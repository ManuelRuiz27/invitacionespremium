import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { HotspotVisualOwnerType, type InvitationCountdown } from '../generated/prisma/client';

const fonts = ['montserrat', 'playfair', 'system'] as const;
const weights = [400, 500, 600, 700] as const;
const frames = ['none', 'thin', 'double', 'rounded'] as const;
const shadows = ['none', 'soft', 'strong'] as const;
const layouts = ['row', 'grid'] as const;
const color = z
  .string()
  .regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/)
  .transform((value) =>
    (value.length === 4 ? '#' + [...value.slice(1)].map((part) => part + part).join('') : value).toUpperCase()
  );
const coordinate = z.number().finite().min(0).max(1);
const schema = z
  .object({
    visualOwnerType: z.nativeEnum(HotspotVisualOwnerType),
    flipbookPageId: z.string().uuid().nullable(),
    x: coordinate,
    y: coordinate,
    width: coordinate.refine((value) => value > 0),
    height: coordinate.refine((value) => value > 0),
    numberFont: z.enum(fonts),
    labelFont: z.enum(fonts),
    numberWeight: z.union(weights.map((weight) => z.literal(weight))),
    labelWeight: z.union(weights.map((weight) => z.literal(weight))),
    layout: z.enum(layouts),
    numberColor: color,
    labelColor: color,
    backgroundColor: color,
    borderColor: color,
    shadowColor: color,
    backgroundOpacity: coordinate,
    frame: z.enum(frames),
    shadow: z.enum(shadows),
    revision: z.number().int().min(0).max(2147483646)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.x + value.width > 1 || value.y + value.height > 1) {
      context.addIssue({ code: 'custom', message: 'Countdown exceeds image bounds.' });
    }
    if ((value.visualOwnerType === 'FLYER') !== (value.flipbookPageId === null)) {
      context.addIssue({ code: 'custom', message: 'Countdown visual owner and page must agree.' });
    }
  })
  .transform((value) => {
    const scale = 100_000_000;
    const x = Math.round(value.x * scale);
    const y = Math.round(value.y * scale);
    return {
      ...value,
      x: x / scale,
      y: y / scale,
      width: Math.min(scale - x, Math.round(value.width * scale)) / scale,
      height: Math.min(scale - y, Math.round(value.height * scale)) / scale
    };
  })
  .refine((value) => value.width > 0 && value.height > 0, {
    message: 'Countdown dimensions must fit the stored decimal precision.'
  });

export type SaveCountdownInput = z.infer<typeof schema>;
export function parseSaveCountdown(input: unknown): SaveCountdownInput {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException({ code: 'COUNTDOWN_INPUT_INVALID', message: 'Invalid countdown configuration.' });
  return parsed.data;
}

export function parseCountdownRevision(input: unknown): number {
  const parsed = z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(2147483646))
    .safeParse(input);
  if (!parsed.success)
    throw new BadRequestException({ code: 'COUNTDOWN_REVISION_INVALID', message: 'A valid revision is required.' });
  return parsed.data;
}

export class SaveCountdownRequestDto {
  @ApiProperty({ enum: HotspotVisualOwnerType }) visualOwnerType!: HotspotVisualOwnerType;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) flipbookPageId!: string | null;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 }) x!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 }) y!: number;
  @ApiProperty({ type: Number, minimum: 0, exclusiveMinimum: true, maximum: 1 }) width!: number;
  @ApiProperty({ type: Number, minimum: 0, exclusiveMinimum: true, maximum: 1 }) height!: number;
  @ApiProperty({ type: String, enum: fonts }) numberFont!: (typeof fonts)[number];
  @ApiProperty({ type: String, enum: fonts }) labelFont!: (typeof fonts)[number];
  @ApiProperty({ enum: weights, type: Number }) numberWeight!: (typeof weights)[number];
  @ApiProperty({ enum: weights, type: Number }) labelWeight!: (typeof weights)[number];
  @ApiProperty({ type: String, enum: layouts }) layout!: (typeof layouts)[number];
  @ApiProperty({ type: String, pattern: '^#[A-Fa-f0-9]{6}$' }) numberColor!: string;
  @ApiProperty({ type: String, pattern: '^#[A-Fa-f0-9]{6}$' }) labelColor!: string;
  @ApiProperty({ type: String, pattern: '^#[A-Fa-f0-9]{6}$' }) backgroundColor!: string;
  @ApiProperty({ type: String, pattern: '^#[A-Fa-f0-9]{6}$' }) borderColor!: string;
  @ApiProperty({ type: String, pattern: '^#[A-Fa-f0-9]{6}$' }) shadowColor!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1 }) backgroundOpacity!: number;
  @ApiProperty({ type: String, enum: frames }) frame!: (typeof frames)[number];
  @ApiProperty({ type: String, enum: shadows }) shadow!: (typeof shadows)[number];
  @ApiProperty({ minimum: 0, maximum: 2147483646, type: 'integer' }) revision!: number;
}

export class CountdownResponseDto extends SaveCountdownRequestDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
}

export function toCountdownResponse(value: InvitationCountdown): CountdownResponseDto {
  return {
    id: value.id,
    visualOwnerType: value.visualOwnerType,
    flipbookPageId: value.flipbookPageId,
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
    numberFont: value.numberFont as CountdownResponseDto['numberFont'],
    labelFont: value.labelFont as CountdownResponseDto['labelFont'],
    numberWeight: value.numberWeight as CountdownResponseDto['numberWeight'],
    labelWeight: value.labelWeight as CountdownResponseDto['labelWeight'],
    layout: value.layout as CountdownResponseDto['layout'],
    numberColor: value.numberColor,
    labelColor: value.labelColor,
    backgroundColor: value.backgroundColor,
    borderColor: value.borderColor,
    shadowColor: value.shadowColor,
    backgroundOpacity: value.backgroundOpacity,
    frame: value.frame as CountdownResponseDto['frame'],
    shadow: value.shadow as CountdownResponseDto['shadow'],
    revision: value.revision
  };
}
