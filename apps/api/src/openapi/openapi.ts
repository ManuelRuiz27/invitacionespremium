import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppConfigService } from '../config/app-config.service';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const appConfig = app.get(AppConfigService);
  const config = new DocumentBuilder()
    .setTitle('InvitacionesPremium API')
    .setDescription('REST contract for InvitacionesPremium.')
    .setVersion('0.1.0')
    .addCookieAuth(appConfig.authCookieName)
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupOpenApi(app: INestApplication): void {
  const document = createOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      withCredentials: true
    }
  });
}
