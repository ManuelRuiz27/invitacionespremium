import { HttpStatus, NotFoundException } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

export function albumNotFound(): NotFoundException {
  return new NotFoundException({ code: 'ALBUM_NOT_FOUND', message: 'Album not found.' });
}

export function albumError(code: string, message: string, status = HttpStatus.CONFLICT): DomainError {
  return new DomainError(code, message, status);
}
