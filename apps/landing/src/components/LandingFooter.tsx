import { getLandingConfig } from '../config/landing-config';
import { Box, Container, Divider, Stack, Typography } from '@mui/material';
import { BrandLockup } from '@invitaciones/ui';
import { landingTokens } from '../theme/landing-theme';

const landingContent = getLandingConfig();

export function LandingFooter() {
  return (
    <Box
      component="footer"
      sx={{
        py: 6,
        bgcolor: landingTokens.colors.base.background,
        color: landingTokens.colors.base.text,
        borderTop: landingTokens.borders.hairlineDark
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', md: 'center' },
              gap: 4
            }}
          >
            <Box>
              <Box sx={{ mb: 1 }}>
                <BrandLockup size="small" />
              </Box>
              <Typography
                variant="caption"
                sx={{ ...landingTokens.typography.body, color: landingTokens.colors.base.textMuted }}
              >
                {landingContent.footer.legalNotice}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {landingContent.nav.map((item) => (
                <Typography
                  key={item.href}
                  component="a"
                  href={item.href}
                  sx={{
                    ...landingTokens.typography.eyebrow,
                    color: landingTokens.colors.base.textMuted,
                    textDecoration: 'none',
                    transition: landingTokens.transitions.duration,
                    '&:hover': { color: landingTokens.colors.base.text }
                  }}
                >
                  {item.label}
                </Typography>
              ))}
            </Box>
          </Box>

          <Divider sx={{ borderColor: landingTokens.borders.darkColor }} />

          <Typography
            variant="caption"
            sx={{
              ...landingTokens.typography.body,
              color: landingTokens.colors.base.textMuted,
              textAlign: 'center',
              display: 'block',
              fontSize: '0.85rem'
            }}
          >
            {landingContent.footer.copyright}
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
