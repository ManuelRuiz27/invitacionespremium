import { useState, type ReactNode } from 'react';
import MenuRounded from '@mui/icons-material/MenuRounded';
import { AppBar, Box, Drawer, IconButton, Stack, Toolbar, Typography } from '@mui/material';

const drawerWidth = 272;

export interface ResponsiveAppShellProps {
  brand: string;
  navigation: ReactNode;
  userMenu: ReactNode;
  children: ReactNode;
}

export function ResponsiveAppShell({ brand, navigation, userMenu, children }: ResponsiveAppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  const sidebar = (
    <Stack sx={{ height: '100%', px: 2.5, py: 3 }} spacing={4}>
      <Typography variant="h4" sx={{ px: 1, letterSpacing: '-0.04em' }}>
        {brand}
      </Typography>
      <Box component="nav" aria-label="Navegación principal" onClick={closeMobile} sx={{ flex: 1 }}>
        {navigation}
      </Box>
      {userMenu}
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100svh', width: '100%', overflowX: 'clip' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          display: { md: 'none' },
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper'
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            aria-label="Abrir navegación"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, minWidth: 44, minHeight: 44 }}
          >
            <MenuRounded />
          </IconButton>
          <Typography variant="h4" component="span" noWrap>
            {brand}
          </Typography>
          <Box sx={{ ml: 'auto' }}>{userMenu}</Box>
        </Toolbar>
      </AppBar>

      <Box
        component="aside"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper'
        }}
      >
        <Box sx={{ position: 'fixed', width: drawerWidth, inset: '0 auto 0 0' }}>{sidebar}</Box>
      </Box>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={closeMobile}
        ModalProps={{ keepMounted: true }}
        slotProps={{ paper: { sx: { width: 'min(86vw, 320px)' } } }}
      >
        {sidebar}
      </Drawer>

      <Box
        component="main"
        sx={{
          minWidth: 0,
          flex: 1,
          pt: { xs: 10, md: 0 },
          px: { xs: 2, sm: 4, lg: 6 },
          pb: 6
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1280, mx: 'auto', py: { xs: 2, md: 5 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
