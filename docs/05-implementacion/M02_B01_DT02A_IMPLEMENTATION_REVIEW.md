# M02-B01-DT02A — Revisión de implementación contra ticket

**Estado:** **ACCEPTED — FOUNDATION IMPLEMENTADA; QA M01 DE NAVEGADOR PENDIENTE (INCIDENCIA PREVIA)**  
**Fecha de revisión:** 2026-10-19 (America/Monterrey); commit auditado con timestamp GitHub 2026-10-20T02:19:16Z.  
**Commit técnico:** [`ae1e4b6c7450a845cf8d57361a86abf7a76691ff`](https://github.com/ManuelRuiz27/invitacionespremium/commit/ae1e4b6c7450a845cf8d57361a86abf7a76691ff).  
**Ticket de alcance:** [DT02A Foundation](./M02_B01_DT02A_ACCESS_CONTROL_FOUNDATION.md).  
**Naturaleza de esta revisión:** inspección independiente de commit/código SQL+TypeScript, tests versionados y estado GitHub Actions. **No** se ejecutaron pruebas locales adicionales durante la revisión.

## 1. Dictamen

**DT02A puede cerrarse como ticket de foundation implementado** según alcance de DB/API/Provider: `ACCESS_CONTROL` existe como `ServiceCode`, `Event.accessMode` distingue NOMINAL/ANONYMOUS, el Provider puede realizar intake para `ORGANIZATION+MANAGED`, y la activación B01 permanece **fail-closed** `409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` hasta DT06. `PHYSICAL_QR` y M01 mantienen sus reglas existentes; no se introdujo precio B01.

**Importante:** este cierre NO certifica evento B01 operativo ni readiness, Scanner, entrega QR, teléfono opcional, pase revocable, licenciamiento, E2E de M01 ni staging. El workflow de CI completo sigue rojo por Playwright Flipbook; la **misma etapa** ya fallaba en el commit padre, pero no hay evidencia del log de aserción que pruebe una causa idéntica.

## 2. Evidencia directa de código revisado

| Área | Evidencia concreta en `ae1e4b6` | Evaluación |
|---|---|---|
| Prisma y persistencia | `apps/api/prisma/schema.prisma` declara `ServiceCode.ACCESS_CONTROL`, `EventAccessMode` y `Event.accessMode nullable` | Conforme |
| SQL enum | `20261019120000_add_access_control_service/migration.sql` contiene `ALTER TYPE service_code ADD VALUE 'ACCESS_CONTROL'` en migración previa | Conforme |
| SQL integridad | `20261019121000_add_access_control_foundation/migration.sql` añade `validate_event_access_configuration()`, guardas modo/servicio/perfil/assignment, `event_has_access_material()`, bloqueos de escritura y protección de `Service.code` | Conforme al corte Foundation; ampliar a nuevos objetos en DT03/DT05 |
| SQL activación | misma migración redefine `validate_event_activation_snapshot_references()` con rama restrictiva Managed Organización + ACCESS_CONTROL + Org Planner | Conforme a habilitación de integridad, **no a readiness** |
| Seed y precios | `seedServicesPricing()` usa `Object.values(ServiceCode)` (nuevo quinto Servicio); `configuredPrices` permanece sin `ACCESS_CONTROL`, 16 reglas V2; `ServicesPricingService` excluye ACCESS_CONTROL de descubrimiento/precios/cotizaciones | Conforme |
| Intake y autorización | `EventsService.createManagedAdminIntake()` comprueba Provider real, Client activo, MANAGED + ORGANIZATION para ACCESS_CONTROL; `requireValidPlannerAssignment()` valida Org Planner de tenant | Conforme |
| Edición Provider | `EventsService.updatePreparation()` comprueba coherencia de modo/servicio, emisor Provider cuando corresponde e inmutabilidad ante material/historial; `eventAuditSnapshot()` y `toEventResponse()` incluyen accessMode | Conforme |
| API y DTO | `events.dto.ts` discriminatedUnion de Managed intake, `parseAdminUpdateEventRequest()` separado de Client; rutas `AdminClientEventsController` actuales se reutilizan; OpenAPI/SDK generados | Conforme |
| Activación temporal | `EventsService.requireActivationPreflight()` lanza `EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` antes de readiness legacy y mutación, incluso READY forzado | **Conforme / bloqueo funcional deliberado** |
| Tests añadidos | `events.integration-spec.ts`, `event-activation.integration-spec.ts`, `services-pricing.integration-spec.ts`, `events.dto.spec.ts` prueban seguridad, integridad, backfill nulo, precio, modo y rechazo de activación | Conforme como evidencia de cobertura; no equivale a ejecutar manualmente |

## 3. Trazabilidad AC01–AC12

| AC | Evidencia del commit | Resultado |
|---|---|---|
| AC01 | Seed y tests servicios (5 Service, 16 Price V2; sin ACCESS_CONTROL price) | Cubierto |
| AC02 | Test migración legacy reconstruida y `access_mode NULL` | Cubierto |
| AC03 | Test intake NOMINAL/ANONYMOUS, creator real, assignment, DRAFT y CONFIGURED | Cubierto |
| AC04 | Zod/SQL servicio-modo, UPDATE e INSERT negativos | Cubierto |
| AC05 | Tests de rol Provider/Client, MANAGED, SELF_SERVICE, tenant y client suspendido | Cubierto |
| AC06 | Test reasignación y exclusión cross-planner | Cubierto |
| AC07 | `event_has_access_material()`, triggers + tests de historial soft-deleted | Cubierto en objetos existentes; extender al crear Credencial B01 |
| AC08 | Tests preflight 409, sin snapshots/auditoría/Finance incluso READY forzado | Cubierto |
| AC09 | Trigger Managed SQL y fixtures rollback auditados según test de activación | Cubierto |
| AC10 | Regresión de servicios/prices, M01 y PHYSICAL_QR: CI `quality` verde | Cubierto para suites automatizadas; E2E navegador pendiente |
| AC11 | Triggers + lock Event, tests de contención y rollback auditoría | Cubierto |
| AC12 | DTO/OpenAPI/SDK generado; steps CI de format/lint/typecheck/test/build verdes | Cubierto |

Las entradas `Cubierto` significan **código/tests presentes y CI quality exitoso**; no certifican que el revisor haya ejecutado un segundo entorno independiente.

## 4. Verificación GitHub Actions (externa al reporte de Codex)

- Workflow [CI de DT02A](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39358272500): **failure** en conjunto.
- Job `quality` [éxito](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39358272500/job/118418103525); pasos verdes en PostgreSQL migrations, Prisma, OpenAPI/SDK, format, lint, typecheck, unit tests, integration tests y build. Esto **corrobora independientemente** las pruebas automatizadas centrales.
- Job `flipbook-browser-qa` [fallo](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39358272500/job/118418104296) en `pnpm exec playwright test -c playwright.flipbook.config.ts`.
- Workflow [CI del commit padre anterior a DT02A](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39311018996): `quality` **success**, `flipbook-browser-qa` **failure en el mismo paso Playwright**. **El fallo de esa etapa antecede a DT02A; no está demostrada la igualdad de error raíz**.
- Staging de DT02A: skipped, no hay verificación de despliegue.
- El reporte versionado en [gate SQL §5](./M02_B01_DT01_SQL_COMPATIBILITY_GATE.md) documenta PostgreSQL 16.14 efímero, 47 migraciones clean+legacy, SHA de triggers, suite local 1,266 tests + 131 integración, y bloqueo E2E local por puertos ocupados; esas cifras son **evidencia reportada por Codex**. CI quality independiente sí pasó, pero no se infieren de GitHub las cifras exactas sin logs.

**Seguimiento necesario (M01):** obtener reporte/artifact Playwright, identificar aserción y comparar las fallas padre/DT02A; corregir en ticket dedicado si persiste. No alterar DT02A por especulación. E2E Managed local se reejecutará con puertos disponibles antes de release.

## 5. Exclusiones aún activas / handoff

1. **DT02B (siguiente):** Contact phone opcional condicionado a ACCESS_CONTROL+NOMINAL, CSV preview/commit/validaciones SQL; mantener E.164 y M01; `Invitation` interna + `Assistant` principal sin RSVP confirmado ficticio.
2. **DT03:** credencial nominal por Assistant + token/SVG/revocación, extender `event_has_access_material()` al nuevo objeto.
3. **DT04:** Scanner nominal y `CheckIn` con referencia a credencial, guardando RSVP legacy.
4. **DT05:** Provider PhysicalPass MANAGED+ANONYMOUS, revocación pre-uso; `validate_physical_pass` legacy aún exige PHYSICAL_QR.
5. **DT06:** readiness por modalidad y **quitar el 409 temporal exclusivamente cuando todas las invariantes estén implementadas/probadas**.
6. **DT07–DT09:** UI/reportes/QA operacional/E2E; comercial/licencias fuera de B01.

**Precaución de diseño para DT02B/DT06:** `ContactsService.createContact()` legacy actualmente crea `Invitation` interna y `Assistant` `PENDING`; sus rutas no se transforman en RSVP confirmado por cambiar el servicio. Asegurar que el nuevo servicio jamás herede como puerta lateral la confirmación/QR de Invitation legacy. La compatibilidad pública/Scanner debe quedar explícitamente acotada antes de habilitar activación en DT06.

**Nota operativa:** `EventPreparationStatus` existente pide `socialType` junto con otros datos básicos. DT02A permite `CONFIGURED` al proporcionarlo; evaluar en DT06 si ese campo seguirá requerido para eventos de salón sin invitación, sin cambiar globalmente el comportamiento M01.

## 6. Cierre

- **Aceptado:** foundation DT02A de persistencia, API, Provider Managed y fail-closed.
- **Aún rojo:** CI total por Playwright Flipbook (mismo job y paso ya rojo antes de DT02A); E2E managed local no ejecutado por puertos.
- **Siguiente paso recomendado:** especificar DT02B con puntos exactos de código y gate de teléfono/CSV SQL. No autorizada implementación adicional sin ticket.
