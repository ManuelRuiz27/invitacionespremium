import { useState } from 'react';
import { Box, Drawer, Stack, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { AdminHeader } from './AdminHeader';
import { AdminNavigation } from './AdminNavigation';

const drawerWidth = 256;

function NavigationBrand() {
  return (
    <Stack spacing={0.5} sx={{ p: 3 }}>
      <Typography sx={{ fontWeight: 800, color: '#D3B66F', letterSpacing: '.08em' }}>IP ADMIN</Typography>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.62)' }}>
        InvitacionesPremium
      </Typography>
    </Stack>
  );
}

export function AdminShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = (
    <Box
      sx={{
        height: '100%',
        bgcolor: '#102B33',
        color: 'rgba(255,255,255,.86)',
        '& .MuiListItemIcon-root': { color: 'inherit' },
        '& .Mui-selected': { bgcolor: 'rgba(211,182,111,.18)!important', color: '#fff' }
      }}
    >
      <NavigationBrand />
      <AdminNavigation onNavigate={() => setMobileOpen(false)} />
    </Box>
  );
  return (
    <Box sx={{ minHeight: '100svh', display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          '& .MuiDrawer-paper': { width: drawerWidth, border: 0 }
        }}
      >
        {navigation}
      </Drawer>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
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
