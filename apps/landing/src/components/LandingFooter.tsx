import { landingContent } from '../landing-content';
import { Box, Container, Divider, Stack, Typography } from '@mui/material';

export function LandingFooter() {
  return (
    <Box
      component="footer"
      sx={{
        py: 4,
        bgcolor: '#17233C',
        color: '#FFFFFF',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              gap: 2
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#FFFFFF' }}>
                {landingContent.brand.fullName}
              </Typography>
              <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                {landingContent.footer.legalNotice}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
              {landingContent.nav.map((item) => (
                <Typography
                  key={item.href}
                  component="a"
                  href={item.href}
                  sx={{
                    color: '#D1D5DB',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    '&:hover': { color: '#3157C8' }
                  }}
                >
                  {item.label}
                </Typography>
              ))}
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />

          <Typography variant="caption" sx={{ color: '#9CA3AF', textAlign: 'center', display: 'block' }}>
            {landingContent.footer.copyright}
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
