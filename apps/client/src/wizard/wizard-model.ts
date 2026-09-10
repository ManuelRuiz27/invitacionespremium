import type { AvailableService, Event, UpdateEventInput } from '@invitaciones/api-client';

export { AttemptManager, isUncertainFailure } from '../shared/attempt-manager';

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
