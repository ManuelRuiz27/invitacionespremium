import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

export type AdminFinanceAction = 'credits' | 'line' | 'payment' | 'rebuild';

export interface AdminFinanceIntent {
  clientId: string;
  action: AdminFinanceAction;
  fingerprint: string;
  key: string;
  body: unknown;
  status: 'uncertain';
}

export interface AdminFinanceIntentRegistry {
  list(clientId: string): AdminFinanceIntent[];
  find(clientId: string, fingerprint: string): AdminFinanceIntent | undefined;
  record(intent: AdminFinanceIntent): void;
  discard(clientId: string, fingerprint: string): void;
  clear(): void;
  version(): number;
  subscribe(listener: () => void): () => void;
}

export function createAdminFinanceIntentRegistry(): AdminFinanceIntentRegistry {
  const intents = new Map<string, AdminFinanceIntent>();
  const listeners = new Set<() => void>();
  let currentVersion = 0;
  const emit = () => {
    currentVersion += 1;
    listeners.forEach((listener) => listener());
  };
  const id = (clientId: string, fingerprint: string) => `${clientId}\u0000${fingerprint}`;
  return {
    list: (clientId) => [...intents.values()].filter((intent) => intent.clientId === clientId),
    find: (clientId, fingerprint) => intents.get(id(clientId, fingerprint)),
    record: (intent) => {
      intents.set(id(intent.clientId, intent.fingerprint), intent);
      emit();
    },
    discard: (clientId, fingerprint) => {
      if (intents.delete(id(clientId, fingerprint))) emit();
    },
    clear: () => {
      if (!intents.size) return;
      intents.clear();
      emit();
    },
    version: () => currentVersion,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

const AdminFinanceIntentContext = createContext<AdminFinanceIntentRegistry | null>(null);

export function AdminFinanceIntentProvider({
  registry,
  children
}: {
  registry: AdminFinanceIntentRegistry;
  children: ReactNode;
}) {
  return <AdminFinanceIntentContext.Provider value={registry}>{children}</AdminFinanceIntentContext.Provider>;
}

export function useAdminFinanceIntentRegistry() {
  const registry = useContext(AdminFinanceIntentContext);
  if (!registry) throw new Error('Finance intent registry is not available.');
  return registry;
}

export function useAdminFinanceIntents(clientId: string) {
  const registry = useAdminFinanceIntentRegistry();
  const version = useSyncExternalStore(registry.subscribe, registry.version, registry.version);
  return useMemo(() => registry.list(clientId), [clientId, registry, version]);
}
