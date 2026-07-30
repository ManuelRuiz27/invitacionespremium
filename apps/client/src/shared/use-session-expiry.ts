import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { toDisplayError } from './error-message';

export function useSessionExpiry(error: unknown, returnTo: string): void {
  const auth = useAuth();
  const unauthorized = error ? toDisplayError(error).unauthorized : false;

  useEffect(() => {
    if (unauthorized) auth.expireSession(returnTo);
  }, [auth, returnTo, unauthorized]);
}
