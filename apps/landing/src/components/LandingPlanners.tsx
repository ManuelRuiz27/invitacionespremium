import plannerOperationImg from '../assets/landing/planner-operation.webp';
import { getLandingConfig } from '../config/landing-config';
import { landingTokens } from '../theme/landing-theme';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import { LandingContainer, LandingSectionIntro } from './primitives';

export interface LandingPlannersProps {
  onOpenRegister: () => void;
  onOpenCommercial: () => void;
}

const landingContent = getLandingConfig();

export function LandingPlanners({ onOpenRegister, onOpenCommercial }: LandingPlannersProps) {
  const headingId = 'landing-planners-heading';

  return (
    <Box
      id="planners"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.light.background }}
    >
      <LandingContainer>
        <Grid container spacing={{ xs: 6, md: 8 }} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <LandingSectionIntro
              headingId={headingId}
              title={landingContent.planners.title}
              subtitle={landingContent.planners.subtitle}
              align="left"
              dark={false}
            />

            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mb: 5, display: 'grid', gap: 3 }}>
              {landingContent.planners.bulletPoints.map((point, index) => (
                <Box component="li" key={point} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Typography aria-hidden sx={{ ...landingTokens.typography.display, opacity: 0.3 }}>
                    {String(index + 1).padStart(2, '0')}
                  </Typography>
                  <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.text }}>
                    {point}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'stretch' } }}>
              <Button
                variant="contained"
                onClick={onOpenCommercial}
                sx={{
                  ...landingTokens.typography.headline,
                  textTransform: 'none',
                  minHeight: 56,
                  px: 3,
                  bgcolor: landingTokens.colors.light.text,
                  color: landingTokens.colors.light.background,
                  borderRadius: 0,
                  boxShadow: 'none'
                }}
              >
                {landingContent.planners.commercialCta}
              </Button>
              <Button
                variant="outlined"
                onClick={onOpenRegister}
                startIcon={<PersonAddIcon aria-hidden />}
                sx={{
                  ...landingTokens.typography.headline,
                  textTransform: 'none',
                  minHeight: 56,
                  px: 3,
                  color: landingTokens.colors.light.text,
                  borderColor: landingTokens.colors.light.text,
                  borderRadius: 0
                }}
              >
                {landingContent.planners.registerCta}
              </Button>
            </Stack>

            <Typography
              id="planner-commercial-notice"
              tabIndex={-1}
              sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, mt: 3 }}
            >
              {landingContent.planners.notice}
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ width: '100%', height: { xs: 400, md: 600 }, overflow: 'hidden' }}>
              <img
                src={plannerOperationImg}
                alt="Planner coordinando la operación de un Evento"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </Box>
          </Grid>
        </Grid>
      </LandingContainer>
    </Box>
  );
}
