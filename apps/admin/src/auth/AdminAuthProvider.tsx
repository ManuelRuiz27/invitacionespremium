import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, type ApiClient, type AuthUser, type LoginInput } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AdminFinanceIntentRegistry } from '../finance/admin-finance-intents';
import type { AdminUnauthorizedController } from './admin-unauthorized-controller';
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
  unauthorizedController,
  financeIntentRegistry,
  children
}: {
  apiClient: ApiClient;
  queryClient: QueryClient;
  unauthorizedController: AdminUnauthorizedController;
  financeIntentRegistry: AdminFinanceIntentRegistry;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const loginPromise = useRef<Promise<void> | null>(null);
  const statusRef = useRef<AdminAuthStatus>('loading');
  const expirationStarted = useRef(false);
  const locationRef = useRef({ pathname: location.pathname, search: location.search });
  locationRef.current = { pathname: location.pathname, search: location.search };

  const setAuthStatus = useCallback((nextStatus: AdminAuthStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const clearPrivateState = useCallback(() => {
    queryClient.clear();
    financeIntentRegistry.clear();
    setUser(null);
  }, [financeIntentRegistry, queryClient]);

  const acceptUser = useCallback(
    (candidate: AuthUser, returnTo?: string, navigateAfter = true) => {
      if (candidate.role !== 'PLATFORM_ADMIN' || candidate.clientId !== null) {
        queryClient.clear();
        financeIntentRegistry.clear();
        setUser(candidate);
        setAuthStatus('forbidden');
        return;
      }
      expirationStarted.current = false;
      setUser(candidate);
      setAuthStatus('authenticated');
      if (navigateAfter) navigate(safeAdminReturnTo(returnTo), { replace: true });
    },
    [financeIntentRegistry, navigate, queryClient, setAuthStatus]
  );

  const restoreSession = useCallback(
    async (signal?: AbortSignal) => {
      setAuthStatus('loading');
      try {
        const candidate = await apiClient.auth.me(signal);
        if (!signal?.aborted) acceptUser(candidate, undefined, false);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          clearPrivateState();
          setAuthStatus('anonymous');
        } else if (error instanceof ApiError && error.status === 403) {
          clearPrivateState();
          setAuthStatus('forbidden');
        } else {
          setAuthStatus('unavailable');
        }
      }
    },
    [acceptUser, apiClient, clearPrivateState, setAuthStatus]
  );

  const expireAuthenticatedSession = useCallback(() => {
    if (statusRef.current !== 'authenticated' || expirationStarted.current) return;
    expirationStarted.current = true;
    const returnTo = safeAdminReturnTo(`${locationRef.current.pathname}${locationRef.current.search}`);
    clearPrivateState();
    setAuthStatus('anonymous');
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
  }, [clearPrivateState, navigate, setAuthStatus]);

  useEffect(
    () => unauthorizedController.subscribe(expireAuthenticatedSession),
    [expireAuthenticatedSession, unauthorizedController]
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
          setAuthStatus('anonymous');
          navigate('/login', { replace: true });
        }
      },
      expireSession: () => expireAuthenticatedSession()
    }),
    [
      acceptUser,
      apiClient,
      clearPrivateState,
      expireAuthenticatedSession,
      navigate,
      restoreSession,
      setAuthStatus,
      status,
      user
    ]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider.');
  return value;
}
