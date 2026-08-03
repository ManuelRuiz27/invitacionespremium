import { landingContent } from '../landing-content';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { Box, Card, CardContent, Container, Grid, Typography } from '@mui/material';

export function LandingProblem() {
  return (
    <Box component="section" sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h2" sx={{ fontWeight: 800, mb: 1.5 }}>
            {landingContent.problem.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: '1.1rem', maxWidth: 640, mx: 'auto' }}>
            {landingContent.problem.subtitle}
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {landingContent.problem.items.map((item, index) => (
            <Grid size={{ xs: 12, md: 4 }} key={index}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  borderColor: 'divider',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 12px 32px rgba(23, 35, 60, 0.06)'
                  }
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: 'rgba(181, 58, 67, 0.08)',
                      color: 'error.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2
                    }}
                  >
                    <ErrorOutlineIcon />
                  </Box>
                  <Typography variant="h4" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {item.description}
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
