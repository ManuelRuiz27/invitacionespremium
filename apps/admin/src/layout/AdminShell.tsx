import { useState } from 'react';
import { Box, Drawer } from '@mui/material';
import { BrandLockup } from '@invitaciones/ui';
import { Outlet } from 'react-router-dom';
import { AdminHeader } from './AdminHeader';
import { AdminNavigation } from './AdminNavigation';

const drawerWidth = 256;

function NavigationBrand() {
  return (
    <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', mb: 1 }}>
      <BrandLockup size="small" tagline="Platform Admin" />
    </Box>
  );
}

export function AdminShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = (
    <Box
      sx={{
        height: '100%',
        bgcolor: 'background.paper',
        color: 'text.primary',
        '& .MuiListItemIcon-root': { color: 'text.secondary' },
        '& .Mui-selected': {
          bgcolor: 'action.selected !important',
          color: 'text.primary',
          fontWeight: 600,
          '& .MuiListItemIcon-root': { color: 'primary.main' }
        }
      }}
    >
      <NavigationBrand />
      <AdminNavigation onNavigate={() => setMobileOpen(false)} />
    </Box>
  );
  return (
    <Box sx={{ minHeight: '100svh', display: 'flex', bgcolor: 'background.default' }}>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }
        }}
      >
        {navigation}
      </Drawer>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { md: 'none' },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }
        }}
      >
        {navigation}
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AdminHeader onOpenNavigation={() => setMobileOpen(true)} />
        <Box component="main" sx={{ p: { xs: 2.5, sm: 4, lg: 5 }, maxWidth: 1480, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
