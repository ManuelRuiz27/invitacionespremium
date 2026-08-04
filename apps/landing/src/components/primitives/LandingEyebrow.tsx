import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { designTokens } from '@invitaciones/ui';
import { landingTokens } from '../../theme/landing-theme';
import type { ReactNode } from 'react';

export interface LandingEyebrowProps {
  /** Label text */
  label: string;
  /** Optional leading icon */
  icon?: ReactNode;
  /** sx overrides */
  sx?: SxProps<Theme>;
}

/**
 * Styled eyebrow / badge for section introductions.
 * Replaces raw MUI Chip with a landing-specific treatment.
 */
export function LandingEyebrow({ label, icon, sx }: LandingEyebrowProps) {
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
        border: `1px solid ${designTokens.colors.accent}33`,
        backgroundColor: `${designTokens.colors.accent}0A`,
        ...sx
      }}
    >
      {icon && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            color: designTokens.colors.accent,
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
          color: designTokens.colors.accent
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
