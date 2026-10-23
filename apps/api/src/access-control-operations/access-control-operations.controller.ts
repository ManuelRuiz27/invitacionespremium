import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiExtraModels, ApiOkResponse, ApiQuery, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { parseEventId } from '../events/events.dto';
import { UserRole } from '../generated/prisma/client';
import { AccessControlOperationsService } from './access-control-operations.service';
import {
  AccessOperationalSummaryDto,
  AnonymousAccessOperationsDto,
  NominalAccessOperationsDto,
  parseAccessOperationsPage
} from './access-control-operations.dto';

@ApiTags('access-operations')
@ApiCookieAuth()
@Controller('events')
export class AccessControlOperationsController {
  constructor(@Inject(AccessControlOperationsService) private readonly operations: AccessControlOperationsService) {}

  @Get(':eventId/access-operations')
  @Roles(UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 9999999 })
  @ApiExtraModels(NominalAccessOperationsDto, AnonymousAccessOperationsDto)
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(NominalAccessOperationsDto) },
        { $ref: getSchemaPath(AnonymousAccessOperationsDto) }
      ],
      discriminator: {
        propertyName: 'accessMode',
        mapping: {
          NOMINAL: getSchemaPath(NominalAccessOperationsDto),
          ANONYMOUS: getSchemaPath(AnonymousAccessOperationsDto)
        }
      }
    }
  })
  get(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal, @Query() query: unknown) {
    return this.operations.client(parseEventId(eventId), principal, parseAccessOperationsPage(query));
  }
}

@ApiTags('admin-events')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events')
export class AdminAccessControlOperationsController {
  constructor(@Inject(AccessControlOperationsService) private readonly operations: AccessControlOperationsService) {}

  @Get(':eventId/access-operations')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOkResponse({ type: AccessOperationalSummaryDto })
  get(@Param('eventId') eventId: string, @Param('clientId') clientId: string, @CurrentAuth() principal: AuthPrincipal) {
    return this.operations.provider(parseEventId(eventId), parseUuidParameter(clientId, 'clientId'), principal);
  }
}
