import { LoadingState } from '@invitaciones/ui';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthProvider';
import { AdminAccessDeniedPage, AdminSessionUnavailablePage } from './AdminSessionStatePages';

export function AdminProtectedRoute() {
  const auth = useAdminAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <LoadingState label="Verificando sesion administrativa..." />;
  if (auth.status === 'forbidden') return <AdminAccessDeniedPage />;
  if (auth.status === 'unavailable') return <AdminSessionUnavailablePage />;
  if (auth.status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}
