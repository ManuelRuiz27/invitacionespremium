import { ApiProperty } from '@nestjs/swagger';

export class HealthComponentDto {
  @ApiProperty({ example: 'up' })
  status!: 'up';

  @ApiProperty({ example: 3.42, required: false })
  latencyMs?: number;
}

export class HealthChecksDto {
  @ApiProperty({ type: HealthComponentDto })
  api!: HealthComponentDto;

  @ApiProperty({ type: HealthComponentDto })
  database!: HealthComponentDto;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'invitacionespremium-api' })
  service!: 'invitacionespremium-api';

  @ApiProperty({ example: '2026-07-21T19:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ type: HealthChecksDto })
  checks!: HealthChecksDto;
}
