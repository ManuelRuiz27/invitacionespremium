import { ApiProperty } from '@nestjs/swagger';
import { CommercialChannel, EventStatus, ServiceCode, VenuePriceTier } from '../generated/prisma/client';
import { PILOT_OBSERVATION_AREAS, type PilotObservationArea } from '../pilot-observations/pilot-observations.dto';

export const COMMERCIAL_CHANNEL_SOURCES = ['SNAPSHOT', 'CURRENT_CLIENT', 'UNAVAILABLE'] as const;
export type CommercialChannelSource = (typeof COMMERCIAL_CHANNEL_SOURCES)[number];

export class OperatorMinutesByAreaDto implements Record<PilotObservationArea, number> {
  @ApiProperty({ type: Number, minimum: 0 }) GENERAL!: number;
  @ApiProperty({ type: Number, minimum: 0 }) INVITATION!: number;
  @ApiProperty({ type: Number, minimum: 0 }) FLOORPLAN!: number;
  @ApiProperty({ type: Number, minimum: 0 }) GUESTS!: number;
  @ApiProperty({ type: Number, minimum: 0 }) RSVP!: number;
  @ApiProperty({ type: Number, minimum: 0 }) SEATING!: number;
  @ApiProperty({ type: Number, minimum: 0 }) STAFF!: number;
  @ApiProperty({ type: Number, minimum: 0 }) CHECKIN!: number;
  @ApiProperty({ type: Number, minimum: 0 }) CLOSE_REPORT!: number;
}

export class UnitEconomicsResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) clientId!: string;
  @ApiProperty({ type: String, nullable: true }) eventName!: string | null;
  @ApiProperty({ enum: EventStatus }) eventStatus!: EventStatus;
  @ApiProperty({ enum: ServiceCode, nullable: true }) serviceCode!: ServiceCode | null;
  @ApiProperty({ enum: CommercialChannel }) commercialChannel!: CommercialChannel;
  @ApiProperty({ enum: COMMERCIAL_CHANNEL_SOURCES }) commercialChannelSource!: CommercialChannelSource;
  @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
  @ApiProperty({ type: Number, nullable: true }) capacityMin!: number | null;
  @ApiProperty({ type: Number, nullable: true }) capacityMax!: number | null;
  @ApiProperty({ enum: VenuePriceTier, nullable: true }) venueTier!: VenuePriceTier | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) activatedAt!: string | null;
  @ApiProperty({ type: Number, minimum: 0 }) grossRevenueCredits!: number;
  @ApiProperty({ type: Number, minimum: 0 }) refundCredits!: number;
  @ApiProperty({ type: Number, minimum: 0 }) netRevenueCredits!: number;
  @ApiProperty({ type: Number, minimum: 1 }) creditUnitValueMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) grossRevenueMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) refundMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) netRevenueMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) designerCostMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) externalCostMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) technologyCostMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) directCostMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) designRounds!: number;
  @ApiProperty({ type: Number, minimum: 0 }) operatorMinutesTotal!: number;
  @ApiProperty({ type: OperatorMinutesByAreaDto }) operatorMinutesByArea!: Record<PilotObservationArea, number>;
  @ApiProperty({ type: Number, nullable: true }) operatorHourlyRateMxnCents!: number | null;
  @ApiProperty({ type: Number, nullable: true }) operatorShadowCostMxnCents!: number | null;
  @ApiProperty({ type: Number }) contributionMarginMxnCents!: number;
  @ApiProperty({ type: Number, nullable: true }) contributionMarginPct!: number | null;
  @ApiProperty({ type: Number, nullable: true }) contributionAfterOperatorShadowMxnCents!: number | null;
  @ApiProperty({ type: Number, nullable: true }) contributionAfterOperatorShadowPct!: number | null;
}

export function emptyOperatorMinutesByArea(): Record<PilotObservationArea, number> {
  return Object.fromEntries(PILOT_OBSERVATION_AREAS.map((area) => [area, 0])) as Record<PilotObservationArea, number>;
}
