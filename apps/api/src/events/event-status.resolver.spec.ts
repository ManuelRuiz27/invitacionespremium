import { describe, expect, it } from 'vitest';
import { EventSocialType, EventStatus } from '../generated/prisma/client';
import { resolveActivationChecklist, resolvePreparationStatus } from './event-status.resolver';

const complete = {
  name: 'Boda de prueba',
  serviceId: '54f82d71-6084-4c12-a94a-5109d5a59823',
  socialType: EventSocialType.WEDDING,
  eventDateTime: new Date('2027-01-10T18:00:00.000Z'),
  timeZone: 'America/Mexico_City',
  capacity: 100
};

describe('Event status resolver', () => {
  it('calculates DRAFT for incomplete basic data and CONFIGURED for complete data', () => {
    expect(resolvePreparationStatus({ ...complete, serviceId: null })).toBe(EventStatus.DRAFT);
    expect(resolvePreparationStatus(complete)).toBe(EventStatus.CONFIGURED);
  });

  it('keeps READY_TO_ACTIVATE unreachable while later checklist modules are deferred', () => {
    expect(resolveActivationChecklist(complete)).toMatchObject({
      basicDataComplete: true,
      contactsImplemented: false,
      designImplemented: false,
      confirmationImplemented: false,
      floorplanValidationImplemented: false,
      financialValidationImplemented: false
    });
    expect(resolvePreparationStatus(complete)).not.toBe(EventStatus.READY_TO_ACTIVATE);
  });
});
