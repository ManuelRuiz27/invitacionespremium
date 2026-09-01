import { Box, Typography } from '@mui/material';
import { landingTokens } from '../../theme/landing-theme';

export interface LandingBrandLockupProps {
  /**
   * `horizontal` — compact, single-line for header.
   * `stacked` — editorial, multi-line for hero brand exploration.
   */
  variant: 'horizontal' | 'stacked';
  /** Brand name (e.g. `landingContent.brand.name`) */
  name: string;
  /** Brand tagline (e.g. `landingContent.brand.tagline`) */
  tagline: string;
}

/**
 * Temporary typographic brand lockup.
 *
 * Uses only `brand.name` and `brand.tagline` from landing config.
 * Does NOT create an isotype, monogram, symbol, or claim to be the official logo.
 * Both variants share typography, proportions, and spacing to serve as
 * requirements for the future graphic package.
 */
export function LandingBrandLockup({ variant, name, tagline }: LandingBrandLockupProps) {
  if (variant === 'horizontal') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, minWidth: 0 }}>
        <Typography
          component="span"
          sx={{
            ...landingTokens.typography.brand.name,
            fontSize: { xs: '1.1rem', md: '1.25rem' },
            whiteSpace: 'nowrap',
            color: 'inherit'
          }}
        >
          {name}
        </Typography>
        <Typography
          component="span"
          sx={{
            ...landingTokens.typography.brand.tagline,
            fontSize: '0.78rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: { xs: 'none', lg: 'inline' },
            color: 'inherit',
            opacity: 0.65
          }}
        >
          {tagline}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography
        component="span"
        sx={{
          ...landingTokens.typography.brand.name,
          fontSize: { xs: '1.6rem', sm: '2rem', md: '2.2rem' }
        }}
      >
        {name}
      </Typography>
      <Typography
        component="span"
        sx={{
          ...landingTokens.typography.brand.tagline,
          fontSize: { xs: '0.88rem', md: '1rem' },
          maxWidth: 360
        }}
      >
        {tagline}
      </Typography>
    </Box>
  );
}
