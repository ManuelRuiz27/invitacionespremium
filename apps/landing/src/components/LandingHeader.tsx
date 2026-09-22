import { getLandingConfig, type LandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { LandingBrandLockup, LandingContainer } from './primitives';
import MenuIcon from '@mui/icons-material/Menu';
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
import { useEffect, useRef, useState } from 'react';

export interface LandingHeaderProps {
  onOpenCommercial: () => void;
  /** Optional injectable config for testing. Defaults to `getLandingConfig()`. */
  config?: LandingConfig;
}

export function LandingHeader({ onOpenCommercial, config }: LandingHeaderProps) {
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
        backgroundColor: scrolled ? landingTokens.glass.headerScrolled.backgroundColor : 'rgba(245, 242, 236, 0.85)',
        backdropFilter: 'blur(10px)',
        borderBottom: scrolled ? landingTokens.borders.hairlineDark : '1px solid transparent',
        transition: `all ${landingTokens.transitions.duration} ${landingTokens.transitions.easing}`,
        color: landingTokens.colors.base.text,
        top: 0,
        zIndex: theme.zIndex.appBar
      }}
    >
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
          '&:focus': {
            position: 'static',
            width: 'auto',
            height: 'auto',
            display: 'block',
            p: 2,
            bgcolor: landingTokens.colors.base.text,
            color: landingTokens.colors.base.background,
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
          <LandingBrandLockup
            variant="horizontal"
            name={landingContent.brand.name}
            tagline={landingContent.brand.tagline}
          />

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
                  onClick={(event: React.MouseEvent) => {
                    event.preventDefault();
                    handleNavClick(item.href);
                  }}
                  sx={{
                    color: landingTokens.colors.base.textMuted,
                    textDecoration: 'none',
                    ...landingTokens.typography.eyebrow,
                    transition: `color ${landingTokens.transitions.duration} ${landingTokens.transitions.easing}`,
                    '&:hover': { color: landingTokens.colors.base.text },
                    '&:focus-visible': { color: landingTokens.colors.base.text }
                  }}
                >
                  {item.label}
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!isMobile && (
              <Button
                variant="outlined"
                size="medium"
                href={landingContent.urls.login}
                disabled={!landingContent.urls.login}
                sx={{
                  ...landingTokens.buttons.secondary,
                  minHeight: 40,
                  px: 2.5,
                  py: 0.85,
                  ...landingTokens.typography.headline,
                  fontSize: '0.88rem'
                }}
              >
                Iniciar sesión
              </Button>
            )}

            {!isMobile && (
              <Button
                variant="contained"
                size="medium"
                onClick={onOpenCommercial}
                sx={{
                  ...landingTokens.buttons.primary,
                  minHeight: 40,
                  px: 2.75,
                  py: 0.85,
                  ...landingTokens.typography.headline,
                  fontSize: '0.88rem'
                }}
              >
                {landingContent.cta.primaryCta}
              </Button>
            )}

            {isMobile && (
              <IconButton
                ref={menuButtonRef}
                onClick={toggleDrawer(true)}
                aria-label="Abrir menú de navegación"
                aria-controls="landing-mobile-navigation"
                aria-expanded={drawerOpen}
                sx={{ color: landingTokens.colors.base.text }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </LandingContainer>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={toggleDrawer(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: 'background.paper',
              color: 'text.primary',
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
                <ListItemButton onClick={() => handleNavClick(item.href)} sx={{ borderRadius: 1, my: 0.5 }}>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { sx: { ...landingTokens.typography.headline, fontSize: '1.05rem' } } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Box sx={{ mt: 4, px: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={() => {
                setDrawerOpen(false);
                onOpenCommercial();
              }}
              sx={{
                ...landingTokens.buttons.primary,
                py: 1.25,
                ...landingTokens.typography.headline,
                fontSize: '0.92rem'
              }}
            >
              {landingContent.cta.primaryCta}
            </Button>

            <Button
              variant="outlined"
              fullWidth
              href={landingContent.urls.login}
              disabled={!landingContent.urls.login}
              sx={{
                ...landingTokens.buttons.secondary,
                py: 1.25,
                ...landingTokens.typography.headline,
                fontSize: '0.92rem'
              }}
            >
              Iniciar sesión
            </Button>
          </Box>
        </Box>
      </Drawer>
    </AppBar>
  );
}
