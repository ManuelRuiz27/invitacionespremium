import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../auth/public-route.decorator';
import type { RequestWithOperationId } from '../common/logging/request-context';
import {
  CommercialLeadAcceptedResponseDto,
  CommercialLeadSubmissionRequestDto,
  parseCommercialLeadSubmission
} from './commercial-leads.dto';
import { CommercialLeadsService } from './commercial-leads.service';

@ApiTags('public-commercial-leads')
@PublicRoute()
@Controller('public/commercial-leads')
export class CommercialLeadsController {
  constructor(@Inject(CommercialLeadsService) private readonly leads: CommercialLeadsService) {}

  @Post()
  @ApiOperation({ operationId: 'CommercialLeadsController_submit', summary: 'Submit a B2B commercial opportunity' })
  @ApiBody({ type: CommercialLeadSubmissionRequestDto })
  @ApiCreatedResponse({ type: CommercialLeadAcceptedResponseDto })
  submit(@Body() body: unknown, @Req() request: RequestWithOperationId): Promise<CommercialLeadAcceptedResponseDto> {
    return this.leads.submit(parseCommercialLeadSubmission(body), request.operationId);
  }
}
