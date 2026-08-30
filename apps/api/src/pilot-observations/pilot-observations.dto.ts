import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const PILOT_OBSERVATION_KINDS = [
  'PREPARATION_TIME',
  'INCIDENT',
  'PLANNER_SUPPORT',
  'LAST_MINUTE_CHANGE',
  'MANUAL_WORK',
  'DESIGNER_COST',
  'EXTERNAL_COST',
  'TECHNOLOGY_COST',
  'DESIGN_ROUND'
] as const;

export const PILOT_OBSERVATION_AREAS = [
  'GENERAL',
  'INVITATION',
  'FLOORPLAN',
  'GUESTS',
  'RSVP',
  'SEATING',
  'STAFF',
  'CHECKIN',
  'CLOSE_REPORT'
] as const;

const durationRequiredKinds = new Set(['PREPARATION_TIME', 'PLANNER_SUPPORT', 'MANUAL_WORK']);
const costKinds = new Set(['DESIGNER_COST', 'EXTERNAL_COST', 'TECHNOLOGY_COST']);
const noteSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? undefined : value));

export const pilotObservationSchema = z
  .object({
    kind: z.enum(PILOT_OBSERVATION_KINDS),
    area: z.enum(PILOT_OBSERVATION_AREAS),
    durationMinutes: z.number().int().positive().max(1440).optional(),
    amountMxnCents: z.number().int().min(0).max(100_000_000).optional(),
    count: z.number().int().positive().max(10_000).default(1),
    note: noteSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (durationRequiredKinds.has(value.kind) && value.durationMinutes === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['durationMinutes'],
        message: 'durationMinutes is required for this observation kind.'
      });
    }
    if (costKinds.has(value.kind)) {
      if (value.amountMxnCents === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['amountMxnCents'],
          message: 'amountMxnCents is required for cost observations.'
        });
      }
      if (value.durationMinutes !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['durationMinutes'],
          message: 'durationMinutes is not allowed for cost observations.'
        });
      }
    } else if (value.amountMxnCents !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['amountMxnCents'],
        message: 'amountMxnCents is only allowed for cost observations.'
      });
    }
  });

const correctionSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

export type PilotObservationInput = z.infer<typeof pilotObservationSchema>;
export type PilotObservationKind = PilotObservationInput['kind'];
export type PilotObservationArea = PilotObservationInput['area'];
export type PilotObservationCorrectionInput = z.infer<typeof correctionSchema>;

export function parsePilotObservation(input: unknown): PilotObservationInput {
  const result = pilotObservationSchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Pilot observation is invalid.',
      details: result.error.flatten()
    });
  }
  return result.data;
}

export function parsePilotObservationCorrection(input: unknown): PilotObservationCorrectionInput {
  const result = correctionSchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Pilot observation correction is invalid.',
      details: result.error.flatten()
    });
  }
  return result.data;
}

export class PilotObservationRequestDto {
  @ApiProperty({ enum: PILOT_OBSERVATION_KINDS })
  kind!: PilotObservationKind;

  @ApiProperty({ enum: PILOT_OBSERVATION_AREAS })
  area!: PilotObservationArea;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 1440 })
  durationMinutes?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100_000_000 })
  amountMxnCents?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10_000, default: 1 })
  count?: number;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  note?: string;
}

export class PilotObservationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ enum: PILOT_OBSERVATION_KINDS })
  kind!: PilotObservationKind;

  @ApiProperty({ enum: PILOT_OBSERVATION_AREAS })
  area!: PilotObservationArea;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 1440 })
  durationMinutes?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 100_000_000 })
  amountMxnCents?: number;

  @ApiProperty({ type: Number, minimum: 1 })
  count!: number;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  note?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  correctedAt?: string;

  @ApiPropertyOptional({ type: String, minLength: 3, maxLength: 300 })
  correctionReason?: string;
}

export class CorrectPilotObservationRequestDto {
  @ApiProperty({ type: String, minLength: 3, maxLength: 300 })
  reason!: string;
}

export class PilotObservationSummaryDto {
  @ApiProperty({ type: Number }) preparationMinutesTotal!: number;
  @ApiProperty({ type: Number }) invitationPreparationMinutes!: number;
  @ApiProperty({ type: Number }) floorplanPreparationMinutes!: number;
  @ApiProperty({ type: Number }) plannerSupportMinutes!: number;
  @ApiProperty({ type: Number }) plannerSupportEntries!: number;
  @ApiProperty({ type: Number }) incidents!: number;
  @ApiProperty({ type: Number }) checkinIncidents!: number;
  @ApiProperty({ type: Number }) lastMinuteChanges!: number;
  @ApiProperty({ type: Number }) manualWorkMinutes!: number;
  @ApiProperty({ type: Number }) manualWorkEntries!: number;
  @ApiProperty({ type: Number }) guestCount!: number;
  @ApiProperty({ type: Number }) tableCount!: number;
}

export class PilotObservationJournalResponseDto {
  @ApiProperty({ type: PilotObservationResponseDto, isArray: true })
  observations!: PilotObservationResponseDto[];

  @ApiProperty({ type: PilotObservationSummaryDto })
  summary!: PilotObservationSummaryDto;
}
