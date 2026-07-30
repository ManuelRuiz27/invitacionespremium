import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const packageRoot = process.cwd();
const inputPath = resolve(packageRoot, '../../apps/api/openapi/openapi.json');
const outputPath = resolve(packageRoot, 'src/generated/schema.ts');
const checkOnly = process.argv.includes('--check');

const ast = await openapiTS(pathToFileURL(inputPath), {
  alphabetize: true,
  exportType: true
});
const generated = astToString(ast);

if (checkOnly) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== generated) {
    process.stderr.write(
      'Generated API client types are out of date. Run the API OpenAPI generator and then pnpm --filter @invitaciones/api-client generate.\n'
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('Generated API client types are current.\n');
  }
} else {
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, generated, 'utf8');
  process.stdout.write(`Generated ${outputPath}\n`);
}
