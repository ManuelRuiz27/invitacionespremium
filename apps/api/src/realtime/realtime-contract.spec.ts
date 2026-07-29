import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { REALTIME_ERROR_CODES, type RealtimeErrorCode } from './realtime-errors';
import {
  checkInCreatedEnvelopeSchema,
  checkInRevertedEnvelopeSchema,
  eventCancelledEnvelopeSchema,
  eventClosedEnvelopeSchema,
  realtimeEnvelopeSchema,
  realtimeRoomName,
  rsvpUpdatedEnvelopeSchema,
  seatingUpdatedEnvelopeSchema
} from './realtime-contract';
import { RealtimePublisherService } from './realtime-publisher.service';
import type { RealtimeServerService } from './realtime-server.service';

const eventId = randomUUID();
const operationId = randomUUID();
const occurredAt = '2026-07-29T12:00:00.000Z';

describe('Realtime v1 contract', () => {
  it('validates every strict envelope and deterministic room name', () => {
    const envelopes = [
      checkInCreatedEnvelopeSchema.parse({
        ...base('checkin.created', 'STAFF_TOKEN'),
        data: {
          checkIns: [
            {
              checkInId: randomUUID(),
              assistantId: randomUUID(),
              invitationId: randomUUID(),
              tableId: randomUUID()
            }
          ],
          delta: 1
        }
      }),
      checkInRevertedEnvelopeSchema.parse({
        ...base('checkin.reverted', 'USER'),
        data: {
          checkInId: randomUUID(),
          assistantId: randomUUID(),
          invitationId: randomUUID(),
          delta: -1
        }
      }),
      rsvpUpdatedEnvelopeSchema.parse({
        ...base('rsvp.updated', 'PUBLIC_TOKEN'),
        data: {
          invitationId: randomUUID(),
          status: 'CONFIRMED',
          confirmedAssistants: 2,
          previousConfirmedAssistants: 1
        }
      }),
      seatingUpdatedEnvelopeSchema.parse({
        ...base('seating.updated', 'USER'),
        data: {
          changes: [
            {
              assistantId: randomUUID(),
              fromTableId: null,
              toTableId: randomUUID()
            }
          ],
          affectedTables: [
            {
              tableId: randomUUID(),
              occupancy: 8,
              capacity: 10
            }
          ]
        }
      }),
      seatingUpdatedEnvelopeSchema.parse({
        ...base('seating.updated', 'PUBLIC_TOKEN'),
        data: {
          changes: [
            {
              assistantId: randomUUID(),
              fromTableId: randomUUID(),
              toTableId: null
            }
          ],
          affectedTables: [
            {
              tableId: randomUUID(),
              occupancy: 0,
              capacity: 10
            }
          ]
        }
      }),
      eventClosedEnvelopeSchema.parse({
        ...base('event.closed', 'USER'),
        data: {
          status: 'closed',
          checkInEnabled: false,
          staffAccessEnabled: false
        }
      }),
      eventCancelledEnvelopeSchema.parse({
        ...base('event.cancelled', 'USER'),
        data: {
          status: 'cancelled',
          checkInEnabled: false,
          rsvpEnabled: false,
          publicQrEnabled: false,
          staffAccessEnabled: false
        }
      })
    ];
    for (const envelope of envelopes) {
      expect(realtimeEnvelopeSchema.parse(envelope)).toEqual(envelope);
    }
    expect(
      seatingUpdatedEnvelopeSchema.safeParse({
        ...envelopes[3],
        actorType: 'STAFF_TOKEN'
      }).success
    ).toBe(false);
    expect(realtimeRoomName(eventId, 'dashboard')).toBe(`event:${eventId}:dashboard`);
    expect(realtimeRoomName(eventId, 'scanner')).toBe(`event:${eventId}:scanner`);
    expect(realtimeRoomName(eventId, 'floorplan')).toBe(`event:${eventId}:floorplan`);
  });

  it('rejects additional fields, PII, tokens and inconsistent check-in batches', () => {
    const valid = {
      ...base('checkin.created', 'STAFF_TOKEN'),
      data: {
        checkIns: [
          {
            checkInId: randomUUID(),
            assistantId: randomUUID(),
            invitationId: randomUUID(),
            tableId: null
          }
        ],
        delta: 1
      }
    };
    for (const forbidden of [
      { ...valid, phone: '+525500000000' },
      { ...valid, token: 'secret' },
      { ...valid, clientId: randomUUID() },
      { ...valid, data: { ...valid.data, name: 'PII' } },
      { ...valid, data: { ...valid.data, checkIns: [{ ...valid.data.checkIns[0], nonce: 'secret' }] } },
      { ...valid, data: { ...valid.data, delta: 2 } }
    ]) {
      expect(checkInCreatedEnvelopeSchema.safeParse(forbidden).success).toBe(false);
    }
  });

  it('publishes once per eventName and operationId, swallows transport failures and logs no payload', async () => {
    const emit = vi.fn().mockImplementation(() => {
      const error = new Error('transport failed with secret-token and name');
      error.name = 'TransportError';
      throw error;
    });
    const disconnectStaff = vi.fn();
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const publisher = new RealtimePublisherService({
      emit,
      disconnectStaff
    } as unknown as RealtimeServerService);

    await expect(
      publisher.publishCheckInCreated({
        eventId,
        invitationId: randomUUID(),
        operationId,
        occurredAt,
        checkIns: [{ checkInId: randomUUID(), assistantId: randomUUID(), tableId: null }]
      })
    ).resolves.toBeUndefined();
    await publisher.publishCheckInCreated({
      eventId,
      invitationId: randomUUID(),
      operationId,
      occurredAt,
      checkIns: [{ checkInId: randomUUID(), assistantId: randomUUID(), tableId: null }]
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith({
      eventName: 'checkin.created',
      eventId,
      operationId,
      errorName: 'TransportError'
    });
    expect(Object.keys(logger.mock.calls[0]?.[0] as object).sort()).toEqual([
      'errorName',
      'eventId',
      'eventName',
      'operationId'
    ]);
    logger.mockRestore();
  });

  it('exports the complete stable connection error code set', () => {
    const expected: RealtimeErrorCode[] = [
      'SOCKET_UNAUTHORIZED',
      'SOCKET_ROOM_FORBIDDEN',
      'SOCKET_EVENT_FORBIDDEN',
      'SOCKET_STAFF_TOKEN_EXPIRED',
      'SOCKET_EVENT_NOT_OPERATIONAL',
      'SOCKET_EVENT_CLOSED',
      'SOCKET_EVENT_CANCELLED',
      'SOCKET_PAYLOAD_VERSION_UNSUPPORTED'
    ];
    expect(REALTIME_ERROR_CODES).toEqual(expected);
  });
});

function base(eventName: string, actorType: string) {
  return {
    eventName,
    version: 1,
    eventId,
    occurredAt,
    operationId,
    actorType
  };
}
