import { landingContent } from '../landing-content';
import { Box, Card, CardContent, Container, Divider, Grid, Stack, Typography } from '@mui/material';

export function LandingPricing() {
  return (
    <Box id="precios" component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {landingContent.pricing.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            {landingContent.pricing.subtitle}
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {/* Planner Independiente */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card
              sx={{
                height: '100%',
                borderRadius: 3,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                boxShadow: '0 8px 24px rgba(23, 35, 60, 0.04)'
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h3" component="h3" sx={{ fontWeight: 800, mb: 1 }}>
                  {landingContent.pricing.planner.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minHeight: 48, mb: 3 }}>
                  {landingContent.pricing.planner.description}
                </Typography>

                <Divider sx={{ mb: 3 }} />

                <Stack spacing={2.5}>
                  {landingContent.pricing.planner.rates.map((rate, idx) => (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {rate.service}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {rate.credits} créditos
                        </Typography>
                      </Box>
                      <Typography variant="h4" color="primary.main" sx={{ fontWeight: 800 }}>
                        ${rate.mxn} MXN
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Organización */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card
              sx={{
                height: '100%',
                borderRadius: 3,
                borderColor: 'primary.main',
                borderWidth: 2,
                bgcolor: 'background.paper',
                boxShadow: '0 12px 32px rgba(49, 87, 200, 0.08)'
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Typography variant="h3" component="h3" sx={{ fontWeight: 800, mb: 1 }}>
                  {landingContent.pricing.organization.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minHeight: 48, mb: 3 }}>
                  {landingContent.pricing.organization.description}
                </Typography>

                <Divider sx={{ mb: 3 }} />

                <Stack spacing={2.5}>
                  {landingContent.pricing.organization.rates.map((rate, idx) => (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {rate.service}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {rate.credits} créditos
                        </Typography>
                      </Box>
                      <Typography variant="h4" color="primary.main" sx={{ fontWeight: 800 }}>
                        ${rate.mxn} MXN
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
