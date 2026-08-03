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
  it('rejects a nearby completion without evicting two visible photos', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const states = new Map<string, PhotoPoolState[]>();
    for (const key of ['A', 'B']) {
      const values: PhotoPoolState[] = [];
      states.set(key, values);
      pool.subscribe(key, (state) => values.push(state), 2);
      pool.load(key, () => Promise.resolve(new Blob([key])));
      await vi.waitFor(() => expect(values.at(-1)?.status).toBe('ready'));
    }
    const incoming: PhotoPoolState[] = [];
    pool.subscribe('C', (state) => incoming.push(state), 1);
    pool.load('C', () => Promise.resolve(new Blob(['C'])));
    await vi.waitFor(() => expect(incoming.at(-1)?.status).toBe('evicted'));

    expect(states.get('A')?.at(-1)?.status).toBe('ready');
    expect(states.get('B')?.at(-1)?.status).toBe('ready');
    expect(incoming.some((state) => state.status === 'error')).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(maximumActiveUrls).toBe(2);
    pool.dispose();
  });

  it('protects selected and visible URLs from a nearby completion', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const selected: PhotoPoolState[] = [];
    const visible: PhotoPoolState[] = [];
    const nearby: PhotoPoolState[] = [];
    pool.subscribe('selected', (state) => selected.push(state), 3);
    pool.load('selected', () => Promise.resolve(new Blob(['selected'])));
    await vi.waitFor(() => expect(selected.at(-1)?.status).toBe('ready'));
    pool.subscribe('visible', (state) => visible.push(state), 2);
    pool.load('visible', () => Promise.resolve(new Blob(['visible'])));
    await vi.waitFor(() => expect(visible.at(-1)?.status).toBe('ready'));
    pool.subscribe('nearby', (state) => nearby.push(state), 1);
    pool.load('nearby', () => Promise.resolve(new Blob(['nearby'])));
    await vi.waitFor(() => expect(nearby.at(-1)?.status).toBe('evicted'));

    expect(selected.at(-1)?.status).toBe('ready');
    expect(visible.at(-1)?.status).toBe('ready');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    pool.dispose();
  });

  it('admits a visible completion by evicting the least-recent nearby URL', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const first: PhotoPoolState[] = [];
    const second: PhotoPoolState[] = [];
    const visible: PhotoPoolState[] = [];
    pool.subscribe('nearby-A', (state) => first.push(state), 1);
    pool.load('nearby-A', () => Promise.resolve(new Blob(['A'])));
    await vi.waitFor(() => expect(first.at(-1)?.status).toBe('ready'));
    pool.subscribe('nearby-B', (state) => second.push(state), 1);
    pool.load('nearby-B', () => Promise.resolve(new Blob(['B'])));
    await vi.waitFor(() => expect(second.at(-1)?.status).toBe('ready'));
    pool.subscribe('visible', (state) => visible.push(state), 2);
    pool.load('visible', () => Promise.resolve(new Blob(['visible'])));
    await vi.waitFor(() => expect(visible.at(-1)?.status).toBe('ready'));

    expect(first.at(-1)?.status).toBe('evicted');
    expect(second.at(-1)?.status).toBe('ready');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pool-1');
    expect(maximumActiveUrls).toBeLessThanOrEqual(2);
    pool.dispose();
  });

  it('uses LRU among equal-priority candidates after a touch update', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const first: PhotoPoolState[] = [];
    const second: PhotoPoolState[] = [];
    pool.subscribe('A', (state) => first.push(state), 1);
    pool.load('A', () => Promise.resolve(new Blob(['A'])));
    await vi.waitFor(() => expect(first.at(-1)?.status).toBe('ready'));
    pool.subscribe('B', (state) => second.push(state), 1);
    pool.load('B', () => Promise.resolve(new Blob(['B'])));
    await vi.waitFor(() => expect(second.at(-1)?.status).toBe('ready'));
    pool.subscribe('A', () => undefined, 1);
    pool.subscribe('C', () => undefined, 1);
    pool.load('C', () => Promise.resolve(new Blob(['C'])));
    await vi.waitFor(() => expect(second.at(-1)?.status).toBe('evicted'));

    expect(first.at(-1)?.status).toBe('ready');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pool-2');
    pool.dispose();
  });

  it('evicts an unobserved ready URL before visible content', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const unobserved: PhotoPoolState[] = [];
    const visible: PhotoPoolState[] = [];
    const nearby: PhotoPoolState[] = [];
    const unsubscribe = pool.subscribe('unobserved', (state) => unobserved.push(state), 1);
    pool.load('unobserved', () => Promise.resolve(new Blob(['unobserved'])));
    await vi.waitFor(() => expect(unobserved.at(-1)?.status).toBe('ready'));
    unsubscribe();
    pool.subscribe('visible', (state) => visible.push(state), 2);
    pool.load('visible', () => Promise.resolve(new Blob(['visible'])));
    await vi.waitFor(() => expect(visible.at(-1)?.status).toBe('ready'));
    pool.subscribe('nearby', (state) => nearby.push(state), 1);
    pool.load('nearby', () => Promise.resolve(new Blob(['nearby'])));
    await vi.waitFor(() => expect(nearby.at(-1)?.status).toBe('ready'));

    expect(visible.at(-1)?.status).toBe('ready');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pool-1');
    pool.dispose();
  });

  it('readmits a rejected entry after its priority rises and a lower-priority URL can make room', async () => {
    const pool = new PublicPhotoPool(2, 2);
    const first: PhotoPoolState[] = [];
    const second: PhotoPoolState[] = [];
    const incoming: PhotoPoolState[] = [];
    const unsubscribeFirst = pool.subscribe('A', (state) => first.push(state), 2);
    pool.load('A', () => Promise.resolve(new Blob(['A'])));
    await vi.waitFor(() => expect(first.at(-1)?.status).toBe('ready'));
    pool.subscribe('B', (state) => second.push(state), 2);
    pool.load('B', () => Promise.resolve(new Blob(['B'])));
    await vi.waitFor(() => expect(second.at(-1)?.status).toBe('ready'));
    pool.subscribe('C', (state) => incoming.push(state), 1);
    pool.load('C', () => Promise.resolve(new Blob(['C'])));
    await vi.waitFor(() => expect(incoming.at(-1)?.status).toBe('evicted'));

    pool.subscribe('A', (state) => first.push(state), 0);
    unsubscribeFirst();
    pool.subscribe('C', () => undefined, 2);
    pool.load('C', () => Promise.resolve(new Blob(['C-again'])));
    await vi.waitFor(() => expect(incoming.at(-1)?.status).toBe('ready'));
    expect(first.at(-1)?.status).toBe('evicted');
    expect(second.at(-1)?.status).toBe('ready');
    expect(incoming.some((state) => state.status === 'error')).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
    pool.dispose();
  });

  it('never starts more than four downloads and prioritizes the selected photo', async () => {
    const pool = new PublicPhotoPool(8, 4);
    const work = Array.from({ length: 10 }, () => deferred<Blob>());
    const started: number[] = [];
    const signals: AbortSignal[] = [];
    for (let index = 0; index < work.length; index += 1) {
      const key = String(index);
      pool.subscribe(key, () => undefined, index === 9 ? 3 : 1);
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

  it('retains at most eight Object URLs and revokes all of them on dispose', async () => {
    const pool = new PublicPhotoPool();
    for (let index = 0; index < 9; index += 1) {
      const key = String(index);
      pool.subscribe(key, () => undefined, 2);
      pool.load(key, () => Promise.resolve(new Blob([key])));
      await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(index + 1));
    }

    expect(maximumActiveUrls).toBe(8);
    expect(activeUrls.size).toBe(8);
    pool.dispose();
    expect(activeUrls.size).toBe(0);
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
