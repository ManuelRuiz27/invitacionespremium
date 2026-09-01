import { Box, Container, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';
import flipbookAvif from '../assets/product-proof/flipbook-public-mobile.avif';
import flipbookWebp from '../assets/product-proof/flipbook-public-mobile.webp';
import rsvpAvif from '../assets/product-proof/rsvp-public-mobile.avif';
import rsvpWebp from '../assets/product-proof/rsvp-public-mobile.webp';
import scannerAvif from '../assets/product-proof/scanner-result-mobile.avif';
import scannerWebp from '../assets/product-proof/scanner-result-mobile.webp';
import { ProductProofPicture } from './ProductProofPicture';

const landingContent = getLandingConfig();

const assetMap = {
  FLIPBOOK: { avif: flipbookAvif, webp: flipbookWebp, alt: 'Invitación Premium real' },
  FLYER: { avif: rsvpAvif, webp: rsvpWebp, alt: 'Confirmación digital real' },
  PHYSICAL_QR: { avif: scannerAvif, webp: scannerWebp, alt: 'Control de acceso real para recibir invitados' }
};

export function LandingServices() {
  const headingId = 'landing-services-heading';

  return (
    <Box
      id="servicios"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: { xs: 10, md: 16 }, bgcolor: landingTokens.colors.light.background }}
    >
      <Container maxWidth="lg">
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.services.title}
          subtitle={landingContent.services.subtitle}
          align="center"
          dark={false}
        />

        <Box sx={{ mt: { xs: 8, md: 12 }, display: 'flex', flexDirection: 'column' }}>
          {landingContent.services.items.map((service, index) => (
            <Box
              key={service.code}
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { xs: 'flex-start', md: 'center' },
                gap: { xs: 4, md: 8 },
                py: { xs: 6, md: 8 },
                borderTop: index === 0 ? landingTokens.borders.hairlineLight : 'none',
                borderBottom: landingTokens.borders.hairlineLight
              }}
            >
              <Box sx={{ flex: 1, maxWidth: { xs: '100%', md: 400 } }}>
                <Typography
                  variant="h3"
                  component="h3"
                  sx={{
                    ...landingTokens.typography.display,
                    fontSize: { xs: '1.75rem', md: '2.5rem' },
                    mb: 2,
                    color: landingTokens.colors.light.text
                  }}
                >
                  {service.name}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    ...landingTokens.typography.body,
                    color: landingTokens.colors.light.textMuted,
                    fontSize: '1.15rem'
                  }}
                >
                  {service.description}
                </Typography>
                <Box
                  component="ul"
                  sx={{
                    mt: 3,
                    pl: 2,
                    m: 0,
                    '& li': {
                      ...landingTokens.typography.body,
                      color: landingTokens.colors.light.textMuted,
                      fontSize: '0.95rem',
                      mb: 1,
                      listStyleType: 'disc'
                    }
                  }}
                >
                  {service.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </Box>
              </Box>

              <Box
                sx={{
                  flex: 1.5,
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <ProductProofPicture
                  avif={assetMap[service.code].avif}
                  webp={assetMap[service.code].webp}
                  alt={assetMap[service.code].alt}
                  width={780}
                  height={1688}
                  sx={{
                    width: { xs: '72%', sm: 320 },
                    border: landingTokens.borders.hairlineLight,
                    boxShadow: landingTokens.shadows.elevated
                  }}
                  imageStyle={{ maxHeight: 470, objectFit: 'cover', objectPosition: 'top' }}
                />
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
