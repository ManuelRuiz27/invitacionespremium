import { getLandingConfig, type LandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { LandingBrandLockup } from './primitives';
import MenuIcon from '@mui/icons-material/Menu';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useRef, useState } from 'react';

export interface LandingHeaderProps {
  onOpenRegister: () => void;
  /** Optional injectable config for testing. Defaults to `getLandingConfig()`. */
  config?: LandingConfig;
}

export function LandingHeader({ onOpenRegister, config }: LandingHeaderProps) {
  const landingContent = config ?? getLandingConfig();
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
        backgroundColor: landingTokens.surfaces.glass.background,
        backdropFilter: landingTokens.surfaces.glass.backdropFilter,
        borderBottom: landingTokens.surfaces.glass.borderBottom,
        top: 0,
        zIndex: theme.zIndex.appBar
      }}
    >
      {/* Skip link — visually hidden, visible on :focus-visible */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          zIndex: theme.zIndex.tooltip,
          '&:focus-visible': {
            position: 'fixed',
            top: 8,
            left: 8,
            width: 'auto',
            height: 'auto',
            px: 2,
            py: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: `${landingTokens.radius.badge}px`,
            fontWeight: 700,
            fontSize: '0.85rem',
            textDecoration: 'none',
            boxShadow: landingTokens.shadows.elevated
          }
        }}
      >
        Saltar al contenido principal
      </Box>

      <Box sx={{ maxWidth: 'lg', mx: 'auto', width: '100%', px: { xs: 2, sm: 3 } }}>
        <Toolbar
          disableGutters
          sx={{ minHeight: { xs: 64, md: 72 }, display: 'flex', justifyContent: 'space-between' }}
        >
          {/* Brand lockup — horizontal compact */}
          <LandingBrandLockup
            variant="horizontal"
            name={landingContent.brand.name}
            tagline={landingContent.brand.tagline}
          />

          {/* Desktop navigation */}
          {!isMobile && (
            <Box
              component="nav"
              aria-label="Navegación principal"
              sx={{ display: 'flex', alignItems: 'center', gap: 3 }}
            >
              {landingContent.nav.map((item) => (
                <Box
                  key={item.href}
                  component="a"
                  href={item.href}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    handleNavClick(item.href);
                  }}
                  sx={{
                    color: 'text.primary',
                    textDecoration: 'none',
                    fontWeight: landingTokens.typography.nav.fontWeight,
                    fontSize: landingTokens.typography.nav.fontSize,
                    transition: `color ${landingTokens.transitions.duration} ${landingTokens.transitions.easing}`,
                    '&:hover': { color: 'primary.main' },
                    '&:focus-visible': {
                      color: 'primary.main'
                    }
                  }}
                >
                  {item.label}
                </Box>
              ))}
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Login — visible only on desktop */}
            {!isMobile && (
              <Button
                variant="outlined"
                color="primary"
                size="medium"
                href={landingContent.urls.login}
                disabled={!landingContent.urls.login}
                sx={{
                  borderRadius: `${landingTokens.radius.button}px`,
                  fontWeight: 650
                }}
              >
                {landingContent.hero.secondaryCta}
              </Button>
            )}

            {/* Register — visible only on desktop */}
            {!isMobile && (
              <Button
                variant="contained"
                color="primary"
                size="medium"
                startIcon={<PersonAddIcon />}
                onClick={onOpenRegister}
                sx={{
                  borderRadius: `${landingTokens.radius.button}px`,
                  fontWeight: 650
                }}
              >
                Registrarme
              </Button>
            )}

            {/* Mobile hamburger */}
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
      </Box>

      {/* Mobile Drawer */}
      <Drawer anchor="right" open={drawerOpen} onClose={toggleDrawer(false)}>
        <Box
          id="landing-mobile-navigation"
          sx={{ width: 280, p: 2 }}
          role="navigation"
          aria-label="Navegación principal"
        >
          <Box sx={{ px: 2, py: 1 }}>
            <LandingBrandLockup
              variant="horizontal"
              name={landingContent.brand.name}
              tagline={landingContent.brand.tagline}
            />
          </Box>

          <List>
            {landingContent.nav.map((item) => (
              <ListItem key={item.href} disablePadding>
                <ListItemButton onClick={() => handleNavClick(item.href)} sx={{ borderRadius: 1.5, my: 0.25 }}>
                  <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Box sx={{ mt: 2, px: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<PersonAddIcon />}
              onClick={() => {
                setDrawerOpen(false);
                onOpenRegister();
              }}
              sx={{ borderRadius: `${landingTokens.radius.button}px`, fontWeight: 700 }}
            >
              Registrarme como Planner
            </Button>

            <Button
              variant="outlined"
              color="primary"
              fullWidth
              href={landingContent.urls.login}
              disabled={!landingContent.urls.login}
              sx={{ borderRadius: `${landingTokens.radius.button}px`, fontWeight: 650 }}
            >
              {landingContent.hero.secondaryCta}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
