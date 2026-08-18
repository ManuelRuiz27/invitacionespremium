import {
  Body,
  Controller,
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
  AdministrativeInvitationFileAssetUploadRequestDto,
  FileAssetResponseDto,
  parseAdministrativeInvitationFileAssetUpload,
  parseFileAssetEventId,
  parseFileAssetId
} from './file-assets.dto';
import { FileAssetsService, type UploadedImageFile } from './file-assets.service';

@ApiTags('admin-invitation-file-assets')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId/design/file-assets')
export class AdminInvitationFileAssetsController {
  constructor(@Inject(FileAssetsService) private readonly fileAssets: FileAssetsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdministrativeInvitationFileAssetUploadRequestDto })
  @ApiCreatedResponse({ type: FileAssetResponseDto })
  upload(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FileAssetResponseDto> {
    const input = parseAdministrativeInvitationFileAssetUpload(pickUploadFields(body));
    return this.fileAssets.uploadAdministrativeInvitationImage(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId),
      input,
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
    return this.fileAssets.listAdministrativeInvitationImages(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId)
    );
  }

  @Get(':fileAssetId/content')
  @ApiProduces('image/jpeg', 'image/png')
  @ApiOkResponse({ description: 'Authorized private Invitation image content.' })
  async content(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('fileAssetId') fileAssetId: string,
    @CurrentAuth() _principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.fileAssets.administrativeInvitationContent(
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
    await this.fileAssets.softDeleteAdministrativeInvitationImage(
      parseFileAssetEventId(clientId),
      parseFileAssetEventId(eventId),
      parseFileAssetId(fileAssetId),
      principal,
      request.operationId
    );
  }
}

function pickUploadFields(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  return { fileType: (body as Record<string, unknown>).fileType };
}
