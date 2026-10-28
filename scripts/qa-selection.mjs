import { posix } from 'node:path';

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
    else if (!file.startsWith('docs/') && !file.endsWith('.md')) global = true;
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
