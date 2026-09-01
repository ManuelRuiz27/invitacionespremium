import { getLandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { Box, Button, Stack, Typography } from '@mui/material';
import { LandingContainer } from './primitives';

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
          <Box
            sx={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              borderTop: landingTokens.borders.hairlineDark,
              borderBottom: landingTokens.borders.hairlineDark
            }}
          >
            <CtaPath
              label={content.cta.eventLabel}
              action={content.cta.primaryCta}
              onClick={() => scrollToLandingSection('#precios')}
              primary
            />
            <CtaPath label={content.cta.plannerLabel} action={content.cta.secondaryCta} onClick={onOpenPlanner} />
            <CtaPath label={content.cta.venueLabel} action={content.cta.venueLink} onClick={onOpenVenue} />
          </Box>
        </Stack>
      </LandingContainer>
    </Box>
  );
}

function CtaPath({
  label,
  action,
  onClick,
  primary = false
}: {
  label: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <Stack
      spacing={2.5}
      sx={{ p: { xs: 3, md: 4 }, borderBottom: { xs: landingTokens.borders.hairlineDark, md: 'none' } }}
    >
      <Typography sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.dark.textMuted }}>
        {label}
      </Typography>
      <Button
        variant={primary ? 'contained' : 'outlined'}
        size="large"
        onClick={onClick}
        sx={primary ? buttonSx : outlineSx}
      >
        {action}
      </Button>
    </Stack>
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
