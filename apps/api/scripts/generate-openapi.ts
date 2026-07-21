import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/bootstrap/create-app';
import { createOpenApiDocument } from '../src/openapi/openapi';

type GenerationStage = 'create_app' | 'initialize_app' | 'create_document' | 'write_document' | 'close_app';

let currentStage: GenerationStage = 'create_app';

async function generateOpenApi(): Promise<void> {
  let app: INestApplication | undefined;

  try {
    app = await createApp();
    currentStage = 'initialize_app';
    await app.init();

    currentStage = 'create_document';
    const document = createOpenApiDocument(app);
    const outputPath = resolve(process.cwd(), process.env.OPENAPI_OUTPUT ?? 'openapi/openapi.json');

    currentStage = 'write_document';
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    if (app) {
      currentStage = 'close_app';
      await app.close();
    }
  }
}

void generateOpenApi().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      timestamp: Date.now(),
      event: 'openapi_generation_failed',
      stage: currentStage,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: redactDiagnosticMessage(error)
    })}\n`
  );
  process.exitCode = 1;
});

function redactDiagnosticMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown OpenAPI generation error.';

  return message
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b(password|token|secret)=?[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}
