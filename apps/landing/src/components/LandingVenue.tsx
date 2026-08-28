import { getLandingConfig } from '../config/landing-config';
import { landingTokens } from '../theme/landing-theme';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { Box, Button, Grid, Typography } from '@mui/material';
import { LandingContainer, LandingSectionIntro } from './primitives';

const landingContent = getLandingConfig();

export function LandingVenue({ onOpenCommercial }: { onOpenCommercial: () => void }) {
  const headingId = 'landing-venue-heading';

  return (
    <Box
      id="venues"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <Grid container spacing={{ xs: 6, md: 10 }} sx={{ alignItems: 'start' }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <LandingSectionIntro
              headingId={headingId}
              title={landingContent.venue.title}
              subtitle={landingContent.venue.subtitle}
              align="left"
              dark
            />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', color: landingTokens.colors.dark.text }}>
              <StorefrontIcon aria-hidden sx={{ mt: 0.5 }} />
              <Box>
                <Button
                  variant="contained"
                  onClick={onOpenCommercial}
                  sx={{ ...landingTokens.typography.headline, textTransform: 'none', borderRadius: 0, mb: 1 }}
                >
                  {landingContent.venue.cta}
                </Button>
                <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                  {landingContent.venue.notice}
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, borderTop: landingTokens.borders.hairlineDark }}>
              {landingContent.venue.bulletPoints.map((point, index) => (
                <Box
                  component="li"
                  key={point}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr',
                    gap: 2,
                    py: 3,
                    borderBottom: landingTokens.borders.hairlineDark
                  }}
                >
                  <Typography
                    aria-hidden
                    sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.dark.textMuted }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Typography>
                  <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.text }}>
                    {point}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Grid>
        </Grid>
      </LandingContainer>
    </Box>
  );
}
