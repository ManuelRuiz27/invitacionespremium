import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { AppConfigService } from '../config/app-config.service';
import { AuditActorType, EventStatus, Prisma, type Contact, type Group, type Event } from '../generated/prisma/client';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import { InvitationProvisioningService } from '../invitations/invitation-provisioning.service';
import {
  collapseWhitespace,
  type CommitImportResponseDto,
  type ContactGroupResponseDto,
  type ContactResponseDto,
  type CreateContactInput,
  type GroupInput,
  type ImportPreviewResponseDto,
  normalizeGroupName,
  type StoredImportRow,
  type UpdateContactInput
} from './contacts.dto';
import { PhoneNormalizer } from './phone-normalizer';

const MAX_ACTIVE_CONTACTS = 150;
const MUTABLE_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
]);

export interface UploadedCsvFile {
  buffer: Buffer;
  size: number;
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly eventAccess: EventAccessPolicy,
    @Inject(PhoneNormalizer) private readonly phones: PhoneNormalizer,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(InvitationProvisioningService) private readonly invitations: InvitationProvisioningService
  ) {}

  async listContacts(eventId: string, principal: AuthPrincipal): Promise<ContactResponseDto[]> {
    await this.requireOwnedEvent(eventId, principal);
    const contacts = await this.prisma.contact.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    return contacts.map(toContactResponse);
  }

  async createContact(
    eventId: string,
    input: CreateContactInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<ContactResponseDto> {
    const normalizedPhone = this.phones.normalize(input.whatsappPhone);

    return this.serializable(async (tx) => {
      const event = await this.lockMutableOwnedEvent(tx, eventId, principal);
      await this.assertCapacity(tx, eventId, 1);
      await this.assertGroupInEvent(tx, eventId, input.groupId);

      const contact = await tx.contact.create({
        data: {
          eventId,
          groupId: input.groupId ?? null,
          name: input.name,
          whatsappPhoneNormalized: normalizedPhone
        }
      });
      const provisioned = await this.invitations.provisionForContact(tx, contact);

      await this.recordUserAudit(tx, principal, event, operationId, 'CONTACT_CREATE', 'Contact', contact.id, {
        id: contact.id,
        eventId,
        groupId: contact.groupId,
        ...provisioned
      });
      return toContactResponse(contact);
    });
  }

  async updateContact(
    eventId: string,
    contactId: string,
    input: UpdateContactInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<ContactResponseDto> {
    const normalizedPhone = input.whatsappPhone === undefined ? undefined : this.phones.normalize(input.whatsappPhone);

    return this.serializable(async (tx) => {
      const event = await this.lockMutableOwnedEvent(tx, eventId, principal);
      const current = await tx.contact.findFirst({ where: { id: contactId, eventId, deletedAt: null } });
      if (!current) {
        throw contactNotFound();
      }
      await this.assertGroupInEvent(tx, eventId, input.groupId);

      const contact = await tx.contact.update({
        where: { id: contactId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(normalizedPhone === undefined ? {} : { whatsappPhoneNormalized: normalizedPhone }),
          ...(input.groupId === undefined ? {} : { groupId: input.groupId })
        }
      });
      if (input.name !== undefined) {
        await this.invitations.syncPrimaryName(tx, contact.id, contact.name as string);
      }

      await this.recordUserAudit(
        tx,
        principal,
        event,
        operationId,
        'CONTACT_UPDATE',
        'Contact',
        contact.id,
        technicalContactSnapshot(contact),
        technicalContactSnapshot(current)
      );
      return toContactResponse(contact);
    });
  }

  async deleteContact(
    eventId: string,
    contactId: string,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const event = await this.lockMutableOwnedEvent(tx, eventId, principal);
      const current = await tx.contact.findFirst({ where: { id: contactId, eventId, deletedAt: null } });
      if (!current) {
        throw contactNotFound();
      }
      const deletedAt = new Date();
      const deleted = await tx.contact.update({
        where: { id: contactId },
        data: { deletedAt }
      });
      await this.invitations.softDeleteForContact(tx, contactId, deletedAt);
      await this.recordUserAudit(
        tx,
        principal,
        event,
        operationId,
        'CONTACT_DELETE',
        'Contact',
        contactId,
        technicalContactSnapshot(deleted),
        technicalContactSnapshot(current)
      );
    });
  }

  async listGroups(eventId: string, principal: AuthPrincipal): Promise<ContactGroupResponseDto[]> {
    await this.requireOwnedEvent(eventId, principal);
    const groups = await this.prisma.group.findMany({
      where: { eventId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }]
    });
    return groups.map(toGroupResponse);
  }

  async createGroup(
    eventId: string,
    input: GroupInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<ContactGroupResponseDto> {
    try {
      return await this.serializable(async (tx) => {
        const event = await this.lockMutableOwnedEvent(tx, eventId, principal);
        const group = await tx.group.create({
          data: {
            eventId,
            name: input.name,
            normalizedName: normalizeGroupName(input.name)
          }
        });
        await this.recordUserAudit(
          tx,
          principal,
          event,
          operationId,
          'CONTACT_GROUP_CREATE',
          'ContactGroup',
          group.id,
          {
            id: group.id,
            eventId
          }
        );
        return toGroupResponse(group);
      });
    } catch (error) {
      throw mapGroupConflict(error);
    }
  }

  async updateGroup(
    eventId: string,
    groupId: string,
    input: GroupInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<ContactGroupResponseDto> {
    try {
      return await this.serializable(async (tx) => {
        const event = await this.lockMutableOwnedEvent(tx, eventId, principal);
        const current = await tx.group.findFirst({ where: { id: groupId, eventId } });
        if (!current) {
          throw groupNotFound();
        }
        const group = await tx.group.update({
          where: { id: groupId },
          data: { name: input.name, normalizedName: normalizeGroupName(input.name) }
        });
        await this.recordUserAudit(
          tx,
          principal,
          event,
          operationId,
          'CONTACT_GROUP_UPDATE',
          'ContactGroup',
          group.id,
          { id: group.id, eventId },
          { id: current.id, eventId }
        );
        return toGroupResponse(group);
      });
    } catch (error) {
      throw mapGroupConflict(error);
    }
  }

  async getCsvTemplate(eventId: string, principal: AuthPrincipal): Promise<string> {
    await this.requireOwnedEvent(eventId, principal);
    return 'name,whatsapp_phone,group\r\nMaría Ejemplo,+525512345678,Familia\r\n';
  }

  async previewImport(
    eventId: string,
    file: UploadedCsvFile | undefined,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<ImportPreviewResponseDto> {
    await this.requireOwnedEvent(eventId, principal);
    if (!file || file.size === 0) {
      throw csvError('CONTACT_IMPORT_FILE_REQUIRED', 'A CSV file is required.');
    }

    const rawRows = parseCsv(file.buffer);
    if (rawRows.length > MAX_ACTIVE_CONTACTS) {
      throw csvError('CONTACT_IMPORT_ROW_LIMIT_EXCEEDED', 'The CSV exceeds the 150 contact limit.');
    }

    return this.serializable(async (tx) => {
      const event = await this.lockMutableOwnedEvent(tx, eventId, principal);
      const existingGroups = await tx.group.findMany({ where: { eventId } });
      const groupsByName = new Map(existingGroups.map((group) => [group.normalizedName, group]));
      const rows = rawRows.map((row) => this.normalizeImportRow(row.values, row.rowNumber, groupsByName));
      const invalidRows = rows.filter((row) => row.errors.length > 0).length;
      const expiresAt = new Date(Date.now() + this.config.contactImportPreviewTtlSeconds * 1000);

      const preview = await tx.contactImportPreview.create({
        data: {
          eventId,
          createdByUserId: principal.userId,
          expiresAt,
          totalRows: rows.length,
          validRows: rows.length - invalidRows,
          invalidRows,
          normalizedRows: rows as unknown as Prisma.InputJsonArray
        }
      });

      await this.recordUserAudit(
        tx,
        principal,
        event,
        operationId,
        'CONTACT_IMPORT_PREVIEW_CREATE',
        'ContactImportPreview',
        preview.id,
        {
          previewId: preview.id,
          eventId,
          totalRows: rows.length,
          validRows: rows.length - invalidRows,
          invalidRows,
          expiresAt
        }
      );

      return {
        previewId: preview.id,
        expiresAt,
        totalRows: rows.length,
        validRows: rows.length - invalidRows,
        invalidRows,
        rows: rows.map(publicPreviewRow)
      };
    });
  }

  async commitImport(
    eventId: string,
    previewId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<CommitImportResponseDto> {
    try {
      return await this.serializable(async (tx) => {
        const event = await this.lockOwnedEvent(tx, eventId, principal);
        await tx.$queryRaw`SELECT id FROM contact_import_preview WHERE id = ${previewId}::uuid FOR UPDATE`;

        const priorByKey = await tx.contactImportPreview.findUnique({
          where: { commitIdempotencyKey: idempotencyKey }
        });
        if (priorByKey) {
          if (priorByKey.id !== previewId || priorByKey.eventId !== eventId) {
            throw idempotencyConflict();
          }
          if (!priorByKey.resultSnapshot) {
            throw idempotencyConflict();
          }
          return deserializeCommitResult(priorByKey.resultSnapshot);
        }
        this.assertMutableEvent(event);

        const preview = await tx.contactImportPreview.findFirst({ where: { id: previewId, eventId } });
        if (!preview) {
          throw previewNotFound();
        }
        if (preview.committedAt) {
          throw idempotencyConflict();
        }
        if (preview.expiresAt.getTime() <= Date.now()) {
          throw new ConflictException({
            code: 'CONTACT_IMPORT_PREVIEW_EXPIRED',
            message: 'The contact import preview has expired.'
          });
        }
        if (preview.invalidRows > 0) {
          throw new ConflictException({
            code: 'CONTACT_IMPORT_HAS_INVALID_ROWS',
            message: 'The contact import preview contains invalid rows.'
          });
        }

        const rows = parseStoredRows(preview.normalizedRows);
        await this.assertCapacity(tx, eventId, rows.length);

        const groupIds = new Map<string, string>();
        let createdGroups = 0;
        for (const row of rows) {
          if (!row.normalizedGroup || !row.group) {
            continue;
          }
          let group = await tx.group.findUnique({
            where: { eventId_normalizedName: { eventId, normalizedName: row.normalizedGroup } }
          });
          if (!group) {
            group = await tx.group.create({
              data: { eventId, name: row.group, normalizedName: row.normalizedGroup }
            });
            createdGroups += 1;
          }
          groupIds.set(row.normalizedGroup, group.id);
        }

        const contacts: Contact[] = [];
        for (const row of rows) {
          if (!row.name || !row.normalizedPhone) {
            throw new TypeError('A valid preview contains a non-importable row.');
          }
          const contact = await tx.contact.create({
            data: {
              eventId,
              name: row.name,
              whatsappPhoneNormalized: row.normalizedPhone,
              groupId: row.normalizedGroup ? (groupIds.get(row.normalizedGroup) ?? null) : null
            }
          });
          await this.invitations.provisionForContact(tx, contact);
          contacts.push(contact);
        }

        const result: CommitImportResponseDto = {
          createdContacts: contacts.length,
          createdGroups,
          contacts: contacts.map(toContactResponse)
        };
        await tx.contactImportPreview.update({
          where: { id: preview.id },
          data: {
            committedAt: new Date(),
            commitIdempotencyKey: idempotencyKey,
            resultSnapshot: serializeCommitResult(result),
            normalizedRows: Prisma.DbNull
          }
        });
        await this.recordUserAudit(
          tx,
          principal,
          event,
          operationId,
          'CONTACT_IMPORT_COMMIT',
          'ContactImportPreview',
          preview.id,
          {
            previewId: preview.id,
            eventId,
            createdContacts: contacts.length,
            createdGroups,
            contactIds: contacts.map((contact) => contact.id)
          }
        );
        return result;
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const prior = await this.prisma.contactImportPreview.findUnique({
          where: { commitIdempotencyKey: idempotencyKey }
        });
        if (prior?.id === previewId && prior.eventId === eventId && prior.resultSnapshot) {
          return deserializeCommitResult(prior.resultSnapshot);
        }
        throw idempotencyConflict();
      }
      throw error;
    }
  }

  async anonymizeExpiredContacts(at = new Date()): Promise<number> {
    const threshold = new Date(at.getTime() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.event.findMany({
      where: {
        eventDateTime: { lte: threshold },
        OR: [
          { contacts: { some: { anonymizedAt: null } } },
          {
            contactImportPreviews: {
              some: { committedAt: { not: null }, piiPurgedAt: null }
            }
          },
          { assistants: { some: { anonymizedAt: null } } }
        ]
      },
      select: { id: true }
    });
    let total = 0;

    for (const candidate of candidates) {
      total += await this.serializable(async (tx) => {
        await tx.$queryRaw`SELECT id FROM event WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        const event = await tx.event.findUnique({ where: { id: candidate.id } });
        if (!event?.eventDateTime || event.eventDateTime > threshold) {
          return 0;
        }
        const contacts = await tx.contact.findMany({
          where: { eventId: event.id, anonymizedAt: null },
          select: { id: true }
        });
        const previews = await tx.contactImportPreview.findMany({
          where: { eventId: event.id, committedAt: { not: null }, piiPurgedAt: null },
          select: { id: true, resultSnapshot: true }
        });
        const assistantIds = await this.invitations.anonymizeForEvent(tx, event.id, at);
        if (contacts.length === 0 && previews.length === 0 && assistantIds.length === 0) {
          return 0;
        }
        if (contacts.length > 0) {
          await tx.contact.updateMany({
            where: { id: { in: contacts.map(({ id }) => id) }, anonymizedAt: null },
            data: { name: null, whatsappPhoneNormalized: null, anonymizedAt: at }
          });
        }
        for (const preview of previews) {
          if (!preview.resultSnapshot) {
            throw new TypeError('A committed contact import preview has no result snapshot.');
          }
          await tx.contactImportPreview.update({
            where: { id: preview.id },
            data: {
              resultSnapshot: redactCommitResultSnapshot(preview.resultSnapshot, at),
              piiPurgedAt: at
            }
          });
        }
        if (contacts.length > 0 || previews.length > 0) {
          await this.audit.record(
            {
              actor: { type: AuditActorType.SYSTEM },
              action: 'CONTACTS_ANONYMIZED',
              resourceType: 'Event',
              resourceId: event.id,
              clientId: event.clientId,
              eventId: event.id,
              afterData: {
                eventId: event.id,
                contactsAnonymized: contacts.length,
                previewsRedacted: previews.length,
                contactIds: contacts.map(({ id }) => id),
                previewIds: previews.map(({ id }) => id)
              }
            },
            tx
          );
        }
        if (assistantIds.length > 0) {
          await this.audit.record(
            {
              actor: { type: AuditActorType.SYSTEM },
              action: 'ASSISTANTS_ANONYMIZED',
              resourceType: 'Event',
              resourceId: event.id,
              clientId: event.clientId,
              eventId: event.id,
              afterData: {
                eventId: event.id,
                assistantsAnonymized: assistantIds.length,
                assistantIds
              }
            },
            tx
          );
        }
        return contacts.length + previews.length + assistantIds.length;
      });
    }

    await this.purgeExpiredPreviews(at);
    return total;
  }

  private async purgeExpiredPreviews(at: Date): Promise<void> {
    const eventIds = await this.prisma.contactImportPreview.findMany({
      where: { expiresAt: { lte: at }, committedAt: null },
      distinct: ['eventId'],
      select: { eventId: true }
    });

    for (const { eventId } of eventIds) {
      await this.serializable(async (tx) => {
        await tx.$queryRaw`SELECT id FROM event WHERE id = ${eventId}::uuid FOR UPDATE`;
        const event = await tx.event.findUnique({ where: { id: eventId } });
        if (!event) {
          return;
        }
        const previews = await tx.contactImportPreview.findMany({
          where: { eventId, expiresAt: { lte: at }, committedAt: null },
          select: { id: true }
        });
        if (previews.length === 0) {
          return;
        }
        await tx.contactImportPreview.deleteMany({ where: { id: { in: previews.map(({ id }) => id) } } });
        await this.audit.record(
          {
            actor: { type: AuditActorType.SYSTEM },
            action: 'CONTACT_IMPORT_PREVIEWS_PURGED',
            resourceType: 'Event',
            resourceId: event.id,
            clientId: event.clientId,
            eventId: event.id,
            afterData: { eventId, count: previews.length, previewIds: previews.map(({ id }) => id) }
          },
          tx
        );
      });
    }
  }

  private normalizeImportRow(values: string[], rowNumber: number, groups: Map<string, Group>): StoredImportRow {
    const errors: string[] = [];
    if (values.length !== 3) {
      errors.push('CONTACT_CSV_COLUMN_COUNT_INVALID');
    }
    const name = collapseWhitespace(values[0] ?? '');
    const phoneInput = (values[1] ?? '').trim();
    const group = collapseWhitespace(values[2] ?? '');
    if (!name) {
      errors.push('CONTACT_NAME_REQUIRED');
    } else if (name.length > 160) {
      errors.push('CONTACT_NAME_TOO_LONG');
    }
    let normalizedPhone: string | null = null;
    if (!phoneInput) {
      errors.push('CONTACT_PHONE_REQUIRED');
    } else {
      try {
        normalizedPhone = this.phones.normalize(phoneInput);
      } catch {
        errors.push('CONTACT_PHONE_INVALID');
      }
    }
    if (group.length > 160) {
      errors.push('CONTACT_GROUP_NAME_TOO_LONG');
    }
    const normalizedGroup = group ? normalizeGroupName(group) : null;
    const existing = normalizedGroup ? groups.get(normalizedGroup) : undefined;
    return {
      rowNumber,
      name: name || null,
      normalizedPhone,
      group: group || null,
      normalizedGroup,
      groupId: existing?.id ?? null,
      groupResolution: !group ? 'NONE' : existing ? 'EXISTING' : 'NEW',
      errors
    };
  }

  private async requireOwnedEvent(eventId: string, principal: AuthPrincipal): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.eventAccess.ownedWhere(principal) }
    });
    if (!event) {
      throw eventNotFound();
    }
    return event;
  }

  private async lockMutableOwnedEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    const event = await this.lockOwnedEvent(tx, eventId, principal);
    this.assertMutableEvent(event);
    return event;
  }

  private async lockOwnedEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    await tx.$queryRaw`SELECT id FROM event WHERE id = ${eventId}::uuid FOR UPDATE`;
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.eventAccess.ownedWhere(principal) }
    });
    if (!event) {
      throw eventNotFound();
    }
    return event;
  }

  private assertMutableEvent(event: Event): void {
    if (!MUTABLE_EVENT_STATUSES.has(event.status)) {
      throw new ConflictException({
        code: 'CONTACT_EVENT_NOT_MUTABLE',
        message: 'Contacts can only be changed while the event is being prepared.'
      });
    }
  }

  private async assertCapacity(tx: Prisma.TransactionClient, eventId: string, additional: number): Promise<void> {
    const active = await tx.contact.count({ where: { eventId, deletedAt: null } });
    if (active + additional > MAX_ACTIVE_CONTACTS) {
      throw new ConflictException({
        code: 'CONTACT_LIMIT_EXCEEDED',
        message: 'An event cannot have more than 150 active contacts.'
      });
    }
  }

  private async assertGroupInEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    groupId: string | null | undefined
  ): Promise<void> {
    if (!groupId) {
      return;
    }
    const group = await tx.group.findFirst({ where: { id: groupId, eventId }, select: { id: true } });
    if (!group) {
      throw groupNotFound();
    }
  }

  private async recordUserAudit(
    tx: Prisma.TransactionClient,
    principal: AuthPrincipal,
    event: Event,
    operationId: string | undefined,
    action: string,
    resourceType: string,
    resourceId: string,
    afterData: Record<string, unknown>,
    beforeData?: Record<string, unknown>
  ): Promise<void> {
    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        action,
        resourceType,
        resourceId,
        clientId: event.clientId,
        eventId: event.id,
        ...(beforeData === undefined ? {} : { beforeData }),
        afterData,
        ...(operationId === undefined ? {} : { operationId })
      },
      tx
    );
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (!(isRetryableTransactionError(error) && attempt < 19)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (attempt + 1), 50)));
      }
    }
    throw new Error('Serializable transaction retry limit exceeded.');
  }
}

function parseCsv(buffer: Buffer): Array<{ rowNumber: number; values: string[] }> {
  let records: unknown[][];
  try {
    records = parse(buffer, {
      bom: true,
      encoding: 'utf8',
      relax_column_count: true,
      skip_empty_lines: false
    }) as unknown[][];
  } catch {
    throw csvError('CONTACT_IMPORT_INVALID_CSV', 'The CSV file is invalid.');
  }
  const nonEmpty = records
    .map((values, index) => ({ rowNumber: index + 1, values: values.map((value) => String(value ?? '')) }))
    .filter(({ values }) => values.some((value) => value.trim() !== ''));
  const header = nonEmpty.shift();
  if (
    !header ||
    header.values.length !== 3 ||
    header.values[0] !== 'name' ||
    header.values[1] !== 'whatsapp_phone' ||
    header.values[2] !== 'group'
  ) {
    throw csvError('CONTACT_IMPORT_INVALID_HEADERS', 'CSV headers must be name,whatsapp_phone,group.');
  }
  return nonEmpty;
}

function toContactResponse(contact: Contact): ContactResponseDto {
  return {
    id: contact.id,
    eventId: contact.eventId,
    groupId: contact.groupId,
    name: contact.name,
    whatsappPhone: contact.whatsappPhoneNormalized,
    anonymizedAt: contact.anonymizedAt,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt
  };
}

function toGroupResponse(group: Group): ContactGroupResponseDto {
  return {
    id: group.id,
    eventId: group.eventId,
    name: group.name,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

function technicalContactSnapshot(contact: Contact): Record<string, unknown> {
  return {
    id: contact.id,
    eventId: contact.eventId,
    groupId: contact.groupId,
    anonymizedAt: contact.anonymizedAt,
    deletedAt: contact.deletedAt
  };
}

function publicPreviewRow(row: StoredImportRow) {
  return {
    rowNumber: row.rowNumber,
    name: row.name,
    normalizedPhone: row.normalizedPhone,
    group: row.group,
    groupId: row.groupId,
    groupResolution: row.groupResolution,
    errors: row.errors
  };
}

function parseStoredRows(value: Prisma.JsonValue | null): StoredImportRow[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Contact import preview rows are invalid.');
  }
  return value as unknown as StoredImportRow[];
}

function serializeCommitResult(result: CommitImportResponseDto): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(result)) as Prisma.InputJsonObject;
}

function redactCommitResultSnapshot(value: Prisma.JsonValue, at: Date): Prisma.InputJsonObject {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError('A committed contact import result snapshot is invalid.');
  }
  const result = value as unknown as CommitImportResponseDto;
  if (!Array.isArray(result.contacts)) {
    throw new TypeError('A committed contact import result snapshot has no contacts.');
  }
  return JSON.parse(
    JSON.stringify({
      ...result,
      contacts: result.contacts.map((contact) => ({
        ...contact,
        name: null,
        whatsappPhone: null,
        anonymizedAt: at.toISOString()
      }))
    })
  ) as Prisma.InputJsonObject;
}

function deserializeCommitResult(value: Prisma.JsonValue): CommitImportResponseDto {
  const result = value as unknown as CommitImportResponseDto;
  return {
    ...result,
    contacts: result.contacts.map((contact) => ({
      ...contact,
      anonymizedAt: contact.anonymizedAt ? new Date(contact.anonymizedAt) : null,
      createdAt: new Date(contact.createdAt),
      updatedAt: new Date(contact.updatedAt)
    }))
  };
}

function csvError(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

function contactNotFound(): NotFoundException {
  return new NotFoundException({ code: 'CONTACT_NOT_FOUND', message: 'Contact not found.' });
}

function groupNotFound(): NotFoundException {
  return new NotFoundException({ code: 'CONTACT_GROUP_NOT_FOUND', message: 'Contact group not found.' });
}

function previewNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'CONTACT_IMPORT_PREVIEW_NOT_FOUND',
    message: 'Contact import preview not found.'
  });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'CONTACT_IMPORT_IDEMPOTENCY_CONFLICT',
    message: 'The idempotency key is already associated with another contact import.'
  });
}

function mapGroupConflict(error: unknown): unknown {
  if (isUniqueConflict(error)) {
    return new ConflictException({
      code: 'CONTACT_GROUP_NAME_CONFLICT',
      message: 'A contact group with that name already exists in the event.'
    });
  }
  return error;
}

function isUniqueConflict(error: unknown): boolean {
  return isPrismaCode(error, 'P2002');
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (isPrismaCode(error, 'P2034')) {
    return true;
  }
  if (!isPrismaCode(error, 'P2010') || typeof error !== 'object' || error === null || !('meta' in error)) {
    return false;
  }
  const meta = error.meta;
  if (typeof meta !== 'object' || meta === null) {
    return false;
  }
  const databaseCode = 'code' in meta ? meta.code : undefined;
  const driverError = 'driverAdapterError' in meta ? String(meta.driverAdapterError) : '';
  return databaseCode === '40001' || databaseCode === '40P01' || driverError.includes('TransactionWriteConflict');
}
