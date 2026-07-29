import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { parseEventId } from '../events/events.dto';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  AddAlbumPhotosRequestDto,
  AlbumPublicationResponseDto,
  AlbumResponseDto,
  CreateAlbumRequestDto,
  UpdateAlbumRequestDto,
  parseAddAlbumPhotos,
  parseAlbumUuid,
  parseCreateAlbum,
  parseUpdateAlbum
} from './albums.dto';
import { AlbumsService } from './albums.service';

@ApiTags('albums')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/album')
export class AlbumsController {
  constructor(@Inject(AlbumsService) private readonly albums: AlbumsService) {}

  @Get()
  @ApiOkResponse({ type: AlbumResponseDto })
  get(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<AlbumResponseDto> {
    return this.albums.get(parseEventId(eventId), principal);
  }

  @Post()
  @ApiBody({ type: CreateAlbumRequestDto })
  @ApiCreatedResponse({ type: AlbumResponseDto })
  create(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AlbumResponseDto> {
    return this.albums.create(parseEventId(eventId), parseCreateAlbum(body), principal, request.operationId);
  }

  @Patch()
  @ApiBody({ type: UpdateAlbumRequestDto })
  @ApiOkResponse({ type: AlbumResponseDto })
  update(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AlbumResponseDto> {
    return this.albums.update(parseEventId(eventId), parseUpdateAlbum(body), principal, request.operationId);
  }

  @Post('photos')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: AddAlbumPhotosRequestDto })
  @ApiOkResponse({ type: AlbumResponseDto })
  addPhotos(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AlbumResponseDto> {
    return this.albums.addPhotos(parseEventId(eventId), parseAddAlbumPhotos(body), principal, request.operationId);
  }

  @Delete('photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deletePhoto(
    @Param('eventId') eventId: string,
    @Param('photoId') photoId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    return this.albums.deletePhoto(parseEventId(eventId), parseAlbumUuid(photoId), principal, request.operationId);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AlbumPublicationResponseDto })
  publish(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AlbumPublicationResponseDto> {
    return this.albums.publish(parseEventId(eventId), parseIdempotencyKey(key), principal, request.operationId);
  }

  @Post('unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AlbumPublicationResponseDto })
  unpublish(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AlbumPublicationResponseDto> {
    return this.albums.unpublish(parseEventId(eventId), parseIdempotencyKey(key), principal, request.operationId);
  }
}
