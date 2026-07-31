import type { SaveState } from '../wizard-model';

export class SerialAutosave<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queued: T | undefined;
  private running: Promise<void> | undefined;
  private disposed = false;

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly onState: (state: SaveState) => void,
    private readonly delay = 900
  ) {}

  schedule(value: T): void {
    if (this.disposed) return;
    this.queued = value;
    if (this.timer) clearTimeout(this.timer);
    this.onState('pending');
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  async flush(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) await this.running;
    const value = this.queued;
    this.queued = undefined;
    if (value === undefined || this.disposed) return true;
    this.onState('saving');
    let failed = false;
    this.running = this.save(value)
      .then(() => this.onState('saved'))
      .catch(() => {
        failed = true;
        this.queued = value;
        this.onState('error');
      })
      .finally(() => {
        this.running = undefined;
      });
    await this.running;
    if (failed) return false;
    if (this.queued !== undefined && !this.disposed) return this.flush();
    return true;
  }

  hasPending(): boolean {
    return this.queued !== undefined || this.running !== undefined;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
