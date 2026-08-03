import { landingContent } from '../landing-content';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Container, Grid, Paper, Stack, Typography } from '@mui/material';

export interface LandingPlannersProps {
  onOpenRegister: () => void;
}

export function LandingPlanners({ onOpenRegister }: LandingPlannersProps) {
  return (
    <Box id="planners" component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.paper' }}>
      <Container maxWidth="lg">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 4,
            bgcolor: '#17233C',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <Grid container spacing={4} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack spacing={2.5}>
                <Typography variant="overline" sx={{ color: '#3157C8', fontWeight: 800, letterSpacing: '0.1em' }}>
                  MODELO PLANNER INDEPENDIENTE
                </Typography>
                <Typography variant="h2" component="h2" sx={{ color: '#FFFFFF', fontWeight: 800 }}>
                  {landingContent.planners.title}
                </Typography>
                <Typography variant="body1" sx={{ color: '#D1D5DB', fontSize: '1.1rem', lineHeight: 1.6 }}>
                  {landingContent.planners.subtitle}
                </Typography>

                <Stack spacing={1.5} sx={{ pt: 1 }}>
                  {landingContent.planners.bulletPoints.map((point, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                      <CheckCircleIcon sx={{ color: '#3157C8', fontSize: 20, mt: 0.2 }} />
                      <Typography variant="body2" sx={{ color: '#E5E7EB', fontSize: '0.95rem' }}>
                        {point}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }} sx={{ textAlign: { xs: 'left', md: 'center' } }}>
              <Box sx={{ p: 3, borderRadius: 3, bgcolor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 700, mb: 1, fontSize: '1.3rem' }}>
                  ¿Eres Planner Independiente?
                </Typography>
                <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 3 }}>
                  Crea tu cuenta pública de forma gratuita y accede de inmediato al panel de administración.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  fullWidth
                  startIcon={<PersonAddIcon />}
                  onClick={onOpenRegister}
                  sx={{ minHeight: 48, fontWeight: 700, borderRadius: 2 }}
                >
                  {landingContent.planners.cta}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}
