import { LogoutOutlined, MenuOutlined, VerifiedUserOutlined } from '@mui/icons-material';
import { AppBar, Box, Button, Chip, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { useAdminAuth } from '../auth/AdminAuthProvider';

export function AdminHeader({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const auth = useAdminAuth();
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 2 }}>
        <IconButton aria-label="Abrir navegacion" onClick={onOpenNavigation} sx={{ display: { md: 'none' } }}>
          <MenuOutlined />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 760 }}>Centro de administración</Typography>
          <Typography variant="caption" color="text.secondary">
            Operación global, sin impersonación
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Chip
            icon={<VerifiedUserOutlined />}
            label="Sesión verificada"
            color="success"
            variant="outlined"
            sx={{ display: { xs: 'none', sm: 'flex' } }}
          />
          <Box sx={{ display: { xs: 'none', lg: 'block' }, textAlign: 'right' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {auth.user?.email}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Platform Admin
            </Typography>
          </Box>
          <Button startIcon={<LogoutOutlined />} onClick={() => void auth.logout()}>
            Cerrar sesión
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
