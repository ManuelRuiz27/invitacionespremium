import { DemoVideo } from './DemoVideo';
import { getLandingConfig, type LandingConfig } from '../config/landing-config';

import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { LandingActionGroup, LandingContainer, LandingEyebrow } from './primitives';

import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Box, Button, Stack, Typography } from '@mui/material';

export interface LandingHeroProps {
  config?: LandingConfig;
}

export function LandingHero({ config }: LandingHeroProps) {
  const content = config ?? getLandingConfig();

  return (
    <Box
      component="section"
      sx={{
        minHeight: { xs: 'auto', lg: '88vh' },
        pt: { xs: 12, sm: 14, lg: 18 },
        pb: { xs: 8, sm: 10, lg: 14 },
        bgcolor: landingTokens.colors.base.background,
        color: landingTokens.colors.base.text,
        overflowX: 'clip'
      }}
    >
      <LandingContainer>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.08fr) minmax(360px, 0.92fr)' },
            gap: { xs: 6, sm: 8, lg: 10 },
            alignItems: 'center'
          }}
        >
          {/* Mensaje Editorial Principal */}
          <Stack spacing={{ xs: 2.5, sm: 3.5 }}>
            <Box>
              <LandingEyebrow icon={<AutoAwesomeIcon fontSize="small" />} label={content.hero.badge} tone="dark" />
            </Box>

            <Typography
              component="h1"
              variant="h1"
              sx={{
                ...landingTokens.typography.display,
                color: landingTokens.colors.base.text,
                maxWidth: { lg: '14ch' }
              }}
            >
              {content.hero.title}
            </Typography>

            <Typography
              variant="body1"
              sx={{
                ...landingTokens.typography.body,
                color: landingTokens.colors.base.textMuted,
                maxWidth: { sm: 540 },
                fontSize: { xs: '1.05rem', sm: '1.15rem' },
                lineHeight: 1.6
              }}
            >
              {content.hero.subtitle}
            </Typography>

            <LandingActionGroup>
              <Button
                variant="contained"
                size="large"
                onClick={() => scrollToLandingSection('#servicios')}
                sx={landingTokens.buttons.primary}
              >
                {content.hero.primaryCta}
              </Button>
              <Button
                variant="outlined"
                size="large"
                endIcon={<ArrowForwardIcon />}
                onClick={() => scrollToLandingSection('#como-funciona')}
                sx={landingTokens.buttons.secondary}
              >
                {content.hero.secondaryCta}
              </Button>
            </LandingActionGroup>

            <Typography
              variant="body2"
              sx={{
                color: landingTokens.colors.base.textMuted,
                fontSize: '0.82rem',
                letterSpacing: '0.02em',
                pt: 0.5
              }}
            >
              Preparamos la experiencia. Tú decides quién asiste.
            </Typography>
          </Stack>

          {/* Pieza Visual Protagonista con Espacio Negativo */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              px: { xs: 1, sm: 3 }
            }}
          >
            <Box
              aria-label="Demostración de invitación Premium — Boda de Prueba"
              sx={{
                width: '100%',
                maxWidth: { xs: 250, sm: 290, md: 320, lg: 340 },
                mx: 'auto',
                border: landingTokens.borders.mockup,
                borderRadius: { xs: '20px', sm: '26px' },
                overflow: 'hidden',
                boxShadow: landingTokens.shadows.protagonist,
                bgcolor: landingTokens.colors.base.surface,
                transition: `transform ${landingTokens.transitions.duration} ${landingTokens.transitions.easing}`,
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', transform: 'none' },
                '&:hover': {
                  transform: 'translateY(-3px)'
                }
              }}
            >
              <DemoVideo
                label="Demostración de invitación Premium — Boda de Prueba"
                sx={{ width: '100%', height: 'auto', aspectRatio: '390 / 844', display: 'block', objectFit: 'cover' }}
              />
            </Box>

            <Typography
              variant="caption"
              sx={{
                ...landingTokens.typography.eyebrow,
                fontSize: '0.7rem',
                color: landingTokens.colors.base.textMuted,
                textAlign: 'center',
                mt: 2.5,
                opacity: 0.8
              }}
            >
              Demostración · Invitación Digital · Experiencia móvil
            </Typography>
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
