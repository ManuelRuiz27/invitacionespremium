import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractName = /^tdd\/contracts\/[A-Z0-9][A-Z0-9_-]{2,63}\.json$/u;

export function safePath(file, prefix = false) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes(':') || file.startsWith('/'))
    throw new Error('Use relative POSIX paths in the TDD contract.');
  const path = prefix && file.endsWith('/**') ? file.slice(0, -3) : file;
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('*')) ||
      /[\x00-\x1f]/u.test(file))
    throw new Error('Unsafe TDD path: ' + file);
  return file;
}

export function matches(file, paths) {
  return paths.some((path) => path.endsWith('/**') ? file.startsWith(path.slice(0, -2)) : file === path);
}

export function validate(raw, file) {
  safePath(file);
  if (!contractName.test(file) || !raw || raw.schemaVersion !== 1 || raw.taskId !== basename(file, '.json'))
    throw new Error('Invalid TDD contract or filename.');
  if (!['codex', 'gemini'].includes(raw.executor) || !['L1', 'L2', 'L3'].includes(raw.risk))
    throw new Error('Invalid TDD executor/risk.');
  for (const field of ['testPaths', 'implementationPaths', 'qaCommands', 'acceptance'])
    if (!Array.isArray(raw[field]) || raw[field].length === 0) throw new Error('Missing contract field: ' + field);
  raw.testPaths.forEach((path) => safePath(path));
  raw.implementationPaths.forEach((path) => safePath(path, true));
  if (new Set(raw.testPaths).size !== raw.testPaths.length ||
      new Set(raw.implementationPaths).size !== raw.implementationPaths.length)
    throw new Error('Duplicate TDD paths.');
  if (raw.testPaths.some((path) => matches(path, raw.implementationPaths)))
    throw new Error('Tests overlap implementation scope.');
  for (const path of raw.implementationPaths)
    if (path === 'AGENTS.md' || path.startsWith('tdd/') || path.startsWith('.agents/') ||
        path.startsWith('.codex/') || path.startsWith('.github/') ||
        path === 'scripts/tdd-guard.mjs' || path === 'scripts/tdd-guard.test.mjs')
      throw new Error('Governance and TDD guard are protected.');
  for (const command of raw.qaCommands) {
    if (!Array.isArray(command) || !['node', 'pnpm'].includes(command[0]) ||
        command.some((arg) => typeof arg !== 'string' || !arg || /[\x00-\x1f]/u.test(arg)))
      throw new Error('Only node/pnpm argument arrays are allowed.');
    if (command[0] === 'node' && !command.includes('--test'))
      throw new Error('Node test command must include --test.');
    if (command.includes('qa:full')) throw new Error('Full QA is not task-scoped.');
  }
  if (raw.risk === 'L3' && raw.independentReviewRequired !== true)
    throw new Error('L3 requires independent review.');
  if (raw.acceptance.some((text) => typeof text !== 'string' || !text.trim()))
    throw new Error('Invalid acceptance criterion.');
  return raw;
}

export function checkScope(paths, spec, contract) {
  for (const path of paths) {
    safePath(path);
    if (path === contract || spec.testPaths.includes(path) || !matches(path, spec.implementationPaths))
      throw new Error('Out-of-scope or locked file changed: ' + path);
  }
}

function git(args, binary = false) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: binary ? undefined : 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error('Git check failed: ' + args.slice(0, 3).join(' '));
  return binary ? result.stdout : result.stdout.trim();
}

function paths(args) {
  return git(args, true).toString('utf8').split('\0').filter(Boolean);
}

function verify(contractPath, baseline, mainRef = null) {
  if (!/^[0-9a-f]{40}$/u.test(baseline)) throw new Error('Use the full RED commit SHA.');
  git(['merge-base', '--is-ancestor', baseline, 'HEAD']);
  safePath(contractPath);
  const original = git(['show', baseline + ':' + contractPath], true);
  const spec = validate(JSON.parse(original.toString('utf8')), contractPath);
  for (const file of [contractPath, ...spec.testPaths]) {
    const target = join(root, file);
    if (!existsSync(target) || !lstatSync(target).isFile() ||
        !git(['show', baseline + ':' + file], true).equals(readFileSync(target)))
      throw new Error('Locked TDD file modified: ' + file);
  }
  const changed = [...new Set([
    ...paths(['diff', '--no-renames', '--name-only', '-z', baseline, '--']),
    ...paths(['diff', '--no-renames', '--name-only', '-z', 'HEAD', '--']),
    ...paths(['ls-files', '--others', '--exclude-standard', '-z'])
  ])];
  checkScope(changed, spec, contractPath);
  if (mainRef) {
    const common = git(['merge-base', mainRef, 'HEAD']);
    const initial = paths(['diff', '--no-renames', '--name-only', '-z', common, baseline, '--']);
    const expected = [contractPath, ...spec.testPaths];
    if (initial.length !== expected.length || initial.some((file) => !expected.includes(file)))
      throw new Error('RED commit must change exactly the contract and authorized tests.');
  }
  return { spec, changed };
}

function execute(spec, dry) {
  for (const [index, args] of spec.qaCommands.entries()) {
    process.stdout.write('[tdd] ' + args.join(' ') + '\n');
    if (dry) continue;
    if (args[0] === 'pnpm' && !process.env.npm_execpath) throw new Error('Run QA through pnpm.');
    const directory = join(root, 'var', 'tdd');
    mkdirSync(directory, { recursive: true });
    const logfile = join(directory, spec.taskId + '-' + (index + 1) + '.log');
    const fd = openSync(logfile, 'w');
    let result;
    try {
      const cmd = args[0] === 'pnpm' ? [process.env.npm_execpath, ...args.slice(1)] : args.slice(1);
      result = spawnSync(process.execPath, cmd, { cwd: root, windowsHide: true, stdio: ['ignore', fd, fd] });
    } finally {
      closeSync(fd);
    }
    if (result.error || result.status !== 0)
      throw new Error('QA FAILED; log: ' + logfile + '\n' + readFileSync(logfile, 'utf8').split('\n').slice(-30).join('\n'));
    process.stdout.write('[tdd] PASS; log: ' + logfile + '\n');
  }
}

function main() {
  const options = {};
  for (const arg of process.argv.slice(2).filter((value) => value !== '--')) {
    const cut = arg.indexOf('=');
    const key = cut < 0 ? arg : arg.slice(0, cut);
    if (!['--contract', '--baseline', '--ci', '--main-ref', '--dry-run', '--run'].includes(key) || key in options)
      throw new Error('Unknown/repeated TDD argument: ' + key);
    options[key] = cut < 0 ? true : arg.slice(cut + 1);
  }
  if (options['--ci']) {
    if ('--contract' in options || '--baseline' in options || '--run' in options || '--dry-run' in options)
      throw new Error('CI discovers the baseline automatically.');
    const mainRef = options['--main-ref'] ?? 'origin/main';
    const newFiles = paths(['diff', '--no-renames', '--name-only', '-z', mainRef + '...HEAD', '--']);
    const contracts = newFiles.filter((file) => contractName.test(file));
    if (contracts.length !== 1) throw new Error('Expected exactly one TDD contract in pull request.');
    const history = git(['log', '--reverse', '--format=%H', mainRef + '..HEAD', '--', contracts[0]])
      .split('\n').filter(Boolean);
    if (!history.length) throw new Error('Cannot find RED commit.');
    const checked = verify(contracts[0], history[0], mainRef);
    process.stdout.write('[tdd] CI scope PASS: ' + checked.spec.taskId + '\n');
    return;
  }
  if (typeof options['--contract'] !== 'string' || typeof options['--baseline'] !== 'string' ||
      (options['--run'] && options['--dry-run']))
    throw new Error('Use --contract=tdd/contracts/ID.json --baseline=<RED-SHA> [--run|--dry-run].');
  const checked = verify(options['--contract'], options['--baseline']);
  process.stdout.write('[tdd] Scope PASS; changed files: ' + checked.changed.length + '\n');
  if (options['--run'] || options['--dry-run']) {
    execute(checked.spec, Boolean(options['--dry-run']));
    if (options['--run']) verify(options['--contract'], options['--baseline']);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write('[tdd] BLOCKED: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
