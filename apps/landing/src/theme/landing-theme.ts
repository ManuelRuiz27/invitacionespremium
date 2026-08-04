import { designTokens } from '@invitaciones/ui';

/**
 * Landing-exclusive visual layer.
 *
 * Reuses `designTokens` from `@invitaciones/ui` without modifying the shared theme.
 * Centralizes repeated styles for the commercial site: typography hierarchy,
 * surfaces, radii, shadows, spacing, and transitions.
 */
export const landingTokens = {
  typography: {
    /** Hero h1 / display headlines */
    display: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
      lineHeight: 1.08
    },
    /** Section headlines */
    headline: {
      fontWeight: 720,
      letterSpacing: '-0.035em',
      lineHeight: 1.12
    },
    /** Eyebrow / badge labels */
    eyebrow: {
      fontWeight: 700,
      fontSize: '0.8rem',
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const
    },
    /** Brand lockup typography */
    brand: {
      name: {
        fontWeight: 800,
        letterSpacing: '-0.025em',
        lineHeight: 1.1
      },
      tagline: {
        fontWeight: 500,
        letterSpacing: '0.01em',
        lineHeight: 1.4,
        color: designTokens.colors.mutedInk
      }
    },
    /** Nav links */
    nav: {
      fontWeight: 600,
      fontSize: '0.92rem'
    }
  },

  surfaces: {
    /** Stable glass header — no scroll-dependent state */
    glass: {
      background: 'rgba(255, 254, 251, 0.88)',
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${designTokens.colors.line}`
    },
    /** Hero section gradient */
    heroGradient: `linear-gradient(168deg, ${designTokens.colors.canvas} 0%, ${designTokens.colors.paper} 55%, rgba(49, 87, 200, 0.03) 100%)`,
    /** Dark card for product stage */
    cardDark: {
      background: designTokens.colors.ink,
      color: '#FFFFFF',
      border: '1px solid rgba(255, 255, 255, 0.08)'
    },
    /** Light card */
    cardLight: {
      background: designTokens.colors.paper,
      border: `1px solid ${designTokens.colors.line}`
    }
  },

  radius: {
    pill: 100,
    card: designTokens.radius.large,
    badge: designTokens.radius.small,
    button: designTokens.radius.small
  },

  shadows: {
    soft: designTokens.shadow.soft,
    elevated: '0 8px 32px rgba(23, 35, 60, 0.12)',
    subtle: '0 2px 8px rgba(23, 35, 60, 0.06)'
  },

  spacing: {
    sectionY: { xs: 6, md: 10 }
  },

  transitions: {
    duration: '0.2s',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
} as const;
