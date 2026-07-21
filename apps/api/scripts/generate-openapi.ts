import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createApp } from '../src/bootstrap/create-app';
import { createOpenApiDocument } from '../src/openapi/openapi';

async function generateOpenApi(): Promise<void> {
  const app = await createApp();

  try {
    await app.init();

    const outputPath = resolve(
      process.cwd(),
      process.env.OPENAPI_OUTPUT ?? 'openapi/openapi.json'
    );
    const document = createOpenApiDocument(app);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    await app.close();
  }
}

void generateOpenApi().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      timestamp: Date.now(),
      event: 'openapi_generation_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError'
    })}\n`
  );
  process.exitCode = 1;
});
