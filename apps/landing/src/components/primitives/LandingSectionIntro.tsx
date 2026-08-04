import { Box, Typography } from '@mui/material';
import { landingTokens } from '../../theme/landing-theme';

export interface LandingSectionIntroProps {
  title: string;
  subtitle: string;
  align?: 'left' | 'center';
}

export function LandingSectionIntro({ title, subtitle, align = 'center' }: LandingSectionIntroProps) {
  return (
    <Box sx={{ textAlign: align, mb: { xs: 5, md: 7 } }}>
      <Typography
        variant="h2"
        component="h2"
        sx={{
          ...landingTokens.typography.headline,
          color: 'text.primary',
          mb: 2
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          fontSize: '1.1rem',
          lineHeight: 1.6,
          maxWidth: 680,
          mx: align === 'center' ? 'auto' : 0
        }}
      >
        {subtitle}
      </Typography>
    </Box>
  );
}
