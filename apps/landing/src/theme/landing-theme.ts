import { designTokens } from '@invitaciones/ui';

/**
 * Landing visual layer.
 *
 * Implements Editorial Contemporary / Quiet Luxury aesthetic.
 * Fully coherent with global designTokens from `@invitaciones/ui`.
 */
const palette = {
  ink: designTokens.colors.ink,             // #171717 (Negro sofisticado)
  canvas: designTokens.colors.canvas,       // #F5F2EC (Crema atemporal)
  paper: designTokens.colors.paper,         // #FFFFFF (Blanco puro)
  surfaceMuted: designTokens.colors.surfaceMuted, // #EFECE5
  secondary: designTokens.colors.secondary, // #6D705E (Verde taupe natural)
  secondaryDark: designTokens.colors.secondaryDark,
  accent: designTokens.colors.accent,       // #B8A58A (Taupe elegante)
  accentDark: designTokens.colors.accentDark,
  muted: designTokens.colors.mutedInk,      // #57594F
  line: designTokens.colors.line,           // #E5E0D8
  lineSubtle: designTokens.colors.lineSubtle,
  borderDark: 'rgba(23, 23, 23, 0.1)',
  borderLight: 'rgba(23, 23, 23, 0.08)'
} as const;

export const landingTokens = {
  typography: {
    fontFamily: {
      serif: designTokens.typography.fontFamilySerif,
      sans: designTokens.typography.fontFamilySans
    },
    display: {
      fontFamily: designTokens.typography.fontFamilySerif,
      fontWeight: 500,
      letterSpacing: '-0.02em',
      lineHeight: 1.12
    },
    headline: {
      fontFamily: designTokens.typography.fontFamilySans,
      fontWeight: 600,
      letterSpacing: '-0.01em',
      lineHeight: 1.25
    },
    body: {
      fontFamily: designTokens.typography.fontFamilySans,
      fontWeight: 400,
      lineHeight: 1.65
    },
    eyebrow: {
      fontFamily: designTokens.typography.fontFamilySans,
      fontWeight: 600,
      fontSize: '0.75rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase' as const
    },
    brand: {
      name: {
        fontFamily: designTokens.typography.fontFamilySerif,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1
      },
      tagline: {
        fontFamily: designTokens.typography.fontFamilySans,
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: palette.muted
      }
    }
  },

  colors: {
    // Modo principal editorial: Fondo crema atemporal y superficies blancas/crema
    dark: {
      background: palette.canvas,
      surface: palette.paper,
      text: palette.ink,
      textMuted: palette.muted,
      border: palette.line,
      accent: palette.secondary
    },
    light: {
      background: palette.canvas,
      surface: palette.paper,
      text: palette.ink,
      textMuted: palette.muted,
      border: palette.line,
      accent: palette.secondary
    },
    contrast: {
      background: palette.ink,
      surface: '#242424',
      text: palette.canvas,
      textMuted: 'rgba(245, 242, 236, 0.72)',
      border: 'rgba(245, 242, 236, 0.15)',
      accent: palette.accent
    },
    darkSurface: {
      background: palette.paper,
      accent: palette.secondary,
      accentMuted: palette.accent,
      textPrimary: palette.ink,
      textSecondary: palette.muted,
      divider: palette.line
    }
  },

  radius: {
    badge: designTokens.radius.small,
    card: designTokens.radius.medium,
    button: designTokens.radius.small
  },

  spacing: {
    sectionY: { xs: 8, md: 14 },
    rhythm: { xs: 4, md: 8 }
  },

  borders: {
    hairlineDark: `1px solid ${palette.line}`,
    hairlineLight: `1px solid ${palette.line}`,
    darkColor: palette.line,
    lightColor: palette.line
  },

  surfaces: {
    cardDark: {
      bgcolor: palette.paper,
      border: `1px solid ${palette.line}`
    },
    heroExperienceGlass: {
      background: palette.paper,
      border: `1px solid ${palette.line}`
    },
    invitationLayer: {
      background: palette.paper,
      border: `1px solid ${palette.line}`
    },
    demoSceneLight: {
      mutedBlock: palette.line
    }
  },

  shadows: {
    elevated: designTokens.shadow.soft,
    productLayer: '0 12px 32px rgba(23, 23, 23, 0.06)'
  },

  overlays: {
    heroGradient: 'none',
    ctaGradient: 'none',
    darkWash: 'rgba(23, 23, 23, 0.65)'
  },

  glass: {
    headerScrolled: {
      backgroundColor: 'rgba(245, 242, 236, 0.94)',
      backdropFilter: 'blur(10px)'
    }
  },

  transitions: {
    duration: '0.22s',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
  }
} as const;
