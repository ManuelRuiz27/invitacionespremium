import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CommercialOpportunityType, UserRole } from '../generated/prisma/client';
import {
  COMMERCIAL_LEAD_MAX_LIMIT,
  CommercialLeadPageResponseDto,
  CommercialLeadResponseDto,
  parseCommercialLeadId,
  parseCommercialLeadListQuery
} from './commercial-leads.dto';
import { CommercialLeadsService } from './commercial-leads.service';

@ApiTags('admin-commercial-leads')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/commercial-leads')
export class AdminCommercialLeadsController {
  constructor(@Inject(CommercialLeadsService) private readonly leads: CommercialLeadsService) {}

  @Get()
  @ApiOperation({ operationId: 'AdminCommercialLeadsController_list', summary: 'List B2B commercial opportunities' })
  @ApiQuery({ name: 'opportunityType', required: false, enum: CommercialOpportunityType })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: COMMERCIAL_LEAD_MAX_LIMIT })
  @ApiOkResponse({ type: CommercialLeadPageResponseDto })
  list(@Query() query: unknown): Promise<CommercialLeadPageResponseDto> {
    return this.leads.list(parseCommercialLeadListQuery(query));
  }

  @Get(':leadId')
  @ApiOperation({ operationId: 'AdminCommercialLeadsController_get', summary: 'Get a B2B commercial opportunity' })
  @ApiParam({ name: 'leadId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: CommercialLeadResponseDto })
  get(@Param('leadId') leadId: string): Promise<CommercialLeadResponseDto> {
    return this.leads.get(parseCommercialLeadId(leadId));
  }
}
