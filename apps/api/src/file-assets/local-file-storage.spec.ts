import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { LocalFileStorage } from './local-file-storage';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('LocalFileStorage', () => {
  it('uses unpredictable keys and atomic writes without residual temp files', async () => {
    const { root, storage } = await createStorage();
    const first = storage.generateKey();
    const second = storage.generateKey();
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).not.toBe(first);

    await storage.write({ storageKey: first, bytes: Buffer.from('safe') });
    expect(await storage.read(first)).toEqual(Buffer.from('safe'));
    expect(await readdir(path.join(root, 'test'))).toEqual([first]);
    await storage.delete(first);
    expect(await storage.exists(first)).toBe(false);
  });

  it('rejects path traversal keys without exposing a physical path', async () => {
    const { storage } = await createStorage();
    await expect(storage.write({ storageKey: '../escape', bytes: Buffer.from('unsafe') })).rejects.toMatchObject({
      response: { code: 'FILE_STORAGE_FAILURE', message: 'The file storage operation failed.' }
    });
  });

  it('supports the single recognizable staging floorplan key without opening arbitrary paths', async () => {
    const { storage } = await createStorage();
    await storage.write({ storageKey: 'staging-demo/floorplan.png', bytes: Buffer.from('demo') });
    expect(await storage.read('staging-demo/floorplan.png')).toEqual(Buffer.from('demo'));
    await expect(
      storage.write({ storageKey: 'staging-demo/other.png', bytes: Buffer.from('unsafe') })
    ).rejects.toThrow();
  });

  it('removes the temporary file when the atomic rename fails', async () => {
    const { root, storage } = await createStorage();
    const key = storage.generateKey();
    await mkdir(path.join(root, 'test', key), { recursive: true });

    await expect(storage.write({ storageKey: key, bytes: Buffer.from('will-fail') })).rejects.toMatchObject({
      response: { code: 'FILE_STORAGE_FAILURE' }
    });
    expect((await readdir(path.join(root, 'test'))).filter((entry) => entry.startsWith('.'))).toEqual([]);
  });
});

async function createStorage(): Promise<{ root: string; storage: LocalFileStorage }> {
  const root = await mkdtemp(path.join(tmpdir(), 'file-assets-storage-'));
  roots.push(root);
  return {
    root,
    storage: new LocalFileStorage({
      fileStorageLocalRoot: root,
      nodeEnv: 'test'
    } as AppConfigService)
  };
}
