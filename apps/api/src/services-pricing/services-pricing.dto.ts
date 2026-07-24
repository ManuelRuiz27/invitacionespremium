import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ClientType, PromotionScope, ServiceCode } from '../generated/prisma/client';

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });

const createServiceSchema = z
  .object({
    code: z.enum(ServiceCode),
    isActive: z.boolean().optional()
  })
  .strict();

const updateServiceSchema = z
  .object({
    isActive: z.boolean()
  })
  .strict();

const createPriceSchema = z
  .object({
    serviceId: uuidSchema,
    clientType: z.enum(ClientType),
    credits: z.number().int().nonnegative(),
    validFrom: instantSchema,
    validUntil: instantSchema.nullable().optional()
  })
  .strict()
  .refine((value) => value.validUntil == null || new Date(value.validUntil) > new Date(value.validFrom), {
    message: 'validUntil must be after validFrom.'
  });

const closePriceSchema = z
  .object({
    validUntil: instantSchema
  })
  .strict();

const promotionFields = {
  name: z.string().trim().min(2).max(160),
  scope: z.enum(PromotionScope),
  clientId: uuidSchema.nullable().optional(),
  clientType: z.enum(ClientType).nullable().optional(),
  serviceId: uuidSchema.nullable().optional(),
  validFrom: instantSchema,
  validUntil: instantSchema.nullable().optional(),
  allowsStacking: z.boolean()
};

const createPromotionSchema = z
  .object(promotionFields)
  .strict()
  .refine((value) => value.validUntil == null || new Date(value.validUntil) > new Date(value.validFrom), {
    message: 'validUntil must be after validFrom.'
  });

const updatePromotionSchema = z
  .object({
    name: promotionFields.name.optional(),
    scope: promotionFields.scope.optional(),
    clientId: promotionFields.clientId,
    clientType: promotionFields.clientType,
    serviceId: promotionFields.serviceId,
    validFrom: promotionFields.validFrom.optional(),
    validUntil: promotionFields.validUntil,
    allowsStacking: promotionFields.allowsStacking.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

export class CreateServiceRequestDto {
  @ApiProperty({ enum: ServiceCode })
  code!: ServiceCode;

  @ApiProperty({ type: Boolean, required: false, default: true })
  isActive?: boolean;
}

export class UpdateServiceRequestDto {
  @ApiProperty({ type: Boolean })
  isActive!: boolean;
}

export class ServiceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ServiceCode })
  code!: ServiceCode;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class AvailableServiceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ServiceCode })
  code!: ServiceCode;

  @ApiProperty({ type: Number, minimum: 0 })
  credits!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validUntil!: string | null;
}

export class CreatePriceRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ enum: ClientType })
  clientType!: ClientType;

  @ApiProperty({ type: Number, minimum: 0 })
  credits!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  validUntil?: string | null;
}

export class ClosePriceRequestDto {
  @ApiProperty({ type: String, format: 'date-time' })
  validUntil!: string;
}

export class PriceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ enum: ServiceCode })
  serviceCode!: ServiceCode;

  @ApiProperty({ enum: ClientType })
  clientType!: ClientType;

  @ApiProperty({ type: Number, minimum: 0 })
  credits!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validUntil!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class CreatePromotionRequestDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 160 })
  name!: string;

  @ApiProperty({ enum: PromotionScope })
  scope!: PromotionScope;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  clientId?: string | null;

  @ApiProperty({ enum: ClientType, required: false, nullable: true })
  clientType?: ClientType | null;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  serviceId?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  validUntil?: string | null;

  @ApiProperty({ type: Boolean })
  allowsStacking!: boolean;
}

export class UpdatePromotionRequestDto {
  @ApiProperty({ type: String, minLength: 2, maxLength: 160, required: false })
  name?: string;

  @ApiProperty({ enum: PromotionScope, required: false })
  scope?: PromotionScope;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  clientId?: string | null;

  @ApiProperty({ enum: ClientType, required: false, nullable: true })
  clientType?: ClientType | null;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  serviceId?: string | null;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  validFrom?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  validUntil?: string | null;

  @ApiProperty({ type: Boolean, required: false })
  allowsStacking?: boolean;
}

export class PromotionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: PromotionScope })
  scope!: PromotionScope;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId!: string | null;

  @ApiProperty({ enum: ClientType, nullable: true })
  clientType!: ClientType | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  serviceId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validUntil!: string | null;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ type: Boolean })
  allowsStacking!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type CreatePriceInput = z.infer<typeof createPriceSchema>;
export type ClosePriceInput = z.infer<typeof closePriceSchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export function parseCreateServiceRequest(input: unknown): CreateServiceInput {
  return parse(createServiceSchema, input);
}

export function parseUpdateServiceRequest(input: unknown): UpdateServiceInput {
  return parse(updateServiceSchema, input);
}

export function parseCreatePriceRequest(input: unknown): CreatePriceInput {
  return parse(createPriceSchema, input);
}

export function parseClosePriceRequest(input: unknown): ClosePriceInput {
  return parse(closePriceSchema, input);
}

export function parseCreatePromotionRequest(input: unknown): CreatePromotionInput {
  return parse(createPromotionSchema, input);
}

export function parseUpdatePromotionRequest(input: unknown): UpdatePromotionInput {
  return parse(updatePromotionSchema, input);
}

export function parseUuidParameter(value: string, fieldName: string): string {
  const parsed = uuidSchema.safeParse(value);

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
