import { Box, Grid, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';

const landingContent = getLandingConfig();

export function LandingProblem() {
  const headingId = 'landing-problem-heading';

  return (
    <Box
      id="problema"
      component="section"
      aria-labelledby={headingId}
      sx={{ 
        py: landingTokens.spacing.sectionY, 
        bgcolor: landingTokens.colors.light.background,
        borderBottom: landingTokens.borders.hairlineLight
      }}
    >
      <LandingContainer>
        <Grid container spacing={{ xs: 6, md: 8 }}>
          {/* Left Column: Intro */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Box sx={{ position: { md: 'sticky' }, top: { md: 120 } }}>
              <LandingSectionIntro
                headingId={headingId}
                title={landingContent.problem.title}
                subtitle={landingContent.problem.subtitle}
                align="left"
                dark={false}
              />
            </Box>
          </Grid>

          {/* Right Column: Problems Sequence */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {landingContent.problem.items.map((item, index) => (
                <Box
                  key={item.title}
                  sx={{
                    display: 'flex',
                    gap: { xs: 3, md: 4 },
                    pb: { xs: 4, md: 6 },
                    mb: { xs: 4, md: 6 },
                    borderBottom: index !== landingContent.problem.items.length - 1 ? landingTokens.borders.hairlineLight : 'none'
                  }}
                >
                  <Typography
                    aria-hidden="true"
                    sx={{
                      ...landingTokens.typography.display,
                      fontSize: { xs: '3rem', md: '4.5rem' },
                      color: landingTokens.colors.light.text,
                      opacity: 0.15,
                      lineHeight: 0.8,
                      mt: { xs: 1, md: 2 }
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Typography>
                  <Box>
                    <Typography
                      variant="h3"
                      component="h3"
                      sx={{ 
                        ...landingTokens.typography.headline,
                        mb: 1.5, 
                        fontSize: '1.25rem', 
                        color: landingTokens.colors.light.text 
                      }}
                    >
                      {item.title}
                    </Typography>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        ...landingTokens.typography.body,
                        color: landingTokens.colors.light.textMuted 
                      }}
                    >
                      {item.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Grid>
        </Grid>
      </LandingContainer>
    </Box>
  );
}
