import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export function loadEnvironmentFiles(cwd: string = process.cwd()): void {
  const candidates = [
    resolve(cwd, '.env'),
    resolve(cwd, 'apps/api/.env'),
    resolve(cwd, '../../.env')
  ];

  const loaded = new Set<string>();

  for (const path of candidates) {
    if (loaded.has(path) || !existsSync(path)) {
      continue;
    }

    loadDotenv({ path, override: false, quiet: true });
    loaded.add(path);
  }
}
