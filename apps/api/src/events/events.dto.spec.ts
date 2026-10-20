import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EventSocialType } from '../generated/prisma/client';
import {
  parseAdminEventAssignment,
  parseAdminEventIntake,
  parseAdminEventIntakeQuote,
  parseAdminManagedEventIntake,
  parseAdminUpdateEventRequest,
  parseCreateEventRequest,
  parseUpdateEventRequest
} from './events.dto';

describe('Event DTO validation', () => {
  it.each(['NOMINAL', 'ANONYMOUS'])('discriminates Managed access control mode %s', (accessMode) => {
    const input = {
      serviceCode: 'ACCESS_CONTROL',
      accessMode,
      capacity: 150,
      assignedPlannerUserId: crypto.randomUUID()
    };
    expect(parseAdminManagedEventIntake(input)).toEqual(input);
    expect(() => parseCreateEventRequest(input)).toThrow();
    expect(() => parseUpdateEventRequest({ accessMode })).toThrow();
    expect(parseAdminUpdateEventRequest({ accessMode })).toEqual({ accessMode });
    expect(() => parseAdminEventIntakeQuote({ serviceCode: 'ACCESS_CONTROL', capacity: 10 })).toThrow();
  });

  it('rejects missing, mixed or legacy access modes and keeps intake capacity and assignment strict', () => {
    const input = { serviceCode: 'ACCESS_CONTROL', capacity: 100, assignedPlannerUserId: crypto.randomUUID() };
    for (const accessMode of [undefined, null, 'INVALID', ['NOMINAL', 'ANONYMOUS']]) {
      expect(() => parseAdminManagedEventIntake({ ...input, accessMode })).toThrow();
    }
    for (const serviceCode of ['FLYER', 'FLIPBOOK', 'PHYSICAL_QR', 'DEMO']) {
      expect(() => parseAdminManagedEventIntake({ ...input, serviceCode, accessMode: 'NOMINAL' })).toThrow();
    }
    expect(() => parseAdminManagedEventIntake({ ...input, accessMode: 'NOMINAL', capacity: 151 })).toThrow();
    expect(() =>
      parseAdminManagedEventIntake({ ...input, accessMode: 'NOMINAL', assignedPlannerUserId: null })
    ).toThrow();
    expect(parseAdminUpdateEventRequest({ accessMode: null })).toEqual({ accessMode: null });
  });
  it.each([EventSocialType.OTHER, EventSocialType.CORPORATE, EventSocialType.WEDDING])(
    'accepts event type %s',
    (socialType) => {
      expect(parseCreateEventRequest({ socialType, name: 'Prueba', capacity: 100 })).toMatchObject({ socialType });
    }
  );

  it('identifies invalid editable fields without returning submitted values or unknown field names', () => {
    try {
      parseCreateEventRequest({ capacity: -1, locationUrl: 'private-invalid-value', 'private-unknown-field': true });
      expect.fail('Expected validation to reject the invalid draft');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({ code: 'VALIDATION_ERROR', details: { fields: ['capacity', 'locationUrl'] } });
      expect(JSON.stringify(response)).not.toContain('private-');
    }
  });

  it('accepts an empty draft and valid IANA/configuration values', () => {
    expect(parseCreateEventRequest({})).toEqual({});
    expect(
      parseCreateEventRequest({
        name: 'Evento',
        socialType: EventSocialType.OTHER,
        eventDateTime: '2035-10-18T23:00:00.000Z',
        eventEndDateTime: '2035-10-19T05:00:00.000Z',
        timeZone: 'America/Mexico_City',
        capacity: 1,
        confirmationEnabled: true,
        floorplanEnabled: false
      })
    ).toMatchObject({
      capacity: 1,
      confirmationEnabled: true,
      eventEndDateTime: '2035-10-19T05:00:00.000Z'
    });
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

  it('strictly validates Admin intake, quote, and assignment payloads', () => {
    const plannerId = crypto.randomUUID();
    const priceId = crypto.randomUUID();
    expect(
      parseAdminEventIntake({
        name: null,
        serviceCode: 'FLYER',
        capacity: 100,
        acceptedServicePriceId: priceId,
        assignedPlannerUserId: plannerId,
        acceptanceConfirmed: true
      })
    ).toMatchObject({ acceptedServicePriceId: priceId, assignedPlannerUserId: plannerId });
    expect(parseAdminEventAssignment({ assignedPlannerUserId: null })).toEqual({ assignedPlannerUserId: null });
    expect(parseAdminEventIntakeQuote({ serviceCode: 'PHYSICAL_QR', capacity: '50' })).toEqual({
      serviceCode: 'PHYSICAL_QR',
      capacity: 50
    });
    expect(() =>
      parseAdminEventIntake({
        serviceCode: 'DEMO',
        capacity: 10,
        acceptedServicePriceId: priceId,
        assignedPlannerUserId: null,
        acceptanceConfirmed: true
      })
    ).toThrow();
    expect(() => parseAdminEventAssignment({ assignedPlannerUserId: null, serviceId: priceId })).toThrow();
  });
});
