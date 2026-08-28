import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { CommercialOpportunityType } from '../generated/prisma/client';

export const COMMERCIAL_LEAD_DEFAULT_LIMIT = 25;
export const COMMERCIAL_LEAD_MAX_LIMIT = 100;

const uuidSchema = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

const submissionSchema = z
  .object({
    submissionId: uuidSchema,
    opportunityType: z.enum(CommercialOpportunityType),
    contactName: z.string().trim().min(2).max(160),
    businessName: z.string().trim().min(2).max(160),
    email: z.string().trim().toLowerCase().email().max(320),
    phone: optionalText(200),
    estimatedEventsPerMonth: z.number().int().min(1).max(10_000).optional().nullable(),
    notes: optionalText(1000),
    privacyAccepted: z.literal(true),
    website: z.string().trim().max(200).optional().default('')
  })
  .strict();

const cursorPayloadSchema = z
  .object({ version: z.literal(1), createdAt: z.string().datetime({ offset: true }), id: uuidSchema })
  .strict();

const listQuerySchema = z
  .object({
    opportunityType: z.enum(CommercialOpportunityType).optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(COMMERCIAL_LEAD_MAX_LIMIT).default(COMMERCIAL_LEAD_DEFAULT_LIMIT)
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.cursor) return;
    try {
      decodeCommercialLeadCursor(value.cursor);
    } catch {
      context.addIssue({ code: 'custom', path: ['cursor'], message: 'cursor is invalid.' });
    }
  });

export type CommercialLeadSubmission = z.infer<typeof submissionSchema>;
export type CommercialLeadListQuery = z.infer<typeof listQuerySchema>;

export function parseCommercialLeadSubmission(input: unknown): CommercialLeadSubmission {
  return parseOrThrow(submissionSchema, input, 'Commercial lead submission is invalid.');
}

export function parseCommercialLeadListQuery(input: unknown): CommercialLeadListQuery {
  return parseOrThrow(listQuerySchema, input, 'Commercial lead query is invalid.');
}

export function parseCommercialLeadId(input: string): string {
  return parseOrThrow(uuidSchema, input, 'Commercial lead id is invalid.');
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message,
      details: result.error.flatten()
    });
  }
  return result.data;
}

export function encodeCommercialLeadCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ version: 1, createdAt: createdAt.toISOString(), id }), 'utf8').toString(
    'base64url'
  );
}

export function decodeCommercialLeadCursor(cursor: string): { createdAt: Date; id: string } {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new TypeError('Invalid commercial lead cursor.');
  const parsed = cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  const canonical = Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url');
  if (canonical !== cursor) throw new TypeError('Invalid commercial lead cursor.');
  return { createdAt: new Date(parsed.createdAt), id: parsed.id };
}

export class CommercialLeadSubmissionRequestDto {
  @ApiProperty({ type: String, format: 'uuid' }) submissionId!: string;
  @ApiProperty({ enum: CommercialOpportunityType }) opportunityType!: CommercialOpportunityType;
  @ApiProperty({ type: String, minLength: 2, maxLength: 160 }) contactName!: string;
  @ApiProperty({ type: String, minLength: 2, maxLength: 160 }) businessName!: string;
  @ApiProperty({ type: String, format: 'email', maxLength: 320 }) email!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone?: string | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10_000, nullable: true })
  estimatedEventsPerMonth?: number | null;
  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true }) notes?: string | null;
  @ApiProperty({ type: Boolean, enum: [true] }) privacyAccepted!: true;
  @ApiPropertyOptional({ type: String, maxLength: 200, description: 'Anti-spam honeypot; leave empty.' })
  website?: string;
}

export class CommercialLeadAcceptedResponseDto {
  @ApiProperty({ enum: [true] }) accepted!: true;
}

export class CommercialLeadResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CommercialOpportunityType }) opportunityType!: CommercialOpportunityType;
  @ApiProperty({ type: String }) contactName!: string;
  @ApiProperty({ type: String }) businessName!: string;
  @ApiProperty({ type: String, format: 'email' }) email!: string;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: Number, nullable: true }) estimatedEventsPerMonth!: number | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) privacyAcceptedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class CommercialLeadPageResponseDto {
  @ApiProperty({ type: CommercialLeadResponseDto, isArray: true }) items!: CommercialLeadResponseDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
