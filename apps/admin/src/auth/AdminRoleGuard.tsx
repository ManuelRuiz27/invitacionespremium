import { Outlet } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthProvider';
import { AdminAccessDeniedPage } from './AdminSessionStatePages';

export function AdminRoleGuard() {
  const { user } = useAdminAuth();
  return user?.role === 'PLATFORM_ADMIN' && user.clientId === null ? <Outlet /> : <AdminAccessDeniedPage />;
}
