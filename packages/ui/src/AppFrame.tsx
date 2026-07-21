import type { ReactNode } from 'react';
import {
  Box,
  Chip,
  Container,
  CssBaseline,
  Paper,
  Stack,
  ThemeProvider,
  Typography
} from '@mui/material';
import { appTheme } from './theme';

export interface AppFrameProps {
  appName: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function AppFrame({ appName, title, description, children }: AppFrameProps) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box component="main" sx={{ minHeight: '100vh', py: { xs: 4, md: 8 } }}>
        <Container maxWidth="md">
          <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={3}>
              <Chip label={appName} sx={{ alignSelf: 'flex-start' }} />
              <Stack spacing={1}>
                <Typography component="h1" variant="h3">
                  {title}
                </Typography>
                <Typography color="text.secondary">{description}</Typography>
              </Stack>
              {children}
            </Stack>
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
