import { getLandingConfig, type LandingConfig } from '../config/landing-config';
import { landingTokens } from '../theme/landing-theme';
import { LandingActionGroup, LandingContainer, LandingEyebrow } from './primitives';
import heroBg from '../assets/landing/hero-bg.webp';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { Box, Button, Stack, Typography } from '@mui/material';

export interface LandingHeroProps {
  onOpenRegister: () => void;
  config?: LandingConfig;
}

export function LandingHero({ onOpenRegister, config }: LandingHeroProps) {
  const landingContent = config ?? getLandingConfig();

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        minHeight: { xs: '85vh', md: '90vh' },
        display: 'flex',
        alignItems: 'center',
        background: landingTokens.colors.dark.background,
        overflow: 'hidden'
      }}
    >
      {/* Cinematic Background Image */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: landingTokens.overlays.heroGradient
          }
        }}
        aria-hidden="true"
      />

      <LandingContainer sx={{ position: 'relative', zIndex: 1 }}>
        <Stack
          spacing={4}
          sx={{
            maxWidth: { xs: '100%', md: '65%' },
            pt: { xs: 8, md: 0 } // Offset for transparent header
          }}
        >
          <Box>
            <LandingEyebrow
              icon={<EventAvailableIcon fontSize="small" sx={{ color: landingTokens.colors.dark.accent }} />}
              label={landingContent.hero.badge}
              sx={{ color: landingTokens.colors.dark.textMuted }}
            />
          </Box>

          <Typography
            variant="h1"
            component="h1"
            sx={{
              color: landingTokens.colors.dark.text,
              ...landingTokens.typography.display,
              fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4.5rem' },
              textWrap: 'balance'
            }}
          >
            {landingContent.hero.title}
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: landingTokens.colors.dark.textMuted,
              ...landingTokens.typography.body,
              fontSize: { xs: '1.1rem', md: '1.25rem' },
              maxWidth: 580
            }}
          >
            {landingContent.hero.subtitle}
          </Typography>

          <LandingActionGroup>
            <Button
              variant="contained"
              size="large"
              onClick={onOpenRegister}
              sx={{
                minHeight: 56,
                px: 4,
                fontSize: '1rem',
                backgroundColor: landingTokens.colors.dark.text,
                color: landingTokens.colors.dark.background,
                borderRadius: 0,
                textTransform: 'none',
                fontWeight: 600,
                transition: landingTokens.transitions.duration,
                '&:hover': {
                  backgroundColor: landingTokens.colors.dark.textMuted
                }
              }}
            >
              {landingContent.hero.primaryCta}
            </Button>

            <Button
              variant="outlined"
              size="large"
              endIcon={<ArrowForwardIcon />}
              href={landingContent.urls.login}
              disabled={!landingContent.urls.login}
              sx={{
                minHeight: 56,
                px: 4,
                fontSize: '1rem',
                borderColor: landingTokens.colors.dark.border,
                color: landingTokens.colors.dark.text,
                borderRadius: 0,
                textTransform: 'none',
                fontWeight: 500,
                transition: landingTokens.transitions.duration,
                '&:hover': {
                  borderColor: landingTokens.colors.dark.text,
                  backgroundColor: 'transparent'
                }
              }}
            >
              {landingContent.hero.secondaryCta}
            </Button>
          </LandingActionGroup>
        </Stack>
      </LandingContainer>
    </Box>
  );
}
