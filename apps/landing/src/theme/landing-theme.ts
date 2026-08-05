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
  accent: designTokens.colors.accent, // Shared functional accent
  muted: '#6B7280',
  borderDark: 'rgba(253, 251, 247, 0.1)',
  borderLight: 'rgba(10, 15, 24, 0.1)'
} as const;

export const landingTokens = {
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
    },
    brand: {
      name: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontWeight: 400,
        letterSpacing: '-0.02em',
        lineHeight: 1
      },
      tagline: {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: 400,
        letterSpacing: '0.02em',
        color: palette.muted
      }
    }
  },

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
    },
    darkSurface: {
      background: palette.graphite,
      accent: '#60A5FA',
      accentMuted: '#5B83F1',
      textPrimary: palette.ivory,
      textSecondary: '#9CA3AF',
      divider: palette.borderDark
    }
  },

  radius: {
    badge: designTokens.radius.medium,
    card: designTokens.radius.medium
  },

  spacing: {
    sectionY: { xs: 8, md: 16 },
    rhythm: { xs: 4, md: 8 }
  },

  borders: {
    hairlineDark: `1px solid ${palette.borderDark}`,
    hairlineLight: `1px solid ${palette.borderLight}`,
    darkColor: palette.borderDark,
    lightColor: palette.borderLight
  },

  surfaces: {
    cardDark: {
      bgcolor: palette.graphite,
      border: `1px solid ${palette.borderDark}`
    },
    heroExperienceGlass: {
      background: 'rgba(255, 254, 251, 0.82)',
      border: `1px solid ${designTokens.colors.line}`
    },
    invitationLayer: {
      background: designTokens.colors.paper,
      border: `1px solid ${designTokens.colors.line}`
    },
    demoSceneLight: {
      mutedBlock: designTokens.colors.line
    }
  },

  shadows: {
    elevated: designTokens.shadow.soft,
    productLayer: '0 24px 64px rgba(10, 15, 24, 0.18)'
  },

  overlays: {
    heroGradient: 'linear-gradient(to bottom, rgba(10, 15, 24, 0.4) 0%, rgba(10, 15, 24, 0.8) 60%, #0A0F18 100%)',
    ctaGradient: 'linear-gradient(to top, #0A0F18 0%, rgba(10, 15, 24, 0.4) 100%)',
    darkWash: 'rgba(10, 15, 24, 0.85)'
  },

  glass: {
    headerScrolled: {
      backgroundColor: 'rgba(10, 15, 24, 0.95)',
      backdropFilter: 'blur(12px)'
    }
  },

  transitions: {
    duration: '0.4s',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
  }
} as const;
