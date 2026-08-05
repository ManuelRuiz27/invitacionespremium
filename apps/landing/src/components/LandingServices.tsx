import { Box, Container, Grid, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';

import CheckIcon from '@mui/icons-material/Check';

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
  const paidServices = landingContent.services.items.filter((s) => s.code !== 'DEMO');
  const demoService = landingContent.services.items.find((s) => s.code === 'DEMO');
  const headingId = 'landing-services-heading';

  return (
    <Box id="servicios" component="section" aria-labelledby={headingId} sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.light.background }}>
      <Container maxWidth="lg">
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.services.title}
          subtitle={landingContent.services.subtitle}
          align="center"
          dark={false}
        />

        {/* Paid Services: 3-column grid */}
        <Grid container spacing={{ xs: 4, md: 6 }} sx={{ mb: { xs: 8, md: 10 } }}>
          {paidServices.map((service) => (
            <Grid size={{ xs: 12, md: 4 }} key={service.code}>
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    border: landingTokens.borders.hairlineLight,
                    p: { xs: 3, md: 4 },
                    mb: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: landingTokens.colors.light.surface
                  }}
                >
                  <img src={assetMap[service.code]} alt="" style={{ maxWidth: '100%', height: 'auto', display: 'block' }} aria-hidden="true" />
                </Box>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <Typography variant="h3" component="h3" sx={{ ...landingTokens.typography.headline, fontSize: '1.4rem', mb: 1, color: landingTokens.colors.light.text }}>
                    {service.name}
                  </Typography>
                  <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, minHeight: { md: 48 }, mb: 3 }}>
                    {service.description}
                  </Typography>

                  <Box sx={{ mb: 4, p: 2, bgcolor: landingTokens.colors.light.surface, border: landingTokens.borders.hairlineLight, textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.light.textMuted, display: 'block', mb: 1 }}>
                      COSTO EN CRÉDITOS
                    </Typography>
                    <Typography variant="h4" sx={{ ...landingTokens.typography.display, color: landingTokens.colors.light.text, mb: 0.25, fontSize: '1.5rem' }}>
                      {service.prices.planner.credits} créditos
                    </Typography>
                    <Typography variant="caption" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, fontSize: '0.85rem' }}>
                      (Organización: {service.prices.organization.credits} créditos)
                    </Typography>
                  </Box>

                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 'auto' }}>
                    {service.features.map((feature) => (
                      <Box component="li" key={`${service.code}-${feature}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                        <CheckIcon fontSize="small" sx={{ color: landingTokens.colors.light.text, mt: 0.25, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ ...landingTokens.typography.body, fontSize: '0.9rem', color: landingTokens.colors.light.textMuted }}>
                          {feature}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* Demo Service */}
        {demoService && (
          <Box
            sx={{
              borderTop: landingTokens.borders.hairlineLight,
              pt: { xs: 4, md: 6 }
            }}
          >
            <Grid container spacing={{ xs: 4, md: 6 }} sx={{ alignItems: 'center' }}>
              <Grid size={{ xs: 12, md: 5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                  <Box
                    sx={{
                      width: 100,
                      flexShrink: 0,
                      border: landingTokens.borders.hairlineLight,
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: landingTokens.colors.light.surface
                    }}
                  >
                    <img src={assetMap.DEMO} alt="" style={{ maxWidth: '100%', height: 'auto', display: 'block' }} aria-hidden="true" />
                  </Box>
                  <Box>
                    <Typography variant="h3" component="h3" sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.light.text, fontSize: '1.25rem', mb: 1 }}>
                      {demoService.name}
                    </Typography>
                    <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted, mb: 1 }}>
                      {demoService.description}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.light.text }}>
                      {demoService.prices.planner.credits} créditos
                    </Typography>
                  </Box>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, md: 7 }}>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  {demoService.features.map((feature) => (
                    <Box component="li" key={`${demoService.code}-${feature}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                      <CheckIcon fontSize="small" sx={{ color: landingTokens.colors.light.text, mt: 0.25, flexShrink: 0, opacity: 0.5 }} />
                      <Typography variant="body2" sx={{ ...landingTokens.typography.body, fontSize: '0.9rem', color: landingTokens.colors.light.textMuted }}>
                        {feature}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}
      </Container>
    </Box>
  );
}
