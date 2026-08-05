import { Box, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';

const landingContent = getLandingConfig();

export function LandingSolution() {
  const headingId = 'landing-solution-heading';

  return (
    <Box
      id="solucion"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.default' }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.solution.title}
          subtitle={landingContent.solution.subtitle}
          align="center"
        />

        <Box sx={{ mt: { xs: 6, md: 8 } }}>
          {/* Top Asymmetric Row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' },
              gap: { xs: 4, md: 6 },
              mb: { xs: 4, md: 6 }
            }}
          >
            {/* Pillar 1 */}
            <Box
              sx={{
                p: { xs: 4, md: 6 },
                bgcolor: 'background.paper',
                borderRadius: 4,
                border: landingTokens.borders.editorial,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <Typography variant="h3" component="h3" sx={{ fontWeight: 800, mb: 2, fontSize: '1.5rem' }}>
                {landingContent.solution.pillars[0].title}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                {landingContent.solution.pillars[0].description}
              </Typography>
            </Box>

            {/* Pillar 2 & Rule Notice */}
            <Box
              sx={{
                p: { xs: 4, md: 6 },
                bgcolor: landingTokens.colors.darkSurface.background,
                color: landingTokens.colors.darkSurface.textPrimary,
                borderRadius: 4,
                border: `1px solid ${landingTokens.colors.darkSurface.divider}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: landingTokens.shadows.elevated
              }}
            >
              <Typography variant="h3" component="h3" sx={{ fontWeight: 800, mb: 2, fontSize: '1.75rem' }}>
                {landingContent.solution.pillars[1].title}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: landingTokens.colors.darkSurface.textSecondary,
                  lineHeight: 1.7,
                  mb: 4,
                  fontSize: '1.1rem'
                }}
              >
                {landingContent.solution.pillars[1].description}
              </Typography>

              {/* Natural integration of ruleNotice */}
              <Box sx={{ p: 3, bgcolor: landingTokens.surfaces.darkInset.background, borderRadius: 3, border: landingTokens.surfaces.darkInset.border }}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, color: landingTokens.colors.darkSurface.accent }}
                >
                  {landingContent.solution.ruleNotice}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Bottom Row - 3 Columns */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              gap: { xs: 4, md: 6 }
            }}
          >
            {landingContent.solution.pillars.slice(2).map((pillar) => (
              <Box
                key={pillar.title}
                sx={{
                  p: { xs: 4, md: 5 },
                  bgcolor: 'background.paper',
                  borderRadius: 4,
                  border: landingTokens.borders.editorial,
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Typography variant="h3" component="h3" sx={{ fontWeight: 700, mb: 2, fontSize: '1.25rem' }}>
                  {pillar.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {pillar.description}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
