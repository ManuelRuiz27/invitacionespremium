import { Injectable, Logger } from '@nestjs/common';
import {
  checkInCreatedEnvelopeSchema,
  checkInRevertedEnvelopeSchema,
  eventCancelledEnvelopeSchema,
  eventClosedEnvelopeSchema,
  rsvpUpdatedEnvelopeSchema,
  seatingUpdatedEnvelopeSchema,
  type RealtimeActorType,
  type SeatingUpdatedEnvelope
} from './realtime-contract';
import { RealtimeServerService } from './realtime-server.service';

const MAX_DEDUPLICATION_KEYS = 10_000;

@Injectable()
export class RealtimePublisherService {
  private readonly logger = new Logger(RealtimePublisherService.name);
  private readonly emitted = new Set<string>();

  constructor(private readonly server: RealtimeServerService) {}

  async publishCheckInCreated(input: {
    eventId: string;
    invitationId: string;
    operationId: string;
    occurredAt: string;
    checkIns: Array<{ checkInId: string; assistantId: string }>;
  }): Promise<void> {
    const envelope = checkInCreatedEnvelopeSchema.parse({
      eventName: 'checkin.created',
      version: 1,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      operationId: input.operationId,
      actorType: 'STAFF_TOKEN',
      data: {
        checkIns: input.checkIns.map((item) => ({
          ...item,
          invitationId: input.invitationId,
          tableId: null
        })),
        delta: input.checkIns.length
      }
    });
    await this.publish(envelope, ['dashboard', 'scanner']);
  }

  async publishCheckInReverted(input: {
    eventId: string;
    invitationId: string;
    operationId: string;
    occurredAt: string;
    checkInId: string;
    assistantId: string;
  }): Promise<void> {
    const envelope = checkInRevertedEnvelopeSchema.parse({
      eventName: 'checkin.reverted',
      version: 1,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      operationId: input.operationId,
      actorType: 'USER',
      data: {
        checkInId: input.checkInId,
        assistantId: input.assistantId,
        invitationId: input.invitationId,
        delta: -1
      }
    });
    await this.publish(envelope, ['dashboard', 'scanner']);
  }

  async publishRsvpUpdated(input: {
    eventId: string;
    invitationId: string;
    operationId: string;
    occurredAt: string;
    actorType: Extract<RealtimeActorType, 'USER' | 'PUBLIC_TOKEN'>;
    status: string;
    confirmedAssistants: number;
    previousConfirmedAssistants: number;
  }): Promise<void> {
    const envelope = rsvpUpdatedEnvelopeSchema.parse({
      eventName: 'rsvp.updated',
      version: 1,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      operationId: input.operationId,
      actorType: input.actorType,
      data: {
        invitationId: input.invitationId,
        status: input.status,
        confirmedAssistants: input.confirmedAssistants,
        previousConfirmedAssistants: input.previousConfirmedAssistants
      }
    });
    await this.publish(envelope, ['dashboard', 'scanner']);
  }

  async publishEventClosed(input: { eventId: string; operationId: string; occurredAt: string }): Promise<void> {
    const envelope = eventClosedEnvelopeSchema.parse({
      eventName: 'event.closed',
      version: 1,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      operationId: input.operationId,
      actorType: 'USER',
      data: {
        status: 'closed',
        checkInEnabled: false,
        staffAccessEnabled: false
      }
    });
    await this.publish(envelope, ['dashboard', 'scanner', 'floorplan']);
    this.server.disconnectStaff(input.eventId);
  }

  async publishEventCancelled(input: { eventId: string; operationId: string; occurredAt: string }): Promise<void> {
    const envelope = eventCancelledEnvelopeSchema.parse({
      eventName: 'event.cancelled',
      version: 1,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      operationId: input.operationId,
      actorType: 'USER',
      data: {
        status: 'cancelled',
        checkInEnabled: false,
        rsvpEnabled: false,
        publicQrEnabled: false,
        staffAccessEnabled: false
      }
    });
    await this.publish(envelope, ['dashboard', 'scanner', 'floorplan']);
    this.server.disconnectStaff(input.eventId);
  }

  async publishSeatingUpdated(envelope: SeatingUpdatedEnvelope): Promise<void> {
    await this.publish(seatingUpdatedEnvelopeSchema.parse(envelope), ['dashboard', 'scanner', 'floorplan']);
  }

  private async publish(
    envelope: Parameters<RealtimeServerService['emit']>[0],
    rooms: Parameters<RealtimeServerService['emit']>[1]
  ): Promise<void> {
    const key = `${envelope.eventName}:${envelope.operationId}`;
    if (this.emitted.has(key)) return;
    this.remember(key);
    try {
      this.server.emit(envelope, rooms);
    } catch (error) {
      this.logger.error({
        eventName: envelope.eventName,
        eventId: envelope.eventId,
        operationId: envelope.operationId,
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }

  private remember(key: string): void {
    this.emitted.add(key);
    if (this.emitted.size <= MAX_DEDUPLICATION_KEYS) return;
    const oldest = this.emitted.values().next().value as string | undefined;
    if (oldest) this.emitted.delete(oldest);
  }
}
