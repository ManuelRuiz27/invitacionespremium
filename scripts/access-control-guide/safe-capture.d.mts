import type { Page, Locator } from '@playwright/test';
export type Rectangle = { x: number; y: number; width: number; height: number };
export type CaptureEntry = {
  file: string;
  surface: 'admin' | 'salon' | 'scanner';
  mode: 'NOMINAL' | 'ANONYMOUS' | 'AMBOS';
  route: string;
  anchor: string;
  width: number;
  height: number;
  sha256: string;
  masks: Rectangle[];
  focus: Rectangle | null;
  dialog: Rectangle | null;
};
export const secretPattern: RegExp;
export const maskColor: string;
export function maskQrPixels(png: Buffer): Promise<{ png: Buffer; masks: Rectangle[] }>;
export function capture(
  page: Page,
  directory: string,
  name: string,
  anchor: Locator,
  surface: CaptureEntry['surface'],
  mode: CaptureEntry['mode'],
  inventory: CaptureEntry[]
): Promise<void>;
