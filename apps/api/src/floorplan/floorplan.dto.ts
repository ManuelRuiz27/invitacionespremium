import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { FloorplanGeometry, FloorplanShapeKind } from '../generated/prisma/client';

const uuid = z.string().uuid();
const relative = z.number().finite().min(0).max(1);
const positiveRelative = z.number().finite().gt(0).max(1);
const name = z.string().transform(normalizeFloorplanName).pipe(z.string().min(1).max(120));
const polygonPoint = z.object({ x: relative, y: relative }).strict();
const polygonPoints = z.array(polygonPoint).min(3).max(64);

const shapeFields = {
  kind: z.enum(FloorplanShapeKind),
  geometry: z.enum(FloorplanGeometry),
  name,
  capacity: z.number().int().min(0).max(100_000),
  x: relative,
  y: relative,
  width: positiveRelative,
  height: positiveRelative,
  rotation: z.number().finite().min(0).lt(360),
  polygonPoints: polygonPoints.nullable().optional()
};

export const floorplanShapeSchema = z
  .object(shapeFields)
  .strict()
  .superRefine((value, context) => {
    if (value.x + value.width > 1 || value.y + value.height > 1) {
      context.addIssue({ code: 'custom', message: 'Shape must remain inside the relative canvas.' });
    }
    if (value.kind === FloorplanShapeKind.TABLE ? value.capacity <= 0 : value.capacity !== 0) {
      context.addIssue({ code: 'custom', message: 'Capacity does not match shape kind.' });
    }
    if (
      (value.geometry === FloorplanGeometry.SQUARE || value.geometry === FloorplanGeometry.CIRCLE) &&
      value.width !== value.height
    ) {
      context.addIssue({ code: 'custom', message: 'Square and circle require equal width and height.' });
    }
    const points = value.polygonPoints ?? null;
    if (value.geometry === FloorplanGeometry.POLYGON ? points === null : points !== null) {
      context.addIssue({ code: 'custom', message: 'polygonPoints must match polygon geometry.' });
    }
  });

const createFloorplanSchema = z.object({ imageAssetId: uuid }).strict();
const updateFloorplanSchema = z.object({ imageAssetId: uuid }).strict();
const updateShapeSchema = z.object(shapeFields).partial().strict();
const assignSchema = z
  .object({ assistantIds: z.array(uuid).min(1).max(500), tableShapeId: uuid })
  .strict()
  .refine(({ assistantIds }) => new Set(assistantIds).size === assistantIds.length, {
    message: 'assistantIds must not contain duplicates.'
  });
const assignFamilySchema = z.object({ invitationId: uuid, tableShapeId: uuid }).strict();
const assignGroupSchema = z.object({ groupId: uuid, tableShapeId: uuid }).strict();
const updateSeatingSchema = z.object({ tableShapeId: uuid.nullable() }).strict();
const seatingWorkspaceQuerySchema = z
  .object({
    scope: z.enum(['UNASSIGNED', 'TABLE']),
    tableShapeId: uuid.optional(),
    groupId: uuid.optional(),
    search: z.string().max(160).transform(normalizeSeatingSearch).optional(),
    cursor: z.string().min(1).max(1024).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'TABLE' && !value.tableShapeId) {
      context.addIssue({ code: 'custom', message: 'TABLE scope requires tableShapeId.' });
    }
    if (value.scope === 'UNASSIGNED' && value.tableShapeId) {
      context.addIssue({ code: 'custom', message: 'UNASSIGNED scope does not accept tableShapeId.' });
    }
  });

export type CreateFloorplanInput = z.infer<typeof createFloorplanSchema>;
export type FloorplanShapeInput = z.infer<typeof floorplanShapeSchema>;
export type UpdateFloorplanShapeInput = z.infer<typeof updateShapeSchema>;
export type AssignSeatingInput = z.infer<typeof assignSchema>;
export type AssignFamilyInput = z.infer<typeof assignFamilySchema>;
export type AssignGroupInput = z.infer<typeof assignGroupSchema>;
export type UpdateSeatingInput = z.infer<typeof updateSeatingSchema>;
export type SeatingWorkspaceQueryInput = z.infer<typeof seatingWorkspaceQuerySchema>;

export class FloorplanImageRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  imageAssetId!: string;
}

export class PolygonPointDto {
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  x!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  y!: number;
}

export class FloorplanShapeRequestDto {
  @ApiProperty({ enum: FloorplanShapeKind })
  kind!: FloorplanShapeKind;

  @ApiProperty({ enum: FloorplanGeometry })
  geometry!: FloorplanGeometry;

  @ApiProperty({ type: String, maxLength: 120 })
  name!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  capacity!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  x!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  y!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  width!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1 })
  height!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 360 })
  rotation!: number;

  @ApiPropertyOptional({ type: PolygonPointDto, isArray: true, nullable: true })
  polygonPoints?: PolygonPointDto[] | null;
}

export class UpdateFloorplanShapeRequestDto {
  @ApiPropertyOptional({ enum: FloorplanShapeKind })
  kind?: FloorplanShapeKind;
  @ApiPropertyOptional({ enum: FloorplanGeometry })
  geometry?: FloorplanGeometry;
  @ApiPropertyOptional({ type: String, maxLength: 120 })
  name?: string;
  @ApiPropertyOptional({ type: Number, minimum: 0 })
  capacity?: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  x?: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  y?: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  width?: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  height?: number;
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 360 })
  rotation?: number;
  @ApiPropertyOptional({ type: PolygonPointDto, isArray: true, nullable: true })
  polygonPoints?: PolygonPointDto[] | null;
}

export class AssignSeatingRequestDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true, uniqueItems: true })
  assistantIds!: string[];
  @ApiProperty({ type: String, format: 'uuid' })
  tableShapeId!: string;
}

export class AssignFamilyRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  invitationId!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  tableShapeId!: string;
}

export class AssignGroupRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  groupId!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  tableShapeId!: string;
}

export class UpdateSeatingRequestDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  tableShapeId!: string | null;
}

export class FloorplanShapeResponseDto extends FloorplanShapeRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: Number })
  occupancy!: number;
  @ApiProperty({ type: Number })
  availableCapacity!: number;
}

export class FloorplanImageResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  fileAssetId!: string;
  @ApiProperty({ type: String })
  contentPath!: string;
}

export class FloorplanResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;
  @ApiProperty({ type: FloorplanImageResponseDto })
  image!: FloorplanImageResponseDto;
  @ApiProperty({ type: Boolean })
  locked!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lockedAt!: string | null;
  @ApiProperty({ type: FloorplanShapeResponseDto, isArray: true })
  shapes!: FloorplanShapeResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class SeatingChangeDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assistantId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  fromTableId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  toTableId!: string | null;
}

export class SeatingTableOccupancyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  tableId!: string;
  @ApiProperty({ type: Number })
  occupancy!: number;
  @ApiProperty({ type: Number })
  capacity!: number;
}

export class SeatingMutationResponseDto {
  @ApiProperty({ type: SeatingChangeDto, isArray: true })
  changes!: SeatingChangeDto[];
  @ApiProperty({ type: SeatingTableOccupancyDto, isArray: true })
  affectedTables!: SeatingTableOccupancyDto[];
}

export class SeatingWorkspaceInvitationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: Number, minimum: 0 })
  eligibleAssistantCount!: number;
  @ApiProperty({ type: Number, minimum: 0 })
  assignedAssistantCount!: number;
}

export class SeatingWorkspaceGroupDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String })
  name!: string;
  @ApiProperty({ type: Number, minimum: 0 })
  eligibleAssistantCount!: number;
  @ApiProperty({ type: Number, minimum: 0 })
  assignedAssistantCount!: number;
}

export class SeatingWorkspaceTableDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String })
  name!: string;
}

export class SeatingWorkspaceItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  assistantId!: string;
  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
  @ApiProperty({ type: SeatingWorkspaceInvitationDto })
  invitation!: SeatingWorkspaceInvitationDto;
  @ApiProperty({ type: SeatingWorkspaceGroupDto, nullable: true })
  group!: SeatingWorkspaceGroupDto | null;
  @ApiProperty({ type: SeatingWorkspaceTableDto, nullable: true })
  table!: SeatingWorkspaceTableDto | null;
  @ApiProperty({ type: Boolean })
  checkedIn!: boolean;
}

export class SeatingWorkspaceSelectedTableDto extends SeatingWorkspaceTableDto {
  @ApiProperty({ type: Number, minimum: 0 })
  occupancy!: number;
  @ApiProperty({ type: Number, minimum: 0 })
  capacity!: number;
}

export class SeatingWorkspaceSummaryDto {
  @ApiProperty({ type: Number, minimum: 0 })
  unassignedCount!: number;
  @ApiProperty({ type: SeatingWorkspaceSelectedTableDto, nullable: true })
  selectedTable!: SeatingWorkspaceSelectedTableDto | null;
}

export class SeatingWorkspacePageDto {
  @ApiProperty({ type: SeatingWorkspaceItemDto, isArray: true })
  items!: SeatingWorkspaceItemDto[];
  @ApiProperty({ type: SeatingWorkspaceSummaryDto })
  summary!: SeatingWorkspaceSummaryDto;
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class ScannerFloorplanResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  floorplanId!: string;
  @ApiProperty({ type: String })
  contentPath!: string;
  @ApiProperty({ type: FloorplanShapeResponseDto, isArray: true })
  shapes!: FloorplanShapeResponseDto[];
}

export function parseFloorplanId(value: string): string {
  return parse(uuid, value);
}
export function parseCreateFloorplan(input: unknown): CreateFloorplanInput {
  return parse(createFloorplanSchema, input);
}
export function parseUpdateFloorplan(input: unknown): CreateFloorplanInput {
  return parse(updateFloorplanSchema, input);
}
export function parseCreateShape(input: unknown): FloorplanShapeInput {
  return parse(floorplanShapeSchema, input);
}
export function parseUpdateShape(input: unknown): UpdateFloorplanShapeInput {
  return parse(updateShapeSchema, input);
}
export function parseAssignSeating(input: unknown): AssignSeatingInput {
  return parse(assignSchema, input);
}
export function parseAssignFamily(input: unknown): AssignFamilyInput {
  return parse(assignFamilySchema, input);
}
export function parseAssignGroup(input: unknown): AssignGroupInput {
  return parse(assignGroupSchema, input);
}
export function parseUpdateSeating(input: unknown): UpdateSeatingInput {
  return parse(updateSeatingSchema, input);
}
export function parseSeatingWorkspaceQuery(input: unknown): SeatingWorkspaceQueryInput {
  return parse(seatingWorkspaceQuerySchema, input);
}

export function normalizeFloorplanName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeSeatingSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-MX');
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid Floorplan request.' });
  }
  return result.data;
}
