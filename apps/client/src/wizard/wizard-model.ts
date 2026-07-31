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
const physicalSteps: WizardStep[] = ['datos', 'croquis', 'pases', 'revision'];

export function stepsForService(code: AvailableService['code'] | undefined): WizardStep[] {
  return code === 'PHYSICAL_QR' ? physicalSteps : digitalSteps;
}

export function isEditableEvent(status: Event['status']): boolean {
  return ['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE'].includes(status);
}

export function isMeaningfulDraft(input: UpdateEventInput): boolean {
  return Boolean(input.serviceId || input.name?.trim() || input.eventDateTime || input.capacity);
}

export type Attempt = { identity: string; key: string };

/** Keeps only an unresolved operation attempt. Resolved keys are never persisted. */
export class AttemptManager {
  private readonly attempts = new Map<string, Attempt>();

  start(scope: string, identity: string, forceNew = false): Attempt {
    const current = this.attempts.get(scope);
    if (!forceNew && current?.identity === identity) return current;
    const attempt = { identity, key: globalThis.crypto.randomUUID() };
    this.attempts.set(scope, attempt);
    return attempt;
  }

  current(scope: string): Attempt | undefined {
    return this.attempts.get(scope);
  }

  clear(scope: string, key?: string): void {
    if (!key || this.attempts.get(scope)?.key === key) this.attempts.delete(scope);
  }
}

export function isUncertainFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');
}
