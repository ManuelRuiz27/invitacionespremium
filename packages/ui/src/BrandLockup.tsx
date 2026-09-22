import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { designTokens } from './theme';

export interface BrandLockupProps {
  /**
   * Scale of the lockup:
   * - `small`: for headers, mobile bars, and sidebar navigation
   * - `medium`: for footer, card headers, and dialogs
   * - `large`: for login screens, welcome heroes, and splash screens
   */
  size?: 'small' | 'medium' | 'large' | undefined;
  /**
   * Visual contrast tone:
   * - `dark`: for cream / white surfaces (default)
   * - `light`: for dark / contrast surfaces (e.g. admin login dark panel)
   * - `inherit`: inherits surrounding text color
   */
  tone?: 'dark' | 'light' | 'inherit' | undefined;
  /** Optional secondary subtitle (e.g. "Platform Admin", "Hospitality & Event Technology") */
  tagline?: string | undefined;
  /** Custom SX overrides */
  sx?: SxProps<Theme> | undefined;
}

export function BrandLockup({ size = 'small', tone = 'dark', tagline, sx }: BrandLockupProps) {
  const isLight = tone === 'light';
  const isInherit = tone === 'inherit';

  const categoryColor = isInherit ? 'inherit' : isLight ? designTokens.colors.accent : designTokens.colors.mutedInk;

  const titleColor = isInherit ? 'inherit' : isLight ? designTokens.colors.canvas : designTokens.colors.ink;

  const fontSizes = {
    small: { category: '0.55rem', title: '1.25rem', tagline: '0.68rem', gap: 0.1 },
    medium: { category: '0.65rem', title: '1.75rem', tagline: '0.78rem', gap: 0.2 },
    large: { category: '0.8rem', title: '2.5rem', tagline: '0.9rem', gap: 0.3 }
  }[size];

  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        lineHeight: 1,
        userSelect: 'none',
        ...sx
      }}
    >
      <Typography
        component="span"
        sx={{
          fontFamily: designTokens.typography.fontFamilySans,
          fontSize: fontSizes.category,
          fontWeight: 600,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: categoryColor,
          lineHeight: 1,
          mb: `${fontSizes.gap}rem`
        }}
      >
        Invitaciones
      </Typography>
      <Typography
        component="span"
        sx={{
          fontFamily: designTokens.typography.fontFamilySerif,
          fontSize: fontSizes.title,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: titleColor,
          lineHeight: 1
        }}
      >
        Premium
      </Typography>
      {tagline ? (
        <Typography
          component="span"
          sx={{
            fontFamily: designTokens.typography.fontFamilySans,
            fontSize: fontSizes.tagline,
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: categoryColor,
            lineHeight: 1.2,
            mt: 0.75,
            opacity: 0.85
          }}
        >
          {tagline}
        </Typography>
      ) : null}
    </Box>
  );
}
