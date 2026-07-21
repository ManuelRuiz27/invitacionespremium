import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';

const operationId = '5bc9f81c-49f5-46bb-a395-35b8a3348a43';

describe('API foundation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests.');
    }

    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = 'http://localhost:5173';

    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports API and PostgreSQL as healthy', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-operation-id', operationId)
      .expect(200);

    expect(response.headers['x-operation-id']).toBe(operationId);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'invitacionespremium-api',
      checks: {
        api: { status: 'up' },
        database: { status: 'up' }
      }
    });
  });

  it('returns the uniform error contract without request data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/missing-resource')
      .set('x-operation-id', operationId)
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      operationId
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('serves the OpenAPI document when explicitly enabled', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(response.body.info.title).toBe('InvitacionesPremium API');
  });
});
