import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiClient, AuthUser, LoginInput, UserRole } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'forbidden';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
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

  const clearSession = useCallback(() => {
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const acceptUser = useCallback(
    async (candidate: AuthUser, returnTo?: string, navigateAfter = true) => {
      if (candidate.role === 'PLATFORM_ADMIN') {
        clearSession();
        setStatus('forbidden');
        externalNavigation(adminAppUrl);
        return;
      }

      if (!clientRoles.has(candidate.role)) {
        await apiClient.auth.logout().catch(() => undefined);
        clearSession();
        setStatus('forbidden');
        return;
      }

      setUser(candidate);
      setStatus('authenticated');
      if (navigateAfter) navigate(safeReturnTo(returnTo), { replace: true });
    },
    [adminAppUrl, apiClient, clearSession, externalNavigation, navigate]
  );

  useEffect(() => {
    const controller = new AbortController();
    void apiClient.auth
      .me(controller.signal)
      .then((candidate) => acceptUser(candidate, undefined, false))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        clearSession();
        setStatus(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'anonymous');
      });
    return () => controller.abort();
  }, [acceptUser, apiClient, clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (input, returnTo) => {
        const result = await apiClient.auth.login(input);
        await acceptUser(result.user, returnTo);
      },
      logout: async () => {
        try {
          await apiClient.auth.logout();
        } finally {
          clearSession();
          setStatus('anonymous');
          navigate('/login', { replace: true });
        }
      },
      expireSession: (returnTo) => {
        clearSession();
        setStatus('anonymous');
        const safe = safeReturnTo(returnTo);
        navigate(`/login?returnTo=${encodeURIComponent(safe)}`, { replace: true });
      }
    }),
    [acceptUser, apiClient, clearSession, navigate, status, user]
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
