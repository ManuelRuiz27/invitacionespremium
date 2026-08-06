import { getLandingConfig } from '../config/landing-config';
import { Box, Grid, Typography } from '@mui/material';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';
import { LandingContainer } from './primitives/LandingContainer';

const landingContent = getLandingConfig();

export function LandingOrganizations() {
  const headingId = 'landing-organizations-heading';

  return (
    <Box
      id="organizaciones"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.organizations.title}
          subtitle={landingContent.organizations.subtitle}
          align="center"
          dark={true}
        />

        <Box
          sx={{
            bgcolor: landingTokens.colors.dark.surface,
            border: landingTokens.borders.hairlineDark,
            borderRadius: 0,
            overflow: 'hidden',
            maxWidth: 1000,
            mx: 'auto'
          }}
        >
          {/* Institutional Notice */}
          <Box sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', borderBottom: landingTokens.borders.hairlineDark }}>
            <Typography
              variant="body1"
              sx={{
                ...landingTokens.typography.body,
                color: landingTokens.colors.dark.text,
                maxWidth: 720,
                mx: 'auto',
                fontSize: '1.1rem'
              }}
            >
              {landingContent.organizations.notice}
            </Typography>
          </Box>

          {/* Roles Division */}
          <Grid container>
            {landingContent.organizations.roles.map((role, idx) => (
              <Grid
                size={{ xs: 12, md: 6 }}
                key={role.name}
                sx={{
                  p: { xs: 4, md: 5 },
                  borderBottom: { xs: idx === 0 ? landingTokens.borders.hairlineDark : 'none', md: 'none' },
                  borderRight: { md: idx === 0 ? landingTokens.borders.hairlineDark : 'none' }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5 }}>
                  <Box sx={{ color: landingTokens.colors.dark.text, mt: 0.5, opacity: 0.5 }}>
                    {idx === 0 ? (
                      <SupervisorAccountIcon fontSize="large" aria-hidden="true" />
                    ) : (
                      <AccountCircleIcon fontSize="large" aria-hidden="true" />
                    )}
                  </Box>
                  <Box>
                    <Typography
                      variant="h4"
                      sx={{
                        ...landingTokens.typography.headline,
                        color: landingTokens.colors.dark.text,
                        fontSize: '1.25rem',
                        mb: 1.5
                      }}
                    >
                      {role.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}
                    >
                      {role.description}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </LandingContainer>
    </Box>
  );
}
