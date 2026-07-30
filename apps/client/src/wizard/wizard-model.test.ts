import type { Event, UpdateEventInput } from '@invitaciones/api-client';
import { describe, expect, it, vi } from 'vitest';
import {
  createOperationKey,
  isEditableEvent,
  isMeaningfulDraft,
  SerialAutosave,
  stepsForService
} from './wizard-model';

describe('Event wizard model scenarios', () => {
  it.each([
    ['FLYER', ['datos', 'contactos', 'invitacion', 'confirmacion', 'croquis', 'revision']],
    ['FLIPBOOK', ['datos', 'contactos', 'invitacion', 'confirmacion', 'croquis', 'revision']],
    ['PHYSICAL_QR', ['datos', 'contactos', 'croquis', 'pases', 'revision']],
    [undefined, ['datos', 'contactos', 'invitacion', 'confirmacion', 'croquis', 'revision']]
  ] as const)('derives the authoritative navigation for %s', (service, expected) => {
    expect(stepsForService(service)).toEqual(expected);
  });

  it.each([
    ['DRAFT', true],
    ['CONFIGURED', true],
    ['READY_TO_ACTIVATE', true],
    ['ACTIVE', false],
    ['EVENT_DAY', false],
    ['CLOSED', false],
    ['ALBUM_PUBLISHED', false],
    ['ARCHIVED', false],
    ['CANCELLED', false]
  ] satisfies [Event['status'], boolean][])('maps editability for %s', (status, expected) => {
    expect(isEditableEvent(status)).toBe(expected);
  });

  it.each([
    [{ confirmationEnabled: false, floorplanEnabled: false }, false],
    [{ confirmationEnabled: false, floorplanEnabled: false, name: 'Boda' }, true],
    [{ confirmationEnabled: false, floorplanEnabled: false, name: '  ' }, false],
    [{ confirmationEnabled: false, floorplanEnabled: false, serviceId: 'service' }, true],
    [{ confirmationEnabled: false, floorplanEnabled: false, eventDateTime: '2026-01-01' }, true],
    [{ confirmationEnabled: false, floorplanEnabled: false, capacity: 1 }, true],
    [{ confirmationEnabled: false, floorplanEnabled: false, capacity: 0 }, false]
  ] satisfies [UpdateEventInput, boolean][])('detects meaningful draft %#', (draft, expected) => {
    expect(isMeaningfulDraft(draft)).toBe(expected);
  });

  it.each([
    ['FLYER', 'datos', true],
    ['FLYER', 'contactos', true],
    ['FLYER', 'invitacion', true],
    ['FLYER', 'confirmacion', true],
    ['FLYER', 'croquis', true],
    ['FLYER', 'pases', false],
    ['FLIPBOOK', 'datos', true],
    ['FLIPBOOK', 'contactos', true],
    ['FLIPBOOK', 'invitacion', true],
    ['FLIPBOOK', 'confirmacion', true],
    ['FLIPBOOK', 'croquis', true],
    ['FLIPBOOK', 'pases', false],
    ['PHYSICAL_QR', 'datos', true],
    ['PHYSICAL_QR', 'contactos', true],
    ['PHYSICAL_QR', 'invitacion', false],
    ['PHYSICAL_QR', 'confirmacion', false],
    ['PHYSICAL_QR', 'pases', true],
    [undefined, 'datos', true],
    [undefined, 'invitacion', true],
    [undefined, 'pases', false],
    [undefined, 'revision', true]
  ] as const)('controls step availability for %s/%s', (service, step, expected) => {
    expect(stepsForService(service).includes(step)).toBe(expected);
  });

  it('reuses operation keys per scope and isolates different operations', () => {
    sessionStorage.clear();
    const first = createOperationKey('activate', 'event');
    expect(createOperationKey('activate', 'event')).toBe(first);
    expect(createOperationKey('csv', 'event')).not.toBe(first);
    expect(createOperationKey('activate', 'other')).not.toBe(first);
  });

  it('debounces, consolidates and serializes autosaves', async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    const states: string[] = [];
    const controller = new SerialAutosave<number>(
      async (value) => {
        saved.push(value);
      },
      (state) => states.push(state),
      900
    );
    controller.schedule(1);
    controller.schedule(2);
    expect(controller.hasPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(900);
    expect(saved).toEqual([2]);
    expect(states).toContain('pending');
    expect(states).toContain('saving');
    expect(states).toContain('saved');
    expect(controller.hasPending()).toBe(false);
    controller.dispose();
    vi.useRealTimers();
  });

  it('retains the last value after an autosave failure so manual retry can recover', async () => {
    let attempts = 0;
    const states: string[] = [];
    const controller = new SerialAutosave<number>(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
      },
      (state) => states.push(state),
      900
    );
    controller.schedule(3);
    expect(await controller.flush()).toBe(false);
    expect(states.at(-1)).toBe('error');
    expect(controller.hasPending()).toBe(true);
    expect(await controller.flush()).toBe(true);
    expect(attempts).toBe(2);
    expect(states.at(-1)).toBe('saved');
  });

  it('persists a new change queued while the previous save is in flight', async () => {
    let release!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saved: number[] = [];
    const controller = new SerialAutosave<number>(async (value) => {
      saved.push(value);
      if (value === 1) await firstSave;
    }, vi.fn());
    controller.schedule(1);
    const flushing = controller.flush();
    await Promise.resolve();
    controller.schedule(2);
    release();
    await flushing;
    expect(saved).toEqual([1, 2]);
  });
});
