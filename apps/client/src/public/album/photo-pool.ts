export type PhotoPoolState =
  | { status: 'idle'; url: null }
  | { status: 'loading'; url: null }
  | { status: 'ready'; url: string }
  | { status: 'error'; url: null }
  | { status: 'evicted'; url: null };

type Listener = (state: PhotoPoolState) => void;
type Loader = (signal: AbortSignal) => Promise<Blob>;

interface Entry {
  state: PhotoPoolState;
  controller?: AbortController;
  listeners: Map<Listener, number>;
  loader?: Loader;
  touched: number;
}

export class PublicPhotoPool {
  private readonly entries = new Map<string, Entry>();
  private clock = 0;
  private activeLoads = 0;
  private disposed = false;

  constructor(
    private readonly urlLimit = 8,
    private readonly concurrencyLimit = 4
  ) {}

  subscribe(key: string, listener: Listener, priority = 1): () => void {
    const entry = this.entry(key);
    entry.listeners.set(listener, priority);
    entry.touched = ++this.clock;
    listener(entry.state);
    this.pump();
    return () => {
      entry.listeners.delete(listener);
      queueMicrotask(() => {
        if (!this.disposed && entry.listeners.size === 0 && entry.state.status === 'loading') this.cancelLoad(entry);
      });
    };
  }

  load(key: string, loader: Loader, force = false): void {
    if (this.disposed) return;
    const entry = this.entry(key);
    entry.loader = loader;
    entry.touched = ++this.clock;
    if (entry.state.status === 'ready' && !force) {
      this.emit(entry);
      return;
    }
    if (entry.state.status === 'loading' && !force) return;
    this.cancelLoad(entry);
    if (force) this.revoke(entry, 'idle');
    entry.state = { status: 'loading', url: null };
    this.emit(entry);
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      this.cancelLoad(entry);
      this.revoke(entry, 'idle');
      entry.listeners.clear();
      delete entry.loader;
    }
    this.entries.clear();
  }

  private entry(key: string): Entry {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const created: Entry = {
      state: { status: 'idle', url: null },
      listeners: new Map(),
      touched: ++this.clock
    };
    this.entries.set(key, created);
    return created;
  }

  private pump(): void {
    if (this.disposed) return;
    while (this.activeLoads < this.concurrencyLimit) {
      const candidate = [...this.entries.values()]
        .filter(
          (entry): entry is Entry & { loader: Loader } =>
            entry.state.status === 'loading' && !entry.controller && Boolean(entry.loader) && entry.listeners.size > 0
        )
        .sort((left, right) => this.priority(right) - this.priority(left) || right.touched - left.touched)[0];
      if (!candidate) return;
      this.start(candidate);
    }
  }

  private start(entry: Entry & { loader: Loader }): void {
    const controller = new AbortController();
    entry.controller = controller;
    this.activeLoads += 1;
    void entry.loader(controller.signal).then(
      (blob) => {
        if (this.disposed || controller.signal.aborted || entry.controller !== controller) return;
        this.finishLoad(entry, controller);
        this.makeRoom(entry);
        entry.state = { status: 'ready', url: URL.createObjectURL(blob) };
        entry.touched = ++this.clock;
        this.emit(entry);
        this.pump();
      },
      (error: unknown) => {
        if (entry.controller !== controller) return;
        this.finishLoad(entry, controller);
        if (!controller.signal.aborted && !isAbort(error)) {
          entry.state = { status: 'error', url: null };
          this.emit(entry);
        }
        this.pump();
      }
    );
  }

  private finishLoad(entry: Entry, controller: AbortController): void {
    if (entry.controller !== controller) return;
    delete entry.controller;
    this.activeLoads -= 1;
  }

  private cancelLoad(entry: Entry): void {
    if (entry.controller) {
      const controller = entry.controller;
      controller.abort();
      this.finishLoad(entry, controller);
    }
    if (entry.state.status === 'loading') entry.state = { status: 'idle', url: null };
    this.pump();
  }

  private makeRoom(incoming: Entry): void {
    while (this.readyCount() >= this.urlLimit) {
      const candidate = [...this.entries.values()]
        .filter((entry) => entry !== incoming && entry.state.status === 'ready')
        .sort((left, right) => this.priority(left) - this.priority(right) || left.touched - right.touched)[0];
      if (!candidate) return;
      this.revoke(candidate, 'evicted');
      this.emit(candidate);
    }
  }

  private readyCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.state.status === 'ready') count += 1;
    return count;
  }

  private priority(entry: Entry): number {
    let highest = 0;
    for (const priority of entry.listeners.values()) highest = Math.max(highest, priority);
    return highest;
  }

  private revoke(entry: Entry, next: 'idle' | 'evicted'): void {
    if (entry.state.status === 'ready') URL.revokeObjectURL(entry.state.url);
    entry.state = { status: next, url: null };
  }

  private emit(entry: Entry): void {
    for (const listener of entry.listeners.keys()) listener(entry.state);
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}
