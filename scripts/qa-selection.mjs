import { posix } from 'node:path';

const qaToolingPath = /^scripts\/(?:run-qa|qa-selection|qa-redaction|qa-visual-layout|access-control-integration-selection|tdd-guard)(?:\.test)?\.mjs$/u;
const levels = ['L0', 'L1', 'L2', 'L3'];

export function touchesQaTooling(files) {
  return files.some((file) => qaToolingPath.test(file.replaceAll('\\', '/')));
}

export function requiresApiConsumers(files) {
  return files.some((raw) => {
    const path = raw.replaceAll('\\', '/');
    return (
      path.startsWith('apps/api/prisma/') ||
      path.startsWith('apps/api/openapi/') ||
      /^apps\/api\/src\/.*\/(?:dto|contracts?|schemas?)\//u.test(path) ||
      /^apps\/api\/src\/.*\.(?:controller|dto|contract)\.[cm]?[jt]s$/u.test(path)
    );
  });
}

export function qaPlan(files, { risk = 'auto', journeys = [] } = {}) {
  if (risk !== 'auto' && !levels.includes(risk)) throw new Error('Risk must be auto, L0, L1, L2 or L3.');
  const validJourneys = ['managed', 'access-control', 'public-catalog', 'flipbook', 'guide'];
  if (journeys.some((item) => !validJourneys.includes(item))) throw new Error('Unknown QA journey.');
  const paths = files.map((file) => file.replaceAll('\\', '/'));
  let floor = 'L0';
  const updateFloor = (next) => {
    if (levels.indexOf(next) > levels.indexOf(floor)) floor = next;
  };
  for (const path of paths) {
    if (
      path.startsWith('apps/scanner/') ||
      path.startsWith('apps/api/prisma/') ||
      /^(?:apps\/(?:api|client|admin)\/src\/).*(?:auth|permissions?|roles?|security|finance|ledger|credits?|check.?in|scanner|access-control|qr)(?:\/|[.-])/iu.test(path)
    )
      updateFloor('L3');
    else if (
      path.startsWith('apps/api/') ||
      path.startsWith('packages/') ||
      (!path.startsWith('apps/') && !path.startsWith('docs/') && path !== 'README.md' && path !== 'AGENTS.md' && !path.startsWith('.agents/') && !path.startsWith('.codex/') && !path.startsWith('tdd/') && !path.endsWith('.md'))
    )
      updateFloor('L2');
    else if (/\.[cm]?[jt]sx?$/u.test(path) || (path.startsWith('apps/') && !/\.(?:css|scss|md)$/u.test(path))) updateFloor('L1');
  }
  const effective = levels[Math.max(levels.indexOf(floor), risk === 'auto' ? 0 : levels.indexOf(risk))];
  const required = [];
  if (effective === 'L3') {
    if (
      paths.some(
        (path) =>
          path.startsWith('apps/scanner/') ||
          path.startsWith('apps/api/prisma/') ||
          /auth|permissions?|roles?|security|check.?in|scanner|access-control|qr/iu.test(path)
      )
    ) {
      required.push('managed', 'access-control');
    }
    if (paths.some((path) => /finance|ledger|credits?|pricing|prisma/iu.test(path))) required.push('public-catalog');
    if (!required.length) required.push('managed');
  }
  return { requestedRisk: risk, floor, risk: effective, journeys: [...new Set([...required, ...journeys])] };
}


// Workspace edges come from package.json, including dev/optional dependencies.
export function selectWorkspaces(workspaces, files, { includeApiConsumers = true } = {}) {
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const owners = new Set();
  let global = false;
  for (const raw of files) {
    const file = raw.replaceAll('\\', '/');
    if (file.startsWith('/') || /^[A-Za-z]:/u.test(file) || file.split('/').includes('..'))
      throw new Error('QA paths must be relative to the repository.');
    const owner = workspaces.find((workspace) => file.startsWith(`${workspace.path}/`));
    if (owner) owners.add(owner.name);
    else if (!file.startsWith('docs/') && !file.endsWith('.md') && !file.startsWith('.codex/') && !file.startsWith('.agents/') && !file.startsWith('tdd/') && !qaToolingPath.test(file)) global = true;
  }
  const affected = new Set(global ? byName.keys() : owners);
  // The generated API client is a contract consumer of the API, not a workspace import.
  if (includeApiConsumers && affected.has('@invitaciones/api')) affected.add('@invitaciones/api-client');
  let changed = true;
  while (changed) {
    changed = false;
    for (const workspace of workspaces) {
      if (!affected.has(workspace.name) && workspace.dependencies.some((name) => affected.has(name))) {
        affected.add(workspace.name);
        changed = true;
      }
    }
  }
  const selected = new Set(affected);
  function addDependencies(name) {
    for (const dependency of byName.get(name)?.dependencies ?? []) {
      if (!byName.has(dependency) || selected.has(dependency)) continue;
      selected.add(dependency);
      addDependencies(dependency);
    }
  }
  for (const name of affected) addDependencies(name);
  return { global, owners: [...owners].sort(), affected: [...affected].sort(), selected: [...selected].sort() };
}

export function quickRelatedFiles(workspace, files, selection) {
  // Shared/config/contract changes need full consumers; static related analysis is only
  // used for a directly changed app's source files. No passWithNoTests escape hatch.
  if (selection.global || !selection.owners.includes(workspace.name) || !workspace.path.startsWith('apps/'))
    return null;
  const own = files.filter((file) => file.startsWith(`${workspace.path}/`));
  if (!own.length || own.some((file) => !/^src\/.*\.[cm]?[jt]sx?$/u.test(posix.relative(workspace.path, file))))
    return null;
  return own.map((file) => posix.relative(workspace.path, file));
}
