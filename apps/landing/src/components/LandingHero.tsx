import { getLandingConfig } from '../config/landing-config';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography } from '@mui/material';

export interface LandingHeroProps {
  onOpenRegister: () => void;
}

const landingContent = getLandingConfig();

export function LandingHero({ onOpenRegister }: LandingHeroProps) {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 6, md: 10 },
        background: 'linear-gradient(180deg, #F6F4EF 0%, #FFFEFB 100%)',
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={3}>
              <Box>
                <Chip
                  icon={<EventAvailableIcon fontSize="small" />}
                  label={landingContent.hero.badge}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 650, borderRadius: 3, py: 0.5, px: 0.5 }}
                />
              </Box>

              <Typography
                variant="h1"
                component="h1"
                sx={{
                  color: 'text.primary',
                  fontWeight: 800,
                  fontSize: { xs: '2.2rem', sm: '3rem', md: '3.4rem' },
                  letterSpacing: '-0.035em',
                  lineHeight: 1.1
                }}
              >
                {landingContent.hero.title}
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                  fontSize: { xs: '1.05rem', md: '1.2rem' },
                  lineHeight: 1.6,
                  maxWidth: 620
                }}
              >
                {landingContent.hero.subtitle}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, pt: 1 }}>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  startIcon={<PersonAddIcon />}
                  onClick={onOpenRegister}
                  sx={{ minHeight: 52, px: 3.5, fontSize: '1rem', fontWeight: 700, borderRadius: 2 }}
                >
                  {landingContent.hero.primaryCta}
                </Button>

                <Button
                  variant="outlined"
                  color="primary"
                  size="large"
                  endIcon={<ArrowForwardIcon />}
                  href={landingContent.urls.login}
                  disabled={!landingContent.urls.login}
                  sx={{ minHeight: 52, px: 3, fontSize: '1rem', fontWeight: 650, borderRadius: 2 }}
                >
                  {landingContent.hero.secondaryCta}
                </Button>
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 4,
                bgcolor: '#17233C',
                color: '#FFFFFF',
                boxShadow: '0 24px 60px rgba(23, 35, 60, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <Typography variant="overline" sx={{ color: '#3157C8', fontWeight: 800, letterSpacing: '0.1em' }}>
                VISTA GENERAL DE OPERACIÓN
              </Typography>
              <Typography variant="h3" sx={{ color: '#FFFFFF', fontSize: '1.35rem', fontWeight: 700, mt: 1, mb: 2 }}>
                Plataforma de Eventos Privados
              </Typography>

              <Stack spacing={2}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                    1. Confirmación nominal de Asistentes
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mt: 0.5 }}>
                    Registro individual de cada integrante por Invitación enviada.
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                    2. QR y Check-in en Puerta
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mt: 0.5 }}>
                    QR pertenece a Invitación; check-in individual por Asistente.
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                    3. Croquis, Mesas y StaffTokens
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mt: 0.5 }}>
                    Control de recinto y accesos acotados sin contraseñas en recepción.
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
