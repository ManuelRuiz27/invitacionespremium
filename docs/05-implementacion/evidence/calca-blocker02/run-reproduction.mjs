import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const temporary = join(root, 'var/qa/calca-blocker02/isolated-reproduction.mjs');
await mkdir(dirname(temporary), { recursive: true });
// Reuse the proven owned-resource harness, replacing only its entry point/output namespace.
// The historical CALCA06 runner and results are never written or executed.
let harness = await readFile(join(root, 'docs/05-implementacion/evidence/calca06/run.mjs'), 'utf8');
harness = harness
  .replaceAll('calca06', 'calca-blocker02')
  .replaceAll('CALCA06', 'CALCA_BLOCKER02')
  .replaceAll('../../../../scripts/', '../../../scripts/')
  .replace(
    "const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');",
    `const root = ${JSON.stringify(root)};`
  )
  .replace(
    'docs/05-implementacion/evidence/calca-blocker02/certify.mjs',
    'docs/05-implementacion/evidence/calca-blocker02/reproduce.mjs'
  );
await writeFile(temporary, harness);
const child = spawn(process.execPath, [temporary], {
  cwd: root,
  windowsHide: true,
  stdio: 'inherit',
  env: { ...process.env, CALCA_BLOCKER02_SCOPE: 'restrictions', CALCA_BLOCKER02_ATTEMPT: 'reproduction' }
});
const code = await new Promise((done, fail) => {
  child.once('error', fail);
  child.once('exit', (code) => done(code ?? 1));
});
process.exitCode = code;
