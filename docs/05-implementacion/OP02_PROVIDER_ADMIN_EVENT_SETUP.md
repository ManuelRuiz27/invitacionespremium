# OP-02 — Provider-led administrative Event Setup

Estado: **READY FOR CODE**  
Prioridad: **P0 / bloqueante para piloto**  
Repositorio: `ManuelRuiz27/invitacionespremium`  
Workflow: **directo sobre `main`** conforme a `AGENTS.md`.

## 1. Objetivo

Implementar el primer thin slice backend de la capability provider-led: un `PLATFORM_ADMIN` autenticado puede actualizar la configuración de un Evento de un Cliente explícitamente seleccionado, sin impersonar a Planner, sin ampliar permisos de las rutas Planner y reutilizando los invariantes actuales de preparación.

Este bloque valida la frontera administrativa antes de extenderla a Invitación, FileAssets, Croquis u otras superficies.

## 2. Contratos obligatorios

Leer antes de código:

1. `AGENTS.md`;
2. `docs/01-producto/04_OPERATOR_LED_MVP.md`;
3. `docs/01-producto/ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md`;
4. `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`;
5. `docs/05-implementacion/14_CODEX_RULES.md`;
6. `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`;
7. `docs/05-implementacion/OP01_TECHNICAL_BASELINE.md`;
8. este documento.

Si una referencia antigua exige rama/PR, prevalece `AGENTS.md`: este proyecto trabaja directamente en `main` salvo orden expresa del usuario.

## 3. Superficie HTTP autorizada

Agregar:

```http
PATCH /api/v1/admin/clients/:clientId/events/:eventId
```

Body: reutilizar `UpdateEventRequestDto` y `parseUpdateEventRequest()` de `apps/api/src/events/events.dto.ts`.

Respuesta: `EventResponseDto`.

No crear un DTO paralelo de Event Setup.

## 4. Autenticación y autorización

La nueva ruta debe:

- vivir en superficie administrativa;
- requerir `UserRole.PLATFORM_ADMIN`;
- usar el actor autenticado real mediante `@CurrentAuth()`;
- propagar `request.operationId`;
- validar UUID de `clientId` y `eventId`;
- resolver el target por la relación compuesta `event.id = eventId` + `event.clientId = clientId` + `deletedAt = null`;
- responder con la semántica no filtrante `EVENT_NOT_FOUND` cuando el Evento no exista o no pertenezca al Cliente indicado;
- no depender de `principal.clientId`;
- no modificar ownership del Evento.

Prohibido:

- impersonar Planner;
- fabricar `clientId` dentro del principal;
- añadir `PLATFORM_ADMIN` a `EventsController`;
- introducir `AuthRole.OPERATOR`;
- crear bypass global de ownership;
- reutilizar `EventsService.update()` pasando un principal falso;
- exponer otras mutaciones administrativas por anticipación.

## 5. Flujo actual que debe preservarse

`apps/api/src/events/events.controller.ts` mantiene:

```text
PATCH /events/:eventId
  -> parseEventId
  -> parseUpdateEventRequest
  -> EventsService.update
  -> findOwnedEvent(..., principal)
  -> EventAccessPolicy.ownedWhere(principal)
```

Roles actuales Planner:

- `INDEPENDENT_PLANNER`;
- `ORGANIZATION_ADMIN`;
- `ORGANIZATION_PLANNER`.

`ORGANIZATION_PLANNER` conserva el filtro `createdByUserId = principal.userId` de `eventOwnedWhere()`.

Este flujo no debe cambiar funcionalmente.

## 6. Refactor mínimo permitido

`EventsService.update()` mezcla dos responsabilidades:

1. resolución/autorización Planner del target;
2. mutación transaccional de preparación.

OP-02 puede separar únicamente el núcleo actor-neutral necesario para que existan dos entradas seguras:

```text
Planner route
  -> resolver ownership Planner
  -> shared Event preparation mutation

Platform Admin route
  -> resolver clientId + eventId
  -> shared Event preparation mutation
```

No construir un framework genérico de authorization strategies/resolvers si un método privado o caso de uso pequeño resuelve el alcance.

El núcleo compartido debe preservar:

- `PREPARATION_STATUSES`;
- row lock `FOR UPDATE`;
- `AuditedMutationService`;
- `CRITICAL_TRANSACTION_OPTIONS` que ya aplique el flujo compartido;
- `mergePreparationData()`;
- `requireAvailableService()`;
- `resetIncompatibleDigitalDesign()` y consentimiento `resetInvitationDesign`;
- `updateData()`;
- `resolvePreparationStatus()`;
- `recomputeDigitalEventPreparationStatus()`;
- `recomputePhysicalPassPreparationStatus()`;
- `EVENT_SERVICE_INCLUDE` / `toEventResponse()`;
- auditoría before/after;
- actor real y `operationId`.

No interpretar row locking como idempotencia. Este PATCH mantiene el contrato no-idempotency-key del Event Setup actual; OP-02 no introduce una nueva key.

## 7. Archivos esperados

### REUSE

- `apps/api/src/events/events.dto.ts`
- `apps/api/src/events/event-access.policy.ts`
- `apps/api/src/audit/**`
- auth/roles actuales
- Prisma/schema actuales

### ADAPT

- `apps/api/src/events/admin-events.controller.ts`
- `apps/api/src/events/events.service.ts`
- `apps/api/test/events.integration-spec.ts`

### Sólo si el contrato generado lo requiere

- OpenAPI generado;
- `packages/api-client` generado.

No crear frontend Admin en OP-02.

## 8. Criterios de aceptación

1. `PLATFORM_ADMIN` + `clientId` correcto + `eventId` correcto + estado de preparación -> `200` y actualización aplicada.
2. Client A + Event de Client B -> `404 EVENT_NOT_FOUND`, sin filtrar existencia.
3. Client correcto + Event inexistente -> misma semántica no filtrante.
4. Client inexistente -> no puede mutar ningún Evento.
5. Evento fuera de `DRAFT | CONFIGURED | READY_TO_ACTIVATE` -> misma regla de estado que la ruta Planner.
6. `UpdateEventRequestDto` conserva validaciones existentes y body estricto.
7. Cambio de servicio conserva validación de servicio y comportamiento actual de reset de Invitation Design.
8. Auditoría registra `actor.id = PLATFORM_ADMIN.userId` real.
9. Auditoría conserva `clientId`, `eventId`, `beforeData`, `afterData`, action/resource y `operationId` cuando exista.
10. `PATCH /events/:eventId` continúa funcionando para Planner autorizado.
11. `ORGANIZATION_PLANNER` conserva el ownership por `createdByUserId`.
12. `PLATFORM_ADMIN` continúa sin poder usar `PATCH /events/:eventId`.
13. No cambios Prisma ni migrations.
14. No cambios de créditos, ledger, activación, readiness de activación, RSVP público, QR, check-in, Staff, Floorplan o Seating.
15. OpenAPI refleja la nueva ruta si el repo genera contrato automáticamente.

## 9. QA obligatorio

Ampliar preferentemente `apps/api/test/events.integration-spec.ts` siguiendo fixtures/patrones existentes. Usar `apps/api/test/audit.integration-spec.ts` sólo si es necesario para validar una capacidad que no pueda verificarse limpiamente desde Events.

Casos mínimos:

- admin happy path;
- cross-tenant mismatch;
- Event inexistente;
- Client inexistente;
- estado incompatible;
- actor/auditoría/operationId;
- Planner regression;
- Organization Planner creator ownership regression;
- Platform Admin sigue prohibido en endpoint Planner;
- validación estricta del DTO/servicio.

Después ejecutar:

1. tests específicos del API relacionados con Events;
2. lint;
3. typecheck;
4. build;
5. suite/integration relevante disponible;
6. reportar por separado cualquier fallo preexistente del Client que no sea causado por OP-02.

## 10. Fuera de alcance

- Invitation Design provider-led;
- FileAssets provider-led;
- hotspots provider-led;
- Floorplan/Croquis provider-led;
- restricciones nuevas de geometría para Planner;
- Seating;
- Staff;
- activación administrativa;
- UI Admin;
- UI Client;
- nuevos roles;
- Prisma/migrations;
- dependencias;
- reparación oportunista de tests Client preexistentes;
- OP-03 o FP-*.

## 11. Workflow de implementación

Codex debe trabajar directamente en `main`:

```text
git checkout main
git pull --ff-only origin main
# confirmar git status limpio
# implementar código + tests
# ejecutar QA
git add <solo archivos del ticket>
git commit -m "feat(api): add provider admin event setup"
git push origin main
```

No crear rama. No abrir PR. No ejecutar una fase plan-only. No delegar documentación pura.

## 12. Evidencia de salida requerida

Codex debe devolver:

- SHA base leído de `origin/main`;
- archivos modificados;
- resumen del refactor;
- endpoint final;
- pruebas agregadas/modificadas;
- comandos QA y resultados;
- fallos preexistentes separados;
- commit SHA;
- confirmación de push a `main`;
- confirmación explícita de que no tocó superficies fuera de alcance.
