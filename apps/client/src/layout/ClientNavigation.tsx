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
    ...(user.clientOperatingProfile === 'SELF_SERVICE' && canViewFinance(user.role)
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
                  minHeight: 44,
                  px: 1.5,
                  borderRadius: 1,
                  color: isActive ? 'text.primary' : 'text.secondary',
                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                  borderLeft: '2px solid',
                  borderColor: isActive ? 'secondary.main' : 'transparent',
                  transition: 'background-color 140ms ease, color 140ms ease',
                  '&:hover': { backgroundColor: 'action.hover', color: 'text.primary' }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{item.icon}</ListItemIcon>
                <Typography component="span" sx={{ fontWeight: isActive ? 600 : 500, fontSize: '0.92rem' }}>
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
