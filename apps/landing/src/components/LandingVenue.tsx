import { getLandingConfig } from '../config/landing-config';
import { landingTokens } from '../theme/landing-theme';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { Box, Button, Grid, Typography } from '@mui/material';
import { LandingContainer, LandingSectionIntro } from './primitives';
import checkinAvif from '../assets/product-proof/checkin-success-mobile.avif';
import checkinWebp from '../assets/product-proof/checkin-success-mobile.webp';
import seatingAvif from '../assets/product-proof/seating-desktop.avif';
import seatingWebp from '../assets/product-proof/seating-desktop.webp';
import { ProductProofPicture } from './ProductProofPicture';

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
                  key={point.title}
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
                  <Box>
                    <Typography sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.dark.text }}>
                      {point.title}
                    </Typography>
                    <Typography
                      sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted, mt: 0.75 }}
                    >
                      {point.description}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 5, position: 'relative', minHeight: { xs: 300, sm: 390 } }}>
              <ProductProofPicture
                avif={seatingAvif}
                webp={seatingWebp}
                alt="Organización de mesas de un evento de demostración"
                width={2160}
                height={1500}
                sx={{ width: '90%', ml: 'auto', border: landingTokens.borders.hairlineDark, opacity: 0.78 }}
              />
              <ProductProofPicture
                avif={checkinAvif}
                webp={checkinWebp}
                alt="Confirmación real de ingreso registrado"
                width={780}
                height={380}
                sx={{
                  position: 'absolute',
                  width: { xs: '82%', sm: '62%' },
                  left: 0,
                  bottom: 0,
                  border: landingTokens.borders.hairlineDark,
                  boxShadow: landingTokens.shadows.productLayer
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </LandingContainer>
    </Box>
  );
}
