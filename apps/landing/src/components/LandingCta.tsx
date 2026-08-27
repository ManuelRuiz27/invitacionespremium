import ctaFinaleBg from '../assets/landing/cta-finale.webp';
import { getLandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Box, Button, Link, Stack, Typography } from '@mui/material';
import { LandingActionGroup, LandingContainer } from './primitives';

const landingContent = getLandingConfig();

export function LandingCta() {
  return (
    <Box
      component="section"
      aria-labelledby="landing-final-cta-heading"
      sx={{
        position: 'relative',
        py: { xs: 12, md: 16 },
        display: 'flex',
        alignItems: 'center',
        background: landingTokens.colors.dark.background,
        overflow: 'hidden'
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${ctaFinaleBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          '&::after': { content: '""', position: 'absolute', inset: 0, background: landingTokens.overlays.ctaGradient }
        }}
      />

      <LandingContainer sx={{ position: 'relative', zIndex: 1 }}>
        <Stack spacing={4} sx={{ alignItems: 'center', textAlign: 'center', maxWidth: 800, mx: 'auto' }}>
          <Typography
            id="landing-final-cta-heading"
            component="h2"
            sx={{
              color: landingTokens.colors.dark.text,
              ...landingTokens.typography.display,
              fontSize: { xs: '2rem', md: '3rem' },
              textWrap: 'balance'
            }}
          >
            {landingContent.cta.title}
          </Typography>
          <Typography sx={{ color: landingTokens.colors.dark.textMuted, ...landingTokens.typography.body }}>
            {landingContent.cta.description}
          </Typography>

          <LandingActionGroup sx={{ justifyContent: 'center' }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => scrollToLandingSection('#precios')}
              sx={{
                minHeight: 56,
                px: 4,
                backgroundColor: landingTokens.colors.dark.text,
                color: landingTokens.colors.dark.background,
                borderRadius: 0,
                textTransform: 'none'
              }}
            >
              {landingContent.cta.primaryCta}
            </Button>
            <Button
              variant="outlined"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => scrollToLandingSection('#planners')}
              sx={{
                minHeight: 56,
                px: 4,
                borderColor: landingTokens.colors.dark.border,
                color: landingTokens.colors.dark.text,
                borderRadius: 0,
                textTransform: 'none'
              }}
            >
              {landingContent.cta.secondaryCta}
            </Button>
          </LandingActionGroup>

          <Link
            href="#venues"
            onClick={(event) => {
              event.preventDefault();
              scrollToLandingSection('#venues');
            }}
            sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}
          >
            {landingContent.cta.venueLink}
          </Link>
        </Stack>
      </LandingContainer>
    </Box>
  );
}
