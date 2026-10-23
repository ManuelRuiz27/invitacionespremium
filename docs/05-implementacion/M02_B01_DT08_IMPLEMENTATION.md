# M02-B01-DT08 — Implementación y QA reproducible

Fecha: 2026-10-23. Base: `6425b98` en main, con DT07 funcional `0346250` y su revisión.
Alcance: panel operativo ACCESS_CONTROL NOMINAL/ANONYMOUS. DT09 y gate de lanzamiento pendientes.

## Resolver y superficies

`apps/api/src/access-control-operations/` incorpora DTOs OpenAPI, dos controladores y un servicio
registrado en EventsModule. PostgreSQL calcula resumen, históricos, Mesas y detalle mediante CTE,
dentro de una transacción RepeatableRead/READ ONLY que incluye ownership y privacidad. No toma locks
de filas, no toca readiness ni genera auditoría, Ledger, Receipt o GeneratedReport. No hay migración.

- Organización: `GET /events/:eventId/access-operations?page=1`, sólo Organization Admin del tenant
  y Organization Planner actualmente asignado, mediante EventAccessPolicy/eventOwnedWhere.
- Provider: `GET /admin/clients/:clientId/events/:eventId/access-operations`, sólo Platform Admin
  real, clientId nulo, usuario vigente y tenant/Evento exactos. Resumen y Mesas, sin detalle ni nombres.
- Historial conservado en CLOSED/CANCELLED/ARCHIVED dentro de acceso y privacidad existentes;
  no disponible para legacy, independientes o Staff. Evento ajeno/eliminado devuelve 404.

Definiciones exactas, errores y privacidad:
[ACCESS_CONTROL_OPERATIONS_CONTRACT.md](../04-tecnico/ACCESS_CONTROL_OPERATIONS_CONTRACT.md).

| Cifra | Definición |
| --- | --- |
| Capacidad | Event.capacity; nullable sólo cuando aún falta configurar y no existen derechos |
| Emitidos históricos | Todas las credenciales NOMINAL o todos los pases ANONYMOUS, incluidos revocados |
| Revocados históricos | Material histórico con revokedAt |
| Vigentes | Assistant UUID distintos elegibles con credencial vigente; o pases no revocados |
| Ingresados | Derechos vigentes con CheckIn no revertido; o pases vigentes con usedAt |
| Pendientes | Vigentes − ingresados |
| Disponible | Capacidad − vigentes, cupo para emitir nuevos derechos |

No se mezclan modalidades, contactos ni RSVP. Nombres repetidos no se deduplican. Revocación libera
derechos; reemisión no duplica personas; reversión retira únicamente el ingreso. Identidades borradas
o anonimizadas no son vigentes ni se reconstruyen desde snapshots. CheckIn activo sin derecho válido,
sobrecupo o asignación incoherente produce 409 seguro, sin cifras aparentemente conciliadas.

Cada Mesa activa del Croquis vigente tiene capacidad, derechos, ingresados, pendientes y disponibles.
El ingreso sigue la asignación actual del derecho, incluso tras reasignación. En SEAT se valida lugar
activo/no bloqueado y capacidad derivada. ANONYMOUS sólo TABLE. Mesas vacías incluidas; sin Croquis
no se inventan Mesas. Evento/Mesas satisfacen aritmética y conciliación del contrato.

## Client, Admin y SDK

Client añade **Ingresos y aforo** al workspace B01: cuatro cifras destacadas, capacidad/históricos,
Mesas y detalle por persona o folio. Búsqueda/filtros locales no modifican totales globales. Historial
anónimo paginado a 150 filas, porque las revocaciones pueden superar 150 folios históricos manteniendo
el máximo certificado de derechos. NOMINAL incluye sólo nombre actual, grupo, Mesa/Lugar e ingreso;
ANONYMOUS sólo folio, Mesa, estado y uso. No hay CheckIn manual ni exportaciones nuevas.

Admin consulta agregados desde el detalle ACCESS_CONTROL, con interfaz M01 preservada. Ambos paneles
usan consultas abortables por Evento/modalidad, foco, montaje, actualización manual y asOf PostgreSQL.
Polling de 10 segundos sólo operativo, detenido con respuesta terminal. Client invalida REST ante
señales realtime existentes, sin sumar deltas. PhysicalPass conserva su polling de respaldo.

Red/5xx conserva una lectura marcada desactualizada. Errores autoritativos ocultan el snapshot y
bloquean su versión cacheada: un error transitorio posterior o remontar el panel no vuelve a mostrar
datos retirados. Sólo una lectura exitosa nueva libera esa barrera. Client aplica la barrera a todas
las páginas del Evento/modalidad y aborta páginas concurrentes. Nunca persiste material en Web Storage.

SDK: `events.getAccessOperations(eventId,signal?,page=1)` y
`adminEventPreparation.getAccessOperations(clientId,eventId,signal?)`. DTOs del OpenAPI regenerado;
requester y ApiError actuales, credentials include, sin Idempotency-Key. Validadores estrictos de
claves, modalidad, fechas, paginación, unicidad, aritmética y conciliación; rechazan PII extra y
detalle accidental en Provider. OpenAPI publica oneOf discriminado.

## Reproducción segura

Las integraciones destruyen fixtures; ejecutarlas únicamente mediante el harness aislado. No apuntar
las suites directamente a `.env` ni a la base de trabajo. El harness crea su propia base/storage,
aplica migraciones y elimina exclusivamente recursos propios. No imprime la conexión ni secretos.

```powershell
pnpm --filter @invitaciones/api db:validate
pnpm --filter @invitaciones/api db:generate
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate
pnpm --filter @invitaciones/api-client generate:check
pnpm --filter @invitaciones/api-client verify:openapi-routes
pnpm lint
pnpm typecheck
pnpm --filter @invitaciones/api exec vitest run --config vitest.config.ts --pool=threads --maxWorkers=1
pnpm --filter @invitaciones/api-client test
pnpm --filter @invitaciones/admin exec vitest run --pool=threads --maxWorkers=1 --reporter=verbose
pnpm --filter @invitaciones/client exec vitest run --pool=threads --maxWorkers=1 --reporter=verbose
pnpm test:e2e:access-control -- --integration-only '--integration-files=access-control-operations'
pnpm test:e2e:access-control -- --integration-only
pnpm test:e2e:access-control
pnpm build
pnpm exec playwright test --config playwright.flipbook.config.ts --workers=1
```

El E2E usa 5300/5373/5374/5375 y una base efímera, activación real Provider, SVG/PDF, Staff y cámara
virtual que entrega píxeles al lector real. No intercepta HTTP. Verifica cifras del panel y REST antes
y después del ingreso en ambas modalidades, refresh, Provider sin detalles y outsider 404. Deshabilita
traza/vídeo/screenshots para no almacenar QR/Staff. Las suites UI usan un worker para limitar presión
de recursos en Windows; el detalle de resultados finales se completa tras las ejecuciones.

## Evidencia de cálculo, seguridad y concurrencia

Las **34 integraciones nuevas** pasaron con PostgreSQL real. Cubren vacío/capacidad no configurada,
emisión, ingresos parciales/completos, reemisión, reversión, duplicados, eliminación/anonimización,
folios revocados intermedios, TABLE/SEAT, varias Mesas y Mesa llena, terminales, corrupción explícita,
paginación de 151 históricos/150 derechos, ownership/reasignación/cross-tenant, legacy y retención.

Ocho gates dentro de auditorías retienen transacciones escritoras de scan nominal/anónimo, revocación
nominal/anónima, reversión, reasignación y cierre nominal/anónimo. El panel responde antes de liberar
el escritor, con el snapshot anterior íntegro; después muestra el commit nuevo. Dos gates adicionales
establecen el snapshot del lector y permiten que scan confirme antes de la proyección: resumen y
detalle siguen perteneciendo a la fotografía anterior. Cuatro carreras con dos Staff prueban QR
iguales/diferentes por modalidad, contención PostgreSQL real y único ingreso por derecho.

Privacidad: no hay teléfonos, QR, nonces, firmas, Staff o Finance en proyecciones. Provider jamás
recibe detalles. Las ventanas existentes de Reports se verifican con reloj PostgreSQL, incluso si
anonimización se retrasa: nominal Client 410 desde 30 días y ambas superficies 410 desde seis meses.
No se usa GeneratedReport. Las lecturas no escriben preparación, auditoría ni artefactos financieros.

## Resultados y límites de entorno

| Comprobación | Resultado local |
| --- | --- |
| Prisma validate/generate | Esquema válido y generación ejecutada; sin migraciones nuevas |
| OpenAPI/SDK | Generación oficial coherente; 181 rutas SDK contra 205 operaciones OpenAPI |
| Lint / typecheck / build globales finales | **8/8**, **11/11**, **8/8** tareas aprobadas |
| Formato de código modificado | Prettier aprobado; Markdown y código generado excluidos por la configuración vigente |
| API unitarias | 381/381, 61 archivos |
| SDK | 150/150 unitarias y 9/9 del verificador Node |
| Integración específica DT08 | 34/34 con PostgreSQL real |
| Integración API completa sobre código final | **447/447**, 35 archivos, 654.44 s, sin otras suites pesadas |
| Client nuevo panel + realtime | 35/35; incluye las secuencias de privacidad 403/409/410 → red → éxito |
| Admin panel + detalle | 37/37; incluye 24 pruebas nuevas del panel y 2 del detalle |
| Client global | 432/433; el caso de 200 Mesas agotó 30 s bajo carga y pasó 1/1 al aislarlo sin cambios |
| Admin global | 240/242; dos pruebas previas fallaron por selectores no disponibles dentro del timeout |
| Scanner / UI / Floorplan / Landing | 62/62, 6/6, 100/100, 60/60 |
| E2E B01 real | 2/2: NOMINAL y ANONYMOUS con contadores antes/después de cámara/HTTP reales |

La primera integración API completa pasó **447/447** antes de la última corrección de privacidad UI
(mismo código API). La repetición sobre el código final terminó **446/447**: el beforeEach de
`Realtime Socket.IO > authorizes Staff exclusively from its token and returns prioritized stable errors`
agotó el límite de 60 segundos (`test/realtime.integration-spec.ts:86`). Otra ejecución atravesó pausas
temporales de decenas de minutos dentro de Socket.IO, perdió cuatro casos de ese archivo y se
interrumpió; no se usa como gate. Se repite íntegra sin otras suites pesadas y evitando suspensión
por inactividad durante esa ejecución. Esta última ejecución terminó **447/447**, incluyendo todos los
casos realtime y las 34 integraciones DT08, sobre el código final. Evidencia local:
`dt08-integration-awake-final.log`. No hubo modificaciones posteriores de código.

Detalle de los fallos UI anteriores, sin modificar Croquis ni registro operativo:

- Admin: `moves a Serpentina selection as one Admin batch and renumbers it collision-safely`
  (`admin-event-preparation.test.tsx`), no encontró `admin-floorplan-surface`; se reprodujo aislado y
  también con una carga Vite de los tres archivos Admin modificados desde la base `6425b98` (detalle,
  query keys y fixtures), manteniendo el test previo intacto. Config temporal local:
  `apps/admin/node_modules/.cache/dt08-baseline.config.ts`; evidencia `dt08-admin-head-baseline.log`.
- Admin: `loads the authoritative event and both event-scoped operational sources in parallel`
  (`admin-pilot-operational-log.test.tsx`), no encontró el heading de rentabilidad dentro del timeout;
  pasó al aislarlo, sin cambios en ese módulo.
- Client: `operates 200 read-only tables with one bounded 50-person page and no per-table requests`
  (`ActiveEventWorkspacePage.test.tsx:830`), 39.1 s con límite de 30 s; pasó aislado en 11.9 s.
- Una repetición completa del archivo anterior de preparación Admin bajo carga terminó 66/73, con
  siete fallos de selectores/tiempo en casos existentes; no se alteraron esos tests para aprobar DT08.
  Evidencia: `dt08-admin-preparation-repeat.log`. Las suites globales UI no se declaran verdes.

`format:check` global reproduce el fallo histórico de artefactos ignorados `var/qa`, incluido
`var/qa/binding/baseline.css` con codificación no parseable. Es independiente del formato de archivos
versionados modificados. No se modifican ni se agregan esos artefactos.

El harness E2E M01 se detuvo antes de seed por puertos 3000/5173/5174/5175 ocupados por servicios
existentes. No se terminaron procesos ni se modificó su base. Regresión M01 se verifica mediante
unidades UI, integración API completa y build; no se afirma una nueva certificación E2E M01.

La primera ejecución E2E B01 falló al arrancar un proceso propio durante QA en paralelo;
el harness no expone stderr sensible. La repetición pasó 2/2 sin cambiar el código
de arranque. Se registra como fallo de ejecución, sin atribuir causa no demostrada. CI remoto y piloto
en dispositivos reales no se certifican en DT08.

Flipbook final: **74/74 aprobados**, 37 Chromium y 37 WebKit, 13.7 minutos. Los casos históricos
`mobile boundaries and every real page N=10` (`e2e/flipbook-mobile.spec.ts:261`) y
`REQ-02 corner preview preserves only the stationary leaf curl` (`:630`) pasaron en ambos navegadores.
No se modificó Flipbook ni se declara resuelta su intermitencia histórica por esta ejecución.
Evidencia local: `dt08-flipbook.log` y reporte `playwright-report/ui03b`.
