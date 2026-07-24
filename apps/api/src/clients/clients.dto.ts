import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ClientStatus, ClientType, UserRole } from '../generated/prisma/client';

const clientNameSchema = z.string().trim().min(2).max(160);
const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12).max(1024);

const registerPlannerSchema = z
  .object({
    name: clientNameSchema,
    email: emailSchema,
    password: passwordSchema
  })
  .strict();

const createOrganizationSchema = z
  .object({
    name: clientNameSchema,
    adminEmail: emailSchema,
    adminPassword: passwordSchema
  })
  .strict();

const updateClientSchema = z
  .object({
    name: clientNameSchema.optional()
  })
  .strict()
  .refine((value) => value.name !== undefined, { message: 'At least one field is required.' });

const suspendClientSchema = z
  .object({
    reason: z.string().trim().min(2).max(500).optional()
  })
  .strict();

const createPlannerUserSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema
  })
  .strict();

const updateClientUserSchema = z
  .object({
    email: emailSchema.optional(),
    password: passwordSchema.optional()
  })
  .strict()
  .refine((value) => value.email !== undefined || value.password !== undefined, {
    message: 'At least one field is required.'
  });

export class RegisterPlannerRequestDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 160 })
  name!: string;

  @ApiProperty({ type: String, format: 'email', maxLength: 320 })
  email!: string;

  @ApiProperty({ type: String, format: 'password', minLength: 12, maxLength: 1024, writeOnly: true })
  password!: string;
}

export class CreateOrganizationRequestDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 160 })
  name!: string;

  @ApiProperty({ type: String, format: 'email', maxLength: 320 })
  adminEmail!: string;

  @ApiProperty({ type: String, format: 'password', minLength: 12, maxLength: 1024, writeOnly: true })
  adminPassword!: string;
}

export class UpdateClientRequestDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 160, required: false })
  name?: string;
}

export class SuspendClientRequestDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 500, required: false })
  reason?: string;
}

export class CreatePlannerUserRequestDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 320 })
  email!: string;

  @ApiProperty({ type: String, format: 'password', minLength: 12, maxLength: 1024, writeOnly: true })
  password!: string;
}

export class UpdateClientUserRequestDto {
  @ApiProperty({ type: String, format: 'email', maxLength: 320, required: false })
  email?: string;

  @ApiProperty({ type: String, format: 'password', minLength: 12, maxLength: 1024, writeOnly: true, required: false })
  password?: string;
}

export class ClientResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ClientType })
  type!: ClientType;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: ClientStatus })
  status!: ClientStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  suspensionReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class ClientUserResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class ClientCreatedResponseDto {
  @ApiProperty({ type: () => ClientResponseDto })
  client!: ClientResponseDto;

  @ApiProperty({ type: () => ClientUserResponseDto })
  user!: ClientUserResponseDto;
}

export type RegisterPlannerInput = z.infer<typeof registerPlannerSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type SuspendClientInput = z.infer<typeof suspendClientSchema>;
export type CreatePlannerUserInput = z.infer<typeof createPlannerUserSchema>;
export type UpdateClientUserInput = z.infer<typeof updateClientUserSchema>;

export function parseRegisterPlannerRequest(input: unknown): RegisterPlannerInput {
  return parse(registerPlannerSchema, input);
}

export function parseCreateOrganizationRequest(input: unknown): CreateOrganizationInput {
  return parse(createOrganizationSchema, input);
}

export function parseUpdateClientRequest(input: unknown): UpdateClientInput {
  return parse(updateClientSchema, input);
}

export function parseSuspendClientRequest(input: unknown): SuspendClientInput {
  return parse(suspendClientSchema, input);
}

export function parseCreatePlannerUserRequest(input: unknown): CreatePlannerUserInput {
  return parse(createPlannerUserSchema, input);
}

export function parseUpdateClientUserRequest(input: unknown): UpdateClientUserInput {
  return parse(updateClientUserSchema, input);
}

export function parseUuidParameter(value: string, fieldName: string): string {
  const parsed = z.string().uuid().safeParse(value);

  if (!parsed.success) {
    throw validationError(`Invalid ${fieldName}.`);
  }

  return parsed.data;
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw validationError('Invalid request payload.');
  }

  return parsed.data;
}

function validationError(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message
  });
}
