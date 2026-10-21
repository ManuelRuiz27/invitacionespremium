import { ApiProperty } from '@nestjs/swagger';
import { EventAccessMode } from '../generated/prisma/client';

export class AccessControlReadinessResponseDto {
  @ApiProperty({ type: Boolean }) complete!: boolean;
  @ApiProperty({ enum: EventAccessMode, nullable: true }) accessMode!: EventAccessMode | null;
  @ApiProperty({ type: [String] }) blockers!: string[];
  @ApiProperty({ type: Number, minimum: 0 }) activeMaterialCount!: number;
  @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
}
