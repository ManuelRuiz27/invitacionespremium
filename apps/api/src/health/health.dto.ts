import { ApiProperty } from '@nestjs/swagger';

export class HealthComponentDto {
  @ApiProperty({ type: String, enum: ['up'], example: 'up' })
  status!: 'up';

  @ApiProperty({ type: Number, example: 3.42, required: false })
  latencyMs?: number;
}

export class HealthChecksDto {
  @ApiProperty({ type: () => HealthComponentDto })
  api!: HealthComponentDto;

  @ApiProperty({ type: () => HealthComponentDto })
  database!: HealthComponentDto;
}

export class HealthResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({
    type: String,
    enum: ['invitacionespremium-api'],
    example: 'invitacionespremium-api'
  })
  service!: 'invitacionespremium-api';

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-07-21T19:00:00.000Z'
  })
  timestamp!: string;

  @ApiProperty({ type: () => HealthChecksDto })
  checks!: HealthChecksDto;
}
