import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const temporary = join(root, 'var/qa/calca-blocker03b/isolated-reproduction.mjs');
await mkdir(dirname(temporary), { recursive: true });
// Only copy the owned-resource lifecycle; do not run or overwrite historical certification.
let harness = await readFile(join(root, 'docs/05-implementacion/evidence/calca06/run.mjs'), 'utf8');
harness = harness
  .replaceAll('calca06', 'calca-blocker03b')
  .replaceAll('CALCA06', 'CALCA_BLOCKER03B')
  .replaceAll('../../../../scripts/', '../../../scripts/')
  .replace(
    "const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');",
    `const root = ${JSON.stringify(root)};`
  )
  .replace(
    'docs/05-implementacion/evidence/calca-blocker03b/certify.mjs',
    'docs/05-implementacion/evidence/calca-blocker03b/reproduce.mjs'
  );
await writeFile(temporary, harness);
const child = spawn(process.execPath, [temporary], {
  cwd: root,
  windowsHide: true,
  stdio: 'inherit',
  env: { ...process.env, CALCA_BLOCKER03B_SCOPE: 'svg-recovery-restrictions', CALCA_BLOCKER03B_ATTEMPT: 'reproduction' }
});
// That harness counter expects one confirmed fictitious Assistant. No SVG/security suite is invoked here.
process.exitCode = await new Promise((done, fail) => {
  child.once('error', fail);
  child.once('exit', (code) => done(code ?? 1));
});
