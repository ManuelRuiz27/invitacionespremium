import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, type ApiClient, type AuthUser, type LoginInput } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { safeAdminReturnTo, type AdminAuthStatus } from './admin-session';

interface AdminAuthValue {
  status: AdminAuthStatus;
  user: AuthUser | null;
  restoreSession(signal?: AbortSignal): Promise<void>;
  login(input: LoginInput, returnTo?: string): Promise<void>;
  logout(): Promise<void>;
  expireSession(returnTo: string): void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({
  apiClient,
  queryClient,
  children
}: {
  apiClient: ApiClient;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const loginPromise = useRef<Promise<void> | null>(null);

  const clearPrivateState = useCallback(() => {
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const acceptUser = useCallback(
    (candidate: AuthUser, returnTo?: string, navigateAfter = true) => {
      if (candidate.role !== 'PLATFORM_ADMIN' || candidate.clientId !== null) {
        queryClient.clear();
        setUser(candidate);
        setStatus('forbidden');
        return;
      }
      setUser(candidate);
      setStatus('authenticated');
      if (navigateAfter) navigate(safeAdminReturnTo(returnTo), { replace: true });
    },
    [navigate, queryClient]
  );

  const restoreSession = useCallback(
    async (signal?: AbortSignal) => {
      setStatus('loading');
      try {
        const candidate = await apiClient.auth.me(signal);
        if (!signal?.aborted) acceptUser(candidate, undefined, false);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          clearPrivateState();
          setStatus('anonymous');
        } else if (error instanceof ApiError && error.status === 403) {
          clearPrivateState();
          setStatus('forbidden');
        } else {
          setStatus('unavailable');
        }
      }
    },
    [acceptUser, apiClient, clearPrivateState]
  );

  useEffect(() => {
    const controller = new AbortController();
    void restoreSession(controller.signal);
    return () => controller.abort();
  }, [restoreSession]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      status,
      user,
      restoreSession,
      login: (input, returnTo) => {
        if (loginPromise.current) return loginPromise.current;
        const operation = apiClient.auth
          .login(input)
          .then((result) => acceptUser(result.user, returnTo))
          .finally(() => {
            loginPromise.current = null;
          });
        loginPromise.current = operation;
        return operation;
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
        navigate(`/login?returnTo=${encodeURIComponent(safeAdminReturnTo(returnTo))}`, { replace: true });
      }
    }),
    [acceptUser, apiClient, clearPrivateState, navigate, restoreSession, status, user]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider.');
  return value;
}
