import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { normalizeEventDestinationUrl } from '../events/event-destination-url';

const plainText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        !/[<>]/u.test(value) &&
        [...value].every((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint > 31 && codePoint !== 127;
        })
    );
const color = z.string().regex(/^#[0-9A-F]{6}$/u);
const theme = z
  .object({
    backgroundColor: color,
    textColor: color,
    accentColor: color
  })
  .strict();
const externalButton = z
  .object({
    label: plainText(80),
    url: z
      .string()
      .max(2048)
      .transform((value, context) => {
        const normalized = normalizeEventDestinationUrl(value);
        if (!normalized) {
          context.addIssue({ code: 'custom', message: 'Invalid HTTPS URL.' });
          return z.NEVER;
        }
        return normalized;
      })
  })
  .strict();
const createAlbum = z
  .object({
    title: plainText(120),
    thankYouMessage: plainText(600).nullable().optional(),
    theme,
    externalButton: externalButton.nullable().optional()
  })
  .strict();
const updateAlbum = z
  .object({
    title: plainText(120).optional(),
    thankYouMessage: plainText(600).nullable().optional(),
    theme: theme.optional(),
    externalButton: externalButton.nullable().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const addPhotos = z
  .object({
    fileAssetIds: z
      .array(z.string().uuid())
      .min(1)
      .max(35)
      .refine((ids) => new Set(ids).size === ids.length)
  })
  .strict();
const uuid = z.string().uuid();

export type AlbumTheme = z.infer<typeof theme>;
export type CreateAlbumInput = z.infer<typeof createAlbum>;
export type UpdateAlbumInput = z.infer<typeof updateAlbum>;
export type AddAlbumPhotosInput = z.infer<typeof addPhotos>;
export type AlbumStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export class AlbumThemeDto {
  @ApiProperty({ type: String, example: '#FFFFFF' })
  backgroundColor!: string;
  @ApiProperty({ type: String, example: '#111111' })
  textColor!: string;
  @ApiProperty({ type: String, example: '#C5A46D' })
  accentColor!: string;
}

export class AlbumExternalButtonDto {
  @ApiProperty({ type: String, example: 'Ver video' })
  label!: string;
  @ApiProperty({ type: String, example: 'https://example.com/video' })
  url!: string;
}

export class AlbumPhotoResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: Number })
  position!: number;
  @ApiProperty({ type: String })
  contentPath!: string;
}

export class AlbumResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;
  @ApiProperty({ type: String })
  title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  thankYouMessage!: string | null;
  @ApiProperty({ type: () => AlbumThemeDto })
  theme!: AlbumThemeDto;
  @ApiPropertyOptional({ type: () => AlbumExternalButtonDto, nullable: true })
  externalButton!: AlbumExternalButtonDto | null;
  @ApiProperty({ type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  status!: AlbumStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;
  @ApiProperty({ type: () => AlbumPhotoResponseDto, isArray: true })
  photos!: AlbumPhotoResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class CreateAlbumRequestDto {
  @ApiProperty({ type: String })
  title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  thankYouMessage?: string | null;
  @ApiProperty({ type: () => AlbumThemeDto })
  theme!: AlbumThemeDto;
  @ApiPropertyOptional({ type: () => AlbumExternalButtonDto, nullable: true })
  externalButton?: AlbumExternalButtonDto | null;
}

export class UpdateAlbumRequestDto {
  @ApiPropertyOptional({ type: String })
  title?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  thankYouMessage?: string | null;
  @ApiPropertyOptional({ type: () => AlbumThemeDto })
  theme?: AlbumThemeDto;
  @ApiPropertyOptional({ type: () => AlbumExternalButtonDto, nullable: true })
  externalButton?: AlbumExternalButtonDto | null;
}

export class AddAlbumPhotosRequestDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true })
  fileAssetIds!: string[];
}

export class AlbumPublicationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  albumId!: string;
  @ApiProperty({ type: String, enum: ['PUBLISHED', 'DRAFT', 'ARCHIVED'] })
  status!: AlbumStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;
  @ApiProperty({ type: Number })
  photoCount!: number;
  @ApiProperty({ type: Number })
  eligibleInvitationCount!: number;
}

export class PublicAlbumPhotoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: Number })
  position!: number;
  @ApiProperty({ type: String })
  contentPath!: string;
}

export class PublicAlbumEventDto {
  @ApiProperty({ type: String })
  name!: string;
}

export class PublicAlbumBodyDto {
  @ApiProperty({ type: String })
  title!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  thankYouMessage!: string | null;
  @ApiProperty({ type: () => AlbumThemeDto })
  theme!: AlbumTheme;
  @ApiPropertyOptional({ type: () => AlbumExternalButtonDto, nullable: true })
  externalButton!: { label: string; url: string } | null;
  @ApiProperty({ type: String, format: 'date-time' })
  publishedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
  @ApiProperty({ type: () => PublicAlbumPhotoDto, isArray: true })
  photos!: PublicAlbumPhotoDto[];
}

export class PublicAlbumResponseDto {
  @ApiProperty({ type: String, enum: ['AVAILABLE'] })
  status!: 'AVAILABLE';
  @ApiProperty({ type: () => PublicAlbumEventDto })
  event!: PublicAlbumEventDto;
  @ApiProperty({ type: () => PublicAlbumBodyDto })
  album!: PublicAlbumBodyDto;
}

export function parseCreateAlbum(value: unknown): CreateAlbumInput {
  return parse(createAlbum, value);
}
export function parseUpdateAlbum(value: unknown): UpdateAlbumInput {
  return parse(updateAlbum, value);
}
export function parseAddAlbumPhotos(value: unknown): AddAlbumPhotosInput {
  return parse(addPhotos, value);
}
export function parseAlbumUuid(value: unknown): string {
  return parse(uuid, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid Album request.' });
  }
  return result.data;
}
