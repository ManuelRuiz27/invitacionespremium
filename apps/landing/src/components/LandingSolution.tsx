import { landingContent } from '../landing-content';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { Alert, Box, Card, CardContent, Container, Grid, Typography } from '@mui/material';

export function LandingSolution() {
  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.paper' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {landingContent.solution.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            {landingContent.solution.subtitle}
          </Typography>
        </Box>

        {/* Aviso de Regla Conceptual Obligatoria */}
        <Box sx={{ maxWidth: 720, mx: 'auto', mb: 5 }}>
          <Alert
            icon={<VerifiedUserIcon />}
            severity="info"
            sx={{
              borderRadius: 3,
              bgcolor: 'rgba(49, 87, 200, 0.06)',
              color: 'text.primary',
              border: '1px solid rgba(49, 87, 200, 0.2)',
              '& .MuiAlert-icon': { color: 'primary.main' }
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {landingContent.solution.ruleNotice}
            </Typography>
          </Alert>
        </Box>

        <Grid container spacing={3}>
          {landingContent.solution.pillars.map((pillar, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  borderColor: 'divider',
                  bgcolor: 'background.default',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)'
                  }
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      bgcolor: 'primary.main',
                      color: '#FFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2
                    }}
                  >
                    <CheckCircleIcon />
                  </Box>
                  <Typography variant="h4" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
                    {pillar.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {pillar.description}
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
