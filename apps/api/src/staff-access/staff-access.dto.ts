import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { EventStatus } from '../generated/prisma/client';

const staffAlias = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((value) => value.replace(/\s+/gu, ' '));
const createStaffToken = z.object({ alias: staffAlias }).strict();

export type CreateStaffTokenInput = z.infer<typeof createStaffToken>;
export type StaffTokenState = 'ACTIVE' | 'EXPIRED';

export class CreateStaffTokenRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 80, example: 'Acceso principal' })
  alias!: string;
}

export class StaffTokenResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, maxLength: 80 })
  alias!: string;

  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED'] })
  state!: StaffTokenState;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiredAt!: string | null;
}

export class CreatedStaffTokenResponseDto extends StaffTokenResponseDto {
  @ApiProperty({ type: String, pattern: '^st1\\.[A-Za-z0-9_-]{43}$' })
  token!: string;

  @ApiProperty({ type: String, example: '/api/v1/scanner/st1.ABC/session' })
  sessionPath!: string;
}

export class ScannerSessionStaffDto {
  @ApiProperty({ type: String, maxLength: 80 })
  alias!: string;
}

export class ScannerSessionEventDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: [EventStatus.ACTIVE, EventStatus.EVENT_DAY] })
  status!: EventStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  eventDateTime!: string;

  @ApiProperty({ type: String, example: 'America/Mexico_City' })
  timeZone!: string;

  @ApiProperty({ type: Boolean })
  floorplanEnabled!: boolean;
}

export class ScannerSessionResponseDto {
  @ApiProperty({ enum: ['AVAILABLE'] })
  status!: 'AVAILABLE';

  @ApiProperty({ type: ScannerSessionStaffDto })
  staff!: ScannerSessionStaffDto;

  @ApiProperty({ type: ScannerSessionEventDto })
  event!: ScannerSessionEventDto;
}

export function parseCreateStaffToken(input: unknown): CreateStaffTokenInput {
  const result = createStaffToken.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid StaffToken request.'
    });
  }
  return result.data;
}
