import { Box, Typography } from '@mui/material';
import { landingTokens } from '../../theme/landing-theme';

export interface LandingSectionIntroProps {
  headingId: string;
  title: string;
  subtitle: string;
  align?: 'left' | 'center';
  dark?: boolean;
}

export function LandingSectionIntro({ headingId, title, subtitle, align = 'center', dark = false }: LandingSectionIntroProps) {
  return (
    <Box sx={{ textAlign: align, mb: { xs: 5, md: 7 } }}>
      <Typography
        id={headingId}
        variant="h2"
        component="h2"
        sx={{
          ...landingTokens.typography.headline,
          color: dark ? landingTokens.colors.darkSurface.textPrimary : 'text.primary',
          mb: 2
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="body1"
        sx={{
          color: dark ? landingTokens.colors.darkSurface.textSecondary : 'text.secondary',
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
