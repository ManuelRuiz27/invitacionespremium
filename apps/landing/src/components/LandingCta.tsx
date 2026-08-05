import { getLandingConfig } from '../config/landing-config';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Stack, Typography } from '@mui/material';
import { landingTokens } from '../theme/landing-theme';
import { LandingContainer } from './primitives/LandingContainer';
import { LandingActionGroup } from './primitives';
import ctaFinaleBg from '../assets/landing/cta-finale.webp';

export interface LandingCtaProps {
  onOpenRegister: () => void;
}

const landingContent = getLandingConfig();

export function LandingCta({ onOpenRegister }: LandingCtaProps) {
  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        py: { xs: 12, md: 16 },
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
          backgroundImage: `url(${ctaFinaleBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(0deg, rgba(10,15,24,0.9) 0%, rgba(10,15,24,0.7) 50%, rgba(10,15,24,0.9) 100%)'
          }
        }}
        aria-hidden="true"
      />

      <LandingContainer sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={4} sx={{ alignItems: 'center', textAlign: 'center', maxWidth: 800, mx: 'auto' }}>
          <Typography
            variant="h2"
            component="h2"
            sx={{
              color: landingTokens.colors.dark.text,
              ...landingTokens.typography.display,
              fontSize: { xs: '2rem', md: '3rem' },
              textWrap: 'balance'
            }}
          >
            Comienza a operar tus Eventos con InvitacionesPremium
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: landingTokens.colors.dark.textMuted,
              ...landingTokens.typography.body,
              fontSize: '1.15rem',
              maxWidth: 600
            }}
          >
            Regístrate hoy mismo como Planner independiente o inicia sesión si ya posees una cuenta.
          </Typography>

          <LandingActionGroup sx={{ justifyContent: 'center' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<PersonAddIcon />}
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
              Registrarme como Planner
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
              Iniciar sesión
            </Button>
          </LandingActionGroup>
        </Stack>
      </LandingContainer>
    </Box>
  );
}
