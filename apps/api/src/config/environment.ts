import { z } from 'zod';

const booleanFromEnvironment = z.enum(['true', 'false']).transform((value) => value === 'true');

const postgresUrl = z
  .string()
  .min(1)
  .regex(/^postgres(?:ql)?:\/\//, 'must be a PostgreSQL connection URL');

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    SWAGGER_ENABLED: booleanFromEnvironment.optional(),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
    AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('ip_session'),
    AUTH_COOKIE_SECURE: booleanFromEnvironment.optional(),
    AUTH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    AUTH_COOKIE_PATH: z.string().startsWith('/').default('/api/v1'),
    LOCAL_ADMIN_EMAIL: z.string().email().transform((value) => value.trim().toLowerCase()).optional(),
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
  });

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
