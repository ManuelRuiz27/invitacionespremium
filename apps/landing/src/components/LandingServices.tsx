import { Box, Card, CardContent, Container, Grid, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingSectionIntro } from './primitives';
import CheckIcon from '@mui/icons-material/Check';
import ViewCarouselIcon from '@mui/icons-material/ViewCarousel';

const landingContent = getLandingConfig();

export function LandingServices() {
  const paidServices = landingContent.services.items.filter((s) => s.code !== 'DEMO');
  const demoService = landingContent.services.items.find((s) => s.code === 'DEMO');
  const headingId = 'landing-services-heading';

  return (
    <Box
      id="servicios"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.paper' }}
    >
      <Container maxWidth="lg">
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.services.title}
          subtitle={landingContent.services.subtitle}
          align="center"
        />

        {/* Paid Services: 3-column grid */}
        <Grid container spacing={{ xs: 4, md: 3 }} sx={{ mb: { xs: 6, md: 8 } }}>
          {paidServices.map((service) => (
            <Grid size={{ xs: 12, md: 4 }} key={service.code}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: 'none',
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.default'
                }}
              >
                <CardContent sx={{ p: { xs: 3.5, md: 4 }, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <Typography variant="h3" component="h3" sx={{ fontWeight: 800, fontSize: '1.4rem', mb: 1 }}>
                    {service.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minHeight: { md: 48 }, mb: 3, lineHeight: 1.6 }}
                  >
                    {service.description}
                  </Typography>

                  <Box
                    sx={{
                      mb: 4,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      textAlign: 'center'
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.05em' }}
                    >
                      COSTO EN CRÉDITOS
                    </Typography>
                    <Typography variant="h4" color="primary.main" sx={{ fontWeight: 800, mt: 0.5, mb: 0.25 }}>
                      {service.prices.planner.credits} créditos
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      (Organización: {service.prices.organization.credits} créditos)
                    </Typography>
                  </Box>

                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 'auto' }}>
                    {service.features.map((feature) => (
                      <Box
                        component="li"
                        key={`${service.code}-${feature}`}
                        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}
                      >
                        <CheckIcon color="primary" fontSize="small" sx={{ mt: 0.25, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'text.primary' }}>
                          {feature}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Demo Service: Secondary wide panel */}
        {demoService && (
          <Box
            sx={{
              bgcolor: 'background.default',
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 4,
              p: { xs: 4, md: 5 }
            }}
          >
            <Grid container spacing={{ xs: 4, md: 6 }} sx={{ alignItems: 'center' }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <ViewCarouselIcon color="primary" />
                  <Typography variant="h3" component="h3" sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
                    {demoService.name}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                  {demoService.description}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {demoService.prices.planner.credits} créditos
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, md: 8 }}>
                <Box
                  component="ul"
                  sx={{
                    listStyle: 'none',
                    m: 0,
                    p: 0,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2
                  }}
                >
                  {demoService.features.map((feature) => (
                    <Box
                      component="li"
                      key={`${demoService.code}-${feature}`}
                      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
                    >
                      <CheckIcon color="primary" fontSize="small" sx={{ mt: 0.25, flexShrink: 0, opacity: 0.7 }} />
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'text.secondary' }}
                      >
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
