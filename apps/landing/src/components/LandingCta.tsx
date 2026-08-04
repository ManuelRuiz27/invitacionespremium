import { getLandingConfig } from '../config/landing-config';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Container, Stack, Typography } from '@mui/material';

export interface LandingCtaProps {
  onOpenRegister: () => void;
}

const landingContent = getLandingConfig();

export function LandingCta({ onOpenRegister }: LandingCtaProps) {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 6, md: 8 },
        bgcolor: 'primary.main',
        color: '#FFFFFF',
        textAlign: 'center'
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3} sx={{ alignItems: 'center' }}>
          <Typography variant="h2" component="h2" sx={{ color: '#FFFFFF', fontWeight: 800 }}>
            Comienza a operar tus Eventos con InvitacionesPremium
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '1.15rem', maxWidth: 600 }}>
            Regístrate hoy mismo como Planner independiente o inicia sesión si ya posees una cuenta.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<PersonAddIcon />}
              onClick={onOpenRegister}
              sx={{
                bgcolor: '#FFFFFF',
                color: 'primary.main',
                fontWeight: 800,
                px: 3.5,
                minHeight: 52,
                borderRadius: 2,
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.9)' }
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
                color: '#FFFFFF',
                borderColor: 'rgba(255, 255, 255, 0.4)',
                fontWeight: 700,
                px: 3,
                minHeight: 52,
                borderRadius: 2,
                '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255, 255, 255, 0.08)' }
              }}
            >
              Iniciar sesión
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
