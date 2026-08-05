import { getLandingConfig } from '../config/landing-config';
import { Box, Button, Grid, Typography } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';
import { LandingContainer } from './primitives/LandingContainer';

export interface LandingPlannersProps {
  onOpenRegister: () => void;
}

const landingContent = getLandingConfig();

export function LandingPlanners({ onOpenRegister }: LandingPlannersProps) {
  const headingId = 'landing-planners-heading';

  return (
    <Box id="planners" component="section" aria-labelledby={headingId} sx={{ py: { xs: 8, md: 12 }, bgcolor: landingTokens.colors.darkSurface.background }}>
      <LandingContainer>
        <Grid container spacing={8} sx={{ alignItems: 'center' }}>
          {/* Text Area */}
          <Grid size={{ xs: 12, md: 6 }}>
            <LandingSectionIntro
              headingId={headingId}
              title={landingContent.planners.title}
              subtitle={landingContent.planners.subtitle}
              align="left"
              dark
            />

            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mb: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {landingContent.planners.bulletPoints.map((point) => (
                <Box component="li" key={point} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <CheckCircleIcon aria-hidden="true" sx={{ color: landingTokens.colors.darkSurface.accent, fontSize: 24, mt: 0.2 }} />
                  <Typography variant="body1" sx={{ color: landingTokens.colors.darkSurface.textPrimary, lineHeight: 1.6 }}>
                    {point}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ p: 4, bgcolor: landingTokens.surfaces.cardDark.background, border: landingTokens.surfaces.cardDark.border, borderRadius: 4 }}>
              <Typography variant="body2" sx={{ color: landingTokens.colors.darkSurface.textSecondary, mb: 3 }}>
                {landingContent.planners.onboardingNotice}
              </Typography>
              <Button
                variant="contained"
                color="primary"
                size="large"
                startIcon={<PersonAddIcon aria-hidden="true" />}
                onClick={onOpenRegister}
                sx={{ minHeight: 56, fontWeight: 700, borderRadius: 3, px: 4 }}
              >
                {landingContent.planners.cta}
              </Button>
            </Box>
          </Grid>

          {/* Visual Mockup Area */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ 
              position: 'relative', 
              width: '100%', 
              height: { xs: 400, sm: 500, md: 600 }, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              transform: { xs: 'scale(0.8)', sm: 'scale(0.9)', md: 'scale(1)' },
              transformOrigin: 'center'
            }}>
              {/* Phone Mockup Background Layer */}
              <Box
                sx={{
                  position: 'absolute',
                  width: 320,
                  height: 640,
                  bgcolor: landingTokens.surfaces.productMockup.background,
                  borderRadius: '40px',
                  boxShadow: landingTokens.surfaces.productMockup.shadow,
                  border: landingTokens.surfaces.productMockup.border,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header Mockup */}
                <Box sx={{ height: 140, bgcolor: 'primary.main', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <Box sx={{ width: 40, height: 4, bgcolor: landingTokens.colors.darkSurface.divider, borderRadius: 2, mb: 2 }} aria-hidden="true" />
                  <Box sx={{ width: 120, height: 24, bgcolor: landingTokens.colors.darkSurface.accentMuted, borderRadius: 1, mb: 1 }} aria-hidden="true" />
                  <Box sx={{ width: 80, height: 12, bgcolor: landingTokens.colors.darkSurface.divider, borderRadius: 1 }} aria-hidden="true" />
                </Box>

                {/* Body Mockup */}
                <Box sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* QR Stand-in */}
                  <Box sx={{ width: 160, height: 160, bgcolor: landingTokens.colors.darkSurface.divider, borderRadius: 4, mx: 'auto', mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                     <Box sx={{ width: 120, height: 120, border: '4px solid', borderColor: landingTokens.colors.darkSurface.accentMuted, borderRadius: 2 }} />
                  </Box>
                  <Box sx={{ width: '100%', height: 40, bgcolor: landingTokens.colors.darkSurface.divider, borderRadius: 2, mt: 2 }} aria-hidden="true" />
                  <Box sx={{ width: '70%', height: 40, bgcolor: landingTokens.colors.darkSurface.divider, borderRadius: 2 }} aria-hidden="true" />
                </Box>
              </Box>

              {/* Floating Confirmation Card */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: { xs: 40, md: 80 },
                  right: { xs: 0, md: -40 },
                  width: 280,
                  bgcolor: landingTokens.surfaces.productMockup.background,
                  borderRadius: 4,
                  boxShadow: landingTokens.surfaces.productMockup.shadow,
                  border: landingTokens.surfaces.productMockup.border,
                  p: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}
                aria-hidden="true"
              >
                <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: landingTokens.colors.darkSurface.divider, color: landingTokens.colors.darkSurface.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircleIcon />
                </Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ width: '80%', height: 16, bgcolor: 'primary.main', borderRadius: 1 }} />
                  <Box sx={{ width: '50%', height: 12, bgcolor: landingTokens.colors.darkSurface.accentMuted, borderRadius: 1 }} />
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </LandingContainer>
    </Box>
  );
}
