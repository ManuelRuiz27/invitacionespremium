import { Box, Container, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';

import serviceFlipbook from '../assets/landing/service-flipbook.svg';
import serviceFlyer from '../assets/landing/service-flyer.svg';
import servicePass from '../assets/landing/service-pass.svg';
import serviceDemo from '../assets/landing/service-demo.svg';

const landingContent = getLandingConfig();

const assetMap: Record<string, string> = {
  FLIPBOOK: serviceFlipbook,
  FLYER: serviceFlyer,
  PHYSICAL_QR: servicePass,
  DEMO: serviceDemo
};

export function LandingServices() {
  const headingId = 'landing-services-heading';

  return (
    <Box id="servicios" component="section" aria-labelledby={headingId} sx={{ py: { xs: 10, md: 16 }, bgcolor: landingTokens.colors.light.background }}>
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
                <Typography variant="h3" component="h3" sx={{ ...landingTokens.typography.display, fontSize: { xs: '1.75rem', md: '2.5rem' }, mb: 2, color: landingTokens.colors.light.text }}>
                  {service.name}
                </Typography>
                <Typography variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, fontSize: '1.15rem' }}>
                  {service.description}
                </Typography>
                <Box component="ul" sx={{ mt: 3, pl: 2, m: 0, '& li': { ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, fontSize: '0.95rem', mb: 1, listStyleType: 'disc' } }}>
                  {service.features.map(f => (
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
                <img src={assetMap[service.code]} alt={service.name} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', display: 'block' }} />
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
