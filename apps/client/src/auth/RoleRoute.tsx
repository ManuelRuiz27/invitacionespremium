import type { UserRole } from '@invitaciones/api-client';
import { Outlet } from 'react-router-dom';
import { AccessDeniedPage } from './AccessDeniedPage';
import { useAuth } from './AuthProvider';

export interface RoleRouteProps {
  allowed: UserRole[];
}

export function RoleRoute({ allowed }: RoleRouteProps) {
  const { user } = useAuth();
  return user && allowed.includes(user.role) ? <Outlet /> : <AccessDeniedPage />;
}
