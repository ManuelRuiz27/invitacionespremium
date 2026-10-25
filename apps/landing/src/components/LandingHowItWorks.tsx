import { landingTokens } from '../theme/landing-theme';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { Box, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';

const content = getLandingConfig().howItWorks;

export function LandingHowItWorks() {
  return (
    <Box
      id="como-funciona"
      component="section"
      aria-labelledby="landing-how-heading"
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId="landing-how-heading"
          title={content.title}
          subtitle={content.subtitle}
          align="left"
          dark
        />
        <Box
          sx={{
            mt: 8,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(4,1fr)' },
            borderTop: landingTokens.borders.hairlineDark
          }}
        >
          {content.steps.map(([number, title, description]) => (
            <Box key={number} sx={{ py: 5, pr: { md: 5 }, borderBottom: landingTokens.borders.hairlineDark }}>
              <Typography
                sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.dark.textMuted, mb: 4 }}
              >
                {number}
              </Typography>
              <Typography
                component="h3"
                sx={{
                  ...landingTokens.typography.display,
                  color: landingTokens.colors.dark.text,
                  fontSize: '2rem',
                  mb: 2
                }}
              >
                {title}
              </Typography>
              <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                {description}
              </Typography>
            </Box>
          ))}
        </Box>
      </LandingContainer>
    </Box>
  );
}
