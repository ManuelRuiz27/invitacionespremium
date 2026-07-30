import { createTheme } from '@mui/material/styles';

export const designTokens = {
  colors: {
    ink: '#17233C',
    mutedInk: '#5F6879',
    accent: '#3157C8',
    accentDark: '#23409B',
    canvas: '#F6F4EF',
    paper: '#FFFEFB',
    line: '#E2DED5',
    success: '#287A5B',
    warning: '#A76510',
    danger: '#B53A43'
  },
  radius: {
    small: 10,
    medium: 16,
    large: 24
  },
  shadow: {
    soft: '0 16px 48px rgba(23, 35, 60, 0.08)'
  }
} as const;

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: designTokens.colors.accent,
      dark: designTokens.colors.accentDark,
      contrastText: '#FFFFFF'
    },
    background: {
      default: designTokens.colors.canvas,
      paper: designTokens.colors.paper
    },
    text: {
      primary: designTokens.colors.ink,
      secondary: designTokens.colors.mutedInk
    },
    divider: designTokens.colors.line,
    success: { main: designTokens.colors.success },
    warning: { main: designTokens.colors.warning },
    error: { main: designTokens.colors.danger }
  },
  typography: {
    fontFamily: '"Inter", "Aptos", "Segoe UI", sans-serif',
    h1: { fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.08, fontWeight: 720, letterSpacing: '-0.04em' },
    h2: { fontSize: 'clamp(1.65rem, 3vw, 2.25rem)', lineHeight: 1.12, fontWeight: 700, letterSpacing: '-0.035em' },
    h3: { fontSize: '1.4rem', lineHeight: 1.25, fontWeight: 680, letterSpacing: '-0.025em' },
    h4: { fontSize: '1.12rem', lineHeight: 1.35, fontWeight: 680 },
    button: { textTransform: 'none', fontWeight: 650, letterSpacing: '-0.01em' }
  },
  shape: {
    borderRadius: designTokens.radius.medium
  },
  shadows: [
    'none',
    designTokens.shadow.soft,
    ...Array.from({ length: 23 }, () => designTokens.shadow.soft)
  ] as typeof import('@mui/material/styles').createTheme extends (...args: never[]) => infer T
    ? T extends { shadows: infer S }
      ? S
      : never
    : never,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        html: { backgroundColor: designTokens.colors.canvas },
        body: { minWidth: 320, margin: 0 },
        'a, button, input, [tabindex]': {
          '&:focus-visible': {
            outline: `3px solid ${designTokens.colors.accent}55`,
            outlineOffset: 3
          }
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            scrollBehavior: 'auto !important',
            transitionDuration: '0.01ms !important'
          }
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true
      },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: designTokens.radius.small, paddingInline: 18 }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${designTokens.colors.line}`,
          boxShadow: 'none'
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: designTokens.colors.mutedInk,
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase'
        }
      }
    }
  }
});
