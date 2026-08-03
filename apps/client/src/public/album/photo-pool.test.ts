import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicPhotoPool, type PhotoPoolState } from './photo-pool';

let activeUrls: Set<string>;
let maximumActiveUrls: number;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  let nextUrl = 0;
  activeUrls = new Set();
  maximumActiveUrls = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => {
      const url = `blob:pool-${++nextUrl}`;
      activeUrls.add(url);
      maximumActiveUrls = Math.max(maximumActiveUrls, activeUrls.size);
      return url;
    })
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn((url: string) => activeUrls.delete(url))
  });
});

describe('PublicPhotoPool', () => {
  it('distinguishes eviction from a real loader error and reloads an evicted entry', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const states = new Map<string, PhotoPoolState[]>();
    for (const key of ['one', 'two', 'three']) {
      const values: PhotoPoolState[] = [];
      states.set(key, values);
      pool.subscribe(key, (state) => values.push(state));
      pool.load(key, () => Promise.resolve(new Blob([key])));
    }
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));
    expect(maximumActiveUrls).toBeLessThanOrEqual(2);
    expect(states.get('one')?.at(-1)?.status).toBe('evicted');
    expect(states.get('one')?.some((state) => state.status === 'error')).toBe(false);

    pool.load('one', () => Promise.resolve(new Blob(['one-again'])));
    await vi.waitFor(() => expect(states.get('one')?.at(-1)?.status).toBe('ready'));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(4);
    pool.dispose();
  });

  it('never starts more than four downloads and prioritizes the selected photo', async () => {
    const pool = new PublicPhotoPool(8, 4);
    const work = Array.from({ length: 10 }, () => deferred<Blob>());
    const started: number[] = [];
    const signals: AbortSignal[] = [];
    for (let index = 0; index < work.length; index += 1) {
      const key = String(index);
      pool.subscribe(key, () => undefined, index === 9 ? 2 : 1);
      pool.load(key, (signal) => {
        started.push(index);
        signals.push(signal);
        return work[index]!.promise;
      });
    }
    expect(started).toHaveLength(4);
    work[started[0]!]!.resolve(new Blob(['done']));
    await vi.waitFor(() => expect(started).toHaveLength(5));
    expect(started[4]).toBe(9);
    expect(signals.filter((signal) => !signal.aborted)).toHaveLength(5);
    pool.dispose();
    expect(signals.slice(1).every((signal) => signal.aborted)).toBe(true);
  });

  it('pins a selected ready photo while lower-priority URLs are evicted', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const selected: PhotoPoolState[] = [];
    pool.subscribe('selected', (state) => selected.push(state), 2);
    pool.load('selected', () => Promise.resolve(new Blob(['selected'])));
    for (const key of ['visible-1', 'visible-2']) {
      pool.subscribe(key, () => undefined, 1);
      pool.load(key, () => Promise.resolve(new Blob([key])));
    }
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));
    expect(selected.at(-1)?.status).toBe('ready');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:pool-1');
    pool.dispose();
  });

  it('reserves error for real failures and supports an explicit retry', async () => {
    const pool = new PublicPhotoPool(8, 4);
    const states: PhotoPoolState[] = [];
    pool.subscribe('photo', (state) => states.push(state));
    pool.load('photo', () => Promise.reject(new Error('storage')));
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('error'));
    pool.load('photo', () => Promise.resolve(new Blob(['recovered'])), true);
    await vi.waitFor(() => expect(states.at(-1)?.status).toBe('ready'));
    pool.dispose();
  });

  it('aborts every in-flight load, clears queued work and revokes every URL on dispose', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const signals: AbortSignal[] = [];
    pool.subscribe('ready', () => undefined);
    pool.load('ready', () => Promise.resolve(new Blob(['ready'])));
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    for (const key of ['active-1', 'active-2', 'queued']) {
      pool.subscribe(key, () => undefined);
      pool.load(key, (signal) => {
        signals.push(signal);
        return new Promise(() => undefined);
      });
    }
    expect(signals).toHaveLength(2);
    pool.dispose();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pool-1');
  });
});
