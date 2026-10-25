# M02-B01-DT09 — Certificación integral del piloto

Fecha de ejecución: 2026-10-23–25, America/Mexico_City. Base funcional:
[`6945b9d326c5502b1812fee270461300dcc0ed29`](https://github.com/ManuelRuiz27/invitacionespremium/commit/6945b9d326c5502b1812fee270461300dcc0ed29).
SHA funcional evaluado: [`d5a2d2a589219baed18dc5eb6148b267d446ae7e`](https://github.com/ManuelRuiz27/invitacionespremium/commit/d5a2d2a589219baed18dc5eb6148b267d446ae7e).
**QA local completo aprobado; CI requiere cerrar instalación Flipbook. NO-GO presencial.**
M01 sigue siendo la dirección principal; esta certificación corresponde exclusivamente al piloto separado M02-B01.
No autoriza un lanzamiento comercial, nuevas licencias, roles ni capacidades.

## Ambiente y reproducibilidad

Windows, Node 22.18.0, pnpm 11.15.1, PostgreSQL 16.14 real en Docker; Intel i3-1215U,
8 procesadores lógicos y 16.84 GB de RAM. Chromium/WebKit de Playwright 1.55.0.
Las mediciones usan loopback, API NestJS y transacciones reales; no son un SLA ni una garantía de producción.

Cada harness crea una base única, aplica todas las migraciones y usa storage y secretos propios.
Al finalizar elimina sólo su base, storage y descendientes. Las bases existentes no se reutilizan.
Los puertos 3000/5173/5174/5175 pertenecían a Docker/WSL; no se terminaron esos procesos.
M01 utiliza `--port-offset=1000` (4000/6173/6174/6175); M02 5300/5373/5374/5375.

```powershell
pnpm --filter @invitaciones/api db:validate
pnpm --filter @invitaciones/api db:generate
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate
pnpm --filter @invitaciones/api-client generate:check
pnpm --filter @invitaciones/api-client verify:openapi-routes
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
$env:DT09_PERF_DIR = Join-Path (Get-Location) 'var/qa/dt09-performance-final'
pnpm test:e2e:access-control -- --integration-only
pnpm test:e2e:managed -- --port-offset=1000
pnpm test:e2e:access-control
pnpm exec playwright test -c playwright.flipbook.config.ts
node --test scripts/qa-redaction.test.mjs
pnpm build
```

No ejecutar `test:integration` directamente contra una base compartida: las suites limpian sus fixtures.
La integración completa incluye el test de actualización aditiva sobre datos legacy de `events.integration-spec.ts`;
la creación de la base del harness comprueba la instalación limpia. No se agrega una migración DT09.

## Matriz funcional RF01–RF12

La evidencia automatizada queda condicionada a los gates globales y CI de esta entrega. La aceptación física
es independiente y permanece pendiente para las doce filas.

| Requisito | Evidencia reproducible | Alcance verificado |
| --- | --- | --- |
| RF01 Modalidad única | `access-control-readiness`, `events` integración; E2E DT09 misma Organización | Dos Eventos independientes, NOMINAL/ANONYMOUS exclusivos; mutaciones incompatibles rechazadas por API/SQL. |
| RF02 Registro nominal | `contacts` integración; E2E CSV/SEAT | Nombres repetidos mantienen Assistant distintos; teléfono ausente/válido, preview/commit y replay; RSVP continúa PENDING. |
| RF03 QR individual | `nominal-access` integración; E2E emisión/reemisión | SVG real decodificado; credencial por Assistant, tokens distintos e historial; anterior revocada no ingresa. |
| RF04 Pases anónimos | `physical-passes` integración; E2E TABLE | Lotes, folios históricos 1/2/3, revocación y capacidad liberada sin reciclar folios ni crear Contact/Assistant. |
| RF05 Acomodo | `seating`, `physical-passes`, `scanner` integración; E2E SEAT/TABLE | Mesa/Lugar nominal; TABLE anónimo; rechazo de exceso, cambios incompatibles y recursos ajenos. |
| RF06 Scanner nominal | `scanner`, `access-control-operations` integración; cámara virtual E2E | Dos lectores, un CheckIn activo; reintento tras respuesta perdida conserva clave, resultado y auditoría únicos. |
| RF07 Scanner anónimo | `physical-passes`, carga 150; cámara virtual E2E | Primer uso único, segundo lector rechazado, retry exacto, sin identidad ficticia; cierre impide nuevas operaciones B01. |
| RF08 Material | Dos journeys originales `access-control.spec.ts`; nuevo DT09 | SVG/PDF autorizados, QR realmente renderizado/decodificado, impresión/descarga; aislamiento y secretos fuera de artefactos. |
| RF09 Aforo/concurrencia | Barreras PostgreSQL DT03–DT08; dos cargas DT09 | Mismo/distinto QR, revocación, cierre, capacidad, asignación, snapshots; rollback sin escritura parcial ni auditoría duplicada. |
| RF10 Revocación | `nominal-access`, `physical-passes` integración; E2E DT09 | Antes de uso, conservación histórica, reemisión nominal, folios monotónicos; usado no se revoca por este flujo. |
| RF11 Operación | `access-control-operations` integración; panel real E2E | Vigentes = ingresados + pendientes; capacidad disponible = capacidad − vigentes; Mesas, reversión y snapshots consistentes. |
| RF12 Roles/privacidad | Integración completa, suites UI/Scanner, E2E negativos | Provider sólo Admin/agregados; Planner asignado, reasignación inmediata, Staff acotado, retención y auditoría mínima. |

## Suites globales y CI

No convertir ejecuciones focalizadas en aprobación global. Estado durante el cierre:

| Gate | Resultado |
| --- | --- |
| Prisma validate/generate | Aprobado. |
| OpenAPI/SDK generate/check | Aprobado; ningún drift en OpenAPI/schema generado. |
| Rutas SDK | 181 rutas verificadas contra 205 operaciones OpenAPI. |
| Formato global | Aprobado tras excluir únicamente artefactos locales ignorados. |
| Lint global / harness | 8/8 tareas globales y lint de E2E/scripts/configs aprobados. |
| Typecheck global | 11/11 tareas aprobadas. |
| Redacción de secretos | 1/1 aprobado. |
| Repetición de casos UI DT08 | 3 rondas independientes: 6/6 Admin y 3/3 Client; timeouts originales. |
| Repetición Flipbook REQ-02 | 10/10, cinco Chromium y cinco WebKit, sin retries (104 s). |
| E2E M02 completo | 3/3, más conciliación SQL de Finance/RSVP/CheckIn/auditoría/Staff, aprobado. |
| E2E M01 completo | 4/4, repetición final del 25 de octubre y SQL de aislamiento financiero aprobados (112.36 s harness). |
| Unidades API / SDK | 381/381 API; 150/150 SDK más 9/9 verificaciones Node. |
| Unidades Scanner / packages / Landing | 62/62 Scanner; 100/100 Floorplan; 6/6 UI; 60/60 Landing. |
| Unidades Client | 433/433 en 28 archivos (228.51 s); caso 200 Mesas 2.05 s dentro de la suite global. |
| Unidades Admin | 242/242 en 15 archivos (451.47 s); Serpentina 565 ms dentro de la suite global. |
| Unidades globales | `pnpm test --force`: 11/11 tareas, 0 caché, 823.57 s; 1,443 comprobaciones (1,434 Vitest + 9 Node). |
| Integración API completa | 450/450 en 35 archivos (782.67 s Vitest, 836.17 s harness con migraciones/limpieza). |
| Migración limpia / upgrade legacy | Aprobados en base efímera y caso legacy de `events.integration-spec.ts`. |
| Flipbook global | 74/74 Chromium/WebKit, sin retries (283.49 s harness / 4.7 min Playwright). |
| Build global | 8/8 tareas aprobadas (47.77 s del gate); warnings de tamaño de bundle existentes, sin error. |
| CI inicial DT09 | [40218604104](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/40218604104), SHA `d5a2d2a589219baed18dc5eb6148b267d446ae7e`: quality/pilot success; Flipbook cancelado en APT, sin ejecutar tests. |

Una ejecución Admin del 24 al 25 atravesó suspensión: Vitest informó 70,977 s, incluyendo 38,009 s
de import y 32,895 s de tests; 1/2 falló por superficie ausente al reanudar. Se conserva como ejecución
interrumpida y **no acredita estabilidad**. Se repite completa la validación pendiente con el entorno activo;
no se aumentan timeouts para absorber una suspensión.

La ejecución base [DT08 CI 40021069784](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/40021069784)
se consultó antes de editar: `quality` success, `flipbook-browser-qa` failure (73/74).
Falló WebKit en `REQ-02 corner preview preserves only the stationary leaf curl`.
El workflow DT09 conserva ambos jobs y `cancel-in-progress: true` por rama; agrega `pilot-browser-qa`
con ambos harness aislados. No se publican artefactos de journeys con credenciales operativas.
El CI del SHA final debe comprobarse después de un único push, sin pushes sucesivos que lo cancelen.

El primer CI DT09 agotó los 15 minutos del job Flipbook descargando dependencias desde
`azure.archive.ubuntu.com`; el log termina en `Get:190 ... gstreamer1.0-plugins-bad` y cancelación,
antes de lanzar Playwright. Quality y piloto acabaron en success. Se conserva este resultado como
**gate no aprobado**. Ajuste acotado: ejecutar sólo el job Flipbook en
`mcr.microsoft.com/playwright:v1.55.0-noble`, cuya versión coincide con `@playwright/test` del repo.
La [imagen oficial](https://playwright.dev/docs/docker) incluye navegadores/dependencias; se comprobó
que el manifest de esa versión existe. Se elimina el paso APT y se mantienen timeout de job, timeouts
de test, 74 casos, dos navegadores y cero retries. El siguiente CI debe validar realmente los tests.

## M01 y compatibilidad legacy

El E2E completo incluye el journey Managed existente (Croquis, acomodo, Staff, Scanner familiar,
check-in parcial, cierre y negativos), más creación/preparación Provider desde cero para FLYER y FLIPBOOK.
Planner independiente registra contacto con teléfono; la UI pública confirma RSVP y navega Flipbook;
se descarga/decodifica el QR real y se hace check-in con replay exacto.

El cuarto journey conserva PHYSICAL_QR Self-Service: autorización comercial, grant controlado, activación,
consumo real de créditos y Receipt; SVG, primer uso, rechazo de segundo uso y replay legacy tras cierre.
No se extrapola ese replay histórico a ANONYMOUS B01. SQL comprueba ausencia de Ledger, Receipt,
Payment, saldo, línea de crédito y marcas de autorización/kickoff comercial **en el Cliente Managed**.
La operación financiera del Cliente Self-Service separado permanece intacta.

## M02 y concurrencia

Los dos journeys originales ejercitan cámara virtual con el SVG real, PDF/material, Planner y Provider
autenticados. Se pierde deliberadamente la respuesta **después del commit real**, mediante aborto de transporte;
el panel ya muestra el ingreso y Scanner reintenta con la misma clave. No hay respuesta backend simulada.

El tercer journey crea ambos Eventos en una Organización, CSV con nombres repetidos, SEAT nominal y
TABLE anónimo, revocación/reemisión, lotes históricos, readiness, activación sin Finance, dos Staff,
QR cruzado/revocado, dos lectores concurrentes, dashboard, reversión nominal, reasignación y cierre/cancelación.
Tras el cierre NOMINAL devuelve `401 STAFF_TOKEN_INVALID_OR_EXPIRED` (Staff primero), ANONYMOUS
`409 STAFF_EVENT_NOT_OPERATIONAL` (Evento primero); sesión Staff expirada devuelve 401 en ambos.
El harness concilia CheckIn/uso/auditoría, RSVP PENDING, expiración y ausencia de Finance después del E2E completo.

Las integraciones usan PostgreSQL real y barreras verificadas de locks/auditoría. Cubren scan/revoke
en ambos órdenes, scan/cierre/cancelación, misma clave/distinta clave, capacidad final, reducción/reubicación
de Mesa contra asignación/uso, reversión contra lectura y commit entre queries del snapshot.
El panel mantiene una fotografía consistente sin esperar los locks de escritura del Scanner.

## Rendimiento medido

Dos escenarios reproducibles incluidos en la suite completa: 150 derechos vigentes por modalidad,
5 Mesas de 30, historial de tres reemisiones nominales o un pase anónimo revocado, dos lectores continuos
y consultas concurrentes al panel. No se ejecutan otras suites pesadas simultáneamente.
Se miden HTTP p50/p95, errores, CPU/RSS del worker que aloja Nest y el driver de integración,
conflictos de transacción reales, rollbacks, deadlocks y muestras de espera de locks de PostgreSQL.
Los dos lectores de carga son clientes HTTP con Staff distintos; el E2E de cámara se ejecuta por separado.
CPU/RSS incluye la instrumentación del test: no es CPU exclusiva de una API desplegada. No se afirma
medir CPU de la base ni cada query SQL.

Umbrales locales fijados en el test: Scanner p95 ≤ 2,000 ms, panel p95 ≤ 1,500 ms,
cero errores inesperados, cero deadlocks, 150 ingresos/0 pendientes y una auditoría por operación.
Permiten interacción continua de dos lectores con margen en este equipo; no sustituyen una medición de staging
ni amplían el límite certificado más allá de estos 150 derechos.

Medición final del 25 de octubre, dentro de la integración global:

| Modalidad | Scanner p50 / p95 | Panel p50 / p95 | Muestras panel | Duración carga | Errores / deadlocks | Conflictos recuperados |
| --- | --- | --- | ---: | ---: | --- | ---: |
| NOMINAL | 82.30 / 124.50 ms | 48.73 / 67.25 ms | 127 | 6.83 s | 0 / 0 | 0 |
| ANONYMOUS | 87.97 / 721.90 ms | 47.82 / 64.99 ms | 233 | 12.43 s | 0 / 0 | 111 P2034 |

150 respuestas de ingreso por modalidad; las 127/233 muestras de locks observaron como máximo un waiter.
Rollbacks medidos: 0/111. CPU del worker: 4.17/9.55 s; RSS antes/después: 389.2→457.7 MB y
460.8→536.9 MB, respectivamente. [JSON agregado reproducible](./M02_B01_DT09_PERFORMANCE.json)
conserva precisión, entorno, recursos y la ejecución rechazada anterior a la corrección, sin identificadores.

Antes del ajuste ANONYMOUS produjo 3 errores 500/150 (2%) y 75 conflictos serializables. La primera
ejecución focalizada posterior pasó 150/150 sin errores (p95 301.88 ms, 69 conflictos recuperados);
la repetición final anterior también termina sin errores. La diferencia entre 302 y 722 ms muestra
variabilidad local y justifica no prometer un SLA. La latencia de respuestas fallidas no es un benchmark aceptado.
El cuello demostrado fue agotamiento de retries serializables; esta evidencia no demuestra un índice faltante.
No se agregan índices ni se atribuye latencia a una query particular sin medición SQL.

## Defectos demostrados y correcciones acotadas

| Incidencia | Evidencia / causa | Corrección |
| --- | --- | --- |
| UI global DT08 Client 432/433, Admin 240/242 | Casos aislados y global serial inicial verdes; render MUI/jsdom costoso, promesas/updates React pendientes y búsquedas sobre 200 Mesas | Un worker por suite UI; `act` asíncrono para preparación/resolución; consultas de 50 personas dentro del drawer. Sin aumentar timeouts ni quitar assertions. |
| Contacto con teléfono devuelve 500 en API real bajo tsx | M01 nuevo desde cero: dependencia de PhoneNormalizer ausente con metadata implícita | `@Inject(AppConfigService)` explícito; HTTP de regresión y journeys de CSV/contactos. |
| Provider no puede preparar diseño Managed nuevo | M01 devuelve 409 por exigir price lock/design kickoff Self-Service | Exención exclusivamente de Planner MANAGED digital en el gate Admin existente, después de comprobar tenant. Client técnico y Self-Service mantienen su política; no cambia Finance/activación. |
| Carga ANONYMOUS pierde entradas por agotamiento de retries | 3/150 errores 500, P2034 bajo dos lectores + dashboard | Backoff con jitter de 5–59 ms fuera de transacción, máximo original 20; al agotarse devuelve el 409 existente, sin filtrar Prisma. |
| WebKit Flipbook 73/74 en CI base | Coordenadas de hover medidas antes de terminar la transformación CSS externa; engine READ no acredita fin de esa transición | Test espera `Animation.finished` del volumen antes de medir. Repetición 10/10 y global 74/74; CI pendiente. Sin alterar el motor. |
| Harness M01 no ejecutable con servicios existentes | Puertos Docker/WSL ocupados y artefacto de credenciales compartido | Offset acotado, credenciales por ejecución, limpieza propia y entrada real `src/main.ts`. |
| CI Flipbook cancelado antes de tests | Run 40218604104 consumió 15 min descargando APT; quality/pilot success | Imagen oficial Playwright 1.55.0 Noble con deps preinstaladas, mismo límite de 15 min y mismas pruebas; pendiente confirmar CI del ajuste. |
| Formato local incluye artefactos ignorados | `var/qa` y `var/ngrok-public-test.yml` no están versionados; el segundo apareció en el cierre del 24 de octubre | Exclusiones exactas de esos recursos; no se modifica el túnel local ni se omite código versionado. |

## Seguridad, privacidad y retención

No se amplían roles ni permisos. Pruebas negativas de tenant, Evento, Provider/Client, Planner no asignado,
reasignación, material inválido/revocado y Staff expirado permanecen activas. Los DTO Provider no contienen
detalle personal; Client operativo no expone teléfono, nonce, firma ni tokens. El QR firmado no contiene PII.
Las pruebas de retención incluyen proyección sin identidad a los 30 días aun antes de ejecutar anonimización,
subjects eliminados/anonimizados e historial conservado. UI invalida su caché ante respuestas autoritativas;
un error de red muestra información antigua como tal y no concede ingreso.

Reporter privado redacta conexiones, tokens y valores opacos; prueba `qa-redaction.test.mjs` cubre el filtro.
M01/M02 deshabilitan captura, trace y vídeo, y CI no sube su DOM ni archivos locales de error.
El stderr del servicio que podría incluir rutas con secretos se descarta o redacta; no se imprimen contraseñas,
cookies ni conexiones. Evidencia persistente de carga contiene sólo métricas agregadas, sin QR ni identificadores.
Los artefactos Flipbook usan exclusivamente fixtures visuales sin credenciales operativas.

## Dispositivos y dictamen

El usuario confirmó: **«No hay pruebas físicas; dejarlas pendientes»**. No hay evidencia real de Android/Chrome,
iPhone/Safari ni tablet. Cámara virtual Chromium y WebKit de escritorio no cuentan como aceptación física.
La [matriz manual y guía de contingencias](./M02_B01_PILOT_OPERATIONS_RUNBOOK.md) registra todas las pruebas
pendientes: cámara trasera/denegada, impreso/pantalla, tamaño/ángulo/luz, red lenta, cortes antes/después de envío,
reanudación, Staff expirado y cierre. No se implementa offline ni bypass.

**NO-GO para piloto presencial / certificación física pendiente.** El GO técnico automatizado permanece
pendiente hasta registrar todos los gates y comprobar el CI remoto del SHA final. M02 comercial requiere
decisión separada de Product. La evidencia física debe incluir dispositivo/SO/navegador, fecha, responsable,
resultado y ubicación identificable con secretos ocultos, además de soporte y contingencias aceptados.
