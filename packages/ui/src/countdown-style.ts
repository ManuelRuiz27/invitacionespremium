import type { RelativeVisualRect } from './visual-geometry';

export interface CountdownStyle {
  numberFont: 'montserrat' | 'playfair' | 'system';
  labelFont: 'montserrat' | 'playfair' | 'system';
  numberWeight: 400 | 500 | 600 | 700;
  labelWeight: 400 | 500 | 600 | 700;
  layout: 'row' | 'grid';
  numberColor: string;
  labelColor: string;
  backgroundColor: string;
  borderColor: string;
  shadowColor: string;
  backgroundOpacity: number;
  frame: 'none' | 'thin' | 'double' | 'rounded';
  shadow: 'none' | 'soft' | 'strong';
}

export interface CountdownPlacement extends RelativeVisualRect {
  visualOwnerType: 'FLYER' | 'FLIPBOOK_PAGE';
  flipbookPageId: string | null;
}

export const countdownFonts = {
  montserrat: '"Montserrat", "Segoe UI", sans-serif',
  playfair: '"Playfair Display", Georgia, serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
} as const;

export const countdownPalettes = [
  {
    name: 'Editorial',
    numberColor: '#171717',
    labelColor: '#57594F',
    backgroundColor: '#FFFFFF',
    borderColor: '#B8A58A',
    shadowColor: '#171717',
    backgroundOpacity: 0.95
  },
  {
    name: 'Noche',
    numberColor: '#FFFFFF',
    labelColor: '#E5E0D8',
    backgroundColor: '#171717',
    borderColor: '#B8A58A',
    shadowColor: '#000000',
    backgroundOpacity: 0.9
  },
  {
    name: 'Olivo',
    numberColor: '#24362A',
    labelColor: '#465746',
    backgroundColor: '#F5F2EC',
    borderColor: '#6D705E',
    shadowColor: '#171717',
    backgroundOpacity: 0.95
  },
  {
    name: 'Vino',
    numberColor: '#6B2338',
    labelColor: '#684653',
    backgroundColor: '#FFF7F8',
    borderColor: '#8B4057',
    shadowColor: '#37121E',
    backgroundOpacity: 0.95
  }
] as const;

const { name: _defaultPaletteName, ...defaultPaletteColors } = countdownPalettes[0];

export const defaultCountdownStyle: CountdownStyle = {
  numberFont: 'montserrat',
  labelFont: 'montserrat',
  numberWeight: 600,
  labelWeight: 500,
  layout: 'row',
  ...defaultPaletteColors,
  frame: 'rounded',
  shadow: 'soft'
};

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[\da-f]{6}$/iu.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[\da-f]{3}$/iu.test(trimmed))
    return `#${[...trimmed.slice(1)]
      .map((char) => char.repeat(2))
      .join('')
      .toUpperCase()}`;
  return null;
}

export function colorWithOpacity(value: string, opacity: number): string {
  const hex = normalizeHexColor(value) ?? '#000000';
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${channels.join(', ')}, ${Math.max(0, Math.min(1, opacity))})`;
}

function luminance(color: string): number {
  const hex = normalizeHexColor(color) ?? '#000000';
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function countdownContrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function countdownParts(seconds: number | null): Array<{ value: string; label: string; shortLabel: string }> {
  const total = seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, Math.ceil(seconds));
  const values =
    total === null
      ? [null, null, null, null]
      : [Math.floor(total / 86400), Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60];
  return values.map((value, index) => ({
    value: value === null ? '—' : String(value).padStart(2, '0'),
    label: ['días', 'horas', 'minutos', 'segundos'][index]!,
    shortLabel: ['días', 'horas', 'min.', 'seg.'][index]!
  }));
}

export function rectanglesOverlap(a: RelativeVisualRect, b: RelativeVisualRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Physical image bounds inside a 320px public viewport, including its side gutters. */
export function projectCountdownPreview(imageAspectRatio: number, viewportWidth = 320, pageAspectRatio?: number) {
  const surfaceWidth = Math.max(1, viewportWidth - 32);
  const ratio = Number.isFinite(imageAspectRatio) && imageAspectRatio > 0 ? imageAspectRatio : 1;
  const surfaceHeight = surfaceWidth / (pageAspectRatio ?? ratio);
  const imageWidth = Math.min(surfaceWidth, surfaceHeight * ratio);
  const imageHeight = imageWidth / ratio;
  return {
    surfaceWidth,
    surfaceHeight,
    imageWidth,
    imageHeight,
    imageLeft: (surfaceWidth - imageWidth) / 2,
    imageTop: (surfaceHeight - imageHeight) / 2
  };
}
