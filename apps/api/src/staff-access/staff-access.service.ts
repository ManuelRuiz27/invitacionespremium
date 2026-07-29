import { ConflictException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { eventNotFound, eventOwnedWhere } from '../events/event-access.policy';
import { AuditActorType, EventStatus, Prisma, type Event, type StaffToken } from '../generated/prisma/client';
import type {
  CreateStaffTokenInput,
  CreatedStaffTokenResponseDto,
  ScannerSessionResponseDto,
  StaffTokenResponseDto
} from './staff-access.dto';
import { StaffTokenTechnicalService } from './staff-token-technical.service';

const OPERATIONAL_EVENT_STATUSES = new Set<EventStatus>([EventStatus.ACTIVE, EventStatus.EVENT_DAY]);
const MAX_TRANSACTION_ATTEMPTS = 20;

export interface ResolvedStaffToken {
  staffTokenId: string;
  eventId: string;
  alias: string;
}

export type StaffResolution =
  { kind: 'AVAILABLE'; staff: StaffToken; event: Event } | { kind: 'INVALID' } | { kind: 'EVENT_NOT_OPERATIONAL' };

@Injectable()
export class StaffTokenManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffTokenTechnicalService) private readonly technical: StaffTokenTechnicalService
  ) {}

  async list(eventId: string, principal: AuthPrincipal): Promise<StaffTokenResponseDto[]> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null, ...eventOwnedWhere(principal) },
      select: { id: true }
    });
    if (!event) throw eventNotFound();
    const tokens = await this.prisma.staffToken.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    return tokens.map(toStaffTokenResponse);
  }

  async create(
    eventId: string,
    input: CreateStaffTokenInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<CreatedStaffTokenResponseDto> {
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      const generated = this.technical.generate();
      try {
        return await this.prisma.$transaction(async (transaction) => {
          await this.lockEvent(transaction, eventId);
          const event = await transaction.event.findFirst({
            where: { id: eventId, deletedAt: null, ...eventOwnedWhere(principal) }
          });
          if (!event) throw eventNotFound();
          if (!OPERATIONAL_EVENT_STATUSES.has(event.status)) {
            throw new DomainError(
              'STAFF_EVENT_NOT_OPERATIONAL',
              'StaffTokens can only be created for an operational Event.',
              HttpStatus.CONFLICT
            );
          }
          const activeCount = await transaction.staffToken.count({ where: { eventId, expiredAt: null } });
          if (activeCount >= 3) throw staffTokenLimitReached();

          const created = await transaction.staffToken.create({
            data: {
              eventId,
              alias: input.alias,
              tokenDigestSha256: generated.digestSha256,
              tokenVersion: generated.version,
              createdByUserId: principal.userId
            }
          });
          await this.audit.record(
            {
              actor: { type: AuditActorType.USER, id: principal.userId },
              clientId: event.clientId,
              eventId,
              resourceType: 'STAFF_TOKEN',
              resourceId: created.id,
              action: 'STAFF_TOKEN_CREATE',
              afterData: staffTokenAuditSnapshot(created),
              ...(operationId === undefined ? {} : { operationId })
            },
            transaction
          );
          return {
            ...toStaffTokenResponse(created),
            token: generated.rawToken,
            sessionPath: `/api/v1/scanner/${encodeURIComponent(generated.rawToken)}/session`
          };
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isStaffTokenLimitError(error)) throw staffTokenLimitReached();
        if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS - 1) continue;
        if (hasPrismaCode(error, 'P2002') && attempt < MAX_TRANSACTION_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new DomainError(
      'STAFF_TOKEN_CONCURRENCY_CONFLICT',
      'StaffToken creation could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  private async lockEvent(transaction: Prisma.TransactionClient, eventId: string): Promise<void> {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "event"
      WHERE "id" = ${eventId}::uuid
      FOR UPDATE
    `;
  }
}

@Injectable()
export class StaffTokenResolverService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StaffTokenTechnicalService) private readonly technical: StaffTokenTechnicalService
  ) {}

  async resolveStaffToken(rawToken: string): Promise<ResolvedStaffToken | null> {
    const result = await this.resolve(rawToken);
    if (result.kind !== 'AVAILABLE') return null;
    return {
      staffTokenId: result.staff.id,
      eventId: result.staff.eventId,
      alias: result.staff.alias
    };
  }

  async resolveStaffTokenInTransaction(
    transaction: Prisma.TransactionClient,
    rawToken: string,
    knownEventId?: string
  ): Promise<StaffResolution> {
    if (!this.technical.isValidSyntax(rawToken)) return { kind: 'INVALID' };
    const digest = this.technical.digest(rawToken);
    const eventId = knownEventId ?? (await this.technical.lookupByDigest(transaction, digest))?.eventId;
    if (!eventId) return { kind: 'INVALID' };
    await this.lockRows(transaction, eventId, digest);
    const staff = await this.technical.lookupByDigest(transaction, digest);
    if (!staff || staff.expiredAt) return { kind: 'INVALID' };
    const event = await transaction.event.findUnique({ where: { id: staff.eventId } });
    if (!event || event.deletedAt) return { kind: 'INVALID' };
    if (!OPERATIONAL_EVENT_STATUSES.has(event.status)) return { kind: 'EVENT_NOT_OPERATIONAL' };
    return { kind: 'AVAILABLE', staff, event };
  }

  async getPublicSession(rawToken: string): Promise<ScannerSessionResponseDto> {
    const result = await this.resolve(rawToken);
    if (result.kind === 'INVALID') throw invalidStaffToken();
    if (result.kind === 'EVENT_NOT_OPERATIONAL') {
      throw new ConflictException({
        code: 'STAFF_EVENT_NOT_OPERATIONAL',
        message: 'The StaffToken Event is not operational.'
      });
    }
    const { event, staff } = result;
    if (!event.name || !event.eventDateTime || !event.timeZone) {
      throw new ConflictException({
        code: 'STAFF_EVENT_NOT_OPERATIONAL',
        message: 'The StaffToken Event is not operational.'
      });
    }
    return {
      status: 'AVAILABLE',
      staff: { alias: staff.alias },
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        eventDateTime: event.eventDateTime.toISOString(),
        timeZone: event.timeZone,
        floorplanEnabled: event.floorplanEnabled
      }
    };
  }

  private async resolve(rawToken: string): Promise<StaffResolution> {
    if (!this.technical.isValidSyntax(rawToken)) return { kind: 'INVALID' };
    const digest = this.technical.digest(rawToken);
    const context = await this.technical.lookupByDigest(this.prisma, digest);
    if (!context || context.expiredAt) return { kind: 'INVALID' };

    return this.prisma.$transaction(
      (transaction) => this.resolveStaffTokenInTransaction(transaction, rawToken, context.eventId),
      CRITICAL_TRANSACTION_OPTIONS
    );
  }

  private async lockRows(transaction: Prisma.TransactionClient, eventId: string, digestSha256: string): Promise<void> {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "event"
      WHERE "id" = ${eventId}::uuid
      FOR UPDATE
    `;
    await transaction.$queryRaw`
      SELECT "id"
      FROM "staff_token"
      WHERE "token_digest_sha256" = ${digestSha256}
      FOR UPDATE
    `;
  }
}

@Injectable()
export class StaffTokenExpirationService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async expireForEventTransition(
    transaction: Prisma.TransactionClient,
    event: Event,
    expiredAt: Date,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<number> {
    const active = await transaction.staffToken.findMany({
      where: { eventId: event.id, expiredAt: null },
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    if (active.length === 0) return 0;
    const ids = active.map(({ id }) => id);
    await transaction.staffToken.updateMany({
      where: { id: { in: ids }, expiredAt: null },
      data: { expiredAt }
    });
    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId: event.clientId,
        eventId: event.id,
        resourceType: 'STAFF_TOKEN',
        resourceId: event.id,
        action: 'STAFF_TOKENS_EXPIRE',
        beforeData: { activeCount: active.length, staffTokenIds: ids },
        afterData: { activeCount: 0, expiredAt: expiredAt.toISOString(), staffTokenIds: ids },
        ...(operationId === undefined ? {} : { operationId })
      },
      transaction
    );
    return active.length;
  }
}

function toStaffTokenResponse(token: StaffToken): StaffTokenResponseDto {
  return {
    id: token.id,
    eventId: token.eventId,
    alias: token.alias,
    state: token.expiredAt ? 'EXPIRED' : 'ACTIVE',
    createdAt: token.createdAt.toISOString(),
    expiredAt: token.expiredAt?.toISOString() ?? null
  };
}

function staffTokenAuditSnapshot(token: StaffToken) {
  return {
    id: token.id,
    eventId: token.eventId,
    alias: token.alias,
    state: token.expiredAt ? 'EXPIRED' : 'ACTIVE',
    createdAt: token.createdAt.toISOString(),
    expiredAt: token.expiredAt?.toISOString() ?? null
  };
}

function staffTokenLimitReached(): DomainError {
  return new DomainError('STAFF_TOKEN_LIMIT_REACHED', 'An Event can have at most three active StaffTokens.', 409);
}

function invalidStaffToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'STAFF_TOKEN_INVALID_OR_EXPIRED',
    message: 'StaffToken is invalid or expired.'
  });
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (hasPrismaCode(error, 'P2034')) return true;
  const diagnostic = String(error);
  return (
    diagnostic.includes('40001') || diagnostic.includes('40P01') || diagnostic.includes('TransactionWriteConflict')
  );
}

function isStaffTokenLimitError(error: unknown): boolean {
  return (
    String(error).includes('staff_token_active_limit') || String(error).includes('staff_token active limit reached')
  );
}
