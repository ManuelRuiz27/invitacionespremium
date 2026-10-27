import type { CaptureEntry } from './safe-capture.mjs';
export type Inventory = { version: 1; sourceCommit?: string; runtimeSha256: string; captures: CaptureEntry[] };
export const expectedImages: string[];
export function runtimeHash(): Promise<string>;
export function verifyImages(directory: string, expected?: string[]): Promise<Inventory>;
export function verifyDocuments(inventory: Inventory): Promise<void>;
