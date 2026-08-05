import { designTokens } from '@invitaciones/ui';

/**
 * Landing-exclusive visual layer.
 *
 * Reuses `designTokens` from `@invitaciones/ui` without modifying the shared theme.
 * Implements the Dark Luxury Editorial aesthetic.
 */
const palette = {
  ink: '#0A0F18',
  ivory: '#FDFBF7',
  graphite: '#1A1D20',
  accent: '#2563EB', // Strictly functional
  muted: '#6B7280',
  borderDark: 'rgba(253, 251, 247, 0.1)',
  borderLight: 'rgba(10, 15, 24, 0.1)',
} as const;

export const landingTokens = {
  colors: {
    dark: {
      background: palette.ink,
      surface: palette.graphite,
      text: palette.ivory,
      textMuted: 'rgba(253, 251, 247, 0.6)',
      border: palette.borderDark,
      accent: palette.accent
    },
    light: {
      background: palette.ivory,
      surface: '#FFFFFF',
      text: palette.ink,
      textMuted: palette.muted,
      border: palette.borderLight,
      accent: palette.accent
    }
  },

  typography: {
    fontFamily: {
      serif: 'Georgia, "Times New Roman", serif',
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    display: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontWeight: 400,
      letterSpacing: '-0.02em',
      lineHeight: 1.1
    },
    headline: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontWeight: 500,
      letterSpacing: '-0.01em',
      lineHeight: 1.2
    },
    body: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontWeight: 400,
      lineHeight: 1.6
    },
    eyebrow: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontWeight: 600,
      fontSize: '0.75rem',
      letterSpacing: '0.1em',
      textTransform: 'uppercase' as const
    }
  },

  spacing: {
    sectionY: { xs: 8, md: 16 },
    rhythm: { xs: 4, md: 8 }
  },
  
  borders: {
    hairlineDark: `1px solid ${palette.borderDark}`,
    hairlineLight: `1px solid ${palette.borderLight}`,
  },
  
  transitions: {
    duration: '0.4s',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
  }
} as const;
