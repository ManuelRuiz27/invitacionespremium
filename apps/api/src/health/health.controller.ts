import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

export interface HealthResponse {
  status: 'ok';
  service: 'invitacionespremium-api';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({
    description: 'API available'
  })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'invitacionespremium-api'
    };
  }
}
