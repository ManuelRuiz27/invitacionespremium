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
  FileAssetResponseDto,
  parseFileAssetEventId,
  parseFileAssetId,
  parseFileAssetUpload,
  UploadFileAssetRequestDto
} from './file-assets.dto';
import { FileAssetsService, type UploadedImageFile } from './file-assets.service';

@ApiTags('file-assets')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/file-assets')
export class FileAssetsController {
  constructor(@Inject(FileAssetsService) private readonly fileAssets: FileAssetsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadFileAssetRequestDto })
  @ApiCreatedResponse({ type: FileAssetResponseDto })
  upload(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FileAssetResponseDto> {
    return this.fileAssets.uploadImage(
      parseFileAssetEventId(eventId),
      parseFileAssetUpload(body),
      file,
      principal,
      request.operationId
    );
  }

  @Get()
  @ApiOkResponse({ type: FileAssetResponseDto, isArray: true })
  list(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<FileAssetResponseDto[]> {
    return this.fileAssets.list(parseFileAssetEventId(eventId), principal);
  }

  @Get(':fileAssetId')
  @ApiOkResponse({ type: FileAssetResponseDto })
  get(
    @Param('eventId') eventId: string,
    @Param('fileAssetId') fileAssetId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<FileAssetResponseDto> {
    return this.fileAssets.get(parseFileAssetEventId(eventId), parseFileAssetId(fileAssetId), principal);
  }

  @Get(':fileAssetId/content')
  @ApiProduces('image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'Authorized private binary content.',
    headers: {
      'Content-Type': { schema: { type: 'string', example: 'image/jpeg' } },
      'Content-Length': { schema: { type: 'integer', example: 12345 } },
      ETag: { schema: { type: 'string', example: '"sha256-0123456789abcdef0123456789abcdef"' } },
      'Content-Disposition': { schema: { type: 'string', example: 'inline' } },
      'Cache-Control': { schema: { type: 'string', example: 'private, no-store' } },
      'X-Content-Type-Options': { schema: { type: 'string', example: 'nosniff' } }
    }
  })
  async content(
    @Param('eventId') eventId: string,
    @Param('fileAssetId') fileAssetId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.fileAssets.content(
      parseFileAssetEventId(eventId),
      parseFileAssetId(fileAssetId),
      principal
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
    @Param('eventId') eventId: string,
    @Param('fileAssetId') fileAssetId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.fileAssets.softDelete(
      parseFileAssetEventId(eventId),
      parseFileAssetId(fileAssetId),
      principal,
      request.operationId
    );
  }
}
