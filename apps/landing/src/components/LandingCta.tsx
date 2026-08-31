import { getLandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { Box, Button, Stack, Typography } from '@mui/material';
import { LandingActionGroup, LandingContainer } from './primitives';

const content = getLandingConfig();

export function LandingCta({ onOpenPlanner, onOpenVenue }: { onOpenPlanner: () => void; onOpenVenue: () => void }) {
  return (
    <Box
      component="section"
      aria-labelledby="landing-final-cta-heading"
      sx={{
        py: { xs: 12, md: 18 },
        bgcolor: landingTokens.colors.dark.background,
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
              color: landingTokens.colors.dark.text,
              fontSize: { xs: '2.4rem', md: '4.2rem' },
              textWrap: 'balance'
            }}
          >
            {content.cta.title}
          </Typography>
          <Typography
            sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted, maxWidth: 650 }}
          >
            {content.cta.description}
          </Typography>
          <LandingActionGroup>
            <Button variant="contained" size="large" onClick={() => scrollToLandingSection('#precios')} sx={buttonSx}>
              {content.cta.primaryCta}
            </Button>
            <Button variant="outlined" size="large" onClick={onOpenPlanner} sx={outlineSx}>
              {content.cta.secondaryCta}
            </Button>
            <Button
              variant="text"
              size="large"
              onClick={onOpenVenue}
              sx={{ color: landingTokens.colors.dark.textMuted, textTransform: 'none' }}
            >
              {content.cta.venueLink}
            </Button>
          </LandingActionGroup>
        </Stack>
      </LandingContainer>
    </Box>
  );
}

const buttonSx = {
  minHeight: 56,
  px: 4,
  borderRadius: 0,
  bgcolor: landingTokens.colors.dark.text,
  color: landingTokens.colors.dark.background,
  textTransform: 'none'
};
const outlineSx = {
  minHeight: 56,
  px: 4,
  borderRadius: 0,
  borderColor: landingTokens.colors.dark.border,
  color: landingTokens.colors.dark.text,
  textTransform: 'none'
};
