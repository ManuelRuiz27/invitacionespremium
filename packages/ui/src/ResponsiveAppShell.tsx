import { useState, type ReactNode } from 'react';
import MenuRounded from '@mui/icons-material/MenuRounded';
import { AppBar, Box, Drawer, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { BrandLockup } from './BrandLockup';

const drawerWidth = 232;

export interface ResponsiveAppShellProps {
  brand?: ReactNode;
  navigation: ReactNode;
  userMenu: ReactNode;
  children: ReactNode;
}

export function ResponsiveAppShell({ brand, navigation, userMenu, children }: ResponsiveAppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  const brandNode =
    brand === undefined || brand === 'InvitacionesPremium' ? (
      <BrandLockup size="small" />
    ) : typeof brand === 'string' ? (
      <Typography
        variant="body1"
        sx={{
          px: 1,
          fontFamily: (theme) => theme.typography.h1.fontFamily,
          fontWeight: 600,
          fontSize: '1.15rem',
          letterSpacing: '-0.01em'
        }}
      >
        {brand}
      </Typography>
    ) : (
      brand
    );

  const sidebar = (
    <Stack sx={{ height: '100%', px: 1.5, py: 2 }} spacing={3}>
      <Box sx={{ px: 1 }}>{brandNode}</Box>
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
          <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>{brandNode}</Box>
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
          px: { xs: 2, sm: 4, lg: 5 },
          pb: 6
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1440, mx: 'auto', py: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
