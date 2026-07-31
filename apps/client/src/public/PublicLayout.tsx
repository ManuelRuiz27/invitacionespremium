import type { ReactNode } from 'react';
import { Box, Container, Typography } from '@mui/material';

export function PublicLayout({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <Box
      sx={{
        minHeight: '100svh',
        color: tone === 'dark' ? '#f8f3e8' : 'text.primary',
        bgcolor: tone === 'dark' ? '#171713' : '#f7f3ec',
        backgroundImage:
          tone === 'dark'
            ? 'radial-gradient(circle at 15% 0%, rgba(203,174,113,.16), transparent 36%)'
            : 'radial-gradient(circle at 85% 0%, rgba(183,143,84,.12), transparent 34%)'
      }}
    >
      <Container
        component="main"
        maxWidth="lg"
        sx={{ minHeight: '100svh', px: { xs: 2, sm: 4 }, py: { xs: 3, md: 6 } }}
      >
        <Typography
          component="p"
          sx={{
            mb: 3,
            fontFamily: 'Georgia, serif',
            fontSize: '.78rem',
            letterSpacing: '.18em',
            textTransform: 'uppercase'
          }}
        >
          InvitacionesPremium
        </Typography>
        {children}
      </Container>
    </Box>
  );
}
