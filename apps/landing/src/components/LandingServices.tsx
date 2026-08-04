import { getLandingConfig } from '../config/landing-config';
import CheckIcon from '@mui/icons-material/Check';
import { Box, Card, CardContent, Container, Grid, Stack, Typography } from '@mui/material';

const landingContent = getLandingConfig();

export function LandingServices() {
  return (
    <Box id="servicios" component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {landingContent.services.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            {landingContent.services.subtitle}
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {landingContent.services.items.map((service) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={service.code}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  borderColor: service.code === 'DEMO' ? 'divider' : 'primary.main',
                  borderWidth: service.code === 'FLIPBOOK' ? 2 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative'
                }}
              >
                <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <Typography variant="h3" component="h3" sx={{ fontWeight: 800, fontSize: '1.4rem', mb: 0.5 }}>
                    {service.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, mb: 2 }}>
                    {service.description}
                  </Typography>

                  <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                      COSTO EN CRÉDITOS
                    </Typography>
                    <Typography variant="h4" color="primary.main" sx={{ fontWeight: 800, my: 0.25 }}>
                      {service.prices.planner.credits} créditos
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      (Organización: {service.prices.organization.credits} créditos)
                    </Typography>
                  </Box>

                  <Stack spacing={1} sx={{ mt: 'auto' }}>
                    {service.features.map((feature, idx) => (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <CheckIcon color="primary" fontSize="small" sx={{ mt: 0.2 }} />
                        <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
                          {feature}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
