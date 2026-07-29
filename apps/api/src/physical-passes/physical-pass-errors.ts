import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

export function physicalPassNotFound(): NotFoundException {
  return new NotFoundException({ code: 'PHYSICAL_PASS_NOT_FOUND', message: 'Physical pass not found.' });
}

export function physicalPassError(code: string, message: string, status = HttpStatus.CONFLICT): DomainError {
  return new DomainError(code, message, status);
}

export function generationIdempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'PHYSICAL_PASS_GENERATION_IDEMPOTENCY_CONFLICT',
    message: 'The Idempotency-Key is already associated with another physical pass generation.'
  });
}

export function useIdempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'PHYSICAL_PASS_IDEMPOTENCY_CONFLICT',
    message: 'The Idempotency-Key is already associated with another physical pass use.'
  });
}
