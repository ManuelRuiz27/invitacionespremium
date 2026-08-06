import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { AppConfigService } from '../config/app-config.service';
import { FileStorage, type StoredFileWrite } from './file-storage';

const STORAGE_KEY_PATTERN = /^(?:[0-9a-f]{64}|staging-demo\/floorplan\.png)$/u;

@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly root: string;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super();
    this.root = path.resolve(config.fileStorageLocalRoot, config.nodeEnv);
  }

  generateKey(): string {
    return randomBytes(32).toString('hex');
  }

  async write(input: StoredFileWrite): Promise<void> {
    const target = this.resolveKey(input.storageKey);
    const directory = path.dirname(target);
    const temporary = path.join(directory, `.${path.basename(target)}.${randomBytes(12).toString('hex')}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      await mkdir(directory, { recursive: true });
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(input.bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, target);
    } catch {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      throw storageFailure();
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveKey(storageKey));
    } catch {
      throw storageFailure();
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await rm(this.resolveKey(storageKey), { force: true });
    } catch {
      throw storageFailure();
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(this.resolveKey(storageKey), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw storageFailure();
    }
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) {
      throw storageFailure();
    }
    return resolved;
  }
}

function storageFailure(): DomainError {
  return new DomainError(
    'FILE_STORAGE_FAILURE',
    'The file storage operation failed.',
    HttpStatus.INTERNAL_SERVER_ERROR
  );
}
