import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { EventSocialType, EventStatus } from '../generated/prisma/client';

const nullableName = z.string().trim().min(1).max(160).nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();
const nullableSocialType = z.enum(EventSocialType).nullable().optional();
const nullableEventDateTime = z.string().datetime({ offset: true }).nullable().optional();
const nullableTimeZone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, { message: 'timeZone must be a valid IANA identifier.' })
  .nullable()
  .optional();
const nullableCapacity = z.number().int().positive().max(1_000_000_000).nullable().optional();

const eventFields = {
  name: nullableName,
  serviceId: nullableUuid,
  socialType: nullableSocialType,
  eventDateTime: nullableEventDateTime,
  timeZone: nullableTimeZone,
  capacity: nullableCapacity,
  confirmationEnabled: z.boolean().optional(),
  floorplanEnabled: z.boolean().optional()
};

const createEventSchema = z.object(eventFields).strict();
const updateEventSchema = z
  .object(eventFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

export class CreateEventRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 160, required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  serviceId?: string | null;

  @ApiProperty({ enum: EventSocialType, required: false, nullable: true })
  socialType?: EventSocialType | null;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  eventDateTime?: string | null;

  @ApiProperty({ type: String, example: 'America/Mexico_City', required: false, nullable: true })
  timeZone?: string | null;

  @ApiProperty({ type: Number, minimum: 1, required: false, nullable: true })
  capacity?: number | null;

  @ApiProperty({ type: Boolean, required: false, default: false })
  confirmationEnabled?: boolean;

  @ApiProperty({ type: Boolean, required: false, default: false })
  floorplanEnabled?: boolean;
}

export class UpdateEventRequestDto extends CreateEventRequestDto {}

export class EventResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  createdByUserId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  serviceId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: EventSocialType, nullable: true })
  socialType!: EventSocialType | null;

  @ApiProperty({ enum: EventStatus })
  status!: EventStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  eventDateTime!: string | null;

  @ApiProperty({ type: String, nullable: true })
  timeZone!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  capacity!: number | null;

  @ApiProperty({ type: Boolean })
  confirmationEnabled!: boolean;

  @ApiProperty({ type: Boolean })
  floorplanEnabled!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
}

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export function parseCreateEventRequest(input: unknown): CreateEventInput {
  return parse(createEventSchema, input);
}

export function parseUpdateEventRequest(input: unknown): UpdateEventInput {
  return parse(updateEventSchema, input);
}

export function parseEventId(value: string): string {
  return parse(z.string().uuid(), value);
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid Event request.'
    });
  }
  return parsed.data;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
