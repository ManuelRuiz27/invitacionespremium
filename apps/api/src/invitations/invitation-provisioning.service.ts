import { Inject, Injectable } from '@nestjs/common';
import type { Contact, Prisma } from '../generated/prisma/client';
import { InvitationTokenService } from './invitation-token.service';

export interface ProvisionedInvitation {
  invitationId: string;
  primaryAssistantId: string;
}

@Injectable()
export class InvitationProvisioningService {
  constructor(@Inject(InvitationTokenService) private readonly tokens: InvitationTokenService) {}

  async provisionForContact(
    tx: Prisma.TransactionClient,
    contact: Pick<Contact, 'id' | 'eventId' | 'name' | 'anonymizedAt' | 'deletedAt'>
  ): Promise<ProvisionedInvitation> {
    const invitation = await tx.invitation.create({
      data: {
        eventId: contact.eventId,
        contactId: contact.id,
        invitationTokenNonce: this.tokens.createNonce(),
        qrTokenNonce: this.tokens.createNonce(),
        deletedAt: contact.deletedAt
      }
    });
    const primary = await tx.assistant.create({
      data: {
        eventId: contact.eventId,
        invitationId: invitation.id,
        name: contact.name,
        isPrimary: true,
        anonymizedAt: contact.anonymizedAt,
        deletedAt: contact.deletedAt
      }
    });
    return { invitationId: invitation.id, primaryAssistantId: primary.id };
  }

  async syncPrimaryName(tx: Prisma.TransactionClient, contactId: string, name: string): Promise<void> {
    const invitation = await tx.invitation.findUnique({ where: { contactId }, select: { id: true } });
    if (!invitation) throw new TypeError('Contact invitation provisioning is missing.');
    await tx.assistant.updateMany({
      where: { invitationId: invitation.id, isPrimary: true, deletedAt: null },
      data: { name }
    });
  }

  async softDeleteForContact(tx: Prisma.TransactionClient, contactId: string, deletedAt: Date): Promise<void> {
    const invitation = await tx.invitation.findUnique({ where: { contactId }, select: { id: true } });
    if (!invitation) throw new TypeError('Contact invitation provisioning is missing.');
    await tx.invitation.update({ where: { id: invitation.id }, data: { deletedAt } });
    await tx.assistant.updateMany({
      where: { invitationId: invitation.id, deletedAt: null },
      data: { deletedAt }
    });
  }

  async anonymizeForEvent(tx: Prisma.TransactionClient, eventId: string, at: Date): Promise<string[]> {
    const assistants = await tx.assistant.findMany({
      where: { eventId, anonymizedAt: null },
      select: { id: true }
    });
    if (assistants.length > 0) {
      await tx.assistant.updateMany({
        where: { id: { in: assistants.map(({ id }) => id) }, anonymizedAt: null },
        data: { name: null, anonymizedAt: at }
      });
    }
    return assistants.map(({ id }) => id);
  }
}
