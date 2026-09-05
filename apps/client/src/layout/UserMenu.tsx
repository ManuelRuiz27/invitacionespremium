import { useState } from 'react';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { Box, Button, IconButton, Menu, MenuItem, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useAuth } from '../auth/AuthProvider';
import { roleLabels } from '../shared/roles';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  if (!user) return null;

  if (!mobile) {
    return (
      <Stack spacing={0.5} sx={{ px: 1 }}>
        <Box>
          <Typography variant="caption" noWrap sx={{ fontWeight: 650 }}>
            {user.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {roleLabels[user.role]}
          </Typography>
        </Box>
        <Button
          startIcon={<LogoutRounded />}
          color="inherit"
          size="small"
          onClick={() => void logout()}
          sx={{ justifyContent: 'flex-start', px: 0, minHeight: 36, color: 'text.secondary' }}
        >
          Cerrar sesión
        </Button>
      </Stack>
    );
  }

  return (
    <>
      <IconButton aria-label="Abrir menú de usuario" onClick={(event) => setAnchor(event.currentTarget)}>
        <AccountCircleOutlined />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 280 }}>
          <Typography variant="body2" noWrap>
            {user.email}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {roleLabels[user.role]}
          </Typography>
        </Box>
        <MenuItem onClick={() => void logout()}>
          <LogoutRounded fontSize="small" sx={{ mr: 1.5 }} />
          Cerrar sesión
        </MenuItem>
      </Menu>
    </>
  );
}
