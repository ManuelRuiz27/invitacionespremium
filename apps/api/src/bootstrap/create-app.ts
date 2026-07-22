import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { AppConfigService } from '../config/app-config.service';
import { validateEnvironment } from '../config/environment';
import { loadEnvironmentFiles } from '../config/load-environment';
import { setupOpenApi } from '../openapi/openapi';

export async function createApp(): Promise<INestApplication> {
  loadEnvironmentFiles();
  const environment = validateEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      json: true,
      colors: false,
      logLevels: logLevelsFor(environment.LOG_LEVEL)
    })
  });
  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true
  });
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    setupOpenApi(app);
  }

  return app;
}

function logLevelsFor(
  level: ReturnType<typeof validateEnvironment>['LOG_LEVEL']
): Array<'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose'> {
  const levels = {
    fatal: ['fatal'],
    error: ['fatal', 'error'],
    warn: ['fatal', 'error', 'warn'],
    log: ['fatal', 'error', 'warn', 'log'],
    debug: ['fatal', 'error', 'warn', 'log', 'debug'],
    verbose: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose']
  } as const;

  return [...levels[level]];
}
