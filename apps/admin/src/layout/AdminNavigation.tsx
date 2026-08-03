import {
  AssessmentOutlined,
  BusinessOutlined,
  CalendarMonthOutlined,
  Inventory2Outlined,
  SpaceDashboardOutlined
} from '@mui/icons-material';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';

const items = [
  { label: 'Resumen', path: '/', icon: <SpaceDashboardOutlined /> },
  { label: 'Clientes', path: '/clientes', icon: <BusinessOutlined /> },
  { label: 'Eventos', path: '/eventos', icon: <CalendarMonthOutlined /> },
  { label: 'Catalogo', path: '/catalogo', icon: <Inventory2Outlined /> },
  { label: 'Reportes', path: '/reportes', icon: <AssessmentOutlined /> }
];

export function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <List sx={{ px: 1.5 }}>
      {items.map((item) => {
        const selected = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
        return (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            selected={selected}
            onClick={onNavigate}
            sx={{ borderRadius: 1.5, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 42 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        );
      })}
    </List>
  );
}
