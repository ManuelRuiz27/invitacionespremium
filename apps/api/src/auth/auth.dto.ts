import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { UserRole } from '../generated/prisma/client';

const loginRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024)
});

export class LoginRequestDto {
  @ApiProperty({
    type: String,
    example: 'admin@example.com',
    format: 'email',
    maxLength: 320
  })
  email!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    maxLength: 1024,
    writeOnly: true
  })
  password!: string;
}

export class AuthUserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId!: string | null;
}

export class LoginResponseDto {
  @ApiProperty({ type: () => AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export function parseLoginRequest(input: unknown): LoginRequestDto {
  const parsed = loginRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid login payload.'
    });
  }

  return parsed.data;
}
