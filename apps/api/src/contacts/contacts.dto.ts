import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

const uuidSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(160).transform(collapseWhitespace);
const phoneSchema = z.string().trim().min(3).max(100);

const createContactSchema = z
  .object({
    name: nameSchema,
    whatsappPhone: phoneSchema,
    groupId: uuidSchema.nullable().optional()
  })
  .strict();

const updateContactSchema = z
  .object({
    name: nameSchema.optional(),
    whatsappPhone: phoneSchema.optional(),
    groupId: uuidSchema.nullable().optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const groupSchema = z.object({ name: nameSchema }).strict();
const commitSchema = z.object({ previewId: uuidSchema }).strict();

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type CommitImportInput = z.infer<typeof commitSchema>;

export class CreateContactRequestDto {
  @ApiProperty({ type: String, example: 'María Ejemplo' })
  name!: string;

  @ApiProperty({ type: String, example: '+525512345678' })
  whatsappPhone!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  groupId?: string | null;
}

export class UpdateContactRequestDto {
  @ApiPropertyOptional({ type: String, example: 'María Ejemplo' })
  name?: string;

  @ApiPropertyOptional({ type: String, example: '+525512345678' })
  whatsappPhone?: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  groupId?: string | null;
}

export class GroupRequestDto {
  @ApiProperty({ type: String, example: 'Familia' })
  name!: string;
}

export class ContactResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  groupId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+525512345678' })
  whatsappPhone!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  anonymizedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ContactGroupResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ImportPreviewRowDto {
  @ApiProperty({ type: Number })
  rowNumber!: number;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+525512345678' })
  normalizedPhone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  group!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  groupId!: string | null;

  @ApiProperty({ type: String, enum: ['NONE', 'EXISTING', 'NEW'] })
  groupResolution!: 'NONE' | 'EXISTING' | 'NEW';

  @ApiProperty({ type: [String] })
  errors!: string[];
}

export class ImportPreviewResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  previewId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ type: Number })
  totalRows!: number;

  @ApiProperty({ type: Number })
  validRows!: number;

  @ApiProperty({ type: Number })
  invalidRows!: number;

  @ApiProperty({ type: () => ImportPreviewRowDto, isArray: true })
  rows!: ImportPreviewRowDto[];
}

export class CommitImportRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  previewId!: string;
}

export class CommitImportResponseDto {
  @ApiProperty({ type: Number })
  createdContacts!: number;

  @ApiProperty({ type: Number })
  createdGroups!: number;

  @ApiProperty({ type: () => ContactResponseDto, isArray: true })
  contacts!: ContactResponseDto[];
}

export interface StoredImportRow {
  rowNumber: number;
  name: string | null;
  normalizedPhone: string | null;
  group: string | null;
  normalizedGroup: string | null;
  groupId: string | null;
  groupResolution: 'NONE' | 'EXISTING' | 'NEW';
  errors: string[];
}

export function parseEventId(input: unknown): string {
  return parse(uuidSchema, input);
}

export function parseContactId(input: unknown): string {
  return parse(uuidSchema, input);
}

export function parseGroupId(input: unknown): string {
  return parse(uuidSchema, input);
}

export function parseCreateContactRequest(input: unknown): CreateContactInput {
  return parse(createContactSchema, input);
}

export function parseUpdateContactRequest(input: unknown): UpdateContactInput {
  return parse(updateContactSchema, input);
}

export function parseGroupRequest(input: unknown): GroupInput {
  return parse(groupSchema, input);
}

export function parseCommitImportRequest(input: unknown): CommitImportInput {
  return parse(commitSchema, input);
}

export function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/gu, ' ');
}

export function normalizeGroupName(input: string): string {
  return collapseWhitespace(input).toLocaleLowerCase('es-MX');
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid Contacts request.'
    });
  }
  return result.data;
}
