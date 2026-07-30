import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiClient, AuthUser, LoginInput, UserRole } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'forbidden' | 'unavailable' | 'redirecting';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  restoreSession(signal?: AbortSignal): Promise<void>;
  login(input: LoginInput, returnTo?: string): Promise<void>;
  logout(): Promise<void>;
  expireSession(returnTo: string): void;
}

interface AuthProviderProps {
  apiClient: ApiClient;
  queryClient: QueryClient;
  adminAppUrl: string;
  navigateExternal?: (url: string) => void;
  children: ReactNode;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const clientRoles = new Set<UserRole>(['INDEPENDENT_PLANNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER']);

export function AuthProvider({ apiClient, queryClient, adminAppUrl, navigateExternal, children }: AuthProviderProps) {
  const navigate = useNavigate();
  const externalNavigation = navigateExternal ?? defaultExternalNavigation;
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearPrivateState = useCallback(() => {
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const acceptUser = useCallback(
    async (candidate: AuthUser, returnTo?: string, navigateAfter = true) => {
      if (candidate.role === 'PLATFORM_ADMIN') {
        setUser(null);
        setStatus('redirecting');
        externalNavigation(adminAppUrl);
        return;
      }

      if (!clientRoles.has(candidate.role)) {
        await apiClient.auth.logout().catch(() => undefined);
        clearPrivateState();
        setStatus('forbidden');
        return;
      }

      setUser(candidate);
      setStatus('authenticated');
      if (navigateAfter) navigate(safeReturnTo(returnTo), { replace: true });
    },
    [adminAppUrl, apiClient, clearPrivateState, externalNavigation, navigate]
  );

  const restoreSession = useCallback(
    async (signal?: AbortSignal) => {
      setStatus('loading');
      try {
        const candidate = await apiClient.auth.me(signal);
        if (signal?.aborted) return;
        await acceptUser(candidate, undefined, false);
      } catch (error: unknown) {
        if (signal?.aborted) return;

        if (error instanceof ApiError && error.status === 401) {
          clearPrivateState();
          setStatus('anonymous');
          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          clearPrivateState();
          setStatus('forbidden');
          return;
        }

        setStatus('unavailable');
      }
    },
    [acceptUser, apiClient, clearPrivateState]
  );

  useEffect(() => {
    const controller = new AbortController();
    void restoreSession(controller.signal);
    return () => controller.abort();
  }, [restoreSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      restoreSession,
      login: async (input, returnTo) => {
        const result = await apiClient.auth.login(input);
        await acceptUser(result.user, returnTo);
      },
      logout: async () => {
        try {
          await apiClient.auth.logout();
        } finally {
          clearPrivateState();
          setStatus('anonymous');
          navigate('/login', { replace: true });
        }
      },
      expireSession: (returnTo) => {
        clearPrivateState();
        setStatus('anonymous');
        const safe = safeReturnTo(returnTo);
        navigate(`/login?returnTo=${encodeURIComponent(safe)}`, { replace: true });
      }
    }),
    [acceptUser, apiClient, clearPrivateState, navigate, restoreSession, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function defaultExternalNavigation(url: string): void {
  window.location.assign(url);
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/eventos';
  try {
    const parsed = new URL(value, 'https://client.invalid');
    if (parsed.origin !== 'https://client.invalid') return '/eventos';
    if (parsed.pathname === '/login') return '/eventos';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/eventos';
  }
}
