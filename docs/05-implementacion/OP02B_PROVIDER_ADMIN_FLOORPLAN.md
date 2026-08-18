# OP-02B — Provider-led administrative Floorplan capability

Estado: **READY FOR CODE**  
Prioridad: **P0 / bloqueante para OP-03 y Builder operator-led**  
Issue: **#23**  
Repositorio: `ManuelRuiz27/invitacionespremium`  
Workflow: **directo sobre `main`** conforme a `AGENTS.md`.

## 1. Objetivo

Completar la frontera backend mínima para que un `PLATFORM_ADMIN` autenticado pueda operar un Croquis real de un Cliente/Evento explícitamente seleccionado, sin impersonar Planner, sin ampliar `PLANNER_ROLES`, sin obtener Seating y sin crear un backend Floorplan paralelo.

OP-02B extiende el patrón validado por OP-02A:

```text
Platform Admin real
  -> target explícito clientId + eventId
  -> autorización administrativa no filtrante
  -> mismo dominio/invariantes Floorplan existentes
  -> auditoría con actor real
```

Este ticket no cambia todavía la superficie Planner. La retirada de mutación de geometría para Planner corresponde a OP-03.

## 2. Contratos obligatorios

Leer antes de código, en este orden:

1. `AGENTS.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/01-producto/04_OPERATOR_LED_MVP.md`
4. `docs/01-producto/ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md`
5. `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`
6. `docs/05-implementacion/OP01_TECHNICAL_BASELINE.md`
7. `docs/05-implementacion/OP02_PROVIDER_ADMIN_EVENT_SETUP.md`
8. `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`
9. `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`
10. `docs/05-implementacion/19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`
11. `docs/05-implementacion/14_CODEX_RULES.md`
12. `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`
13. este documento

Ante referencias antiguas a ramas/PR, prevalece `AGENTS.md`: trabajo directo sobre `main` salvo orden expresa del usuario.

## 3. Runtime existente que se reutiliza

### Floorplan

- `apps/api/src/floorplan/floorplan.controller.ts`
- `apps/api/src/floorplan/floorplan.service.ts`
- `apps/api/src/floorplan/floorplan-access.service.ts`
- `apps/api/src/floorplan/floorplan.dto.ts`
- `apps/api/src/floorplan/floorplan.module.ts`

### FileAssets

- `apps/api/src/file-assets/file-assets.controller.ts`
- `apps/api/src/file-assets/file-assets.service.ts`
- `apps/api/src/file-assets/file-assets.dto.ts`
- `apps/api/src/file-assets/file-asset-compatibility.ts`
- `apps/api/src/file-assets/file-asset-owner.registry.ts`
- `apps/api/src/file-assets/file-image-validator.ts`
- `apps/api/src/file-assets/file-storage.ts`

### Infraestructura transversal

- auth/roles actuales;
- `EventAccessPolicy` para el flujo Planner existente;
- `AuditService`;
- `CRITICAL_TRANSACTION_OPTIONS`;
- Prisma/schema vigente;
- OpenAPI y `packages/api-client` generado;
- realtime existente;
- Staff/Scanner existentes.

## 4. Invariantes que deben permanecer idénticos

No reimplementar ni reinterpretar:

- `LAYOUT_MUTABLE` actual;
- `FOR UPDATE` y serialización/retry actuales;
- un solo Floorplan activo por Evento;
- lock/unlock;
- `FLOORPLAN_LAYOUT_LOCKED`;
- validaciones `floorplanShapeSchema`;
- coordenadas normalizadas `0..1`;
- `TABLE` / `DECORATIVE_ZONE`;
- capacidad positiva para Mesas y cero para zonas;
- ocupación combinada de Assistants + PhysicalPasses;
- prohibición de borrar Mesa ocupada;
- validaciones PostgreSQL existentes;
- claim/hide de FileAssets;
- compatibilidad `FLOORPLAN -> FLOORPLAN_IMAGE`;
- `recomputeDigitalEventPreparationStatus`;
- auditoría Floorplan/FileAsset existente;
- realtime existente;
- Scanner y Seating.

No crear `FloorplanV2`, `Sticker`, `Seat` ni `SeatAssignment`.

## 5. Superficie administrativa Floorplan autorizada

Implementar exactamente la capability geométrica bajo:

```http
GET    /api/v1/admin/clients/:clientId/events/:eventId/floorplan
POST   /api/v1/admin/clients/:clientId/events/:eventId/floorplan
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/floorplan
POST   /api/v1/admin/clients/:clientId/events/:eventId/floorplan/lock
POST   /api/v1/admin/clients/:clientId/events/:eventId/floorplan/unlock
POST   /api/v1/admin/clients/:clientId/events/:eventId/floorplan/shapes
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/floorplan/shapes/:shapeId
DELETE /api/v1/admin/clients/:clientId/events/:eventId/floorplan/shapes/:shapeId
```

Reutilizar DTOs y parsers actuales de Floorplan. No crear payloads paralelos si el contrato vigente ya cubre la operación.

El controller administrativo debe ser estrecho y no incluir endpoints Seating.

## 6. Superficie administrativa mínima para FLOORPLAN_IMAGE

No reutilizar el controller genérico Planner agregando `PLATFORM_ADMIN`.

No aceptar del consumidor administrativo un `ownerType` o `fileType` arbitrario.

La superficie provider-led debe forzar en servidor:

```text
ownerType = FLOORPLAN
fileType  = FLOORPLAN_IMAGE
```

Superficie autorizada:

```http
POST   /api/v1/admin/clients/:clientId/events/:eventId/floorplan/file-assets
GET    /api/v1/admin/clients/:clientId/events/:eventId/floorplan/file-assets
GET    /api/v1/admin/clients/:clientId/events/:eventId/floorplan/file-assets/:fileAssetId/content
DELETE /api/v1/admin/clients/:clientId/events/:eventId/floorplan/file-assets/:fileAssetId
```

### POST

- multipart `file` únicamente;
- no necesita ni debe confiar en `ownerType`/`fileType` del body;
- reutilizar `FileImageValidator`, tamaño máximo, storage staging, checksum, dimensiones, estado `UPLOADING -> READY/FAILED`, auditoría y cleanup actuales;
- conservar exactamente la ventana de estados vigente para `FLOORPLAN_IMAGE`: preparación y el comportamiento operacional ya autorizado en `ACTIVE`/`EVENT_DAY`.

### GET list

- devolver sólo assets del `eventId` objetivo con `ownerType=FLOORPLAN`, `fileType=FLOORPLAN_IMAGE` y `deletedAt=null`;
- no listar assets Flyer, Flipbook, Album, QR, Report ni cualquier otro tipo.

### GET content

- resolver únicamente un `FLOORPLAN_IMAGE` perteneciente al mismo `clientId/eventId`;
- exigir estado `READY` y checksum como el flujo actual;
- conservar headers privados (`Cache-Control: private, no-store`, `nosniff`, etc.).

### DELETE

- sólo un `FLOORPLAN_IMAGE` del target;
- conservar soft delete actual;
- si `ownerId !== null`, conservar `FILE_ASSET_ASSOCIATED`;
- no permitir borrar mediante esta superficie assets de otros tipos aunque pertenezcan al mismo Evento.

No agregar un endpoint administrativo genérico de FileAssets en este ticket.

## 7. Autorización y target

Toda operación administrativa Floorplan/FileAsset debe:

- exigir `UserRole.PLATFORM_ADMIN`;
- usar `@CurrentAuth()` real;
- propagar `request.operationId` en mutaciones;
- validar UUID de `clientId`, `eventId`, `shapeId` y `fileAssetId` según aplique;
- resolver el Evento siempre por `id = eventId AND clientId = clientId AND deletedAt IS NULL`;
- responder `EVENT_NOT_FOUND` con semántica no filtrante ante mismatch/no existencia del target;
- preservar `createdByUserId` y ownership originales;
- no depender de `principal.clientId`.

Prohibido:

- `PLATFORM_ADMIN` en `PLANNER_ROLES`;
- principal Planner falso;
- mutar `principal.clientId`;
- rol `OPERATOR`;
- bypass global de `EventAccessPolicy`;
- autorización basada sólo en conocer `eventId`;
- endpoint genérico administrativo para todos los FileAssets.

## 8. Diseño interno esperado

### FloorplanAccessService

Separar la resolución del target de la lógica de dominio, conservando el flujo Planner actual.

Dirección aceptable:

```text
Planner
  -> requireOwnedEvent(...principal)

Platform Admin
  -> requireAdministrativeEvent(...clientId, eventId)

ambos
  -> mismas operaciones actor-neutrales Floorplan
```

Puede extraerse un helper privado pequeño para lock + lookup común. No construir un framework genérico de strategies/resolvers.

### FloorplanService

Agregar entradas administrativas estrechas o refactorizar las operaciones existentes para recibir un target ya autorizado, siempre preservando una única implementación de:

- create;
- get;
- replace image;
- lock/unlock;
- create/update/delete shape.

No duplicar el dominio completo en métodos `*Admin`.

El `principal` continúa siendo útil para actor de auditoría; no debe usarse para fingir ownership Planner.

### FileAssetsService

Agregar entradas administrativas exclusivamente para `FLOORPLAN_IMAGE` y compartir el núcleo actual de upload/list/content/delete donde sea seguro.

El servicio administrativo no debe aceptar `FileAssetType`/`FileAssetOwnerType` arbitrarios desde controller.

## 9. contentPath administrativo obligatorio

`toFloorplanResponse()` actualmente proyecta:

```text
/api/v1/events/:eventId/file-assets/:fileAssetId/content
```

Esa ruta pertenece al flujo Planner y `PLATFORM_ADMIN` no debe obtener permiso sobre ella.

Por tanto, **toda respuesta Floorplan administrativa** debe proyectar un `image.contentPath` administrativo válido, por ejemplo:

```text
/api/v1/admin/clients/:clientId/events/:eventId/floorplan/file-assets/:fileAssetId/content
```

No solucionar este problema ampliando roles del controller Planner.

Puede reutilizarse `FloorplanResponseDto`; la diferencia puede resolverse mediante mapper/proyección interna pequeña. No crear otro modelo de negocio Floorplan.

## 10. Asset isolation

Al crear o reemplazar imagen:

- el asset debe ser `READY`;
- `ownerType=FLOORPLAN`;
- `fileType=FLOORPLAN_IMAGE`;
- `ownerId=null` antes de claim;
- `asset.clientId` debe coincidir con el Cliente target;
- `asset.eventId` debe coincidir con el Evento target;
- el owner resolver actual debe continuar validando relación real.

Un asset de otro Cliente o Evento debe ser rechazado por las invariantes actuales (`ownerMismatch`/semántica vigente), y la transacción no debe dejar un Floorplan parcial.

No relajar `claimReadyAssetInTransaction()`.

## 11. Seating explícitamente excluido

No crear ninguna ruta administrativa equivalente a:

```text
GET   /events/:eventId/seating
POST  /events/:eventId/seating/assign
POST  /events/:eventId/seating/assign-family
POST  /events/:eventId/seating/assign-group
PATCH /events/:eventId/seating/:assistantId
```

Requisitos de prueba:

- `PLATFORM_ADMIN` continúa recibiendo `403` en los endpoints Planner de Seating;
- bajo `/admin/clients/:clientId/events/:eventId/...` no existe superficie Seating provider-led (`404` o ausencia de ruta en OpenAPI).

No tocar `runSeating()` salvo ajuste mecánico estrictamente necesario para compilar; cualquier cambio funcional en Seating queda fuera de alcance.

## 12. Scanner/Staff

No modificar:

- `ScannerFloorplanController`;
- resolución de StaffToken;
- `scannerFloorplan()`;
- `scannerContent()`;
- roles/permisos Staff;
- payloads Scanner;
- comportamiento de check-in.

Los tests de regresión deben demostrar que la nueva superficie administrativa no altera el acceso Scanner existente.

## 13. Auditoría

Usar el actor humano real:

```text
actor.type = USER
actor.id   = principal.userId del PLATFORM_ADMIN
```

Conservar acciones actuales de Floorplan/FileAsset en lugar de inventar acciones equivalentes sólo por ser Admin:

- `FLOORPLAN_CREATE`;
- `FLOORPLAN_IMAGE_REPLACE`;
- acciones lock/unlock actuales;
- `FLOORPLAN_SHAPE_CREATE`;
- `FLOORPLAN_SHAPE_UPDATE`;
- `FLOORPLAN_SHAPE_DELETE`;
- `FILE_ASSET_UPLOAD_READY` / `FAILED`;
- `FILE_ASSET_CLAIM`;
- `FILE_ASSET_HIDE`;
- `FILE_ASSET_SOFT_DELETE`.

Preservar `clientId`, `eventId`, `resourceType`, `resourceId`, datos actuales y `operationId` cuando exista.

No inventar actor `PROVIDER`/`OPERATOR`.

## 14. Tests obligatorios

Ampliar preferentemente:

- `apps/api/test/floorplan.integration-spec.ts`;
- `apps/api/test/file-assets.integration-spec.ts` sólo donde aporte cobertura específica de assets;
- suites Scanner/Staff únicamente si es necesario para regresión puntual.

Cubrir como mínimo:

1. Admin GET Floorplan correcto.
2. Admin upload válido de `FLOORPLAN_IMAGE`.
3. Upload administrativo no puede crear otros tipos/owners.
4. Admin list no filtra assets ajenos al tipo Floorplan: sólo devuelve Floorplan images.
5. Admin content sirve sólo imagen Floorplan READY del target.
6. Admin delete elimina sólo asset Floorplan desacoplado.
7. Asset asociado no puede eliminarse.
8. Admin create Floorplan con asset del mismo Event.
9. Foreign Client/Event asset rejection + rollback.
10. Admin replace image + old asset HIDDEN + new asset CLAIMED.
11. create/update/delete shape reutilizando validaciones actuales.
12. occupied table sigue sin poder borrarse/reducirse inconsistentemente.
13. lock/unlock conserva comportamiento actual.
14. Client A + Event B -> `404 EVENT_NOT_FOUND`.
15. Event inexistente -> misma semántica.
16. Client inexistente -> misma semántica.
17. estado incompatible -> `FLOORPLAN_EVENT_STATE_LOCKED` vigente.
18. auditoría usa Platform Admin real + client/event correctos + operationId.
19. Planner Floorplan endpoints siguen funcionando.
20. Platform Admin sigue prohibido en Planner Floorplan/Seating.
21. no existe Admin Seating en OpenAPI.
22. Scanner Floorplan/content sigue funcionando con StaffToken válido.
23. OpenAPI contiene sólo las nuevas rutas administrativas autorizadas.

## 15. OpenAPI / SDK

Regenerar conforme al workflow normal del repo.

El SDK generado puede cambiar por las rutas nuevas.

No construir todavía clients manuales de UI Admin ni consumir estas rutas desde frontend.

Verificar que OpenAPI no incluya rutas administrativas Seating ni FileAssets genéricas no autorizadas.

## 16. Archivos esperables

### ADAPT

- `apps/api/src/floorplan/floorplan-access.service.ts`
- `apps/api/src/floorplan/floorplan.service.ts`
- `apps/api/src/floorplan/floorplan.module.ts`
- `apps/api/src/file-assets/file-assets.service.ts`
- tests de integración relevantes

### BUILD

Es aceptable agregar uno o dos controllers administrativos estrechos dentro de los módulos existentes, por ejemplo:

- controller administrativo Floorplan;
- controller administrativo Floorplan FileAsset.

No crear módulos Nest nuevos si `FloorplanModule` + `FileAssetsModule` actuales bastan.

### GENERADO

- `packages/api-client/src/generated/schema.ts` y otros artefactos generados estándar si el workflow del repo los actualiza.

## 17. Fuera de alcance

- UI Admin;
- UI Client;
- Croquis V2 visual/Sticker shell;
- retirar Builder a Planner (OP-03);
- Seating provider-led;
- Invitation Design provider-led;
- Hotspots provider-led;
- RSVP provider-led adicional;
- Staff provider-led;
- activación administrativa;
- Finance/credits/pricing;
- Prisma/migrations;
- nuevos roles;
- nuevas entidades;
- refactors oportunistas.

## 18. Definition of Done

OP-02B está terminado cuando puede demostrarse:

```text
PLATFORM_ADMIN real
+ clientId/eventId explícitos
+ FLOORPLAN_IMAGE seguro y restringido
+ Floorplan CRUD geométrico real
+ contentPath administrativo renderizable
+ invariantes/locks/concurrencia actuales
+ auditoría con actor real
+ cross-tenant denial
+ Planner sin cambios
+ Seating inexistente para Admin
+ Scanner/Staff sin regresión
```

La existencia de endpoints por sí sola no basta.

Al terminar, Codex debe devolver commit SHA en `main`, archivos modificados, endpoints agregados, evidencia de autorización/auditoría, QA ejecutado, fallos preexistentes separados y diff final. No iniciar OP-03.