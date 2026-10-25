import { recomputeAccessControlPreparationStatus } from '../events/access-control-readiness.service';
import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { ClientOperatingProfilePolicy } from '../clients/client-operating-profile.policy';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import { AuditActorType, EventStatus, FloorplanShapeKind, Prisma, ServiceCode } from '../generated/prisma/client';
import { StaffTokenResolverService } from '../staff-access/staff-access.service';
import {
  type GeneratePhysicalPassesInput,
  type GeneratePhysicalPassesResponseDto,
  type PhysicalPassResponseDto,
  type ScanPhysicalPassInput,
  type ScanPhysicalPassResponseDto,
  type RevokePhysicalPassInput,
  type RevokePhysicalPassResponseDto,
  parseGenerationSnapshot,
  parseUseSnapshot,
  parseRevokeSnapshot
} from './physical-passes.dto';
import {
  generationIdempotencyConflict,
  physicalPassError,
  physicalPassNotFound,
  useIdempotencyConflict,
  revokeIdempotencyConflict
} from './physical-pass-errors';
import { PhysicalPassQrService, type PhysicalPassSvgContent } from './physical-pass-qr.service';
import { recomputePhysicalPassPreparationStatus } from './physical-pass-readiness.service';
import { PhysicalPassTokenService } from './physical-pass-token.service';

const GENERATION_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE,
  EventStatus.ACTIVE,
  EventStatus.EVENT_DAY
]);
const OPERATIONAL_STATUSES = new Set<EventStatus>([EventStatus.ACTIVE, EventStatus.EVENT_DAY]);
const MAX_ATTEMPTS = 20;
const passInclude = { floorplanShape: { select: { id: true, name: true } } } satisfies Prisma.PhysicalPassInclude;
type PhysicalPassView = Prisma.PhysicalPassGetPayload<{ include: typeof passInclude }>;
const physicalEventInclude = { service: { select: { code: true } }, client: true } satisfies Prisma.EventInclude;
type PhysicalEventView = Prisma.EventGetPayload<{ include: typeof physicalEventInclude }>;

@Injectable()
export class PhysicalPassesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessPolicy) private readonly access: EventAccessPolicy,
    @Inject(ClientOperatingProfilePolicy) private readonly operatingProfile: ClientOperatingProfilePolicy,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffTokenResolverService) private readonly staffTokens: StaffTokenResolverService,
    @Inject(PhysicalPassTokenService) private readonly tokens: PhysicalPassTokenService,
    @Inject(PhysicalPassQrService) private readonly qr: PhysicalPassQrService
  ) {}

  async generate(
    eventId: string,
    idempotencyKey: string,
    input: GeneratePhysicalPassesInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<GeneratePhysicalPassesResponseDto> {
    return this.generateBatch(eventId, idempotencyKey, input, principal, operationId);
  }

  async generateAdministrative(
    clientId: string,
    eventId: string,
    idempotencyKey: string,
    input: GeneratePhysicalPassesInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<GeneratePhysicalPassesResponseDto> {
    if (principal.role !== 'PLATFORM_ADMIN')
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: 'Provider access required.' });
    return this.generateBatch(
      eventId.toLowerCase(),
      idempotencyKey,
      input,
      principal,
      operationId,
      clientId.toLowerCase()
    );
  }

  private async generateBatch(
    eventId: string,
    idempotencyKey: string,
    input: GeneratePhysicalPassesInput,
    principal: AuthPrincipal,
    operationId?: string,
    providerClientId?: string
  ): Promise<GeneratePhysicalPassesResponseDto> {
    const tableShapeId = input.tableShapeId ?? null;
    // Preserve historical Client signatures verbatim. Managed receipts bind Provider + tenant + purpose.
    const signature = hashSignature({
      eventId,
      quantity: input.quantity,
      tableShapeId,
      ...(providerClientId
        ? { context: 'PROVIDER_ANONYMOUS', clientId: providerClientId, actorUserId: principal.userId }
        : {})
    });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await lockEvent(tx, eventId);
          const event = await tx.event.findFirst({
            where: {
              id: eventId,
              deletedAt: null,
              ...(providerClientId ? { clientId: providerClientId } : this.access.ownedWhere(principal))
            },
            include: physicalEventInclude
          });
          if (!event) throw eventNotFound();
          if (providerClientId) {
            assertAnonymousEvent(event);
          } else {
            await this.operatingProfile.assertTechnicalMutationAllowed(tx, event.clientId);
          }
          const replay = await tx.physicalPassGenerationOperation.findUnique({ where: { idempotencyKey } });
          if (replay) {
            if (replay.eventId !== eventId || replay.requestSignature !== signature) {
              throw generationIdempotencyConflict();
            }
            await recomputePhysicalPassPreparationStatus(tx, eventId);
            await recomputeAccessControlPreparationStatus(tx, eventId);
            return parseGenerationSnapshot(replay.resultSnapshot);
          }
          if (!providerClientId && !legacyPhysicalEvent(event))
            throw physicalPassError(
              'PHYSICAL_PASS_SERVICE_MISMATCH',
              'Event service does not support physical passes.'
            );
          if (!GENERATION_STATUSES.has(event.status)) {
            throw physicalPassError(
              'PHYSICAL_PASS_EVENT_NOT_MUTABLE',
              'Physical passes cannot be generated in this state.'
            );
          }
          if (!event.capacity || event.capacity <= 0) {
            throw physicalPassError('PHYSICAL_PASS_CAPACITY_EXCEEDED', 'Event capacity is not available.');
          }
          let table: { id: string; name: string; capacity: number } | null = null;
          if (event.floorplanEnabled) {
            if (!tableShapeId) throw physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'A table is required.');
            await tx.$queryRaw`SELECT "id" FROM "floorplan" WHERE "event_id" = ${eventId}::uuid AND "deleted_at" IS NULL FOR UPDATE`;
            await tx.$queryRaw`SELECT "id" FROM "floorplan_shape" WHERE "id" = ${tableShapeId}::uuid FOR UPDATE`;
            table = await tx.floorplanShape.findFirst({
              where: {
                id: tableShapeId,
                eventId,
                deletedAt: null,
                kind: FloorplanShapeKind.TABLE,
                floorplan: {
                  deletedAt: null,
                  ...(anonymousPhysicalEvent(event) ? { seatingMode: 'TABLE' as const } : {})
                }
              },
              select: { id: true, name: true, capacity: true }
            });
            if (!table) throw physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'The table is not valid.');
          } else if (tableShapeId) {
            throw physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'Table must be omitted without a Floorplan.');
          }
          const activeCount = await tx.physicalPass.count({ where: { eventId, deletedAt: null, revokedAt: null } });
          if (activeCount + input.quantity > event.capacity) {
            throw physicalPassError('PHYSICAL_PASS_CAPACITY_EXCEEDED', 'Event capacity would be exceeded.');
          }
          if (table) {
            const [assistantCount, passCount] = await Promise.all([
              tx.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } }),
              tx.physicalPass.count({ where: { floorplanShapeId: table.id, deletedAt: null, revokedAt: null } })
            ]);
            if (assistantCount + passCount + input.quantity > table.capacity) {
              throw physicalPassError('PHYSICAL_PASS_CAPACITY_EXCEEDED', 'Table capacity would be exceeded.');
            }
          }
          const last = await tx.physicalPass.aggregate({ where: { eventId }, _max: { passNumber: true } });
          const firstPassNumber = (last._max.passNumber ?? 0) + 1;
          const operationIdValue = randomUUID();
          const created: PhysicalPassView[] = [];
          for (let offset = 0; offset < input.quantity; offset += 1) {
            created.push(
              await tx.physicalPass.create({
                data: {
                  id: randomUUID(),
                  eventId,
                  passNumber: firstPassNumber + offset,
                  floorplanShapeId: tableShapeId,
                  qrTokenNonce: this.tokens.createNonce(),
                  qrTokenVersion: 1,
                  createdByUserId: principal.userId
                },
                include: passInclude
              })
            );
          }
          const response: GeneratePhysicalPassesResponseDto = {
            generationOperationId: operationIdValue,
            eventId,
            quantity: input.quantity,
            firstPassNumber,
            lastPassNumber: firstPassNumber + input.quantity - 1,
            table: table ? { id: table.id, name: table.name } : null,
            passes: created.map(toPassResponse)
          };
          await tx.physicalPassGenerationOperation.create({
            data: {
              id: operationIdValue,
              eventId,
              idempotencyKey,
              requestSignature: signature,
              resultSnapshot: response as unknown as Prisma.InputJsonObject
            }
          });
          await recomputePhysicalPassPreparationStatus(tx, eventId);
          await recomputeAccessControlPreparationStatus(tx, eventId);
          await this.audit.record(
            {
              actor: { type: AuditActorType.USER, id: principal.userId },
              clientId: event.clientId,
              eventId,
              resourceType: 'PHYSICAL_PASS_GENERATION',
              resourceId: operationIdValue,
              action: 'PHYSICAL_PASS_GENERATE',
              afterData: {
                generationOperationId: operationIdValue,
                quantity: input.quantity,
                firstPassNumber,
                lastPassNumber: response.lastPassNumber,
                tableShapeId
              },
              ...(operationId ? { operationId } : {})
            },
            tx
          );
          return response;
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if ((isRetryable(error) || isIdempotencyUnique(error)) && attempt < MAX_ATTEMPTS - 1) continue;
        throw mapDatabaseError(error);
      }
    }
    throw physicalPassError('PHYSICAL_PASS_CONCURRENCY_CONFLICT', 'Physical pass generation could not be serialized.');
  }

  async list(eventId: string, principal: AuthPrincipal): Promise<PhysicalPassResponseDto[]> {
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      await this.requireOwnedPhysicalEvent(eventId, principal, tx);
      const passes = await tx.physicalPass.findMany({
        where: { eventId, deletedAt: null },
        include: passInclude,
        orderBy: { passNumber: 'asc' }
      });
      return passes.map(toPassResponse);
    });
  }

  async getSvg(eventId: string, passId: string, principal: AuthPrincipal): Promise<PhysicalPassSvgContent> {
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedPhysicalEvent(eventId, principal, tx);
      await tx.$queryRaw`SELECT id FROM physical_pass WHERE id = ${passId}::uuid AND event_id = ${eventId}::uuid FOR UPDATE`;
      const pass = await tx.physicalPass.findFirst({
        where: { id: passId, eventId, deletedAt: null, revokedAt: null },
        include: passInclude
      });
      if (!pass) throw physicalPassNotFound();
      const token = this.tokens.issue(pass.id, pass.qrTokenNonce, pass.qrTokenVersion);
      try {
        return await this.qr.render({
          eventName: event.name ?? 'Evento',
          passNumber: pass.passNumber,
          tableName: pass.floorplanShape?.name ?? null,
          qrToken: token
        });
      } catch {
        throw physicalPassError(
          'PHYSICAL_PASS_QR_GENERATION_FAILURE',
          'The physical pass SVG could not be generated.',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    });
  }

  async revoke(
    eventId: string,
    passId: string,
    idempotencyKey: string,
    input: RevokePhysicalPassInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<RevokePhysicalPassResponseDto> {
    eventId = eventId.toLowerCase();
    passId = passId.toLowerCase();
    if (!['ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER'].includes(principal.role))
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: 'Organization access required.' });
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedPhysicalEvent(eventId, principal, tx);
      assertAnonymousEvent(event);
      const signature = hashSignature({
        context: 'REVOKE_ANONYMOUS',
        clientId: event.clientId,
        eventId,
        passId,
        actorUserId: principal.userId,
        revocationReasonCode: input.revocationReasonCode
      });
      await tx.$queryRaw`SELECT id FROM physical_pass WHERE id = ${passId}::uuid AND event_id = ${eventId}::uuid FOR UPDATE`;
      const prior = await tx.physicalPass.findUnique({ where: { revokeIdempotencyKey: idempotencyKey } });
      if (prior) {
        if (prior.id !== passId || prior.eventId !== eventId || prior.revokeRequestSignature !== signature)
          throw revokeIdempotencyConflict();
        return parseRevokeSnapshot(prior.revokeResultSnapshot);
      }
      const pass = await tx.physicalPass.findFirst({ where: { id: passId, eventId, deletedAt: null } });
      if (!pass) throw physicalPassNotFound();
      if (!GENERATION_STATUSES.has(event.status))
        throw physicalPassError('PHYSICAL_PASS_EVENT_NOT_MUTABLE', 'Physical passes cannot be revoked in this state.');
      if (pass.usedAt)
        throw physicalPassError('PHYSICAL_PASS_ALREADY_USED', 'The physical pass has already been used.');
      if (pass.revokedAt) throw physicalPassError('PHYSICAL_PASS_ALREADY_REVOKED', 'The physical pass is revoked.');
      const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const now = rows[0]?.now;
      if (!now) throw new Error('Database clock unavailable.');
      const snapshot: RevokePhysicalPassResponseDto = {
        status: 'REVOKED',
        physicalPassId: pass.id,
        passNumber: pass.passNumber,
        revokedAt: now.toISOString(),
        revocationReasonCode: input.revocationReasonCode
      };
      await tx.physicalPass.update({
        where: { id: pass.id },
        data: {
          revokedAt: now,
          revokedByUserId: principal.userId,
          revocationReasonCode: input.revocationReasonCode,
          revokeIdempotencyKey: idempotencyKey,
          revokeRequestSignature: signature,
          revokeResultSnapshot: snapshot as unknown as Prisma.InputJsonObject
        }
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId: event.clientId,
          eventId,
          resourceType: 'PHYSICAL_PASS',
          resourceId: pass.id,
          action: 'PHYSICAL_PASS_REVOKE',
          afterData: {
            physicalPassId: pass.id,
            passNumber: pass.passNumber,
            revokedAt: snapshot.revokedAt,
            revocationReasonCode: input.revocationReasonCode
          },
          ...(operationId ? { operationId } : {})
        },
        tx
      );
      await recomputeAccessControlPreparationStatus(tx, eventId);
      return snapshot;
    });
  }

  async scan(
    rawStaffToken: string,
    idempotencyKey: string,
    input: ScanPhysicalPassInput,
    operationId?: string
  ): Promise<ScanPhysicalPassResponseDto> {
    const verified = this.tokens.verify(input.qrToken);
    if (!verified) throw physicalPassNotFound();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const identity = await this.staffTokens.resolveStaffTokenIdentityInTransaction(tx, rawStaffToken);
          if (!identity) throw invalidStaff();
          // New anonymous requests (including replay) require current operational Staff.
          // Historical PHYSICAL_QR replays retain their original post-close contract below.
          if (identity.event.accessMode !== null) {
            if (identity.event.deletedAt || !OPERATIONAL_STATUSES.has(identity.event.status))
              throw physicalPassError('STAFF_EVENT_NOT_OPERATIONAL', 'The StaffToken Event is not operational.');
            if (identity.staff.expiredAt) throw invalidStaff();
            const context = await tx.event.findUniqueOrThrow({
              where: { id: identity.event.id },
              include: physicalEventInclude
            });
            if (!anonymousPhysicalEvent(context)) throw physicalPassNotFound();
            assertAnonymousEvent(context);
          }
          const signature = hashSignature({
            staffTokenId: identity.staff.id,
            eventId: identity.event.id,
            physicalPassId: verified.physicalPassId,
            qrToken: input.qrToken
          });
          const replay = await tx.physicalPass.findFirst({ where: { useIdempotencyKey: idempotencyKey } });
          if (replay) {
            if (
              replay.id !== verified.physicalPassId ||
              replay.eventId !== identity.event.id ||
              replay.usedByStaffTokenId !== identity.staff.id ||
              replay.useRequestSignature !== signature
            ) {
              throw useIdempotencyConflict();
            }
            return parseUseSnapshot(replay.useResultSnapshot);
          }
          if (identity.event.deletedAt || !OPERATIONAL_STATUSES.has(identity.event.status)) {
            throw physicalPassError('STAFF_EVENT_NOT_OPERATIONAL', 'The StaffToken Event is not operational.');
          }
          if (identity.staff.expiredAt) throw invalidStaff();
          const service = await tx.service.findUnique({ where: { id: identity.event.serviceId ?? '' } });
          const physicalEvent = { ...identity.event, service };
          if (!legacyPhysicalEvent(physicalEvent) && !anonymousPhysicalEvent(physicalEvent))
            throw physicalPassNotFound();
          if (anonymousPhysicalEvent(physicalEvent)) {
            const client = await tx.client.findUnique({ where: { id: identity.event.clientId } });
            if (
              !client ||
              client.deletedAt ||
              client.type !== 'ORGANIZATION' ||
              client.operatingProfile !== 'MANAGED' ||
              client.status !== 'ACTIVE'
            )
              throw physicalPassNotFound();
          }
          await tx.$queryRaw`SELECT "id" FROM "physical_pass" WHERE "id" = ${verified.physicalPassId}::uuid FOR UPDATE`;
          const pass = await tx.physicalPass.findFirst({
            where: {
              id: verified.physicalPassId,
              eventId: identity.event.id,
              qrTokenNonce: verified.nonce,
              qrTokenVersion: verified.version,
              deletedAt: null,
              revokedAt: null
            },
            include: passInclude
          });
          if (!pass) throw physicalPassNotFound();
          if (pass.usedAt) {
            throw physicalPassError('PHYSICAL_PASS_ALREADY_USED', 'The physical pass has already been used.');
          }
          if (identity.event.floorplanEnabled) {
            if (!pass.floorplanShapeId) {
              throw physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'Physical pass table is not operational.');
            }
            await tx.$queryRaw`SELECT "id" FROM "floorplan_shape" WHERE "id" = ${pass.floorplanShapeId}::uuid FOR UPDATE`;
            const table = await tx.floorplanShape.findFirst({
              where: {
                id: pass.floorplanShapeId,
                eventId: identity.event.id,
                deletedAt: null,
                kind: FloorplanShapeKind.TABLE,
                floorplan: {
                  deletedAt: null,
                  ...(anonymousPhysicalEvent(physicalEvent) ? { seatingMode: 'TABLE' as const } : {})
                }
              }
            });
            if (!table)
              throw physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'Physical pass table is not operational.');
          } else if (pass.floorplanShapeId) {
            throw physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'Physical pass table is not operational.');
          }
          const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
          const now = clock[0]?.now;
          if (!now) throw new Error('Database clock unavailable.');
          const snapshot: ScanPhysicalPassResponseDto = {
            status: 'USED',
            physicalPassId: pass.id,
            passNumber: pass.passNumber,
            usedAt: now.toISOString(),
            table: pass.floorplanShape ? { id: pass.floorplanShape.id, name: pass.floorplanShape.name } : null
          };
          await tx.physicalPass.update({
            where: { id: pass.id },
            data: {
              usedAt: now,
              usedByStaffTokenId: identity.staff.id,
              useIdempotencyKey: idempotencyKey,
              useRequestSignature: signature,
              useResultSnapshot: snapshot as unknown as Prisma.InputJsonObject
            }
          });
          await this.audit.record(
            {
              actor: { type: AuditActorType.STAFF_TOKEN, id: identity.staff.id },
              clientId: identity.event.clientId,
              eventId: identity.event.id,
              resourceType: 'PHYSICAL_PASS',
              resourceId: pass.id,
              action: 'PHYSICAL_PASS_USE',
              afterData: {
                physicalPassId: pass.id,
                passNumber: pass.passNumber,
                tableShapeId: pass.floorplanShapeId,
                usedAt: now.toISOString()
              },
              ...(operationId ? { operationId } : {})
            },
            tx
          );
          return snapshot;
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryable(error) || isIdempotencyUnique(error)) {
          if (attempt === MAX_ATTEMPTS - 1)
            throw physicalPassError('PHYSICAL_PASS_CONCURRENCY_CONFLICT', 'Physical pass use could not be serialized.');
          // Yield outside the transaction: synchronized gates otherwise keep
          // acquiring stale snapshots and can starve one reader for 20 attempts.
          const backoffMs = Math.min(5 * 2 ** attempt, 250);
          await new Promise((resolve) =>
            setTimeout(resolve, backoffMs + Math.floor(Math.random() * Math.ceil(backoffMs / 2)))
          );
          continue;
        }
        throw mapDatabaseError(error);
      }
    }
    throw physicalPassError('PHYSICAL_PASS_CONCURRENCY_CONFLICT', 'Physical pass use could not be serialized.');
  }

  private async requireOwnedPhysicalEvent(eventId: string, principal: AuthPrincipal, tx: Prisma.TransactionClient) {
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.access.ownedWhere(principal) },
      include: physicalEventInclude
    });
    if (!event) throw eventNotFound();
    if (!legacyPhysicalEvent(event)) {
      assertAnonymousEvent(event);
      if (!['ORGANIZATION_ADMIN', 'ORGANIZATION_PLANNER'].includes(principal.role))
        throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: 'Organization access required.' });
    }
    return event;
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if ((isRetryable(error) || isIdempotencyUnique(error)) && attempt < MAX_ATTEMPTS - 1) continue;
        throw mapDatabaseError(error);
      }
    }
    throw physicalPassError('PHYSICAL_PASS_CONCURRENCY_CONFLICT', 'Physical pass operation could not be serialized.');
  }
}

function toPassResponse(pass: PhysicalPassView): PhysicalPassResponseDto {
  return {
    id: pass.id,
    eventId: pass.eventId,
    passNumber: pass.passNumber,
    status: pass.revokedAt ? 'REVOKED' : pass.usedAt ? 'USED' : 'UNUSED',
    table: pass.floorplanShape ? { id: pass.floorplanShape.id, name: pass.floorplanShape.name } : null,
    usedAt: pass.usedAt?.toISOString() ?? null,
    createdAt: pass.createdAt.toISOString()
  };
}

type PhysicalEventIdentity = { service: { code: ServiceCode } | null; accessMode: string | null };
function legacyPhysicalEvent(event: PhysicalEventIdentity): boolean {
  return event.service?.code === ServiceCode.PHYSICAL_QR && event.accessMode === null;
}
function anonymousPhysicalEvent(event: PhysicalEventIdentity): boolean {
  return event.service?.code === ServiceCode.ACCESS_CONTROL && event.accessMode === 'ANONYMOUS';
}
function assertAnonymousEvent(event: PhysicalEventView): void {
  if (
    !anonymousPhysicalEvent(event) ||
    event.client.type !== 'ORGANIZATION' ||
    event.client.operatingProfile !== 'MANAGED' ||
    event.client.deletedAt ||
    event.client.status !== 'ACTIVE'
  )
    throw physicalPassError('PHYSICAL_PASS_SERVICE_MISMATCH', 'Event does not support Managed anonymous passes.');
}

function hashSignature(value: Record<string, unknown>): string {
  const canonical = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}=${item === null ? 'null' : String(item)}`)
    .join('\0');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function lockEvent(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
}

function invalidStaff(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'STAFF_TOKEN_INVALID_OR_EXPIRED',
    message: 'StaffToken is invalid or expired.'
  });
}

function isRetryable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P2034') return true;
  const text = JSON.stringify(error);
  return text.includes('40001') || text.includes('40P01') || text.includes('TransactionWriteConflict');
}

function isIdempotencyUnique(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
  );
}

function mapDatabaseError(error: unknown): unknown {
  const text = JSON.stringify(error);
  if (text.includes('PHYSICAL_PASS_CAPACITY_EXCEEDED') || text.includes('physical_pass_event_capacity')) {
    return physicalPassError('PHYSICAL_PASS_CAPACITY_EXCEEDED', 'Physical pass capacity would be exceeded.');
  }
  if (text.includes('PHYSICAL_PASS_TABLE_INVALID') || text.includes('physical_pass_table')) {
    return physicalPassError('PHYSICAL_PASS_TABLE_INVALID', 'Physical pass table is invalid.');
  }
  if (text.includes('PHYSICAL_PASS_SERVICE_MISMATCH') || text.includes('physical_pass_service_mismatch')) {
    return physicalPassError('PHYSICAL_PASS_SERVICE_MISMATCH', 'Event service does not support physical passes.');
  }
  if (text.includes('physical_pass_generation_state')) {
    return physicalPassError('PHYSICAL_PASS_EVENT_NOT_MUTABLE', 'Physical passes cannot be generated in this state.');
  }
  if (text.includes('physical_pass_use_event_not_operational')) {
    return physicalPassError('STAFF_EVENT_NOT_OPERATIONAL', 'The StaffToken Event is not operational.');
  }
  if (text.includes('physical_pass_use_staff_expired')) {
    return invalidStaff();
  }
  return error;
}

export const physicalPassTesting = { hashSignature, toPassResponse };
