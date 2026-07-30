import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { parseEventId } from '../events/events.dto';
import { UserRole } from '../generated/prisma/client';
import { AdminReportListItemDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('admin-reports')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  @ApiOkResponse({ type: AdminReportListItemDto, isArray: true })
  list() {
    return this.reports.listAdmin();
  }

  @Get('events/:eventId')
  @ApiOkResponse({ type: AdminReportListItemDto, isArray: true })
  listEvent(@Param('eventId') eventId: string) {
    return this.reports.listAdmin(parseEventId(eventId));
  }
}
