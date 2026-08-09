import { describe, expect, it } from 'vitest';
import { EventSocialType } from '../generated/prisma/client';
import { parseCreateEventRequest, parseUpdateEventRequest } from './events.dto';

describe('Event DTO validation', () => {
  it('accepts an empty draft and valid IANA/configuration values', () => {
    expect(parseCreateEventRequest({})).toEqual({});
    expect(
      parseCreateEventRequest({
        name: 'Evento',
        socialType: EventSocialType.OTHER,
        timeZone: 'America/Mexico_City',
        capacity: 1,
        confirmationEnabled: true,
        floorplanEnabled: false
      })
    ).toMatchObject({ capacity: 1, confirmationEnabled: true });
  });

  it('rejects invalid time zones, capacities, and server-owned fields', () => {
    expect(() => parseCreateEventRequest({ timeZone: 'Mexico/Invalid' })).toThrow();
    expect(() => parseCreateEventRequest({ capacity: 0 })).toThrow();
    expect(() => parseCreateEventRequest({ status: 'ACTIVE' })).toThrow();
    expect(() => parseCreateEventRequest({ clientId: '54f82d71-6084-4c12-a94a-5109d5a59823' })).toThrow();
    expect(() => parseCreateEventRequest({ createdByUserId: '54f82d71-6084-4c12-a94a-5109d5a59823' })).toThrow();
  });

  it('accepts only explicit true consent for an invitation design reset on update', () => {
    expect(parseUpdateEventRequest({ serviceId: crypto.randomUUID(), resetInvitationDesign: true })).toMatchObject({
      resetInvitationDesign: true
    });
    expect(() => parseUpdateEventRequest({ resetInvitationDesign: false })).toThrow();
    expect(() => parseCreateEventRequest({ resetInvitationDesign: true })).toThrow();
  });
});
