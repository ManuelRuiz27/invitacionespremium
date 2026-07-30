import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: string;
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <Box sx={{ minWidth: 0, py: 2.5, borderTop: 2, borderColor: 'primary.main' }}>
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography component="p" variant="h3" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
        {detail ? (
          <Typography variant="caption" color="text.secondary">
            {detail}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
