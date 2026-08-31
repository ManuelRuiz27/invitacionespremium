import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { designTokens } from '@invitaciones/ui';
import { landingTokens } from '../../theme/landing-theme';
import type { ReactNode } from 'react';

export interface LandingEyebrowProps {
  /** Label text */
  label: string;
  /** Optional leading icon */
  icon?: ReactNode;
  /** Color treatment for the surface where the eyebrow is rendered. */
  tone?: 'accent' | 'dark';
  /** sx overrides */
  sx?: SxProps<Theme>;
}

/**
 * Styled eyebrow / badge for section introductions.
 * Replaces raw MUI Chip with a landing-specific treatment.
 */
export function LandingEyebrow({ label, icon, tone = 'accent', sx }: LandingEyebrowProps) {
  const foreground = tone === 'dark' ? landingTokens.colors.dark.text : designTokens.colors.accent;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        borderRadius: `${landingTokens.radius.badge}px`,
        color: foreground,
        border: `1px solid ${foreground}${tone === 'dark' ? '66' : '33'}`,
        backgroundColor: `${foreground}${tone === 'dark' ? '14' : '0A'}`,
        ...sx
      }}
    >
      {icon && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            fontSize: '1rem'
          }}
        >
          {icon}
        </Box>
      )}
      <Typography
        component="span"
        sx={{
          ...landingTokens.typography.eyebrow,
          color: 'inherit'
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
