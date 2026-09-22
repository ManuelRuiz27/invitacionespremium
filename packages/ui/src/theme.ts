import { createTheme } from '@mui/material/styles';

export const designTokens = {
  colors: {
    // Paleta principal - Editorial Contemporary / Quiet Luxury
    canvas: '#F5F2EC', // Background principal (Crema atemporal)
    paper: '#FFFFFF', // Superficie limpia / tarjetas (Blanco)
    surfaceMuted: '#EFECE5', // Superficie atenuada
    ink: '#171717', // Foreground principal (Negro sofisticado)
    mutedInk: '#57594F', // Foreground secundario / texto atenuado (Verde taupe oscuro / gris cálido accesible)
    secondary: '#6D705E', // Color secundario (Verde taupe natural)
    secondaryDark: '#585B4B',
    accent: '#B8A58A', // Acento cálido (Taupe elegante)
    accentDark: '#A69378',
    line: '#E5E0D8', // Líneas divisorias muy sutiles
    lineSubtle: '#ECE7DF', // Divisores suaves alternativos
    borderDark: 'rgba(23, 23, 23, 0.12)',
    borderSubtle: '#D8D2C7',
    inkHover: '#2A2A2A',
    hoverAction: 'rgba(23, 23, 23, 0.04)',
    mockupBorder: 'rgba(23, 23, 23, 0.12)',
    // Estados semánticos sobrios
    success: '#287A5B',
    warning: '#A76510',
    danger: '#B53A43'
  },
  typography: {
    fontFamilySerif: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    fontFamilySans: '"Montserrat", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  radius: {
    small: 6, // Inputs: 6px-8px, Buttons: 6px-8px
    medium: 10, // Cards: 8px-12px
    large: 12
  },
  shadow: {
    soft: '0 4px 20px rgba(23, 23, 23, 0.04)',
    protagonist: '0 20px 48px rgba(23, 23, 23, 0.07)'
  }
} as const;

export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: designTokens.colors.ink,
      dark: designTokens.colors.inkHover,
      contrastText: designTokens.colors.canvas
    },
    secondary: {
      main: designTokens.colors.secondary,
      dark: designTokens.colors.secondaryDark,
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
    action: {
      hover: designTokens.colors.hoverAction,
      selected: 'rgba(109, 112, 94, 0.08)',
      focus: 'rgba(23, 23, 23, 0.08)'
    },
    success: { main: designTokens.colors.success },
    warning: { main: designTokens.colors.warning },
    error: { main: designTokens.colors.danger }
  },
  typography: {
    fontFamily: designTokens.typography.fontFamilySans,
    h1: {
      fontFamily: designTokens.typography.fontFamilySerif,
      fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)',
      lineHeight: 1.1,
      fontWeight: 500,
      letterSpacing: '-0.02em'
    },
    h2: {
      fontFamily: designTokens.typography.fontFamilySerif,
      fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)',
      lineHeight: 1.15,
      fontWeight: 500,
      letterSpacing: '-0.015em'
    },
    h3: {
      fontFamily: designTokens.typography.fontFamilySans,
      fontSize: '1.35rem',
      lineHeight: 1.3,
      fontWeight: 600,
      letterSpacing: '-0.01em'
    },
    h4: {
      fontFamily: designTokens.typography.fontFamilySans,
      fontSize: '1.12rem',
      lineHeight: 1.35,
      fontWeight: 600
    },
    body1: {
      fontFamily: designTokens.typography.fontFamilySans,
      lineHeight: 1.6
    },
    body2: {
      fontFamily: designTokens.typography.fontFamilySans,
      lineHeight: 1.5
    },
    button: {
      fontFamily: designTokens.typography.fontFamilySans,
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '-0.005em'
    }
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
        body: {
          minWidth: 320,
          margin: 0,
          backgroundColor: designTokens.colors.canvas,
          color: designTokens.colors.ink
        },
        'a, button, input, [tabindex]': {
          '&:focus-visible': {
            outline: `2px solid ${designTokens.colors.ink}`,
            outlineOffset: 2
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
        root: {
          minHeight: 42,
          borderRadius: designTokens.radius.small,
          paddingInline: 18,
          transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease'
        },
        contained: {
          backgroundColor: designTokens.colors.ink,
          color: designTokens.colors.canvas,
          '&:hover': {
            backgroundColor: designTokens.colors.inkHover
          }
        },
        outlined: {
          borderColor: designTokens.colors.borderSubtle,
          color: designTokens.colors.ink,
          '&:hover': {
            borderColor: designTokens.colors.ink,
            backgroundColor: designTokens.colors.hoverAction
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: designTokens.colors.paper,
          border: `1px solid ${designTokens.colors.line}`,
          borderRadius: designTokens.radius.medium,
          boxShadow: 'none'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none'
        },
        outlined: {
          borderColor: designTokens.colors.line,
          borderRadius: designTokens.radius.medium
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.radius.small,
          backgroundColor: designTokens.colors.paper,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: designTokens.colors.line
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: designTokens.colors.ink
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: designTokens.colors.ink,
            borderWidth: 1.5
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: designTokens.radius.small
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: designTokens.colors.mutedInk,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontFamily: designTokens.typography.fontFamilySans
        },
        root: {
          borderColor: designTokens.colors.line
        }
      }
    }
  }
});
