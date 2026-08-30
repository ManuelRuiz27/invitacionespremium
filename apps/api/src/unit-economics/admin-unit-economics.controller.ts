import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { UserRole } from '../generated/prisma/client';
import { UnitEconomicsResponseDto } from './unit-economics.dto';
import { UnitEconomicsService } from './unit-economics.service';

@ApiTags('admin-unit-economics')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId/unit-economics')
export class AdminUnitEconomicsController {
  constructor(@Inject(UnitEconomicsService) private readonly unitEconomics: UnitEconomicsService) {}

  @Get()
  @ApiOkResponse({ type: UnitEconomicsResponseDto })
  get(@Param('clientId') clientId: string, @Param('eventId') eventId: string): Promise<UnitEconomicsResponseDto> {
    return this.unitEconomics.getEvent(
      parseUuidParameter(clientId, 'clientId'),
      parseUuidParameter(eventId, 'eventId')
    );
  }
}
