export interface StoredFileWrite {
  storageKey: string;
  bytes: Buffer;
}

export abstract class FileStorage {
  abstract generateKey(): string;
  abstract write(input: StoredFileWrite): Promise<void>;
  abstract read(storageKey: string): Promise<Buffer>;
  abstract delete(storageKey: string): Promise<void>;
}
