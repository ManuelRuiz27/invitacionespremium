import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditActorFactory } from '../audit/audit-actor.factory';
import { AuditService } from '../audit/audit.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { PhoneNormalizer } from '../contacts/phone-normalizer';
import type { CommercialLead, CommercialOpportunityType } from '../generated/prisma/client';
import {
  decodeCommercialLeadCursor,
  encodeCommercialLeadCursor,
  type CommercialLeadAcceptedResponseDto,
  type CommercialLeadListQuery,
  type CommercialLeadPageResponseDto,
  type CommercialLeadResponseDto,
  type CommercialLeadSubmission
} from './commercial-leads.dto';

const ACCEPTED = { accepted: true } as const;
const MAX_SERIALIZATION_ATTEMPTS = 5;

interface NormalizedSubmission {
  submissionId: string;
  opportunityType: CommercialOpportunityType;
  contactName: string;
  businessName: string;
  email: string;
  phone: string | null;
  estimatedEventsPerMonth: number | null;
  notes: string | null;
}

@Injectable()
export class CommercialLeadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PhoneNormalizer) private readonly phoneNormalizer: PhoneNormalizer
  ) {}

  async submit(input: CommercialLeadSubmission, operationId?: string): Promise<CommercialLeadAcceptedResponseDto> {
    if (input.website.length > 0) return ACCEPTED;
    const normalized = this.normalize(input);

    for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
      try {
        return await this.submitTransaction(normalized, operationId);
      } catch (error) {
        if (hasPrismaCode(error, 'P2034') && attempt < MAX_SERIALIZATION_ATTEMPTS) continue;
        if (hasPrismaCode(error, 'P2002')) return this.resolveUniqueRace(normalized);
        throw error;
      }
    }
    throw new DomainError(
      'COMMERCIAL_LEAD_CONCURRENCY_CONFLICT',
      'Commercial lead submission could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  async list(query: CommercialLeadListQuery): Promise<CommercialLeadPageResponseDto> {
    const cursor = query.cursor ? decodeCommercialLeadCursor(query.cursor) : undefined;
    const rows = await this.prisma.commercialLead.findMany({
      where: {
        ...(query.opportunityType ? { opportunityType: query.opportunityType } : {}),
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1
    });
    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(toResponse),
      nextCursor: hasNextPage && last ? encodeCommercialLeadCursor(last.createdAt, last.id) : null
    };
  }

  async get(leadId: string): Promise<CommercialLeadResponseDto> {
    const lead = await this.prisma.commercialLead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new DomainError('COMMERCIAL_LEAD_NOT_FOUND', 'Commercial lead was not found.', HttpStatus.NOT_FOUND);
    }
    return toResponse(lead);
  }

  private normalize(input: CommercialLeadSubmission): NormalizedSubmission {
    return {
      submissionId: input.submissionId,
      opportunityType: input.opportunityType,
      contactName: input.contactName,
      businessName: input.businessName,
      email: input.email,
      phone: input.phone ? this.phoneNormalizer.normalize(input.phone) : null,
      estimatedEventsPerMonth: input.estimatedEventsPerMonth ?? null,
      notes: input.notes
    };
  }

  private submitTransaction(
    input: NormalizedSubmission,
    operationId?: string
  ): Promise<CommercialLeadAcceptedResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT TRUE AS "locked"
        FROM pg_advisory_xact_lock(hashtextextended(${`commercial-lead:${input.email}`}, 0))
      `;

      const sameSubmission = await tx.commercialLead.findUnique({ where: { submissionId: input.submissionId } });
      if (sameSubmission) {
        if (matchesNormalized(sameSubmission, input)) return ACCEPTED;
        throw idempotencyConflict();
      }

      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const now = clock[0]?.now;
      if (!now) throw new Error('Database clock was unavailable.');
      const recentDuplicate = await tx.commercialLead.findFirst({
        where: {
          opportunityType: input.opportunityType,
          email: input.email,
          businessName: input.businessName,
          contactName: input.contactName,
          phone: input.phone,
          estimatedEventsPerMonth: input.estimatedEventsPerMonth,
          notes: input.notes,
          createdAt: { gte: new Date(now.getTime() - 10 * 60_000) }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      });
      if (recentDuplicate) return ACCEPTED;

      const recentCount = await tx.commercialLead.count({
        where: { email: input.email, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } }
      });
      if (recentCount >= 3) {
        throw new DomainError(
          'COMMERCIAL_LEAD_RATE_LIMITED',
          'Too many commercial lead submissions were received.',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      const lead = await tx.commercialLead.create({
        data: { ...input, privacyAcceptedAt: now, createdAt: now }
      });
      await this.audit.record(
        {
          actor: AuditActorFactory.system(),
          resourceType: 'COMMERCIAL_LEAD',
          resourceId: lead.id,
          action: 'COMMERCIAL_LEAD_CREATE',
          ...(operationId ? { operationId } : {}),
          afterData: { opportunityType: lead.opportunityType, createdAt: lead.createdAt.toISOString() },
          metadata: { source: 'LANDING' }
        },
        tx
      );
      return ACCEPTED;
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  private async resolveUniqueRace(input: NormalizedSubmission): Promise<CommercialLeadAcceptedResponseDto> {
    const existing = await this.prisma.commercialLead.findUnique({ where: { submissionId: input.submissionId } });
    if (existing && matchesNormalized(existing, input)) return ACCEPTED;
    throw idempotencyConflict();
  }
}

function matchesNormalized(lead: CommercialLead, input: NormalizedSubmission): boolean {
  return (
    lead.opportunityType === input.opportunityType &&
    lead.contactName === input.contactName &&
    lead.businessName === input.businessName &&
    lead.email === input.email &&
    lead.phone === input.phone &&
    lead.estimatedEventsPerMonth === input.estimatedEventsPerMonth &&
    lead.notes === input.notes
  );
}

function toResponse(lead: CommercialLead): CommercialLeadResponseDto {
  return {
    id: lead.id,
    opportunityType: lead.opportunityType,
    contactName: lead.contactName,
    businessName: lead.businessName,
    email: lead.email,
    phone: lead.phone,
    estimatedEventsPerMonth: lead.estimatedEventsPerMonth,
    notes: lead.notes,
    privacyAcceptedAt: lead.privacyAcceptedAt.toISOString(),
    createdAt: lead.createdAt.toISOString()
  };
}

function idempotencyConflict(): DomainError {
  return new DomainError(
    'COMMERCIAL_LEAD_IDEMPOTENCY_CONFLICT',
    'The submission id was already used with different data.',
    HttpStatus.CONFLICT
  );
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
