import { getLandingConfig } from '../config/landing-config';
import { landingTokens } from '../theme/landing-theme';
import { Button, Stack, Typography } from '@mui/material';
import { Box } from '@mui/material';
import { LandingContainer } from './primitives';

const content = getLandingConfig();

export function LandingCta({ onOpenCommercial }: { onOpenCommercial: () => void }) {
  return (
    <Box
      component="section"
      aria-labelledby="landing-final-cta-heading"
      sx={{
        py: { xs: 12, md: 18 },
        bgcolor: landingTokens.colors.base.background,
        borderTop: landingTokens.borders.hairlineDark
      }}
    >
      <LandingContainer>
        <Stack spacing={4} sx={{ alignItems: 'center', textAlign: 'center', maxWidth: 920, mx: 'auto' }}>
          <Typography
            id="landing-final-cta-heading"
            component="h2"
            sx={{
              ...landingTokens.typography.display,
              color: landingTokens.colors.base.text,
              fontSize: { xs: '2.4rem', md: '4.2rem' },
              textWrap: 'balance'
            }}
          >
            {content.cta.title}
          </Typography>
          <Typography
            sx={{ ...landingTokens.typography.body, color: landingTokens.colors.base.textMuted, maxWidth: 680 }}
          >
            {content.cta.description}
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={onOpenCommercial}
            sx={{
              ...landingTokens.buttons.primary,
              px: 4
            }}
          >
            {content.cta.primaryCta}
          </Button>
        </Stack>
      </LandingContainer>
    </Box>
  );
}
