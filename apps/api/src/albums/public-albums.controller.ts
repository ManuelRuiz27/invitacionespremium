import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PublicRoute } from '../auth/public-route.decorator';
import { PublicAlbumResponseDto, parseAlbumUuid } from './albums.dto';
import { AlbumsService } from './albums.service';

@ApiTags('public-albums')
@PublicRoute()
@Controller('public/albums')
export class PublicAlbumsController {
  constructor(@Inject(AlbumsService) private readonly albums: AlbumsService) {}

  @Get(':albumToken')
  @ApiOkResponse({ type: PublicAlbumResponseDto })
  resolve(@Param('albumToken') token: string): Promise<PublicAlbumResponseDto> {
    return this.albums.resolvePublic(token);
  }

  @Get(':albumToken/photos/:photoId/content')
  @ApiProduces('image/jpeg', 'image/png')
  async content(
    @Param('albumToken') token: string,
    @Param('photoId') photoId: string,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.albums.publicPhotoContent(token, parseAlbumUuid(photoId));
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader('ETag', content.etag);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.end(content.bytes);
  }
}
