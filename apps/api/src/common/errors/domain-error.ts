import { HttpException, HttpStatus } from '@nestjs/common';

export interface DomainErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class DomainError extends HttpException {
  constructor(
    code: string,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>
  ) {
    const payload: DomainErrorPayload = {
      code,
      message,
      ...(details ? { details } : {})
    };

    super(payload, statusCode);
  }
}
