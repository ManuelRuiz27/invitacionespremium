const palette = ['#6750A4', '#386A20', '#006A6A', '#9C4146', '#8C5000'] as const;

export function stickerColor(key: string, decorative = false) {
  if (decorative) return '#FFF3D6';
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.codePointAt(0)!) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}

export function contrastingText(background: string) {
  const value = background.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.55 ? '#1C1B1F' : '#FFFFFF';
}
