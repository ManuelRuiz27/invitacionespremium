import type { AuditObject } from './audit.types';

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|secret|token|phone|telefono|teléfono|whatsapp)/i;

export function sanitizeAuditObject(input: AuditObject): AuditObject {
  return sanitizeObject(input);
}

function sanitizeObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }

    output[key] = sanitizeValue(value);
  }

  return output;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }

  return String(value);
}
