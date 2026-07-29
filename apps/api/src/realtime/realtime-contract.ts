import { InvitationResponseStatus } from '../generated/prisma/client';
import { z } from 'zod';

export const REALTIME_PROTOCOL_VERSION = 1 as const;
export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_PATH = '/socket.io';

export const realtimeRoomTypeSchema = z.enum(['dashboard', 'scanner', 'floorplan']);
export type RealtimeRoomType = z.infer<typeof realtimeRoomTypeSchema>;

export const realtimeActorTypeSchema = z.enum(['USER', 'STAFF_TOKEN', 'PUBLIC_TOKEN', 'SYSTEM']);
export type RealtimeActorType = z.infer<typeof realtimeActorTypeSchema>;

const uuid = z.string().uuid();
const occurredAt = z.iso.datetime({ offset: false });
const nullableUuid = uuid.nullable();

const checkInCreatedDataSchema = z
  .object({
    checkIns: z
      .array(
        z
          .object({
            checkInId: uuid,
            assistantId: uuid,
            invitationId: uuid,
            tableId: z.null()
          })
          .strict()
      )
      .min(1),
    delta: z.number().int().positive()
  })
  .strict()
  .refine(({ checkIns, delta }) => checkIns.length === delta, {
    message: 'delta must equal checkIns.length.'
  });

const checkInRevertedDataSchema = z
  .object({
    checkInId: uuid,
    assistantId: uuid,
    invitationId: uuid,
    delta: z.literal(-1)
  })
  .strict();

const rsvpUpdatedDataSchema = z
  .object({
    invitationId: uuid,
    status: z.enum(InvitationResponseStatus),
    confirmedAssistants: z.number().int().nonnegative(),
    previousConfirmedAssistants: z.number().int().nonnegative()
  })
  .strict();

const seatingUpdatedDataSchema = z
  .object({
    changes: z.array(
      z
        .object({
          assistantId: uuid,
          fromTableId: nullableUuid,
          toTableId: nullableUuid
        })
        .strict()
    ),
    affectedTables: z.array(
      z
        .object({
          tableId: uuid,
          occupancy: z.number().int().nonnegative(),
          capacity: z.number().int().nonnegative()
        })
        .strict()
    )
  })
  .strict();

const eventClosedDataSchema = z
  .object({
    status: z.literal('closed'),
    checkInEnabled: z.literal(false),
    staffAccessEnabled: z.literal(false)
  })
  .strict();

const eventCancelledDataSchema = z
  .object({
    status: z.literal('cancelled'),
    checkInEnabled: z.literal(false),
    rsvpEnabled: z.literal(false),
    publicQrEnabled: z.literal(false),
    staffAccessEnabled: z.literal(false)
  })
  .strict();

function envelope<EventName extends string, Data extends z.ZodType>(eventName: EventName, data: Data) {
  return z
    .object({
      eventName: z.literal(eventName),
      version: z.literal(REALTIME_PROTOCOL_VERSION),
      eventId: uuid,
      occurredAt,
      operationId: uuid,
      actorType: realtimeActorTypeSchema,
      data
    })
    .strict();
}

export const checkInCreatedEnvelopeSchema = envelope('checkin.created', checkInCreatedDataSchema);
export const checkInRevertedEnvelopeSchema = envelope('checkin.reverted', checkInRevertedDataSchema);
export const rsvpUpdatedEnvelopeSchema = envelope('rsvp.updated', rsvpUpdatedDataSchema);
export const seatingUpdatedEnvelopeSchema = envelope('seating.updated', seatingUpdatedDataSchema);
export const eventClosedEnvelopeSchema = envelope('event.closed', eventClosedDataSchema);
export const eventCancelledEnvelopeSchema = envelope('event.cancelled', eventCancelledDataSchema);

export const realtimeEnvelopeSchema = z.discriminatedUnion('eventName', [
  checkInCreatedEnvelopeSchema,
  checkInRevertedEnvelopeSchema,
  rsvpUpdatedEnvelopeSchema,
  seatingUpdatedEnvelopeSchema,
  eventClosedEnvelopeSchema,
  eventCancelledEnvelopeSchema
]);

export type CheckInCreatedEnvelope = z.infer<typeof checkInCreatedEnvelopeSchema>;
export type CheckInRevertedEnvelope = z.infer<typeof checkInRevertedEnvelopeSchema>;
export type RsvpUpdatedEnvelope = z.infer<typeof rsvpUpdatedEnvelopeSchema>;
export type SeatingUpdatedEnvelope = z.infer<typeof seatingUpdatedEnvelopeSchema>;
export type EventClosedEnvelope = z.infer<typeof eventClosedEnvelopeSchema>;
export type EventCancelledEnvelope = z.infer<typeof eventCancelledEnvelopeSchema>;
export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;

export function realtimeRoomName(eventId: string, roomType: RealtimeRoomType): string {
  return `event:${uuid.parse(eventId)}:${realtimeRoomTypeSchema.parse(roomType)}`;
}
