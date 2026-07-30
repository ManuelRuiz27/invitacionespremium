import { LoadingState } from '@invitaciones/ui';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AccessDeniedPage } from './AccessDeniedPage';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <LoadingState label="Restaurando tu sesión…" />;
  if (auth.status === 'forbidden') return <AccessDeniedPage />;
  if (auth.status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}
