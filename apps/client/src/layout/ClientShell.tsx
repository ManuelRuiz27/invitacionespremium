import { ResponsiveAppShell } from '@invitaciones/ui';
import { Outlet } from 'react-router-dom';
import { ClientNavigation } from './ClientNavigation';
import { UserMenu } from './UserMenu';

export function ClientShell() {
  return (
    <ResponsiveAppShell brand="InvitacionesPremium" navigation={<ClientNavigation />} userMenu={<UserMenu />}>
      <Outlet />
    </ResponsiveAppShell>
  );
}
