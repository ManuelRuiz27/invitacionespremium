import { describe, expect, it } from 'vitest';
import { InvitationMode } from '../generated/prisma/client';
import { parseAssistant, parseUpdateInvitation } from './invitations.dto';

describe('Invitations DTOs', () => {
  it('accepts only mode and additional assistant limit', () => {
    expect(parseUpdateInvitation({ mode: InvitationMode.FAMILY_NOMINAL, additionalAssistantLimit: 2 })).toEqual({
      mode: InvitationMode.FAMILY_NOMINAL,
      additionalAssistantLimit: 2
    });
    expect(() => parseUpdateInvitation({ responseStatus: 'CONFIRMED' })).toThrow();
  });

  it('normalizes nominal assistant names', () => {
    expect(parseAssistant({ name: '  Ana   Ejemplo ' })).toEqual({ name: 'Ana Ejemplo' });
  });
});
