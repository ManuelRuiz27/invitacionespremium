import type { UpdateEventInput } from '@invitaciones/api-client';
import { describe, expect, it } from 'vitest';
import { applyDraftPatch } from './WizardPage';

describe('wizard draft patches', () => {
  it('preserves two patches applied synchronously before React can render', () => {
    const initial: UpdateEventInput = { confirmationEnabled: false, floorplanEnabled: false };
    const withZone = applyDraftPatch(initial, { timeZone: 'America/Tijuana' });
    const withDate = applyDraftPatch(withZone, { eventDateTime: '2026-01-16T02:30:00.000Z' });

    expect(withDate).toMatchObject({
      timeZone: 'America/Tijuana',
      eventDateTime: '2026-01-16T02:30:00.000Z'
    });
  });
});
