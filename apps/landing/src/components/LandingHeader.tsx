import { getLandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import MenuIcon from '@mui/icons-material/Menu';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
  AppBar,
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useRef, useState } from 'react';

const landingContent = getLandingConfig();

export interface LandingHeaderProps {
  onOpenRegister: () => void;
}

export function LandingHeader({ onOpenRegister }: LandingHeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const toggleDrawer = (open: boolean) => () => {
    setDrawerOpen(open);
    if (!open) queueMicrotask(() => menuButtonRef.current?.focus());
  };

  const handleNavClick = (href: string) => {
    setDrawerOpen(false);
    scrollToLandingSection(href);
  };

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{
        backgroundColor: 'rgba(255, 254, 251, 0.92)',
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${theme.palette.divider}`,
        top: 0,
        zIndex: theme.zIndex.appBar
      }}
    >
      <Container maxWidth="lg">
        <Toolbar
          disableGutters
          sx={{ minHeight: { xs: 64, md: 72 }, display: 'flex', justifyContent: 'space-between' }}
        >
          {/* Logo / Identidad */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFF',
                fontWeight: 800,
                fontSize: '1.1rem'
              }}
            >
              IP
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {landingContent.brand.name}
            </Typography>
          </Box>

          {/* Navegación Desktop */}
          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {landingContent.nav.map((item) => (
                <Typography
                  key={item.href}
                  component="a"
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavClick(item.href);
                  }}
                  sx={{
                    color: 'text.primary',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.92rem',
                    transition: 'color 0.2s',
                    '&:hover': { color: 'primary.main' }
                  }}
                >
                  {item.label}
                </Typography>
              ))}
            </Box>
          )}

          {/* Acciones CTAs */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              href={landingContent.urls.login}
              disabled={!landingContent.urls.login}
              sx={{ borderRadius: 2, fontWeight: 650 }}
            >
              Iniciar sesión
            </Button>

            {!isMobile && (
              <Button
                variant="contained"
                color="primary"
                size="medium"
                startIcon={<PersonAddIcon />}
                onClick={onOpenRegister}
                sx={{ borderRadius: 2, fontWeight: 650 }}
              >
                Registrarme
              </Button>
            )}

            {/* Menú Hamburguesa Móvil */}
            {isMobile && (
              <IconButton
                ref={menuButtonRef}
                aria-label="Abrir menú de navegación"
                aria-expanded={drawerOpen}
                aria-controls="landing-mobile-navigation"
                edge="end"
                onClick={toggleDrawer(true)}
                sx={{ color: 'text.primary' }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </Container>

      {/* Drawer Móvil */}
      <Drawer anchor="right" open={drawerOpen} onClose={toggleDrawer(false)}>
        <Box
          id="landing-mobile-navigation"
          sx={{ width: 280, p: 2 }}
          role="navigation"
          aria-label="Navegación principal"
        >
          <Typography variant="h6" sx={{ fontWeight: 800, px: 2, py: 1 }}>
            {landingContent.brand.name}
          </Typography>
          <List>
            {landingContent.nav.map((item) => (
              <ListItem key={item.href} disablePadding>
                <ListItemButton onClick={() => handleNavClick(item.href)} sx={{ borderRadius: 1.5, my: 0.25 }}>
                  <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Box sx={{ mt: 2, px: 2 }}>
            <Button
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<PersonAddIcon />}
              onClick={() => {
                setDrawerOpen(false);
                onOpenRegister();
              }}
              sx={{ borderRadius: 2, fontWeight: 700 }}
            >
              Registrarme como Planner
            </Button>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
