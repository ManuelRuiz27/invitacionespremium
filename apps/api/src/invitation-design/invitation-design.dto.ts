import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HotspotAction, HotspotVisualOwnerType, InvitationDesignType } from '../generated/prisma/client';
import { z } from 'zod';

const uuid = z.string().uuid();
const flyerSchema = z
  .object({
    initialAssetId: uuid,
    qrAssetId: uuid
  })
  .strict()
  .refine((value) => value.initialAssetId !== value.qrAssetId);
const replaceAssetSchema = z.object({ assetId: uuid }).strict();
const addPageSchema = z.object({ fileAssetId: uuid }).strict();
const reorderPagesSchema = z
  .object({ pageIds: z.array(uuid).min(1).max(10) })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.pageIds).size !== value.pageIds.length) {
      context.addIssue({ code: 'custom', message: 'Page IDs must be unique.' });
    }
  });

const coordinate = z.number().finite().min(0).max(1);
const positiveCoordinate = z.number().finite().gt(0).max(1);
const hotspotBaseSchema = z.object({
  action: z.nativeEnum(HotspotAction),
  x: coordinate,
  y: coordinate,
  width: positiveCoordinate,
  height: positiveCoordinate,
  priority: z.number().int().min(0).max(1000).default(0),
  url: z.string().max(2048).optional()
});

const createHotspotSchema = hotspotBaseSchema
  .extend({
    visualOwnerType: z.nativeEnum(HotspotVisualOwnerType),
    flipbookPageId: uuid.optional()
  })
  .strict()
  .superRefine(validateHotspot);

const updateHotspotSchema = hotspotBaseSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0)
  .superRefine((value, context) => {
    if (value.x !== undefined && value.width !== undefined && value.x + value.width > 1) {
      context.addIssue({ code: 'custom', message: 'Hotspot exceeds horizontal bounds.' });
    }
    if (value.y !== undefined && value.height !== undefined && value.y + value.height > 1) {
      context.addIssue({ code: 'custom', message: 'Hotspot exceeds vertical bounds.' });
    }
    validateUrlForAction(value.action, value.url, context);
  });

export type CreateFlyerInput = z.infer<typeof flyerSchema>;
export type ReplaceAssetInput = z.infer<typeof replaceAssetSchema>;
export type AddPageInput = z.infer<typeof addPageSchema>;
export type ReorderPagesInput = z.infer<typeof reorderPagesSchema>;
export type CreateHotspotInput = z.infer<typeof createHotspotSchema>;
export type UpdateHotspotInput = z.infer<typeof updateHotspotSchema>;

export class CreateFlyerRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  initialAssetId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  qrAssetId!: string;
}

export class ReplaceDesignAssetRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string;
}

export class AddFlipbookPageRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  fileAssetId!: string;
}

export class ReorderFlipbookPagesRequestDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true, minItems: 1, maxItems: 10 })
  pageIds!: string[];
}

export class CreateHotspotRequestDto {
  @ApiProperty({ enum: HotspotVisualOwnerType })
  visualOwnerType!: HotspotVisualOwnerType;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  flipbookPageId?: string;

  @ApiProperty({ enum: HotspotAction })
  action!: HotspotAction;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  x!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  y!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  width!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  height!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1000, default: 0 })
  priority?: number;

  @ApiPropertyOptional({ type: String, format: 'uri', maxLength: 2048 })
  url?: string;
}

export class UpdateHotspotRequestDto {
  @ApiPropertyOptional({ enum: HotspotAction })
  action?: HotspotAction;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  x?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  y?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  width?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  height?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1000 })
  priority?: number;

  @ApiPropertyOptional({ type: String, format: 'uri', maxLength: 2048, nullable: true })
  url?: string;
}

export class HotspotResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ enum: HotspotVisualOwnerType })
  visualOwnerType!: HotspotVisualOwnerType;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  flipbookPageId!: string | null;

  @ApiProperty({ enum: HotspotAction })
  action!: HotspotAction;

  @ApiProperty({ type: Number })
  x!: number;

  @ApiProperty({ type: Number })
  y!: number;

  @ApiProperty({ type: Number })
  width!: number;

  @ApiProperty({ type: Number })
  height!: number;

  @ApiProperty({ type: Number })
  priority!: number;

  @ApiProperty({ type: String, nullable: true })
  url!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class FlipbookPageResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  fileAssetId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 10 })
  position!: number;

  @ApiProperty({ type: () => HotspotResponseDto, isArray: true })
  hotspots!: HotspotResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class InvitationDesignResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ enum: InvitationDesignType })
  type!: InvitationDesignType;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  flyerInitialAssetId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  flyerQrAssetId!: string | null;

  @ApiProperty({ type: () => FlipbookPageResponseDto, isArray: true })
  pages!: FlipbookPageResponseDto[];

  @ApiProperty({ type: () => HotspotResponseDto, isArray: true })
  hotspots!: HotspotResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class DesignReadinessResponseDto {
  @ApiProperty({ type: Boolean })
  complete!: boolean;

  @ApiProperty({ enum: InvitationDesignType, nullable: true })
  designType!: InvitationDesignType | null;

  @ApiProperty({ type: String, isArray: true })
  blockers!: string[];
}

export function parseCreateFlyer(value: unknown): CreateFlyerInput {
  return parse(flyerSchema, value);
}

export function parseReplaceAsset(value: unknown): ReplaceAssetInput {
  return parse(replaceAssetSchema, value);
}

export function parseAddPage(value: unknown): AddPageInput {
  return parse(addPageSchema, value);
}

export function parseReorderPages(value: unknown): ReorderPagesInput {
  return parse(reorderPagesSchema, value);
}

export function parseCreateHotspot(value: unknown): CreateHotspotInput {
  return parse(createHotspotSchema, value);
}

export function parseUpdateHotspot(value: unknown): UpdateHotspotInput {
  return parse(updateHotspotSchema, value);
}

export function parseDesignUuid(value: unknown): string {
  return parse(uuid, value);
}

export function normalizeExternalHotspotUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw validationError();
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hostname.length === 0 ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw validationError();
  }
  return parsed.toString();
}

function validateHotspot(value: CreateHotspotInput, context: z.RefinementCtx): void {
  if (
    (value.visualOwnerType === HotspotVisualOwnerType.FLYER && value.flipbookPageId !== undefined) ||
    (value.visualOwnerType === HotspotVisualOwnerType.FLIPBOOK_PAGE && value.flipbookPageId === undefined)
  ) {
    context.addIssue({ code: 'custom', message: 'Invalid hotspot visual owner.' });
  }
  if (value.x + value.width > 1) {
    context.addIssue({ code: 'custom', message: 'Hotspot exceeds horizontal bounds.' });
  }
  if (value.y + value.height > 1) {
    context.addIssue({ code: 'custom', message: 'Hotspot exceeds vertical bounds.' });
  }
  validateUrlForAction(value.action, value.url, context);
}

function validateUrlForAction(
  action: HotspotAction | undefined,
  url: string | undefined,
  context: z.RefinementCtx
): void {
  if (action === HotspotAction.EXTERNAL_LINK) {
    if (url === undefined) {
      context.addIssue({ code: 'custom', message: 'External link hotspot requires a URL.' });
      return;
    }
    try {
      normalizeExternalHotspotUrl(url);
    } catch {
      context.addIssue({ code: 'custom', message: 'External hotspot URL is invalid.' });
    }
  } else if (action !== undefined && url !== undefined) {
    context.addIssue({ code: 'custom', message: 'This hotspot action does not accept a URL.' });
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError();
  }
  return result.data;
}

function validationError(): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Invalid invitation design request.'
  });
}
