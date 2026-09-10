import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function SelfServiceRoute() {
  const { user } = useAuth();
  if (!user) return null;
  return user.clientOperatingProfile === 'SELF_SERVICE' ? <Outlet /> : <Navigate to="/eventos" replace />;
}
