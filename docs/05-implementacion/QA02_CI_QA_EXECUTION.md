# QA02 ? Ejecuci?n de CI y QA

Cambio de ejecuci?n/configuraci?n, sin modificar contratos, dominio, assertions, fixtures,
umbrales DT09, workers de integraci?n ni configuraci?n Vitest/Playwright.

## L?nea base medida

Referencia: [CI 40564463539](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/40564463539),
commit `0191d9c03048eb0eb882085d5927b8f79f2e61d8`.
Tiempos obtenidos de la API Actions (`createdAt`, `startedAt`, `completedAt` y steps),
con resoluci?n de un segundo. Tiempo total desde creaci?n hasta conclusi?n: **17:39**.

| Job anterior | Duraci?n del job | Etapas principales |
|---|---:|---|
| quality | 17:36 | Integraci?n 7:40; unidades 7:27; typecheck 0:39; build 0:18 |
| pilot-browser-qa | 6:04 | M01 1:12; M02 0:52; PR01/PR02 0:56; gu?as 0:40; Chromium 0:23 |
| flipbook-browser-qa | 5:43 | Playwright 4:24, con ambos motores y dos workers |

Los tres mayores bloques son integraci?n, unidades serializadas y Flipbook. En unidades,
Admin tom? 225.87 s y Client 150.83 s de Vitest; el resto sum? aproximadamente un minuto.
La fase serial no permit?a solapar los 7:40 de integraci?n con los 7:27 de unidades.

## Configuraci?n aplicada

- `checks`: formato/tooling/lint temprano; Prisma/migraciones, generaci?n OpenAPI real,
  drift del SDK, rutas tipadas, typecheck y todos los builds.
- `api-integration`: runner y servicio PostgreSQL propios; una base ef?mera del harness,
  los 37 archivos en serie y un worker. DT09 conserva 150 scans, dos lectores y 1,500 ms;
  no se ejecuta otro build, unidad ni navegador mientras corren sus cargas.
- `unit-tests`: matriz Admin, Client y resto. La uni?n cubre exactamente los ocho workspaces;
  s?lo los builds de dependencias pueden repetirse entre runners. Cada grupo conserva
  `--concurrency=1` y cada suite conserva su configuraci?n de workers y timeouts.
- `pilot-browser-qa` y `flipbook-browser-qa`: conservan sus journeys, motores, l?mites,
  redacci?n y evidencia. No se comparten bases, puertos ni ficheros entre runners.
- `quality`: mantiene el nombre hist?rico y espera todos los grupos anteriores con
  `if: always()`. S?lo pasa si todos terminan en `success`, incluidas todas las entradas
  de la matriz. Fallo, cancelaci?n u omisi?n producen fallo. Hay una prueba que ejecuta
  la expresi?n real del gate con esos escenarios. Los checks hist?ricos de navegador
  conservan sus nombres. No se modifica protecci?n de ramas ni reglas de repositorio.

Todos los jobs de trabajo arrancan independientemente. La predicci?n basada en la l?nea
base sit?a la ruta cr?tica cerca de integraci?n (unos ocho minutos m?s preparaci?n y
el gate); la reducci?n real s?lo se declara al comprobar la ejecuci?n remota final.

## Cach?s y generaci?n

- Se conserva la cach? pnpm de `setup-node`, indexada por `pnpm-lock.yaml`.
- `actions/cache` persiste `.turbo` por OS, arquitectura, job, grupo de unidades,
  lockfile y commit. El restore por prefijo s?lo recupera entradas candidatas;
  Turbo valida cada entrada con su hash de contenido antes de usarla.
- Build, lint y typecheck son cacheables. Los hashes incluyen c?digo y dependencias
  transitivas, lockfile, manifiestos, configuraci?n ra?z TypeScript/ESLint/Prettier,
  versi?n Node, variables declaradas, archivos `.env`, Prisma/migraciones y OpenAPI.
  Los `VITE_*` siguen participando en el hash de build.
- Los tests unitarios se ejecutan siempre (`test.cache=false`). Integraci?n y E2E
  se invocan directamente, sin cach? de resultados. La cach? no evita ning?n test.
- Se elimina la escritura previa redundante del SDK: `generate:check` ya genera
  determin?sticamente y compara con el schema versionado; se conserva tambi?n
  `git diff --exit-code` y el verificador de rutas. OpenAPI se genera en cada `checks`.
- Prisma se conserva expl?cito en los scripts de API. Sus dos segundos por invocaci?n
  no justifican quitar una garant?a de arranque para una optimizaci?n marginal.
- Los builds de dependencias se reutilizan dentro de cada job mediante Turbo;
  no se a?ade una etapa compartida de artefactos que bloquear?a todos los runners.
- No se cambia la preparaci?n de Playwright: los 23 s de Chromium no dominan la ruta
  cr?tica, y una imagen adicional no tiene un beneficio medido para este job.

La primera ejecuci?n no demuestra mejora de una cach? Actions caliente: puede ser fr?a.
El ahorro principal debe sostenerse aun con cach? fr?a, por separaci?n de runners.

## Comandos locales

```bash
pnpm qa:quick
pnpm qa:quick -- --files=apps/client/src/workspace/access-control/AccessOperationsPanel.tsx
pnpm qa:focused -- --files=apps/scanner/src/App.tsx
pnpm qa:focused -- --base=HEAD~1
pnpm qa:full
pnpm qa:focused -- --files=apps/scanner/src/App.tsx --dry-run
```

Por defecto se incluyen staged/unstaged/deleted y archivos nuevos desde HEAD.
`--base` incluye commits desde merge-base m?s cambios locales y archivos nuevos.
Tras hacer commit, usar `--base=HEAD~1` para revisar ese commit. `--files` es una
selecci?n expl?cita de rutas relativas; citar el argumento con comas en PowerShell.

R?pido ejecuta formato de archivos seleccionados existentes y tests/lint de tooling, lint/typecheck de workspaces
seleccionados y unidades relacionadas con las fuentes de app modificadas. Un cambio
compartido incluye consumidores transitivos y sus suites completas; los cambios de
configuraci?n global incluyen todos los workspaces. No se permite aceptar una selecci?n
Vitest vac?a. El an?lisis `related` sigue imports est?ticos: usar focalizado para cambios
con dependencias din?micas o comportamiento transversal.

Focalizado ejecuta suites completas de los workspaces afectados y dependencias reales,
builds y journeys aplicables. La selecci?n usa los manifests existentes; API tiene adem?s
una arista expl?cita hacia su contrato generado en `api-client` en modo focalizado.
El modo r?pido de API comprueba sus unidades relacionadas; el contrato generado y sus
consumidores se comprueban en focalizado/completo. Para cambios API, la
integraci?n completa es deliberadamente conservadora: los archivos comparten estado
mutable, imports de m?dulos y resets de PostgreSQL. Para iterar un m?dulo API concreto,
se conservan los selectores aislados existentes del README (PERF01 A/B).

Completo no admite filtros y cubre todos los controles de CI. Ejecuta fases secuenciales
para no contaminar DT09 en una sola m?quina; GitHub logra el paralelismo mediante runners
independientes. OpenAPI usa su propia base ef?mera, sin migrar la base compartida. Requiere
PostgreSQL local con permiso CREATE DATABASE, browsers instalados y los puertos del README.
Cada comando registra su duraci?n y falla al primer error. Un dry-run imprime el plan y
explicita que no ejecut? validaciones. `pnpm ci` conserva su alcance hist?rico reducido.

## Validaci?n local de este corte

`pnpm qa:full` termin? aprobado en **2265.25 s (37:45.25)** en Windows/Node 22.18.0:
1,572 unidades Vitest, nueve comprobaciones Node del SDK, 471 integraciones en 37
archivos, ocho builds, M01/PHYSICAL_QR 4/4, ACCESS_CONTROL 3/3, PR01/PR02 2/2,
Flipbook 74/74 en Chromium/WebKit y gu?as verificadas/renderizadas (39 PNG; 14/21/2 p?ginas).
El tiempo local no se compara con el hardware de GitHub Actions.

Los chequeos focalizados finales incluyeron 18 tests de tooling y los 425 casos unitarios
API con una URL en puerto 1, sin servidor PostgreSQL accesible: generaci?n Prisma y
unidades pasaron. El modo r?pido sobre `apps/client/src/server/invitation-preview.ts`
termin? en **14.32 s**, con 17 tests relacionados y cach?s est?ticas calientes; no equivale
al alcance de QA completo. Su formato seleccionado tom? **0.79 s**, frente a **13.25 s**
del formato global conservado en QA completo. Los ocho probes de hashes verificaron
invalidaci?n real ante cambios de configuraci?n, Node, Prisma, OpenAPI, manifiestos,
lockfile, c?digo compartido y variables Vite; restauraron los bytes originales.

## Evidencia final y l?mites

El informe de esta ejecuci?n y JSON/logs originales se conservan en
`var/qa/qa02/REPORT.md` y `var/qa/qa02-*` (artefactos locales ignorados).
Incluyen comparaci?n antes/despu?s, duraciones por job, recuentos, hashes y enlace al
?nico push de validaci?n. El informe final debe distinguir mediciones de estimaciones.

El paralelismo aumenta minutos agregados y demanda de runners aunque reduzca la espera.
Cuotas y cola de Actions pueden limitar el ahorro observado. Una ejecuci?n verde prueba
este commit; no demuestra una tasa hist?rica de flakiness de cero. No se aumenta
concurrencia dentro de tests que mutan estado. No se promete SLA de producci?n ni se
sustituye QA f?sica de Scanner. M01, M02, PR01, PR02 y los 74 casos Flipbook se conservan.
