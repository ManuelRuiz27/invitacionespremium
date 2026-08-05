import { Box, Typography } from '@mui/material';
import { landingTokens } from '../../theme/landing-theme';

export interface LandingSectionIntroProps {
  headingId: string;
  title: string;
  subtitle: string;
  align?: 'left' | 'center';
  dark?: boolean;
}

export function LandingSectionIntro({
  headingId,
  title,
  subtitle,
  align = 'center',
  dark = false
}: LandingSectionIntroProps) {
  const mode = dark ? landingTokens.colors.dark : landingTokens.colors.light;

  return (
    <Box sx={{ textAlign: align, mb: { xs: 5, md: 7 } }}>
      <Typography
        id={headingId}
        variant="h2"
        component="h2"
        sx={{
          ...landingTokens.typography.headline,
          color: mode.text,
          fontSize: { xs: '2rem', md: '2.5rem' },
          mb: 2
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="body1"
        sx={{
          ...landingTokens.typography.body,
          color: mode.textMuted,
          fontSize: '1.1rem',
          maxWidth: 680,
          mx: align === 'center' ? 'auto' : 0
        }}
      >
        {subtitle}
      </Typography>
    </Box>
  );
}
