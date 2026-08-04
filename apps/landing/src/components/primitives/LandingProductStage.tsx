import { Box, Typography } from '@mui/material';
import { designTokens } from '@invitaciones/ui';
import { landingTokens } from '../../theme/landing-theme';

export interface ProductStagePillar {
  readonly title: string;
  readonly description: string;
}

export interface LandingProductStageProps {
  /** Solution pillars from `landingContent.solution.pillars` */
  pillars: readonly ProductStagePillar[];
  /** Access rule notice from `landingContent.solution.ruleNotice` */
  ruleNotice: string;
}

/**
 * Abstract visual composition of the operational flow based exclusively on
 * `landingContent.solution.pillars` and `landingContent.solution.ruleNotice`.
 *
 * Represented as a numbered step sequence — NOT a real product screenshot.
 * Animations respect `prefers-reduced-motion`.
 */
export function LandingProductStage({ pillars, ruleNotice }: LandingProductStageProps) {
  return (
    <Box
      sx={{
        ...landingTokens.surfaces.cardDark,
        borderRadius: `${landingTokens.radius.card}px`,
        p: { xs: 2.5, md: 3 },
        boxShadow: landingTokens.shadows.elevated,
        overflow: 'hidden'
      }}
    >
      {/* Rule notice as accent caption */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: designTokens.colors.accent,
          fontWeight: 700,
          fontSize: '0.7rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          mb: 2.5,
          pl: 0.5
        }}
      >
        {ruleNotice}
      </Typography>

      {/* Pillar steps */}
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {pillars.map((pillar, index) => (
          <Box
            component="li"
            key={index}
            sx={{
              display: 'flex',
              gap: 1.5,
              py: 1.5,
              borderTop: index > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
              '@media (prefers-reduced-motion: no-preference)': {
                opacity: 0,
                animation: 'landingStageIn 0.4s ease both',
                animationDelay: `${index * 0.1}s`
              },
              '@keyframes landingStageIn': {
                from: { opacity: 0, transform: 'translateY(6px)' },
                to: { opacity: 1, transform: 'translateY(0)' }
              }
            }}
          >
            {/* Step indicator */}
            <Box
              aria-hidden="true"
              sx={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `1.5px solid ${designTokens.colors.accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mt: 0.25
              }}
            >
              <Typography
                component="span"
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: designTokens.colors.accent,
                  lineHeight: 1
                }}
              >
                {index + 1}
              </Typography>
            </Box>

            {/* Content */}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                  lineHeight: 1.3
                }}
              >
                {pillar.title}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255, 255, 255, 0.75)',
                  display: 'block',
                  mt: 0.25,
                  lineHeight: 1.4,
                  fontSize: '0.74rem'
                }}
              >
                {pillar.description}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
