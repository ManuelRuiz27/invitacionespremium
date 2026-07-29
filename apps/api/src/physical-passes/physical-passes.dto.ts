import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

const uuid = z.string().uuid();
const generationSchema = z
  .object({
    quantity: z.number().int().positive().max(10_000),
    tableShapeId: uuid.nullable().optional()
  })
  .strict();
const scanSchema = z.object({ qrToken: z.string().min(1).max(1024) }).strict();
const tableSnapshotSchema = z.object({ id: uuid, name: z.string() }).strict();
const passSnapshotSchema = z
  .object({
    id: uuid,
    eventId: uuid,
    passNumber: z.number().int().positive(),
    status: z.enum(['UNUSED', 'USED']),
    table: tableSnapshotSchema.nullable(),
    usedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime()
  })
  .strict();
const generationSnapshotSchema = z
  .object({
    generationOperationId: uuid,
    eventId: uuid,
    quantity: z.number().int().positive(),
    firstPassNumber: z.number().int().positive(),
    lastPassNumber: z.number().int().positive(),
    table: tableSnapshotSchema.nullable(),
    passes: z.array(passSnapshotSchema)
  })
  .strict();
const useSnapshotSchema = z
  .object({
    status: z.literal('USED'),
    physicalPassId: uuid,
    passNumber: z.number().int().positive(),
    usedAt: z.string().datetime(),
    table: tableSnapshotSchema.nullable()
  })
  .strict();

export type GeneratePhysicalPassesInput = z.infer<typeof generationSchema>;
export type ScanPhysicalPassInput = z.infer<typeof scanSchema>;

export class GeneratePhysicalPassesRequestDto {
  @ApiProperty({ type: Number, example: 10, minimum: 1, maximum: 10_000 })
  quantity!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false })
  tableShapeId?: string | null;
}

export class PhysicalPassTableDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;
}

export class PhysicalPassResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: Number })
  passNumber!: number;

  @ApiProperty({ type: String, enum: ['UNUSED', 'USED'] })
  status!: 'UNUSED' | 'USED';

  @ApiProperty({ type: () => PhysicalPassTableDto, nullable: true })
  table!: PhysicalPassTableDto | null;

  @ApiProperty({ type: String, nullable: true })
  usedAt!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;
}

export class GeneratePhysicalPassesResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  generationOperationId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: Number })
  quantity!: number;

  @ApiProperty({ type: Number })
  firstPassNumber!: number;

  @ApiProperty({ type: Number })
  lastPassNumber!: number;

  @ApiProperty({ type: () => PhysicalPassTableDto, nullable: true })
  table!: PhysicalPassTableDto | null;

  @ApiProperty({ type: () => PhysicalPassResponseDto, isArray: true })
  passes!: PhysicalPassResponseDto[];
}

export class ScanPhysicalPassRequestDto {
  @ApiProperty({ type: String, description: 'Opaque PHYSICAL_PASS token.' })
  qrToken!: string;
}

export class ScanPhysicalPassResponseDto {
  @ApiProperty({ type: String, enum: ['USED'] })
  status!: 'USED';

  @ApiProperty({ type: String, format: 'uuid' })
  physicalPassId!: string;

  @ApiProperty({ type: Number })
  passNumber!: number;

  @ApiProperty({ type: String })
  usedAt!: string;

  @ApiProperty({ type: () => PhysicalPassTableDto, nullable: true })
  table!: PhysicalPassTableDto | null;
}

export function parseGeneratePhysicalPasses(value: unknown): GeneratePhysicalPassesInput {
  return parse(generationSchema, value);
}

export function parseScanPhysicalPass(value: unknown): ScanPhysicalPassInput {
  return parse(scanSchema, value);
}

export function parsePhysicalPassId(value: string): string {
  return parse(uuid, value);
}

export function parseGenerationSnapshot(value: unknown): GeneratePhysicalPassesResponseDto {
  return parseStored(generationSnapshotSchema, value);
}

export function parseUseSnapshot(value: unknown): ScanPhysicalPassResponseDto {
  return parseStored(useSnapshotSchema, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: { issues: result.error.issues }
    });
  }
  return result.data;
}

function parseStored<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('Invalid persisted physical pass snapshot.');
  return result.data;
}
