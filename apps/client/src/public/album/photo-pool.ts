export interface PhotoPoolState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

interface Entry extends PhotoPoolState {
  controller?: AbortController;
  listeners: Set<(state: PhotoPoolState) => void>;
  touched: number;
}

export class PublicPhotoPool {
  private readonly entries = new Map<string, Entry>();
  private clock = 0;

  constructor(private readonly limit = 8) {}

  subscribe(key: string, listener: (state: PhotoPoolState) => void): () => void {
    const entry = this.entry(key);
    entry.listeners.add(listener);
    listener(this.snapshot(entry));
    return () => entry.listeners.delete(listener);
  }

  load(key: string, loader: (signal: AbortSignal) => Promise<Blob>, force = false): void {
    const entry = this.entry(key);
    entry.touched = ++this.clock;
    if (entry.url && !force) {
      this.emit(entry);
      return;
    }
    if (entry.loading && !force) return;
    entry.controller?.abort();
    if (force) this.revoke(entry);
    const controller = new AbortController();
    entry.controller = controller;
    entry.loading = true;
    entry.error = false;
    this.emit(entry);
    void loader(controller.signal).then(
      (blob) => {
        if (controller.signal.aborted || entry.controller !== controller) return;
        this.revoke(entry);
        entry.url = URL.createObjectURL(blob);
        entry.loading = false;
        entry.error = false;
        entry.touched = ++this.clock;
        this.evict(key);
        this.emit(entry);
      },
      (error: unknown) => {
        if (controller.signal.aborted || entry.controller !== controller || isAbort(error)) return;
        entry.loading = false;
        entry.error = true;
        this.emit(entry);
      }
    );
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.controller?.abort();
      this.revoke(entry);
      entry.listeners.clear();
    }
    this.entries.clear();
  }

  private entry(key: string): Entry {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const created: Entry = { url: null, loading: false, error: false, listeners: new Set(), touched: ++this.clock };
    this.entries.set(key, created);
    return created;
  }

  private evict(protectedKey: string): void {
    while ([...this.entries.values()].filter((entry) => entry.url).length > this.limit) {
      const candidate = [...this.entries.entries()]
        .filter(([key, entry]) => key !== protectedKey && entry.url)
        .sort(([, left], [, right]) => left.touched - right.touched)[0];
      if (!candidate) return;
      const [, entry] = candidate;
      this.revoke(entry);
      this.emit(entry);
    }
  }

  private revoke(entry: Entry): void {
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = null;
  }

  private emit(entry: Entry): void {
    const state = this.snapshot(entry);
    for (const listener of entry.listeners) listener(state);
  }

  private snapshot(entry: Entry): PhotoPoolState {
    return { url: entry.url, loading: entry.loading, error: entry.error };
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}
