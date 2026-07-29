import { Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import type { Event, Prisma } from '../generated/prisma/client';

@Injectable()
export class FloorplanAccessService {
  constructor(@Inject(EventAccessPolicy) private readonly events: EventAccessPolicy) {}

  async requireOwnedEvent(
    transaction: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal,
    lock = false
  ): Promise<Event> {
    if (lock) {
      await transaction.$queryRaw`
        SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE
      `;
    }
    const event = await transaction.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.events.ownedWhere(principal) }
    });
    if (!event) throw eventNotFound();
    return event;
  }
}
