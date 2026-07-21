import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({
    description: 'API and PostgreSQL are available.',
    type: HealthResponseDto
  })
  @ApiServiceUnavailableResponse({
    description: 'PostgreSQL health check failed.'
  })
  getHealth(): Promise<HealthResponseDto> {
    return this.healthService.getHealth();
  }
}
