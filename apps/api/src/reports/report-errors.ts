import { HttpStatus, NotFoundException } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

export function reportNotFound(): NotFoundException {
  return new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
}

export function reportError(code: string, message: string, status = HttpStatus.CONFLICT): DomainError {
  return new DomainError(code, message, status);
}
