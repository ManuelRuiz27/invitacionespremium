import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditActorType } from '../generated/prisma/client';

export const AUDIT_LOG_DEFAULT_LIMIT = 50;
export const AUDIT_LOG_MAX_LIMIT = 100;

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    occurredAt: instantSchema,
    id: uuidSchema
  })
  .strict();

const auditLogQuerySchema = z
  .object({
    clientId: uuidSchema.optional(),
    eventId: uuidSchema.optional(),
    actorType: z.enum(AuditActorType).optional(),
    actorId: uuidSchema.optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
    resourceId: uuidSchema.optional(),
    action: z.string().trim().min(1).max(120).optional(),
    operationId: uuidSchema.optional(),
    createdFrom: instantSchema.optional(),
    createdTo: instantSchema.optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(AUDIT_LOG_MAX_LIMIT).default(AUDIT_LOG_DEFAULT_LIMIT)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.createdFrom && value.createdTo && Date.parse(value.createdFrom) > Date.parse(value.createdTo)) {
      context.addIssue({
        code: 'custom',
        path: ['createdTo'],
        message: 'createdTo must be after or equal to createdFrom.'
      });
    }

    if (value.cursor) {
      try {
        decodeAuditCursor(value.cursor);
      } catch {
        context.addIssue({ code: 'custom', path: ['cursor'], message: 'cursor is invalid.' });
      }
    }
  });

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export interface AuditCursor {
  occurredAt: Date;
  id: string;
}

export function parseAuditLogQuery(input: unknown): AuditLogQuery {
  const result = auditLogQuerySchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Audit log query is invalid.',
      details: result.error.flatten()
    });
  }

  return result.data;
}

export function encodeAuditCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ version: 1, occurredAt: occurredAt.toISOString(), id }), 'utf8').toString(
    'base64url'
  );
}

export function decodeAuditCursor(cursor: string): AuditCursor {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new TypeError('Invalid audit cursor.');
  }

  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed = cursorPayloadSchema.parse(JSON.parse(decoded));
  const canonical = Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url');
  if (canonical !== cursor) {
    throw new TypeError('Invalid audit cursor.');
  }

  return { occurredAt: new Date(parsed.occurredAt), id: parsed.id };
}

const jsonValueSchemas = [
  { type: 'object', additionalProperties: true },
  { type: 'array', items: {} },
  { type: 'string' },
  { type: 'number' },
  { type: 'boolean' }
];

export class AuditLogResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ enum: AuditActorType })
  actorType!: AuditActorType;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  actorId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  actorFingerprint!: string | null;

  @ApiProperty({ type: String })
  resourceType!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  resourceId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  eventId!: string | null;

  @ApiProperty({ type: String })
  action!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  operationId!: string | null;

  @ApiProperty({ type: Object, nullable: true, oneOf: jsonValueSchemas })
  beforeData!: unknown;

  @ApiProperty({ type: Object, nullable: true, oneOf: jsonValueSchemas })
  afterData!: unknown;

  @ApiProperty({ type: Object, nullable: true, oneOf: jsonValueSchemas })
  metadata!: unknown;
}

export class AuditLogPageResponseDto {
  @ApiProperty({ type: AuditLogResponseDto, isArray: true })
  items!: AuditLogResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
