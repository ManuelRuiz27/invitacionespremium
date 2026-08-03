import { landingContent } from '../landing-content';
import BusinessIcon from '@mui/icons-material/Business';
import InfoIcon from '@mui/icons-material/Info';
import { Alert, Box, Card, CardContent, Container, Grid, Typography } from '@mui/material';

export function LandingOrganizations() {
  return (
    <Box id="organizaciones" component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {landingContent.organizations.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            {landingContent.organizations.subtitle}
          </Typography>
        </Box>

        <Box sx={{ maxWidth: 720, mx: 'auto', mb: 5 }}>
          <Alert severity="warning" icon={<InfoIcon />} sx={{ borderRadius: 3, fontWeight: 600 }}>
            {landingContent.organizations.notice}
          </Alert>
        </Box>

        <Grid container spacing={4}>
          {landingContent.organizations.roles.map((role, idx) => (
            <Grid size={{ xs: 12, md: 6 }} key={idx}>
              <Card sx={{ height: '100%', borderRadius: 3, borderColor: 'divider', p: 1 }}>
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      bgcolor: 'rgba(49, 87, 200, 0.08)',
                      color: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2
                    }}
                  >
                    <BusinessIcon />
                  </Box>
                  <Typography variant="h3" component="h3" sx={{ fontWeight: 700, mb: 1, fontSize: '1.3rem' }}>
                    {role.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {role.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
