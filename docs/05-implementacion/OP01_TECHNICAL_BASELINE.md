# OP-01 — Baseline técnico y mapa de superficie Operator-led / Croquis V2

Estado: **Baseline del código real al 2026-08-13**
Repositorio auditado: `ManuelRuiz27/invitacionespremium`
Alcance: exclusivamente OP-01 de `docs/05-implementacion/19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`

## Convenciones

- **REUSE**: el código actual ya resuelve la necesidad sin cambiar su responsabilidad.
- **ADAPT**: existe una base correcta, pero necesita una entrada o policy administrativa acotada.
- **BUILD**: no existe la superficie necesaria en el código actual.
- **NOT NOW**: queda fuera de OP-01, OP-02 o del MVP operator-led vigente.

Las referencias de este documento apuntan al repositorio canónico. No se consultó
`Soft-Monkey_InvitacionesPremium`.

## 1. Estado actual

### 1.1 Resumen verificable

| Superficie | Estado real | Clasificación |
| --- | --- | --- |
| Configuración de Evento | El Client expone `/eventos/nuevo` y `/eventos/:eventId/configuracion/:step`; `WizardPage` crea, consulta y actualiza por `apiClient.events`. La API permite esas mutaciones sólo a los tres roles Planner mediante `EventsController`. | **REUSE** para dominio; **ADAPT** para entrada administrativa |
| Invitación | `DesignStep`, `HotspotEditor`, FileAssets y `InvitationDesignService` cubren Flyer, Flipbook, assets, páginas, hotspots y readiness. Todos los endpoints autenticados son Planner-owned. | **REUSE** para dominio; **ADAPT** para acceso provider-led |
| Croquis Builder | `FloorplanStep` usa `FloorplanSurface` y `FloorplanKonvaRenderer`; crea/reemplaza imagen, crea/edita/elimina shapes y lock/unlock. Hoy está dentro del wizard Client y sus endpoints permiten roles Planner. | **REUSE** del motor; **BUILD** de la superficie administrativa |
| Seating Planner | `ActiveEventWorkspacePage` monta `SeatingWorkspace` con geometría read-only, asignación individual/familiar/grupal, move/unassign, capacidad, idempotencia, reconciliación `409` y realtime. | **REUSE** |
| Platform Admin | `apps/admin` autentica exclusivamente `PLATFORM_ADMIN`, lista/detalla Eventos globales y sólo restaura eliminados. No aloja wizard, diseño, Floorplan o Staff access operativos. | **ADAPT** como host; **BUILD** de casos de uso operator-led |
| Autorización operator-led | No existe capability administrativa por `clientId + eventId`. `EventAccessPolicy.eventOwnedWhere()` rechaza principals sin `clientId`, por lo que Platform Admin no atraviesa las rutas Planner. | **BUILD** |

Evidencia principal: `apps/client/src/app/router.tsx:createRoutes`,
`apps/client/src/wizard/WizardPage.tsx:WizardPage`,
`apps/client/src/workspace/ActiveEventWorkspacePage.tsx:ActiveEventWorkspacePage`,
`apps/api/src/events/events.controller.ts:EventsController`,
`apps/api/src/invitation-design/invitation-design.controller.ts:InvitationDesignController`,
`apps/api/src/floorplan/floorplan.controller.ts:FloorplanController`,
`apps/api/src/events/event-access.policy.ts:eventOwnedWhere` y
`apps/admin/src/app/router.tsx:createRoutes`.

### 1.2 Frontera confirmada

El código actual no implementa operator-led access. No hay rol `OPERATOR`, impersonación ni bypass. Un
`AuthPrincipal` de Platform Admin tiene `clientId === null`; `eventOwnedWhere()` lanza `EVENT_NOT_FOUND` cuando
`principal.clientId` no existe. Los controllers normales de Events, Invitation Design, Floorplan y Staff access
además declaran `@Roles(INDEPENDENT_PLANNER, ORGANIZATION_ADMIN, ORGANIZATION_PLANNER)`.

Referencias: `apps/api/src/auth/auth.types.ts:AuthPrincipal`,
`apps/api/src/events/event-access.policy.ts:eventOwnedWhere`,
`apps/api/src/events/events.controller.ts:EventsController`,
`apps/api/src/invitation-design/invitation-design.controller.ts:InvitationDesignController`,
`apps/api/src/floorplan/floorplan.controller.ts:FloorplanController` y
`apps/api/src/staff-access/staff-access.controller.ts:StaffTokensController`.

## 2. Mapa frontend

### 2.1 Event Setup

#### Rutas Client

| Ruta | Componente | Comportamiento real |
| --- | --- | --- |
| `/eventos` | `DashboardPage` | Lista Eventos y enlaza preparación, revisión o workspace mediante `EventsList`/`EventCard`. |
| `/eventos/nuevo` | `WizardPage` | Mantiene borrador local y difiere `POST /events` hasta que existe información significativa. |
| `/eventos/:eventId/configuracion/:step` | `WizardPage` | Reanuda el wizard por URL y corrige pasos incompatibles con el servicio. |
| `/eventos/:eventId` | `ActiveEventWorkspacePage` | Redirige Estados de preparación al wizard y monta el workspace para Estados posteriores. |

Referencias: `apps/client/src/app/router.tsx:createRoutes`,
`apps/client/src/dashboard/EventsList.tsx`, `apps/client/src/dashboard/EventCard.tsx` y
`apps/client/src/workspace/ActiveEventWorkspacePage.tsx:preparationDestinations`.

#### Orquestación y componentes

- `WizardPage` es el coordinador: carga servicios y Evento; crea mediante una única `createPromiseRef`; mantiene
  `SerialAutosave`; y monta `DataStep`, `ContactsStep`, `DesignStep`, `ConfirmationStep`, `FloorplanStep`,
  `PhysicalPassesStep` o `ReviewStep`.
- `WizardLayout` proyecta estado de guardado, navegación desktop/mobile y read-only según `isEditableEvent()`.
- `wizard-model.ts:stepsForService()` define pasos digitales
  (`datos/contactos/invitacion/confirmacion/croquis/revision`) y Physical QR
  (`datos/croquis/pases/revision`).
- `DataStep` modifica el draft de Evento; `ConfirmationStep` sólo cambia `confirmationEnabled`; `ReviewStep`
  recarga recursos, consulta readiness y ejecuta activación con `AttemptManager`.

Clasificación: **REUSE** de orquestación y componentes en Client. No moverlos directamente a Admin porque una app
no puede importar source de otra (`MONOREPO_ARCHITECTURE.md`). La lógica presentacional que deba compartirse en una
fase posterior tendría que extraerse a un package autorizado, pero eso no es necesario para OP-02 backend-first.

#### API client

`packages/api-client/src/events.ts:createEventsClient()` implementa:

- `GET /events`;
- `GET /events/:eventId`;
- `POST /events`;
- `PATCH /events/:eventId`;
- `POST /events/:eventId/activate` con `Idempotency-Key`.

Los tipos `Event`, `CreateEventInput`, `UpdateEventInput` y `EventActivation` derivan de
`packages/api-client/src/generated/schema.ts`. No hay DTO manual administrativo equivalente.

### 2.2 Invitation Setup

#### Wizard y componentes

- `DesignStep` consulta diseño + readiness, crea Flyer/Flipbook, carga/reemplaza assets, administra páginas y
  distingue mutación confirmada de fallo de refresco.
- `HotspotEditor` crea, actualiza y elimina hotspots a través de `apiClient.design`; conserva el draft ante fallo.
- `AssetPreview` y `usePrivateAssetUrl` descargan FileAssets privados y revocan Object URLs.
- `ConfirmationStep` configura `confirmationEnabled` dentro del mismo `PATCH /events/:eventId`; la operación de
  cierre/reapertura posterior vive en `PublicRsvpController`, no en este paso del wizard.

Referencias: `apps/client/src/wizard/design/DesignStep.tsx:DesignStep`,
`apps/client/src/wizard/design/HotspotEditor.tsx:HotspotEditor`,
`apps/client/src/wizard/design/usePrivateAssetUrl.ts:usePrivateAssetUrl`,
`apps/client/src/wizard/confirmation/ConfirmationStep.tsx:ConfirmationStep` y
`apps/api/src/public-rsvp/public-rsvp.controller.ts:EventConfirmationController`.

#### SDK y endpoints consumidos

`packages/api-client/src/wizard.ts` expone `createFileAssetsClient()` y `createDesignClient()`:

- `POST/GET/DELETE /events/:eventId/file-assets/**`;
- `GET /events/:eventId/design`;
- `GET /events/:eventId/design/readiness`;
- `POST /events/:eventId/design/flyer`;
- `POST /events/:eventId/design/flipbook`;
- `PATCH` de assets Flyer y páginas Flipbook;
- alta, orden, reemplazo y eliminación de páginas;
- `GET/POST/PATCH/DELETE /events/:eventId/hotspots/**`.

Ownership real: `FileAssetsService.requireOwnedEvent()` y
`InvitationDesignService.requireOwnedEvent()` aplican `EventAccessPolicy.ownedWhere(principal)`.
`InvitationDesignService.lockMutableEvent()` agrega lock del Evento, Estados permitidos y compatibilidad de
servicio. Clasificación: **REUSE** de validadores/transacciones/claims/readiness; **ADAPT** de la entrada de acceso.

### 2.3 Floorplan Builder

#### Composición actual

| Archivo/símbolo | Responsabilidad real | Clasificación |
| --- | --- | --- |
| `FloorplanStep.tsx:FloorplanStep` | Orquesta carga/refetch, imagen, CRUD de shapes, draft exclusivo, inventario local, reconciliación post-mutation y lock/unlock. | **REUSE** |
| `FloorplanKonvaRenderer.tsx:FloorplanKonvaRenderer` | Stage/Layer, imagen, shapes, Transformer, drag/transform end, zoom wheel, pan y pinch; no llama API. | **REUSE** |
| `FloorplanSurface.tsx:FloorplanSurface` | Mide owner, carga imagen, lazy-load Konva con fallback DOM, toolbar, viewport, history local, teclado, drop y lista accesible. | **REUSE** |
| `FloorplanToolbar.tsx:FloorplanToolbar` | Zoom, fit, pan, snap, sillas visuales y undo/redo; oculta edición en `readOnly`. | **REUSE** |
| `FloorplanTray.tsx:FloorplanTray` | Inventario pendiente buscable, colocación click/drag y auto-placement. | **REUSE** |
| `floorplan-geometry.ts` | Normalización `0..1`, rotación local, lados iguales y validación de polígonos. | **REUSE** |
| `floorplan-scene.ts` | Adaptador shapes normalizados ↔ rectángulos de Stage con proyección aspect-aware. | **REUSE** |
| `floorplan-history.ts` | Undo/redo local de máximo 20 snapshots; no es versionado servidor. | **REUSE** |
| `floorplan-sticker-style.ts` | Colores derivados de `designTokens`; no contiene negocio/API. | **REUSE** |
| `floorplan-inventory.ts` / `FloorplanInventory.tsx` | Expande configuraciones a Mesas pendientes sin crear entidad Sticker. | **REUSE** |
| `floorplan-visual-seats.ts` | Deriva sillas visuales desde capacidad; no persiste Seat. | **REUSE** |

#### Flujo de persistencia

`FloorplanStep` mantiene geometría transitoria; guarda una vez mediante `apiClient.floorplan.addShape()` o
`updateShape()`, adopta la respuesta segura y luego refresca. Si el refresco falla, no repite la mutación.
`FloorplanKonvaRenderer` entrega cambios estables desde drag/transform end; sus tests verifican cero requests por
frame.

La imagen usa `apiClient.fileAssets.upload(..., 'FLOORPLAN_IMAGE', 'FLOORPLAN')` y después
`setImage()`/`replaceImage()`. El SDK en `packages/api-client/src/wizard.ts:createFloorplanClient()` mapea:

- `POST/GET/PATCH /events/:eventId/floorplan`;
- `POST /events/:eventId/floorplan/lock` y `/unlock`;
- `POST /events/:eventId/floorplan/shapes`;
- `PATCH/DELETE /events/:eventId/floorplan/shapes/:shapeId`.

#### Versionado y concurrencia

- `FloorplanResponseDto` publica `updatedAt`, `locked` y `lockedAt`, pero request DTOs no incluyen `version`, ETag,
  `If-Match` ni timestamp esperado (`apps/api/src/floorplan/floorplan.dto.ts`).
- La concurrencia de escritura es pesimista/serializable: `FloorplanService.serializable()` usa
  `CRITICAL_TRANSACTION_OPTIONS`; `FloorplanAccessService.requireOwnedEvent(..., lock=true)`, `lockFloorplan()` y
  `lockShape()` ejecutan `FOR UPDATE`.
- `FLOORPLAN_LAYOUT_LOCKED` impide mutar una distribución finalizada; `changeLock()` es idempotente por estado.
- No existe detección optimista de “cliente editó una versión vieja” para geometría. Dos updates concurrentes se
  serializan y la última escritura válida puede prevalecer. Esto es un riesgo de colaboración, no autorización para
  cambiar payload/OpenAPI en OP-01.
- Seating sí persiste `SeatingOperation` con `idempotencyKey`, `requestSignature` y `resultSnapshot`; la geometría no
  tiene operación idempotente equivalente.

### 2.4 Planner Seating

#### Rutas y montaje

`ActiveEventWorkspacePage` usa `/eventos/:eventId?seccion=mesas`. Sólo muestra Seating cuando
`event.floorplanEnabled` y el servicio es Flyer, Flipbook o Physical QR. Para Eventos en preparación redirige al
wizard; admite workspace en `ACTIVE`, `EVENT_DAY`, `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y `CANCELLED`.

`SeatingWorkspace` siempre pasa `readOnly` a `FloorplanSurface`; no invoca endpoints de geometría. Para digital sólo
habilita mutaciones de personas en `ACTIVE`/`EVENT_DAY`; Physical QR proyecta ocupación sin lista nominal.

#### Read model y mutaciones

- `GET /events/:eventId/seating` acepta scope `UNASSIGNED|TABLE`, Mesa, Grupo, búsqueda, cursor y límite 1..100.
- `POST /events/:eventId/seating/assign` asigna selección acotada.
- `POST /events/:eventId/seating/assign-family` y `/assign-group` resuelven agregados en backend.
- `PATCH /events/:eventId/seating/:assistantId` mueve o desasigna.
- Todos los writes requieren `Idempotency-Key`.

Referencias: `FloorplanController.seatingWorkspace/assign/assignFamily/assignGroup/updateSeating`,
`FloorplanService.seatingWorkspace()` y `FloorplanService.runSeating()`.

#### Capacidad y conflictos

- La UI calcula disponibilidad para feedback y bloquea selecciones evidentemente mayores, pero el backend vuelve a
  contar Asistentes y pases bajo locks.
- `runSeating()` bloquea Evento, Floorplan, Mesa y Asistentes; rechaza sobrecupo con
  `SEATING_TABLE_CAPACITY_EXCEEDED` (`409`).
- Un `409` en `SeatingWorkspace.executeIntent()` refresca Floorplan + seating y depura la selección contra la lectura
  autoritativa.
- Un resultado de red incierto se reconcilia por lectura; si no se confirma conserva exactamente el mismo intent y
  `Idempotency-Key` para reintento.

#### Realtime

`useWorkspaceRealtime()` conecta a `/realtime`, room `floorplan`, actor `USER`, `administrative:false`, escucha
`seating.updated`, `event.closed` y `event.cancelled`, deduplica `operationId` y recupera por invalidación REST.
`FloorplanService.runSeating()` publica `seating.updated` versión 1 sólo post-commit, si no fue replay y hubo cambios.

Platform Admin no puede usar este room como operador: `RealtimeAuthService.authorizeUser()` limita
`PLATFORM_ADMIN` a `administrative:true` y `roomType:'dashboard'`; el room administrativo `floorplan` no existe.

## 3. Mapa backend

### 3.1 Eventos

| Capa | Símbolos reales | Estado |
| --- | --- | --- |
| Controller cliente | `EventsController` | CRUD/lifecycle/activate; tres roles Planner. |
| Controller admin | `AdminEventsController` | `GET /admin/events`, `GET /admin/events/:eventId`, `POST .../restore`; Platform Admin. |
| Servicio | `EventsService.listOwned/getOwned/create/update/activate/listAdmin/getAdmin/restoreAdmin` | Comparte dominio, pero create/update/activate dependen de principal owned. |
| Policy | `EventAccessPolicy.ownedWhere`, `eventOwnedWhere` | Tenant + filtro `createdByUserId` para Organization Planner; rechaza principal sin client. |
| Estado/readiness | `resolvePreparationStatus`, `recomputeDigitalEventPreparationStatus`, `recomputePhysicalPassPreparationStatus` | Backend autoritativo. |
| Activación | `EventsService.activate` | Lock, idempotencia, readiness, pricing, finanzas, receipt, Evento y auditoría transaccional. |

### 3.2 Invitación, assets y RSVP

- `InvitationDesignController` y `InvitationDesignService` cubren diseño y hotspots.
- `FileAssetsController`/`FileAssetsService` cubren staging privado, validación, claim/hide y contenido autenticado.
- `PublicRsvpController` expone token público; `EventConfirmationController` expone consulta/cierre/reapertura a
  roles Planner.
- `InvitationsController`/`InvitationsService` cubren Invitaciones y Asistentes con ownership Planner.
- El ownership en estos módulos converge en `EventAccessPolicy.ownedWhere()`; las mutaciones registran actor
  `AuditActorType.USER` con `principal.userId`.

### 3.3 Floorplan y Seating

- `FloorplanController` mezcla lectura, mutación de layout y seating bajo el mismo allowlist de roles Planner.
- `ScannerFloorplanController` es público por StaffToken y sólo devuelve proyección mínima + contenido privado.
- `FloorplanService` concentra persistencia, locks, estados, capacidad, idempotencia de seating, auditoría y publish
  realtime.
- `FloorplanAccessService.requireOwnedEvent()` es el único access helper especializado actual y delega al ownership
  Planner.
- `FloorplanModule` ya importa `AuditModule`, `EventsModule`, `FileAssetsModule`, `RealtimeModule` y
  `StaffAccessModule`; es la ubicación correcta para reutilizar dominio sin crear otro módulo backend.

### 3.4 Staff access

`StaffTokensController` publica `GET/POST /events/:eventId/staff-tokens` para roles Planner.
`StaffTokenManagementService.create()`:

- bloquea el Evento;
- aplica `eventOwnedWhere(principal)`;
- exige `ACTIVE|EVENT_DAY`;
- limita a tres activos;
- guarda sólo digest;
- entrega el secreto una vez;
- registra `STAFF_TOKEN_CREATE` con actor real.

El servicio es **ADAPT** para una entrada administrativa: sus invariantes técnicos son reutilizables, pero su lookup
owned y actor están acoplados al principal Planner.

## 4. Matriz de autorización actual

| Operación | Implementación actual | Rol permitido actual | Endpoint actual | Necesaria para operator-led | Gap | Cambio mínimo recomendado |
| --- | --- | --- | --- | --- | --- | --- |
| Crear/preparar Evento | `EventsController.create` → `EventsService.create`; deriva `clientId` de `principal` | Independent Planner, Organization Admin, Organization Planner | `POST /events` | Sí | Platform Admin no tiene `clientId`; no puede indicar target validado | **ADAPT**: caso de uso admin con target Client explícito, validación de Cliente y actor real; reutilizar preparation/status/audit |
| Editar configuración | `EventsController.update` → `EventsService.update`; `findOwnedEvent` y Estados de preparación | Los tres Planner bajo ownership | `PATCH /events/:eventId` | Sí | No existe target `clientId + eventId` administrativo | **ADAPT**: adapter admin que valide par Cliente/Evento y reutilice merge, service validation, locks, readiness y audit |
| Invitation design | `InvitationDesignController` → `InvitationDesignService.lockMutableEvent` | Los tres Planner bajo ownership | `/events/:eventId/design/**`, `/hotspots/**` | Sí | Controller/policy rechazan Platform Admin; no hay admin SDK | **ADAPT**: entrada admin allowlisted dentro de `InvitationDesignModule`; reutilizar service internals, FileAsset claims y readiness |
| RSVP configuration | `confirmationEnabled` via Event patch; cierre/reapertura en `ConfirmationManagementController` | Los tres Planner bajo ownership | `PATCH /events/:eventId`; `GET /confirmation`; `POST /confirmation/close|reopen` | Preparación inicial sí; operación RSVP no por defecto | No hay acción admin para configurar el flag; cierre/override no está concedido por ADR como gestión cotidiana | **ADAPT** sólo configuración inicial; **NOT NOW** editar respuestas/cierre operativo salvo contrato explícito |
| Floorplan read | `FloorplanController.get` → `FloorplanService.get` | Los tres Planner; Staff por controller Scanner | `GET /events/:eventId/floorplan`; `GET /scanner/:staffToken/floorplan` | Sí | Admin sólo tiene lectura genérica de Evento, no del Croquis | **ADAPT**: lectura admin target-scoped que reutilice `requireView`/DTO sin token Staff ni ruta Planner |
| Floorplan geometry mutation | `create/replaceImage/lock/unlock/createShape/updateShape/deleteShape` | Los tres Planner bajo ownership | `/events/:eventId/floorplan/**` | Sí, provider-led; Planner read-only en launch | No capability admin y la API actual todavía concede mutación histórica a Planner | **BUILD** entrada admin explícita; **ADAPT** access resolver y service. La reducción Planner pertenece a la separación OP-03 y no se resuelve ocultando UI |
| Tables | `FloorplanShape kind=TABLE`; validación DTO + `FloorplanService` | Los tres Planner bajo ownership | `POST/PATCH/DELETE /events/:eventId/floorplan/shapes/**` | Sí para infraestructura | No hay allowlist administrativa por operación/target | **ADAPT** mismos casos de uso de geometría; no crear entidad Table paralela ni Sticker persistente |
| Seating | `FloorplanService.runSeating`; `SeatingWorkspace` | Los tres Planner bajo ownership; UI mutable sólo digital `ACTIVE|EVENT_DAY` | `/events/:eventId/seating/**` | No por defecto para provider operation | Reutilizarlo daría al operador una capability excluida | **NOT NOW** para provider-led; mantener endpoints Planner separados |
| Staff access | `StaffTokensController` → `StaffTokenManagementService` | Los tres Planner bajo ownership | `GET/POST /events/:eventId/staff-tokens` | Puede ser necesaria para preparación | No ruta admin; service acoplado a `eventOwnedWhere` | **ADAPT** sólo si el piloto lo requiere: adapter admin target-scoped conservando Estado, límite, digest, one-time secret y auditoría |
| Activación | `EventsService.activate` | Los tres Planner bajo ownership; integración bloquea Platform Admin | `POST /events/:eventId/activate` | Posible según ADR, sin bypass | No entrada administrativa; cobro atribuye `principal.userId` y lookup owned | **ADAPT** caso de uso admin explícito que conserve toda la transacción, target/Cliente, idempotencia, pricing, credits, readiness y audit; nunca llamar controller Planner |

### Respuestas actuales

- `SessionAuthGuard` + `RolesGuard`: `401` sin sesión y `403` rol no permitido.
- `eventOwnedWhere()` y los `requireOwnedEvent()` especializados: `404 EVENT_NOT_FOUND` fuera de ownership o para
  Platform Admin en rutas Planner.
- `DomainError(..., HttpStatus.CONFLICT)`: `409` para Estado, capacidad, lock o idempotencia incompatible.

## 5. Gap contra ADR_OPERATOR_LED_ACCESS

| Requisito ADR | Evidencia actual | Estado |
| --- | --- | --- |
| Actor interno real | Auth y Admin ya conservan `principal.userId`; auditoría acepta actor USER | **REUSE** |
| Capability administrativa explícita | Sólo existe allowlist por rol `PLATFORM_ADMIN` en controllers admin generales; no capability operator-led por acción | **BUILD** |
| Target `clientId + eventId` | Admin Events consulta por `eventId`; los writes Planner derivan `clientId` del principal | **BUILD** |
| Verificar Evento pertenece al Client target | No existe resolver administrativo del par; `eventOwnedWhere` sólo resuelve ownership Planner | **BUILD** |
| Allowlist de acciones | Controllers Planner agrupan capacidades amplias; Admin no tiene allowlist operator-led | **BUILD** |
| Conservar Estado/negocio | Services actuales validan Estados, servicio, readiness, capacidad, pricing y créditos | **REUSE** |
| Auditoría actor/Cliente/Evento/recurso | Events, Invitation Design, Floorplan, Staff y `AuditedMutationService` ya escriben esos campos | **REUSE/ADAPT** |
| Cross-tenant denial sin leakage | Ownership Planner está probado; falta la variante de target administrativo | **ADAPT** |
| Sin impersonación | No se encontró mecanismo de impersonación; AdminRoleGuard exige Platform Admin sin Client | **REUSE** |
| Builder provider-led | No existe ruta Admin ni endpoint administrativo de Floorplan | **BUILD** |
| Planner geometry read-only en launch | `SeatingWorkspace` ya es read-only, pero el wizard Client y endpoints Floorplan aún permiten mutación Planner | **ADAPT** posterior en separación OP-03; backend sigue siendo obligatorio |

El gap bloqueante no es el motor de negocio: es la entrada administrativa y su policy target-scoped. Copiar el wizard
Client a Admin o agregar `PLATFORM_ADMIN` a los decorators actuales no resolvería el ADR.

## 6. Código reutilizable

### 6.1 Platform Admin como host

`apps/admin` **sí puede alojar** futuras superficies operator-led porque ya tiene:

- sesión aislada y restauración (`AdminAuthProvider`);
- guard exacto `PLATFORM_ADMIN` + `clientId === null` (`AdminRoleGuard`);
- rutas de Clientes y Eventos (`apps/admin/src/app/router.tsx`);
- selección/navegación de Cliente y Evento (`AdminClientsPage`, `AdminClientDetailPage`, `AdminEventsPage`,
  `AdminEventDetailPage`);
- abort/generation safety por target (`useAdminOperationScope`);
- Query keys e invalidación (`adminQueryKeys`);
- dialogs de confirmación sensible (`ConfirmSensitiveActionDialog`);
- SDK admin separado (`packages/api-client/src/admin/**`).

Limitación real: `AdminEventDetailPage` se declara y se comporta como sólo lectura; sólo llama
`apiClient.adminEvents.restore()` cuando el Evento está eliminado. No hay componentes ni SDK operator-led todavía.

### 6.2 Casos de uso administrativos existentes

- Clientes: listar, leer, crear Organización, editar, suspender/restaurar y gestionar usuarios
  (`AdminClientsController`, `AdminClientUsersController`, `packages/api-client/src/admin/clients.ts`).
- Eventos: listar, leer y restaurar (`AdminEventsController`, `EventsService.listAdmin/getAdmin/restoreAdmin`,
  `packages/api-client/src/admin/events.ts`).
- Finanzas/catálogo/reportes/auditoría: controllers `@Roles(PLATFORM_ADMIN)` y SDKs bajo
  `packages/api-client/src/admin/`.
- Auditoría transaccional genérica: `AuditedMutationService.execute()` + `AuditService.record()`.
- Realtime administrativo: Platform Admin puede entrar sólo a room `dashboard` con `administrative:true`; no es una
  base autorizada para editar Floorplan.

### 6.3 Lógica reutilizable por módulo

- **Events — REUSE/ADAPT:** `preparationData`, `resolvePreparationStatus`, service availability, readiness,
  `EventsService.activate`, `FinanceService.consumeEventActivation`, locks e idempotencia.
- **Invitation Design — REUSE/ADAPT:** validación DTO, `lockMutableEvent`, design/page/hotspot transactions,
  readiness, claim/hide de assets y auditoría.
- **Floorplan — REUSE/ADAPT:** DTO/schema, `FloorplanService`, `FloorplanAccessService`, `lockFloorplan`, `lockShape`,
  readiness, capacity, response mappers y audit.
- **Staff — REUSE/ADAPT:** token technical service, limit/Estado, digest, one-time response y audit.
- **Frontend Builder — REUSE:** todos los componentes listados en sección 2.3. La reutilización entre apps debe ser
  por extracción autorizada o composición futura, nunca importando `apps/client/src` desde `apps/admin`.

### 6.4 Endpoints Planner que no deben reutilizarse directamente

No deben ser llamados por Admin ni ampliados con `PLATFORM_ADMIN`:

- `POST/PATCH /events/**` y `POST /events/:eventId/activate`;
- `/events/:eventId/design/**` y `/hotspots/**`;
- `/events/:eventId/file-assets/**` para operación provider-led sin adapter target-scoped;
- `/events/:eventId/floorplan/**`;
- `/events/:eventId/staff-tokens/**`;
- especialmente `/events/:eventId/seating/**`, porque seating provider-led está fuera de alcance por defecto.

Razón verificable: todos derivan ownership de `AuthPrincipal` Planner y registran ese principal como actor. Habilitar
Platform Admin en el decorator no agrega target Client, allowlist ni verificación cruzada.

## 7. Código que NO debe tocarse

Para OP-02 mínimo y, con mayor razón, para este OP-01 documental:

- **NOT NOW:** `apps/api/prisma/**`, schema y migraciones; el ADR no requiere modelo nuevo.
- **NOT NOW:** `apps/api/src/openapi/openapi.ts` y `packages/api-client/src/generated/schema.ts` durante OP-01. OP-02
  deberá regenerarlos sólo si agrega API real.
- **NOT NOW:** endpoints y lógica de `/events/:eventId/seating/**`; siguen siendo Planner.
- **NOT NOW:** `SeatingWorkspace` salvo regresión estrictamente necesaria; ya cumple geometría read-only y seating.
- **NOT NOW:** Scanner, QR, RSVP público, finanzas, pricing, roles y Estados.
- **NOT NOW:** entidades `Seat`, `SeatAssignment`, `Sticker` o `FloorplanV2`.
- **NOT NOW:** un nuevo módulo backend; Events, InvitationDesign, Floorplan, StaffAccess y Audit ya son módulos
  autorizados.
- **NOT NOW:** imports cross-app o mover negocio a `packages/ui`.
- **NOT NOW:** rediseño visual, nuevos tipos de sticker o consulta del legacy.

## 8. Cambios mínimos propuestos para OP-02

Esto no es un plan de implementación completo. Es el mínimo técnico que se desprende de gaps observados:

1. **BUILD — policy/resolver administrativo target-scoped.** Dentro de módulos existentes, resolver actor Platform
   Admin + `clientId` + `eventId`, verificar pertenencia y devolver no-leakage cuando el par no coincide.
2. **BUILD — entradas administrativas allowlisted.** Exponer sólo las operaciones requeridas por el piloto. No añadir
   `PLATFORM_ADMIN` a `EventsController`, `InvitationDesignController`, `FloorplanController` o
   `StaffTokensController`.
3. **ADAPT — casos de uso existentes.** Separar autorización de la lógica de dominio sólo donde hoy está acoplada al
   principal Planner; conservar locks, validación, readiness, assets, idempotencia, pricing/credits y transacciones.
4. **ADAPT — auditoría.** Registrar siempre `principal.userId` del Platform Admin, Client target, Evento, recurso,
   acción, before/after y `operationId`. Reutilizar `AuditService`/`AuditedMutationService`.
5. **BUILD — pruebas de autorización.** Happy path, target cross-tenant, target inexistente/no leakage, Estado
   incompatible, actor de auditoría y regresión que confirme que Staff/Público/Planner no ganaron permisos.
6. **BUILD — contrato/SDK sólo junto con API real.** Regenerar OpenAPI y `packages/api-client` en OP-02; no mantener
   DTOs manuales paralelos.
7. **NOT NOW — gran UI Admin.** El roadmap permite validar endpoints/casos de uso primero. `apps/admin` es host viable,
   pero copiar/mover el Builder no es requisito del backend OP-02.
8. **NOT NOW — Seating provider-led.** No crear adapter administrativo de seating sin contrato de recuperación
   explícito.

La forma y nombres finales de endpoints administrativos no están decididos por OP-01; no se inventan aquí.

## 9. Tests existentes

### 9.1 Events y activación

- `apps/api/test/events.integration-spec.ts`: creación por roles Client, ownership, rutas admin read-only, cambios de
  servicio, soft-delete/restore/audit y OpenAPI.
- `apps/api/test/event-activation.integration-spec.ts`: readiness, snapshots, ownership de roles, bloqueo de Platform
  Admin, idempotencia, concurrencia, rollback de auditoría y OpenAPI.
- `apps/api/test/event-lifecycle.integration-spec.ts` y
  `apps/api/src/events/event-lifecycle.service.spec.ts`: ciclo posterior y unitarios de transiciones.
- `apps/api/src/events/events.dto.spec.ts`, `event-status.resolver.spec.ts` y
  `event-destination-url.spec.ts`: DTO/estado/URLs.
- `apps/client/src/wizard/wizard-flow.test.tsx`, `wizard-model.test.ts`, `wizard-draft.test.ts`,
  `wizard-editors.test.tsx`, `DataStep.test.tsx` y `ReviewStepDistributionHandoff.test.tsx`.

### 9.2 Invitation Design, assets y RSVP

- `apps/api/test/invitation-design.integration-spec.ts`: Flyer/Flipbook/assets/hotspots/readiness, ownership,
  congelamiento, concurrencia, rollback, constraints y OpenAPI.
- `apps/api/src/invitation-design/invitation-design.dto.spec.ts` y
  `invitation-design.readiness.spec.ts`.
- `apps/client/src/wizard/design/DesignStep.test.tsx` y `HotspotEditor.test.tsx`.
- `apps/api/test/invitations.integration-spec.ts`, `apps/api/test/invitation-qr.integration-spec.ts`,
  `apps/api/src/invitations/*.spec.ts` y `apps/api/src/public-rsvp/invitation-qr.service.spec.ts`.

### 9.3 Floorplan y Seating

- `apps/api/test/floorplan.integration-spec.ts`: imagen/lock, geometría, seating individual/familia/grupo,
  paginación, 1,800 Asistentes, carreras, capacidad, RSVP/cancelación, audit/realtime, Staff y ownership/Estados.
- `apps/api/src/floorplan/floorplan.dto.spec.ts`, `floorplan-readiness.service.spec.ts` y
  `floorplan.workspace.spec.ts`.
- `apps/client/src/wizard/floorplan/FloorplanStep.test.tsx` y `FloorplanStep.konva.test.tsx`.
- `FloorplanKonvaRenderer.test.tsx`, `FloorplanSurface.test.tsx`, `FloorplanTray.test.tsx` y
  `FloorplanInventory.test.tsx`.
- `floorplan-geometry.test.ts`, `floorplan-scene.test.ts`, `floorplan-history.test.ts`,
  `floorplan-inventory.test.ts`, `floorplan-visual-seats.test.ts` y `floorplan-performance.test.tsx` (50/100/200).
- `apps/client/src/workspace/ActiveEventWorkspacePage.test.tsx`: read-only, asignar/mover/desasignar,
  family/group, capacidad, mismo idempotency key, `409`, filtros/página 50 y Estados terminales.

### 9.4 Admin, autorización, auditoría y realtime

- `apps/admin/src/auth/admin-auth.test.tsx`, `events/admin-events.test.tsx`,
  `clients/admin-clients.test.tsx`, `audit/admin-audit.test.tsx`, `finance/admin-finance.test.tsx`,
  `catalog/admin-catalog.test.tsx` y `reports/admin-reports.test.tsx`.
- `packages/api-client/src/admin/admin.test.ts` y `audit.test.ts`.
- `apps/api/src/auth/roles.guard.spec.ts`, `apps/api/test/auth.integration-spec.ts` y
  `apps/api/src/clients/client-access.policy.spec.ts`.
- `apps/api/src/audit/*.spec.ts` y `apps/api/test/audit.integration-spec.ts`.
- `apps/api/src/realtime/realtime-contract.spec.ts`, `apps/api/test/realtime.integration-spec.ts` y
  `apps/client/src/workspace/useWorkspaceRealtime.test.ts`.
- `apps/api/test/staff-access.integration-spec.ts` y
  `apps/api/src/staff-access/staff-token-technical.service.spec.ts`.

### 9.5 Cobertura operator-led ausente

No existe test de happy path provider-led para Events/Design/Floorplan/Staff porque la capability no existe. La
cobertura actual sólo demuestra rutas administrativas existentes y que Platform Admin queda bloqueado en rutas
operativas Planner, incluido `event-activation.integration-spec.ts`.

## 10. Resultado de tests ejecutados

Comandos derivados de scripts existentes en `package.json` y package manifests:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @invitaciones/client test -- ...` (wizard, design, todos los tests floorplan y workspace) | Primera ejecución: timeout externo a 120 s. Repetición con margen: 18 archivos verdes, 1 archivo con un caso agotando su timeout de 15 s; total 240 passed, 1 failed por timeout. |
| Repetición aislada de `FloorplanStep.test.tsx` con `-t "protects the active draft..."` | 1 passed, 39 skipped; el mismo caso pasó en 7.93 s. Se clasifica como sensibilidad temporal/preexistente, no fallo funcional reproducido. |
| `pnpm --filter @invitaciones/admin test --` auth + events + audit | 3 archivos, 33 tests: **PASS**. |
| `pnpm --filter @invitaciones/api test --` Events + Invitation Design + Floorplan + roles + audit + realtime + Staff technical | 17 archivos, 128 tests: **PASS**. |
| `pnpm --filter @invitaciones/api-client test --` admin + audit | 2 archivos, 27 tests: **PASS**. |
| `pnpm --filter @invitaciones/api test:integration --` Events + activation + Invitation Design + Floorplan + Staff + realtime + audit | 7 archivos, 83 tests: **PASS** contra PostgreSQL real. |
| `pnpm run ci` | `format:check`, lint (7/7 paquetes) y typecheck (9/9 tareas) pasaron. El gate se detuvo en test: `@invitaciones/client#test` tuvo 2 archivos fallidos y 6 tests fallidos; por ello el script no alcanzó build. |
| `pnpm --filter @invitaciones/client test -- --reporter=dot` | Reproducción completa: 29/31 archivos y 389/395 tests pasan. Fallan 4 casos de `src/workspace/InvitationDistribution.test.tsx` y 2 de `src/wizard/review/ReviewStepDistributionHandoff.test.tsx`. |
| `pnpm --filter @invitaciones/client test -- src/wizard/review/ReviewStepDistributionHandoff.test.tsx` | Reproducción aislada: 2/2 fallan; tras la acción simulada permanece abierto `Confirmar activación` y no aparecen los links esperados `Enviar invitaciones` / `Ir al evento`. |
| `pnpm build` | 7/7 paquetes: **PASS**. Vite reportó únicamente warnings de chunks mayores a 500 kB. |

La integración emitió warnings deprecados de `pg` sobre `client.query()` concurrente y el warning de Nest para
auto-conversión de `/api/v1/*`; las pruebas esperadas de rollback también registraron errores simulados. Ninguno
produjo fallo de suite.

El fallo del gate raíz es reproducible y está fuera de la superficie modificada por OP-01: este cambio sólo agrega
Markdown. No se corrigieron esos tests ni el flujo de distribución/activación porque hacerlo sería implementación o
refactor fuera de alcance.

## 11. Riesgos

1. **Bloqueante de piloto — acceso:** no existe provider-led access. Habilitar UI Admin hoy no autoriza ninguna
   mutación.
2. **Seguridad — shortcut peligroso:** añadir Platform Admin a decorators Planner omitiría target Client, allowlist y
   auditoría semántica del ADR.
3. **Frontera launch incompleta:** Seating UI es read-only para geometría, pero el wizard y API Floorplan todavía
   permiten mutación Planner. La separación completa requiere backend, no sólo routing/ocultamiento.
4. **Concurrencia de geometría:** hay locks serializables pero no versión esperada; una escritura vieja serializada
   puede sobrescribir otra. No cambiar el contrato sin decisión posterior.
5. **Acoplamiento de autorización:** `EventsService`, `InvitationDesignService`, `FloorplanService` y
   `StaffTokenManagementService` mezclan lookup owned con caso de uso. OP-02 debe adaptar esa entrada sin duplicar
   dominio.
6. **Cross-app:** `apps/admin` no puede importar el Builder desde `apps/client/src`; una UI posterior necesitará
   composición/extracción respetando el monorepo.
7. **Realtime:** Platform Admin sólo puede room dashboard; no asumir que realtime Floorplan administrativo ya existe.
8. **Baseline Client no verde:** además del caso Floorplan sensible al tiempo que pasó aislado, la suite completa
   reproduce 6 fallos en `InvitationDistribution.test.tsx` y `ReviewStepDistributionHandoff.test.tsx`. El patrón es
   asincronía/estado de UI no asentado antes de las aserciones; OP-01 no autoriza modificar test/runtime o flujo.
9. **Superficie máxima del ADR:** no todo lo permitido es necesario para piloto. Implementarlo completo sin selección
   operativa concreta aumentaría alcance y riesgo.

## 12. Preguntas realmente bloqueantes

No hay preguntas bloqueantes para cerrar OP-01: `17_QA_OPEN_DECISIONS.md` no contiene decisiones `OPEN`, el código
real permite localizar el gap y no se requiere modificar producto.

Antes de fijar el contrato exacto de OP-02 sí será necesario que su tarea delimite la allowlist de piloto dentro del
máximo del ADR, especialmente:

- si creación de StaffToken por proveedor entra en el primer corte;
- si activación provider-led entra en el primer corte o permanece con el cliente;
- si OP-02 debe incluir únicamente API/casos de uso o también un entry point mínimo en Admin.

Estas preguntas no bloquean el baseline y no autorizan anticipar implementación.

## Verificación final del cambio documental

`format:check`, lint, typecheck y build pasan. Las suites específicas relevantes y la integración pasan con los
conteos anteriores. El test completo del workspace no está verde por 6 fallos reproducibles de Client, documentados
con sus archivos y síntomas; el gate raíz se detiene antes de build, que se ejecutó y pasó por separado.

El único archivo del diff de OP-01 es este baseline. No se modificaron código, UI, roles, migraciones, Prisma,
OpenAPI ni contratos.
