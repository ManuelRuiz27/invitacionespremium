import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const API_PREFIX = '/api/v1';

export async function verifyOpenApiRoutes({ sourceRoot, openapiPath, apiPrefix = API_PREFIX }) {
  const [files, rawDocument] = await Promise.all([listSourceFiles(sourceRoot), readFile(openapiPath, 'utf8')]);
  const document = JSON.parse(rawDocument);
  const openapi = collectOpenApiOperations(document, apiPrefix);
  const routes = [];
  const issues = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const result = extractApiRequesterRoutes(source, file, sourceRoot);
    routes.push(...result.routes);
    issues.push(...result.issues);
  }

  for (const route of routes) {
    const availableMethods = openapi.byPath.get(route.path);
    if (!availableMethods) {
      issues.push({ ...route, reason: 'ruta inexistente' });
    } else if (!availableMethods.has(route.method)) {
      issues.push({
        ...route,
        reason: `método inexistente (OpenAPI: ${[...availableMethods].sort().join(', ')})`
      });
    }
  }

  routes.sort(compareDiagnostics);
  issues.sort(compareDiagnostics);
  return {
    ok: issues.length === 0,
    checkedRoutes: routes.length,
    openapiOperations: openapi.operationCount,
    routes,
    issues
  };
}

export function formatVerificationResult(result) {
  if (result.ok) {
    return `Verified ${result.checkedRoutes} API client routes against ${result.openapiOperations} OpenAPI operations.`;
  }

  return [
    `API client route verification failed with ${result.issues.length} issue(s):`,
    ...result.issues.map(
      (issue) =>
        `${issue.file}:${issue.line}:${issue.column} ${issue.method ?? 'UNKNOWN'} ${issue.path ?? '<unresolved>'} — ${issue.reason}`
    )
  ].join('\n');
}

function extractApiRequesterRoutes(source, file, sourceRoot) {
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const context = buildSourceContext(sourceFile);
  const routes = [];
  const issues = [];

  for (const requestCall of context.requestCalls) {
    const direct = extractRequestCall(requestCall, new Map(), context, requestCall);
    if (direct.ok) {
      routes.push(...toDiagnostics(direct.routes, file, sourceRoot, sourceFile, requestCall));
      continue;
    }

    const expanded = expandThroughContainingHelper(requestCall, context);
    if (expanded.ok) {
      for (const item of expanded.items) {
        routes.push(...toDiagnostics(item.routes, file, sourceRoot, sourceFile, item.location));
      }
      continue;
    }

    const location = sourceFile.getLineAndCharacterOfPosition(requestCall.getStart(sourceFile));
    issues.push({
      file: normalizeFile(relative(sourceRoot, file)),
      line: location.line + 1,
      column: location.character + 1,
      method: direct.method,
      path: direct.path,
      reason: `path no resoluble: ${expanded.reason ?? direct.reason}`
    });
  }

  return { routes, issues };
}

function buildSourceContext(sourceFile) {
  const requesterNames = new Set();
  const requesterTypeNames = collectRequesterTypeNames(sourceFile);
  const bindings = new Map();
  const functions = [];
  const callExpressions = [];

  const visit = (node) => {
    if (ts.isParameter(node) && isRequesterType(node.type, requesterTypeNames) && ts.isIdentifier(node.name)) {
      requesterNames.add(node.name.text);
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isRequesterType(node.type, requesterTypeNames)) requesterNames.add(node.name.text);
      addBinding(bindings, node.name.text, {
        node,
        initializer: node.initializer,
        scope: findLexicalScope(node)
      });
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        functions.push(createFunctionInfo(node.name.text, node.initializer, node, findLexicalScope(node)));
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.push(createFunctionInfo(node.name.text, node, node, findLexicalScope(node)));
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) callExpressions.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const context = { sourceFile, requesterNames, bindings, functions, callExpressions, requestCalls: [] };
  context.requestCalls = callExpressions.filter(
    (call) => ts.isIdentifier(call.expression) && requesterNames.has(call.expression.text)
  );
  return context;
}

function collectRequesterTypeNames(sourceFile) {
  const names = new Set(['ApiRequester']);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings) continue;
    if (!ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === 'ApiRequester') names.add(element.name.text);
    }
  }
  return names;
}

function isRequesterType(type, requesterTypeNames) {
  return Boolean(
    type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && requesterTypeNames.has(type.typeName.text)
  );
}

function createFunctionInfo(name, fn, declaration, scope) {
  return {
    name,
    fn,
    declaration,
    scope,
    parameters: fn.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? parameter.name.text : null)),
    returnExpression: getReturnExpression(fn)
  };
}

function getReturnExpression(fn) {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return null;
  for (const statement of body.statements) {
    if (ts.isReturnStatement(statement)) return statement.expression ?? null;
  }
  return null;
}

function expandThroughContainingHelper(requestCall, context) {
  const containing = context.functions
    .filter((candidate) => contains(candidate.fn, requestCall) && candidate.returnExpression)
    .sort((left, right) => span(left.fn) - span(right.fn));

  for (const helper of containing) {
    const callers = context.callExpressions.filter(
      (call) =>
        ts.isIdentifier(call.expression) &&
        call.expression.text === helper.name &&
        resolveFunction(helper.name, call, context) === helper
    );
    if (callers.length === 0) continue;

    const items = [];
    let failure = null;
    for (const caller of callers) {
      const environment = bindArguments(helper.parameters, caller.arguments);
      const extracted = extractRequestCall(requestCall, environment, context, caller);
      if (!extracted.ok) {
        failure = extracted.reason;
        break;
      }
      items.push({ routes: extracted.routes, location: caller });
    }
    if (!failure) return { ok: true, items };
  }

  return { ok: false };
}

function extractRequestCall(call, environment, context, location) {
  const optionsExpression = call.arguments[0];
  if (!optionsExpression) return { ok: false, reason: 'falta el objeto ApiRequest' };

  const optionStates = evaluateOptions(optionsExpression, environment, context, new Set());
  if (!optionStates.ok) return { ok: false, reason: optionStates.reason };

  const routes = [];
  for (const state of optionStates.values) {
    const methodResult = state.method ? evaluateMethod(state.method, environment, context) : { ok: true, value: 'GET' };
    if (!methodResult.ok) return { ok: false, reason: methodResult.reason };
    if (!state.path) {
      return { ok: false, method: methodResult.value, reason: 'el objeto ApiRequest no contiene path' };
    }
    const paths = evaluatePath(state.path, environment, context, new Set());
    if (!paths.ok) return { ok: false, method: methodResult.value, reason: paths.reason };
    for (const path of paths.values) {
      const normalized = normalizeRoutePath(path);
      if (!normalized) {
        return { ok: false, method: methodResult.value, path, reason: 'el path debe ser absoluto' };
      }
      routes.push({ method: methodResult.value, path: normalized, location });
    }
  }

  return {
    ok: true,
    routes: uniqueBy(routes, (route) => `${route.method} ${route.path}`)
  };
}

function evaluateOptions(expression, environment, context, seen) {
  const node = unwrap(expression);
  if (seen.has(node)) return { ok: false, reason: 'referencia circular en ApiRequest' };
  const nextSeen = new Set(seen).add(node);

  if (ts.isIdentifier(node)) {
    const mapped = environment.get(node.text);
    if (mapped) return evaluateOptions(mapped, environment, context, nextSeen);
    const binding = resolveBinding(node.text, node, context);
    if (binding) return evaluateOptions(binding.initializer, environment, context, nextSeen);
    return { ok: false, reason: `objeto ApiRequest dinámico: ${node.text}` };
  }

  if (ts.isConditionalExpression(node)) {
    const left = evaluateOptions(node.whenTrue, environment, context, nextSeen);
    const right = evaluateOptions(node.whenFalse, environment, context, nextSeen);
    if (!left.ok) return left;
    if (!right.ok) return right;
    return { ok: true, values: uniqueOptionStates([...left.values, ...right.values]) };
  }

  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const helper = resolveFunction(node.expression.text, node, context);
    if (!helper?.returnExpression) return { ok: false, reason: `helper no resoluble: ${node.expression.text}` };
    return evaluateOptions(
      helper.returnExpression,
      mergeEnvironments(environment, bindArguments(helper.parameters, node.arguments)),
      context,
      nextSeen
    );
  }

  if (!ts.isObjectLiteralExpression(node)) return { ok: false, reason: 'ApiRequest no es un objeto resoluble' };

  let states = [{}];
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property)) {
      const name = propertyName(property.name);
      if (name === 'path' || name === 'method') {
        states = states.map((state) => ({ ...state, [name]: property.initializer }));
      }
      continue;
    }
    if (ts.isSpreadAssignment(property)) {
      const spread = evaluateOptions(property.expression, environment, context, nextSeen);
      if (!spread.ok) return spread;
      states = states.flatMap((state) =>
        spread.values.map((spreadState) => ({
          ...state,
          ...(spreadState.path ? { path: spreadState.path } : {}),
          ...(spreadState.method ? { method: spreadState.method } : {})
        }))
      );
    }
  }
  return { ok: true, values: uniqueOptionStates(states) };
}

function evaluateMethod(expression, environment, context) {
  const values = evaluatePath(expression, environment, context, new Set());
  if (!values.ok || values.values.length !== 1) return { ok: false, reason: 'método HTTP no resoluble' };
  const method = values.values[0].toUpperCase();
  if (!HTTP_METHODS.includes(method)) return { ok: false, reason: `método HTTP no soportado: ${method}` };
  return { ok: true, value: method };
}

function evaluatePath(expression, environment, context, seen) {
  const node = unwrap(expression);
  if (seen.has(node)) return { ok: false, reason: 'referencia circular en path' };
  const nextSeen = new Set(seen).add(node);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { ok: true, values: [node.text] };
  }

  if (ts.isIdentifier(node)) {
    const mapped = environment.get(node.text);
    if (mapped) return evaluatePath(mapped, environment, context, nextSeen);
    const binding = resolveBinding(node.text, node, context);
    if (binding) return evaluatePath(binding.initializer, environment, context, nextSeen);
    return { ok: false, reason: `identificador dinámico sin normalización: ${node.text}` };
  }

  if (ts.isConditionalExpression(node)) {
    const left = evaluatePath(node.whenTrue, environment, context, nextSeen);
    const right = evaluatePath(node.whenFalse, environment, context, nextSeen);
    if (!left.ok) return left;
    if (!right.ok) return right;
    return { ok: true, values: unique([...left.values, ...right.values]) };
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluatePath(node.left, environment, context, nextSeen);
    if (!left.ok) return left;
    if (left.values.every((value) => value.includes('?'))) return left;
    const right = evaluatePath(node.right, environment, context, nextSeen);
    if (!right.ok) return right;
    return { ok: true, values: combine(left.values, right.values) };
  }

  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const spanNode of node.templateSpans) {
      if (values.every((value) => value.includes('?'))) break;
      const part = evaluatePath(spanNode.expression, environment, context, nextSeen);
      if (!part.ok) return part;
      values = combine(values, part.values).map((value) => `${value}${spanNode.literal.text}`);
    }
    return { ok: true, values: unique(values) };
  }

  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === 'encodeURIComponent') {
      return { ok: true, values: ['{}'] };
    }
    if (ts.isIdentifier(node.expression)) {
      const alias = resolveBinding(node.expression.text, node, context);
      if (
        alias &&
        ts.isIdentifier(unwrap(alias.initializer)) &&
        unwrap(alias.initializer).text === 'encodeURIComponent'
      ) {
        return { ok: true, values: ['{}'] };
      }
      const helper = resolveFunction(node.expression.text, node, context);
      if (!helper?.returnExpression)
        return { ok: false, reason: `helper de path no resoluble: ${node.expression.text}` };
      return evaluatePath(
        helper.returnExpression,
        mergeEnvironments(environment, bindArguments(helper.parameters, node.arguments)),
        context,
        nextSeen
      );
    }
    return { ok: false, reason: `llamada dinámica en path: ${node.expression.getText(context.sourceFile)}` };
  }

  return { ok: false, reason: `expresión de path no soportada: ${node.getText(context.sourceFile)}` };
}

function collectOpenApiOperations(document, apiPrefix) {
  if (!document || typeof document !== 'object' || !document.paths || typeof document.paths !== 'object') {
    throw new TypeError('OpenAPI document.paths is required.');
  }
  const byPath = new Map();
  let operationCount = 0;
  for (const [rawPath, pathItem] of Object.entries(document.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const path = normalizeOpenApiPath(rawPath, apiPrefix);
    const methods = new Set();
    for (const method of HTTP_METHODS) {
      if (Object.hasOwn(pathItem, method.toLowerCase())) {
        methods.add(method);
        operationCount += 1;
      }
    }
    if (methods.size > 0) byPath.set(path, methods);
  }
  return { byPath, operationCount };
}

function normalizeOpenApiPath(path, apiPrefix) {
  const withoutPrefix =
    path === apiPrefix ? '/' : path.startsWith(`${apiPrefix}/`) ? path.slice(apiPrefix.length) : path;
  return normalizeRoutePath(withoutPrefix.replace(/\{[^/{}]+\}/g, '{}'));
}

function normalizeRoutePath(path) {
  const route = path.split('?')[0];
  if (!route.startsWith('/')) return null;
  return route.replace(/\{[^/{}]+\}/g, '{}');
}

async function listSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      const directoryName = entry.name.toLowerCase().replace(/^__|__$/g, '');
      if (['generated', 'fixture', 'fixtures', 'mock', 'mocks'].includes(directoryName)) continue;
      files.push(...(await listSourceFiles(fullPath)));
    } else if (
      entry.isFile() &&
      /\.(?:[cm]?ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/(?:fixture|mock)/i.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveBinding(name, useNode, context) {
  const candidates = context.bindings.get(name) ?? [];
  return candidates
    .filter((candidate) => candidate.node.pos < useNode.pos && contains(candidate.scope, useNode))
    .sort((left, right) => span(left.scope) - span(right.scope))[0];
}

function resolveFunction(name, useNode, context) {
  return context.functions
    .filter(
      (candidate) =>
        candidate.name === name &&
        (ts.isFunctionDeclaration(candidate.declaration) || candidate.declaration.pos < useNode.pos) &&
        contains(candidate.scope, useNode)
    )
    .sort((left, right) => span(left.scope) - span(right.scope))[0];
}

function findLexicalScope(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current) && !ts.isBlock(current)) current = current.parent;
  return current ?? node.getSourceFile();
}

function addBinding(bindings, name, binding) {
  const current = bindings.get(name) ?? [];
  current.push(binding);
  bindings.set(name, current);
}

function bindArguments(parameters, argumentsList) {
  const environment = new Map();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    const argument = argumentsList[index];
    if (parameter && argument) environment.set(parameter, argument);
  }
  return environment;
}

function mergeEnvironments(parent, child) {
  return new Map([...parent, ...child]);
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function combine(left, right) {
  return unique(left.flatMap((leftValue) => right.map((rightValue) => `${leftValue}${rightValue}`)));
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueBy(values, key) {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function uniqueOptionStates(states) {
  return uniqueBy(states, (state) => `${state.method?.pos ?? ''}:${state.path?.pos ?? ''}`);
}

function contains(container, node) {
  return container.pos <= node.pos && node.end <= container.end;
}

function span(node) {
  return node.end - node.pos;
}

function toDiagnostics(routes, file, sourceRoot, sourceFile, defaultLocation) {
  return routes.map((route) => {
    const locationNode = route.location ?? defaultLocation;
    const location = sourceFile.getLineAndCharacterOfPosition(locationNode.getStart(sourceFile));
    return {
      file: normalizeFile(relative(sourceRoot, file)),
      line: location.line + 1,
      column: location.character + 1,
      method: route.method,
      path: route.path
    };
  });
}

function normalizeFile(file) {
  return file.split(sep).join('/');
}

function compareDiagnostics(left, right) {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    String(left.method).localeCompare(String(right.method)) ||
    String(left.path).localeCompare(String(right.path)) ||
    String(left.reason).localeCompare(String(right.reason))
  );
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const result = await verifyOpenApiRoutes({
    sourceRoot: resolve(scriptDirectory, '../src'),
    openapiPath: resolve(scriptDirectory, '../../../apps/api/openapi/openapi.json')
  });
  console.log(formatVerificationResult(result));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
