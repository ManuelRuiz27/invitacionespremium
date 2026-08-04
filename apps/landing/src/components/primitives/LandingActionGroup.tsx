import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

export interface LandingActionGroupProps {
  children: ReactNode;
  /** sx overrides */
  sx?: SxProps<Theme>;
}

/**
 * Responsive CTA group: column on mobile, row on desktop.
 * Consistent gap and alignment for landing action buttons.
 */
export function LandingActionGroup({ children, sx }: LandingActionGroupProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        pt: 1,
        ...sx
      }}
    >
      {children}
    </Box>
  );
}
