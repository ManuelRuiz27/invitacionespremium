import { designTokens } from '@invitaciones/ui';

export const floorplanColors = {
  accent: designTokens.colors.accent,
  accentDark: designTokens.colors.accentDark,
  canvas: designTokens.colors.canvas,
  ink: designTokens.colors.ink,
  line: designTokens.colors.line,
  paper: designTokens.colors.paper,
  mutedInk: designTokens.colors.mutedInk,
  warning: designTokens.colors.warning,
  accentWash: 'rgba(49, 87, 200, 0.08)',
  gridLine: 'rgba(49, 87, 200, 0.22)',
  selectionHalo: 'rgba(49, 87, 200, 0.18)',
  stickerShadow: 'rgba(23, 35, 60, 0.14)',
  zoneFill: 'rgba(167, 101, 16, 0.14)'
} as const;

export function stickerColor(_key: string, decorative = false) {
  return decorative ? floorplanColors.canvas : floorplanColors.paper;
}

export function contrastingText(background: string) {
  const value = background.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.55 ? floorplanColors.ink : floorplanColors.paper;
}
