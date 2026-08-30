import { Inject, Injectable, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from './environment';

const LOG_LEVELS: Record<EnvironmentVariables['LOG_LEVEL'], LogLevel[]> = {
  fatal: ['fatal'],
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  log: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
  verbose: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose']
};

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvironmentVariables, true>
  ) {}

  get nodeEnv(): EnvironmentVariables['NODE_ENV'] {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get apiPort(): number {
    return this.configService.get('API_PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get databasePoolMax(): number {
    return this.configService.get('DATABASE_POOL_MAX', { infer: true });
  }

  get databaseConnectionTimeoutMs(): number {
    return this.configService.get('DATABASE_CONNECTION_TIMEOUT_MS', {
      infer: true
    });
  }

  get databaseIdleTimeoutMs(): number {
    return this.configService.get('DATABASE_IDLE_TIMEOUT_MS', {
      infer: true
    });
  }

  get creditUnitValueMxnCents(): number {
    return this.configService.get('CREDIT_UNIT_VALUE_MXN_CENTS', { infer: true });
  }

  get unitEconomicsOperatorHourlyRateMxnCents(): number | undefined {
    return this.configService.get('UNIT_ECONOMICS_OPERATOR_HOURLY_RATE_MXN_CENTS', { infer: true });
  }

  get phoneDefaultRegion(): string {
    return this.configService.get('PHONE_DEFAULT_REGION', { infer: true });
  }

  get contactImportPreviewTtlSeconds(): number {
    return this.configService.get('CONTACT_IMPORT_PREVIEW_TTL_SECONDS', { infer: true });
  }

  get fileStorageLocalRoot(): string {
    return this.configService.get('FILE_STORAGE_LOCAL_ROOT', { infer: true });
  }

  get fileUploadMaxBytes(): number {
    return this.configService.get('FILE_UPLOAD_MAX_BYTES', { infer: true });
  }

  get fileImageMaxPixels(): number {
    return this.configService.get('FILE_IMAGE_MAX_PIXELS', { infer: true });
  }

  get fileOrphanRetentionSeconds(): number {
    return this.configService.get('FILE_ORPHAN_RETENTION_SECONDS', { infer: true });
  }

  get invitationTokenSigningSecret(): string {
    return this.configService.get('INVITATION_TOKEN_SIGNING_SECRET', { infer: true });
  }

  get publicInvitationBaseUrl(): string {
    return this.configService.get('PUBLIC_INVITATION_BASE_URL', { infer: true }).replace(/\/+$/u, '');
  }

  get corsOrigins(): string[] {
    return this.configService
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get logLevels(): LogLevel[] {
    return LOG_LEVELS[this.configService.get('LOG_LEVEL', { infer: true })];
  }

  get swaggerEnabled(): boolean {
    const explicitValue = this.configService.get('SWAGGER_ENABLED', {
      infer: true
    });

    return explicitValue ?? this.nodeEnv !== 'production';
  }

  get authSessionTtlSeconds(): number {
    return this.configService.get('AUTH_SESSION_TTL_SECONDS', { infer: true });
  }

  get authCookieName(): string {
    return this.configService.get('AUTH_COOKIE_NAME', { infer: true });
  }

  get authCookieSecure(): boolean {
    const explicitValue = this.configService.get('AUTH_COOKIE_SECURE', {
      infer: true
    });

    return explicitValue ?? this.nodeEnv === 'production';
  }

  get authCookieSameSite(): 'strict' | 'lax' | 'none' {
    return this.configService.get('AUTH_COOKIE_SAME_SITE', { infer: true });
  }

  get authCookiePath(): string {
    return this.configService.get('AUTH_COOKIE_PATH', { infer: true });
  }

  get localAdminEmail(): string | undefined {
    return this.configService.get('LOCAL_ADMIN_EMAIL', { infer: true });
  }

  get localAdminPassword(): string | undefined {
    return this.configService.get('LOCAL_ADMIN_PASSWORD', { infer: true });
  }
}
