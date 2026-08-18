import { getLandingConfig, type LandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { LandingBrandLockup, LandingContainer } from './primitives';
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
import { useRef, useState, useEffect } from 'react';

export interface LandingHeaderProps {
  onOpenRegister: () => void;
  /** Optional injectable config for testing. Defaults to `getLandingConfig()`. */
  config?: LandingConfig;
}

export function LandingHeader({ onOpenRegister, config }: LandingHeaderProps) {
  const landingContent = config ?? getLandingConfig();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    // Check initial state
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      position="fixed"
      color="default"
      elevation={0}
      sx={{
        backgroundColor: scrolled ? landingTokens.glass.headerScrolled.backgroundColor : 'transparent',
        backdropFilter: scrolled ? landingTokens.glass.headerScrolled.backdropFilter : 'none',
        borderBottom: scrolled ? landingTokens.borders.hairlineDark : '1px solid transparent',
        transition: `all ${landingTokens.transitions.duration} ${landingTokens.transitions.easing}`,
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
            bgcolor: landingTokens.colors.dark.text,
            color: landingTokens.colors.dark.background,
            borderRadius: 0,
            ...landingTokens.typography.headline,
            fontSize: '0.85rem',
            textDecoration: 'none'
          }
        }}
      >
        Saltar al contenido principal
      </Box>

      <LandingContainer>
        <Toolbar
          disableGutters
          sx={{ minHeight: { xs: 64, md: 80 }, display: 'flex', justifyContent: 'space-between', gap: 2 }}
        >
          {/* Brand lockup */}
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
              sx={{ display: 'flex', alignItems: 'center', gap: 4 }}
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
                    color: landingTokens.colors.dark.textMuted,
                    textDecoration: 'none',
                    ...landingTokens.typography.eyebrow,
                    transition: `color ${landingTokens.transitions.duration} ${landingTokens.transitions.easing}`,
                    '&:hover': { color: landingTokens.colors.dark.text },
                    '&:focus-visible': {
                      color: landingTokens.colors.dark.text
                    }
                  }}
                >
                  {item.label}
                </Box>
              ))}
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Login — visible only on desktop */}
            {!isMobile && (
              <Button
                variant="outlined"
                size="medium"
                href={landingContent.urls.login}
                disabled={!landingContent.urls.login}
                sx={{
                  borderRadius: 0,
                  color: landingTokens.colors.dark.text,
                  borderColor: landingTokens.colors.dark.textMuted,
                  ...landingTokens.typography.headline,
                  fontSize: '0.9rem',
                  px: 3,
                  py: 1,
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: landingTokens.colors.dark.text,
                    backgroundColor: 'transparent'
                  }
                }}
              >
                {landingContent.hero.secondaryCta}
              </Button>
            )}

            {/* Register — visible only on desktop */}
            {!isMobile && (
              <Button
                variant="contained"
                size="medium"
                startIcon={<PersonAddIcon />}
                onClick={onOpenRegister}
                sx={{
                  borderRadius: 0,
                  bgcolor: landingTokens.colors.dark.text,
                  color: landingTokens.colors.dark.background,
                  ...landingTokens.typography.headline,
                  fontSize: '0.9rem',
                  px: 3,
                  py: 1,
                  textTransform: 'none',
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: landingTokens.colors.dark.textMuted,
                    boxShadow: 'none'
                  }
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
                sx={{ color: landingTokens.colors.dark.text }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </LandingContainer>

      {/* Mobile Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={toggleDrawer(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: landingTokens.colors.dark.surface,
              color: landingTokens.colors.dark.text,
              borderLeft: landingTokens.borders.hairlineDark
            }
          }
        }}
      >
        <Box
          id="landing-mobile-navigation"
          sx={{ width: 300, p: 2 }}
          role="navigation"
          aria-label="Navegación principal"
        >
          <Box sx={{ px: 2, py: 2, borderBottom: landingTokens.borders.hairlineDark, mb: 2 }}>
            <LandingBrandLockup
              variant="horizontal"
              name={landingContent.brand.name}
              tagline={landingContent.brand.tagline}
            />
          </Box>

          <List>
            {landingContent.nav.map((item) => (
              <ListItem key={item.href} disablePadding>
                <ListItemButton onClick={() => handleNavClick(item.href)} sx={{ borderRadius: 0, my: 0.5 }}>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { sx: { ...landingTokens.typography.headline, fontSize: '1.1rem' } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Box sx={{ mt: 4, px: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<PersonAddIcon />}
              onClick={() => {
                setDrawerOpen(false);
                onOpenRegister();
              }}
              sx={{
                borderRadius: 0,
                bgcolor: landingTokens.colors.dark.text,
                color: landingTokens.colors.dark.background,
                ...landingTokens.typography.headline,
                fontSize: '0.95rem',
                py: 1.5,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: landingTokens.colors.dark.textMuted,
                  boxShadow: 'none'
                }
              }}
            >
              Registrarme como Planner
            </Button>

            <Button
              variant="outlined"
              fullWidth
              href={landingContent.urls.login}
              disabled={!landingContent.urls.login}
              sx={{
                borderRadius: 0,
                color: landingTokens.colors.dark.text,
                borderColor: landingTokens.colors.dark.textMuted,
                ...landingTokens.typography.headline,
                fontSize: '0.95rem',
                py: 1.5,
                textTransform: 'none',
                '&:hover': {
                  borderColor: landingTokens.colors.dark.text,
                  backgroundColor: 'transparent'
                }
              }}
            >
              {landingContent.hero.secondaryCta}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
