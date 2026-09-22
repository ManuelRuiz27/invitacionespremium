import {
  AssessmentOutlined,
  BusinessOutlined,
  CalendarMonthOutlined,
  Inventory2Outlined,
  FactCheckOutlined,
  ContactMailOutlined,
  SpaceDashboardOutlined
} from '@mui/icons-material';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';

const items = [
  { label: 'Resumen', path: '/', icon: <SpaceDashboardOutlined /> },
  { label: 'Clientes', path: '/clientes', icon: <BusinessOutlined /> },
  { label: 'Eventos', path: '/eventos', icon: <CalendarMonthOutlined /> },
  { label: 'Oportunidades', path: '/oportunidades', icon: <ContactMailOutlined /> },
  { label: 'Catalogo', path: '/catalogo', icon: <Inventory2Outlined /> },
  { label: 'Reportes', path: '/reportes', icon: <AssessmentOutlined /> },
  { label: 'Auditoría', path: '/auditoria', icon: <FactCheckOutlined /> }
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
            sx={{
              borderRadius: 1,
              mb: 0.5,
              py: 1,
              px: 1.5,
              borderLeft: '2px solid',
              borderColor: selected ? 'secondary.main' : 'transparent',
              transition: 'background-color 140ms ease, border-color 140ms ease'
            }}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              slotProps={{
                primary: {
                  sx: {
                    fontWeight: selected ? 650 : 500,
                    fontSize: '0.92rem'
                  }
                }
              }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}
