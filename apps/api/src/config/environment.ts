import { z } from 'zod';

const booleanFromEnvironment = z.enum(['true', 'false']).transform((value) => value === 'true');

const postgresUrl = z
  .string()
  .min(1)
  .regex(/^postgres(?:ql)?:\/\//, 'must be a PostgreSQL connection URL');
const LOCAL_INVITATION_SIGNING_SECRET = 'local-development-invitation-signing-secret';
const LOCAL_PUBLIC_INVITATION_BASE_URL = 'http://localhost:5173/invitacion';
const INVITATION_SECRET_PLACEHOLDER = 'replace-with-at-least-32-random-bytes';
const invitationSigningSecret = z
  .string()
  .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, 'must contain at least 32 bytes');
const exactCorsOrigins = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    const origins = value.split(',').map((origin) => origin.trim());

    if (origins.some((origin) => !origin || origin === '*')) {
      context.addIssue({ code: 'custom', message: 'must contain non-empty exact origins and no wildcard' });
      return;
    }

    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password ||
          parsed.pathname !== '/' ||
          parsed.search ||
          parsed.hash
        ) {
          throw new Error('not an exact HTTP(S) origin');
        }
      } catch {
        context.addIssue({ code: 'custom', message: `contains an invalid exact origin: ${origin}` });
      }
    }
  });

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
    CREDIT_UNIT_VALUE_MXN_CENTS: z.coerce.number().int().positive().default(2000),
    PHONE_DEFAULT_REGION: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('MX'),
    CONTACT_IMPORT_PREVIEW_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1800),
    FILE_STORAGE_LOCAL_ROOT: z.string().trim().min(1).default('var/file-assets'),
    FILE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
    FILE_IMAGE_MAX_PIXELS: z.coerce.number().int().positive().default(40_000_000),
    FILE_ORPHAN_RETENTION_SECONDS: z.coerce.number().int().min(60).default(86_400),
    INVITATION_TOKEN_SIGNING_SECRET: invitationSigningSecret.optional(),
    PUBLIC_INVITATION_BASE_URL: z.string().url().optional(),
    CORS_ORIGINS: exactCorsOrigins.default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    SWAGGER_ENABLED: booleanFromEnvironment.optional(),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
    AUTH_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('ip_session'),
    AUTH_COOKIE_SECURE: booleanFromEnvironment.optional(),
    AUTH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    AUTH_COOKIE_PATH: z.literal('/').default('/'),
    LOCAL_ADMIN_EMAIL: z
      .string()
      .email()
      .transform((value) => value.trim().toLowerCase())
      .optional(),
    LOCAL_ADMIN_PASSWORD: z.string().min(12).max(1024).optional()
  })
  .superRefine((environment, context) => {
    const secureCookie = environment.AUTH_COOKIE_SECURE ?? environment.NODE_ENV === 'production';

    if (environment.NODE_ENV === 'production' && !secureCookie) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'must be true in production'
      });
    }

    if (environment.AUTH_COOKIE_SAME_SITE === 'none' && !secureCookie) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SAME_SITE'],
        message: 'none requires AUTH_COOKIE_SECURE=true'
      });
    }

    if ((environment.LOCAL_ADMIN_EMAIL === undefined) !== (environment.LOCAL_ADMIN_PASSWORD === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['LOCAL_ADMIN_EMAIL'],
        message: 'LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD must be provided together'
      });
    }

    if (environment.NODE_ENV !== 'production') {
      return;
    }

    if (environment.INVITATION_TOKEN_SIGNING_SECRET === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['INVITATION_TOKEN_SIGNING_SECRET'],
        message: 'must be explicitly configured in production'
      });
    } else if (
      environment.INVITATION_TOKEN_SIGNING_SECRET.trim() === LOCAL_INVITATION_SIGNING_SECRET ||
      environment.INVITATION_TOKEN_SIGNING_SECRET.trim() === INVITATION_SECRET_PLACEHOLDER
    ) {
      context.addIssue({
        code: 'custom',
        path: ['INVITATION_TOKEN_SIGNING_SECRET'],
        message: 'must use a unique production secret'
      });
    }

    if (environment.PUBLIC_INVITATION_BASE_URL === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_INVITATION_BASE_URL'],
        message: 'must be explicitly configured in production'
      });
      return;
    }

    const publicUrl = new URL(environment.PUBLIC_INVITATION_BASE_URL);
    if (publicUrl.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_INVITATION_BASE_URL'],
        message: 'must use https in production'
      });
    }
    if (publicUrl.username || publicUrl.password) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_INVITATION_BASE_URL'],
        message: 'must not contain user credentials'
      });
    }
    if (publicUrl.search || publicUrl.hash) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_INVITATION_BASE_URL'],
        message: 'must not contain a query or fragment'
      });
    }
    const hostname = publicUrl.hostname
      .toLowerCase()
      .replace(/^\[|\]$/gu, '')
      .replace(/\.$/u, '');
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_INVITATION_BASE_URL'],
        message: 'must not use a loopback host in production'
      });
    }
    if (publicUrl.pathname === '/' || publicUrl.pathname === '') {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_INVITATION_BASE_URL'],
        message: 'must include a public invitation path'
      });
    }
  })
  .transform((environment) => ({
    ...environment,
    API_PORT: environment.API_PORT ?? environment.PORT ?? 3000,
    INVITATION_TOKEN_SIGNING_SECRET: environment.INVITATION_TOKEN_SIGNING_SECRET ?? LOCAL_INVITATION_SIGNING_SECRET,
    PUBLIC_INVITATION_BASE_URL: environment.PUBLIC_INVITATION_BASE_URL ?? LOCAL_PUBLIC_INVITATION_BASE_URL
  }));

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): EnvironmentVariables {
  const result = environmentSchema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Environment validation failed: ${issues}`);
}
