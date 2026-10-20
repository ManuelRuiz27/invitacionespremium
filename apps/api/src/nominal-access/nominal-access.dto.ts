import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const key = z.string().trim().min(1).max(128);
const issue = z.object({}).strict();
const revoke = z.object({ revocationReasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u) }).strict();
export type RevokeNominalAccessInput = z.infer<typeof revoke>;

export class IssueNominalAccessRequestDto {}

export class RevokeNominalAccessRequestDto {
  @ApiProperty({ type: String, maxLength: 64, pattern: '^[A-Z][A-Z0-9_]{0,63}$', example: 'OPERATOR_REQUEST' })
  revocationReasonCode!: string;
}

export class NominalAccessCredentialResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) assistantId!: string;
  @ApiProperty({
    type: String,
    enum: ['ISSUED', 'REVOKED'],
    description: 'Issuance history only; does not authorize entry.'
  })
  status!: 'ISSUED' | 'REVOKED';
  @ApiProperty({ type: String, format: 'date-time' }) issuedAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revokedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) revocationReasonCode!: string | null;
  @ApiProperty({ type: Boolean, description: 'Derived from existing, unreverted CheckIn records.' })
  hasActiveCheckIn!: boolean;
}

export function parseNominalAccessId(value: unknown): string {
  return parse(uuid, value);
}
export function parseNominalAccessKey(value: unknown): string {
  return parse(key, value);
}
export function parseIssueNominalAccess(value: unknown): void {
  parse(issue, value ?? {});
}
export function parseRevokeNominalAccess(value: unknown): RevokeNominalAccessInput {
  return parse(revoke, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid nominal access request.' });
  return result.data;
}
