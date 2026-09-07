import {
  Controller,
  Body,
  Delete,
  Get,
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
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  AdministrativeFloorplanFileAssetUploadRequestDto,
  FileAssetResponseDto,
  parseAdministrativeFloorplanFileAssetUpload,
  parseFileAssetEventId,
  parseFileAssetId
} from './file-assets.dto';
import { FileAssetsService, type UploadedImageFile } from './file-assets.service';

@ApiTags('admin-floorplan-file-assets')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId/floorplan/file-assets')
export class AdminFloorplanFileAssetsController {
  constructor(@Inject(FileAssetsService) private readonly fileAssets: FileAssetsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        fileType: { type: 'string', enum: ['FLOORPLAN_SVG'] }
      }
    }
  })
  @ApiCreatedResponse({ type: FileAssetResponseDto })
  upload(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: AdministrativeFloorplanFileAssetUploadRequestDto,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FileAssetResponseDto> {
    return this.fileAssets.uploadAdministrativeFloorplanImage(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId),
      parseAdministrativeFloorplanFileAssetUpload(body),
      file,
      principal,
      request.operationId
    );
  }

  @Get()
  @ApiOkResponse({ type: FileAssetResponseDto, isArray: true })
  list(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() _principal: AuthPrincipal
  ): Promise<FileAssetResponseDto[]> {
    return this.fileAssets.listAdministrativeFloorplanImages(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId)
    );
  }

  @Get(':fileAssetId/content')
  @ApiProduces('image/jpeg', 'image/png', 'image/svg+xml')
  @ApiOkResponse({ description: 'Authorized private Floorplan image content.' })
  async content(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('fileAssetId') fileAssetId: string,
    @CurrentAuth() _principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.fileAssets.administrativeFloorplanContent(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId),
      parseFileAssetId(fileAssetId)
    );
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader('ETag', content.etag);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (content.mimeType === 'image/svg+xml') response.setHeader('Content-Security-Policy', svgContentSecurityPolicy());
    response.end(content.bytes);
  }

  @Delete(':fileAssetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('fileAssetId') fileAssetId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.fileAssets.softDeleteAdministrativeFloorplanImage(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId),
      parseFileAssetId(fileAssetId),
      principal,
      request.operationId
    );
  }
}

function svgContentSecurityPolicy(): string {
  return "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'; style-src 'none'; object-src 'none'; connect-src 'none'; font-src 'none'; media-src 'none'; img-src 'self'";
}
