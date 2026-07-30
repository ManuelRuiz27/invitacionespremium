import type { ReactNode } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { appTheme } from './theme';

export interface AppThemeProviderProps {
  children: ReactNode;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
