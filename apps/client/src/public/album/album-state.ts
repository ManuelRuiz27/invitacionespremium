const colorPattern = /^#[0-9A-F]{6}$/;

export function safeThemeColor(value: string, fallback: string): string {
  return colorPattern.test(value) ? value : fallback;
}
