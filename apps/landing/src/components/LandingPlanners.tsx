import { getLandingConfig } from '../config/landing-config';
import { Box, Button, Grid, Typography } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';
import { LandingContainer } from './primitives/LandingContainer';

import plannerOperationImg from '../assets/landing/planner-operation.webp';

export interface LandingPlannersProps {
  onOpenRegister: () => void;
}

const landingContent = getLandingConfig();

export function LandingPlanners({ onOpenRegister }: LandingPlannersProps) {
  const headingId = 'landing-planners-heading';

  return (
    <Box id="planners" component="section" aria-labelledby={headingId} sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.light.background }}>
      <LandingContainer>
        <Grid container spacing={{ xs: 6, md: 8 }} sx={{ alignItems: 'center' }}>
          {/* Text Area */}
          <Grid size={{ xs: 12, md: 6 }}>
            <LandingSectionIntro
              headingId={headingId}
              title={landingContent.planners.title}
              subtitle={landingContent.planners.subtitle}
              align="left"
              dark={false}
            />

            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mb: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {landingContent.planners.bulletPoints.map((point, index) => (
                <Box component="li" key={point} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Typography aria-hidden="true" sx={{ ...landingTokens.typography.display, fontSize: '1.25rem', color: landingTokens.colors.light.text, opacity: 0.3, mt: 0.2 }}>
                    {String(index + 1).padStart(2, '0')}
                  </Typography>
                  <Typography variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.text, lineHeight: 1.6 }}>
                    {point}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ p: 4, bgcolor: landingTokens.colors.light.surface, border: landingTokens.borders.hairlineLight }}>
              <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, mb: 3 }}>
                {landingContent.planners.onboardingNotice}
              </Typography>
              <Button
                variant="contained"
                onClick={onOpenRegister}
                startIcon={<PersonAddIcon aria-hidden="true" />}
                sx={{
                  ...landingTokens.typography.headline,
                  fontSize: '1rem',
                  textTransform: 'none',
                  minHeight: 56,
                  px: 4,
                  bgcolor: landingTokens.colors.light.text,
                  color: landingTokens.colors.light.background,
                  borderRadius: 0,
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: landingTokens.colors.light.text,
                    opacity: 0.9,
                    boxShadow: 'none'
                  }
                }}
              >
                {landingContent.planners.cta}
              </Button>
            </Box>
          </Grid>

          {/* Visual Mockup Area */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                width: '100%',
                height: { xs: 400, md: 600 },
                position: 'relative',
                overflow: 'hidden',
                border: landingTokens.borders.hairlineLight
              }}
            >
              <img
                src={plannerOperationImg}
                alt="Operación de evento"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </LandingContainer>
    </Box>
  );
}
