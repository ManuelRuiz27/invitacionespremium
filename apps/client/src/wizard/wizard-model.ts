import type { AvailableService, Event, UpdateEventInput } from '@invitaciones/api-client';

export const wizardSteps = [
  'datos',
  'contactos',
  'invitacion',
  'confirmacion',
  'croquis',
  'pases',
  'revision'
] as const;
export type WizardStep = (typeof wizardSteps)[number];
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const digitalSteps: WizardStep[] = ['datos', 'contactos', 'invitacion', 'confirmacion', 'croquis', 'revision'];
const physicalSteps: WizardStep[] = ['datos', 'contactos', 'croquis', 'pases', 'revision'];

export function stepsForService(code: AvailableService['code'] | undefined): WizardStep[] {
  return code === 'PHYSICAL_QR' ? physicalSteps : digitalSteps;
}

export function isEditableEvent(status: Event['status']): boolean {
  return ['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE'].includes(status);
}

export function isMeaningfulDraft(input: UpdateEventInput): boolean {
  return Boolean(input.serviceId || input.name?.trim() || input.eventDateTime || input.capacity);
}

export function createOperationKey(scope: string, eventId: string): string {
  const storageKey = `event-wizard:${scope}:${eventId}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const value = globalThis.crypto.randomUUID();
  sessionStorage.setItem(storageKey, value);
  return value;
}

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
