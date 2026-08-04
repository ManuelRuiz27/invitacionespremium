import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { AuditActorType, UserRole } from '../generated/prisma/client';
import { AUDIT_LOG_MAX_LIMIT, AuditLogPageResponseDto, parseAuditLogQuery } from './audit-query.dto';
import { AuditService } from './audit.service';

@ApiTags('admin-audit')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ operationId: 'AdminAuditController_listAuditLogs', summary: 'List immutable audit records' })
  @ApiQuery({ name: 'clientId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'eventId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'actorType', required: false, enum: AuditActorType })
  @ApiQuery({ name: 'actorId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  @ApiQuery({ name: 'resourceId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'operationId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'createdFrom', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'createdTo', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: AUDIT_LOG_MAX_LIMIT })
  @ApiOkResponse({ type: AuditLogPageResponseDto })
  listAuditLogs(@Query() query: unknown): Promise<AuditLogPageResponseDto> {
    return this.audit.list(parseAuditLogQuery(query));
  }
}
