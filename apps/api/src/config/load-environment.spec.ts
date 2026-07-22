import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvironmentFiles } from './load-environment';

const TEST_KEY = 'CODEX_ENV_LOADER_TEST';
let temporaryDirectory: string | undefined;

afterEach(async () => {
  delete process.env[TEST_KEY];

  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe('loadEnvironmentFiles', () => {
  it('loads the nearest .env file before environment validation', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'invitacionespremium-env-'));
    await writeFile(join(temporaryDirectory, '.env'), `${TEST_KEY}=loaded-before-validation\n`, 'utf8');

    loadEnvironmentFiles(temporaryDirectory);

    expect(process.env[TEST_KEY]).toBe('loaded-before-validation');
  });
});
