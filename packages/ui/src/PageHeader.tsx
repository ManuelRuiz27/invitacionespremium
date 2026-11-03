import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * Variante tipográfica del título.
   * - `'display'` (por defecto): serif grande, para dashboards y páginas principales.
   * - `'operational'`: sans-serif compacto, para formularios, listados y paneles operativos.
   */
  size?: 'display' | 'operational';
}

export function PageHeader({ title, description, action, size = 'display' }: PageHeaderProps) {
  return (
    <Stack
      component="header"
      direction={{ xs: 'column', sm: 'row' }}
      sx={{
        mb: size === 'operational' ? 3 : 4,
        gap: 2,
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' }
      }}
    >
      <Box>
        <Typography component="h1" variant={size === 'operational' ? 'h3' : 'h2'}>
          {title}
        </Typography>
        {description ? (
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>
            {description}
          </Typography>
        ) : null}
      </Box>
      {action}
    </Stack>
  );
}
