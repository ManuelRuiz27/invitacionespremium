import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseEventId } from '../events/events.dto';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  parseReportId,
  parseReportUpload,
  ReportAuthorizationResponseDto,
  ReportFileUploadRequestDto,
  ReportListItemDto
} from './reports.dto';
import type { UploadedPdf } from './reports-pdf.service';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  @ApiOkResponse({ type: ReportListItemDto, isArray: true })
  list(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal) {
    return this.reports.list(parseEventId(eventId), principal);
  }

  @Post('attendance-pdf')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ReportAuthorizationResponseDto })
  attendance(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.authorizeAttendance(
      parseEventId(eventId),
      parseIdempotencyKey(key),
      principal,
      request.operationId
    );
  }

  @Post('physical-passes-pdf')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ReportAuthorizationResponseDto })
  physicalPasses(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.authorizePhysicalPasses(
      parseEventId(eventId),
      parseIdempotencyKey(key),
      principal,
      request.operationId
    );
  }

  @Post(':reportId/file')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ReportFileUploadRequestDto })
  @ApiOkResponse({ type: ReportListItemDto })
  attach(
    @Param('eventId') eventId: string,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedPdf | undefined,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.attach(
      parseEventId(eventId),
      parseReportId(reportId),
      parseReportUpload(body),
      file,
      principal,
      request.operationId
    );
  }

  @Get(':reportId/download')
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'Private generated report PDF.',
    headers: {
      'Content-Type': { schema: { type: 'string', example: 'application/pdf' } },
      'Content-Length': { schema: { type: 'integer' } },
      ETag: { schema: { type: 'string' } },
      'Content-Disposition': { schema: { type: 'string' } },
      'Cache-Control': { schema: { type: 'string' } },
      'X-Content-Type-Options': { schema: { type: 'string' } },
      'Referrer-Policy': { schema: { type: 'string' } }
    }
  })
  async download(
    @Param('eventId') eventId: string,
    @Param('reportId') reportId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.reports.download(parseEventId(eventId), parseReportId(reportId), principal);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader('ETag', content.etag);
    response.setHeader('Content-Disposition', `attachment; filename="${content.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.end(content.bytes);
  }
}
