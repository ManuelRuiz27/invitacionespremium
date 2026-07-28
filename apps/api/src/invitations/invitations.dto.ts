import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssistantResponseStatus, InvitationMode, InvitationResponseStatus } from '../generated/prisma/client';
import { z } from 'zod';

const uuid = z.string().uuid();
const nominalName = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((value) => value.replace(/\s+/gu, ' '));
const updateInvitationSchema = z
  .object({
    mode: z.nativeEnum(InvitationMode).optional(),
    additionalAssistantLimit: z.number().int().min(0).max(149).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const assistantSchema = z.object({ name: nominalName }).strict();

export type UpdateInvitationInput = z.infer<typeof updateInvitationSchema>;
export type AssistantInput = z.infer<typeof assistantSchema>;

export class UpdateInvitationRequestDto {
  @ApiPropertyOptional({ enum: InvitationMode })
  mode?: InvitationMode;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 149 })
  additionalAssistantLimit?: number;
}

export class AssistantRequestDto {
  @ApiProperty({ type: String, example: 'María Ejemplo' })
  name!: string;
}

export class AssistantResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: Boolean })
  isPrimary!: boolean;

  @ApiProperty({ enum: AssistantResponseStatus })
  responseStatus!: AssistantResponseStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  anonymizedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class InvitationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  contactId!: string;

  @ApiProperty({ enum: InvitationMode })
  mode!: InvitationMode;

  @ApiProperty({ enum: InvitationResponseStatus })
  responseStatus!: InvitationResponseStatus;

  @ApiProperty({ type: Number })
  additionalAssistantLimit!: number;

  @ApiProperty({ type: String, nullable: true })
  contactName!: string | null;

  @ApiProperty({ type: String, format: 'uri' })
  invitationLink!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: () => AssistantResponseDto, isArray: true })
  assistants!: AssistantResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class InvitationCancellationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ enum: ['CANCELLED'] })
  status!: 'CANCELLED';

  @ApiProperty({ type: String, format: 'date-time' })
  cancelledAt!: Date;
}

export class PublicInvitationResponseDto {
  @ApiProperty({ enum: ['AVAILABLE', 'CANCELLED', 'CLOSED'] })
  status!: 'AVAILABLE' | 'CANCELLED' | 'CLOSED';

  @ApiPropertyOptional({ type: String })
  message?: string;

  @ApiPropertyOptional({ type: Object })
  event?: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  invitation?: Record<string, unknown>;

  @ApiPropertyOptional({ type: () => AssistantResponseDto, isArray: true })
  assistants?: AssistantResponseDto[];
}

export function parseInvitationId(value: unknown): string {
  return parse(uuid, value);
}

export function parseUpdateInvitation(value: unknown): UpdateInvitationInput {
  return parse(updateInvitationSchema, value);
}

export function parseAssistant(value: unknown): AssistantInput {
  return parse(assistantSchema, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid Invitations request.'
    });
  }
  return result.data;
}
