import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap/create-app';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfigService);

  await app.listen(config.apiPort, '0.0.0.0');

  new Logger('Bootstrap').log({
    event: 'api_started',
    port: config.apiPort,
    environment: config.nodeEnv
  });
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      timestamp: Date.now(),
      event: 'api_bootstrap_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError'
    })}\n`
  );
  process.exitCode = 1;
});
