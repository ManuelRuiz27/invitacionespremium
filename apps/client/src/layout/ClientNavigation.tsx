import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import { Box, List, ListItemIcon, Typography } from '@mui/material';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canViewFinance } from '../shared/roles';

export function ClientNavigation() {
  const { user } = useAuth();
  if (!user) return null;

  const items = [
    { to: '/eventos', label: 'Eventos', icon: <EventOutlined /> },
    ...(canViewFinance(user.role)
      ? [{ to: '/finanzas', label: 'Finanzas', icon: <AccountBalanceWalletOutlined /> }]
      : [])
  ];

  return (
    <List disablePadding>
      {items.map((item) => (
        <Box component="li" key={item.to} sx={{ listStyle: 'none' }}>
          <NavLink key={item.to} to={item.to} style={{ color: 'inherit', textDecoration: 'none' }}>
            {({ isActive }) => (
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: 48,
                  px: 1.5,
                  borderRadius: 1,
                  color: isActive ? 'primary.main' : 'text.primary',
                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                  borderLeft: '2px solid',
                  borderColor: isActive ? 'primary.main' : 'transparent',
                  transition: 'background-color 120ms ease, color 120ms ease',
                  '&:hover': { backgroundColor: 'action.hover' }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <Typography component="span" sx={{ fontWeight: isActive ? 680 : 500 }}>
                  {item.label}
                </Typography>
              </Box>
            )}
          </NavLink>
        </Box>
      ))}
    </List>
  );
}
