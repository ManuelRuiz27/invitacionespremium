# OP-03A — Separación Planner / Provider

Estado: **READY FOR CODE**  
Issue: **#25**  
Base aprobada: `4d860d0f57c5ca3a9cc7b5fd5054af707fdc8e4c`  
Workflow: `main` directo.

## Objetivo

Hacer cumplir en backend el perfil operator-led sin cambiar dominio:

- Planner conserva Contactos/Invitados, distribución, RSVP operativo, lectura de Croquis e Invitación y Seating.
- Provider conserva Event Setup, mutación de infraestructura de Invitación y geometría de Croquis mediante OP-02A/B/C.
- OP-03A no toca UI; el gating/routing corresponde a OP-03B / #26.

Fuentes obligatorias: `AGENTS.md`, `04_OPERATOR_LED_MVP.md`, `ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md`, `ADR_OPERATOR_LED_ACCESS.md`, `FILE_ASSETS_CONTRACT.md`, `INVITATION_DESIGN_CONTRACT.md`, `FLOORPLAN_STICKER_SEATING_CONTRACT.md`, OP-02A/B/C, roadmap 19 y Issue #25.

## Floorplan Planner

Mantener:

```http
GET   /api/v1/events/:eventId/floorplan
GET   /api/v1/events/:eventId/seating
POST  /api/v1/events/:eventId/seating/assign
POST  /api/v1/events/:eventId/seating/assign-family
POST  /api/v1/events/:eventId/seating/assign-group
PATCH /api/v1/events/:eventId/seating/:assistantId
```

Retirar del `FloorplanController` Planner y de OpenAPI:

```http
POST   /api/v1/events/:eventId/floorplan
PATCH  /api/v1/events/:eventId/floorplan
POST   /api/v1/events/:eventId/floorplan/lock
POST   /api/v1/events/:eventId/floorplan/unlock
POST   /api/v1/events/:eventId/floorplan/shapes
PATCH  /api/v1/events/:eventId/floorplan/shapes/:shapeId
DELETE /api/v1/events/:eventId/floorplan/shapes/:shapeId
```

No borrar los métodos compartidos de `FloorplanService`: OP-02B Admin los reutiliza. No modificar Seating, idempotencia, capacidad, realtime ni concurrencia.

## Invitation Design Planner

Mantener sólo lectura:

```http
GET /api/v1/events/:eventId/design
GET /api/v1/events/:eventId/design/readiness
GET /api/v1/events/:eventId/hotspots
```

Retirar del controller Planner y de OpenAPI todas las mutaciones:

- crear/reemplazar Flyer;
- crear Flipbook;
- add/reorder/replace/delete páginas;
- create/update/delete Hotspots.

No borrar ni duplicar `InvitationDesignService`: OP-02C Admin reutiliza ese dominio. No cambiar `MUTABLE_EVENT_STATUSES`, ServiceCode, readiness, claim/hide, reglas de páginas/Hotspots, auditoría ni transacciones.

## FileAssets Planner

Tipos técnicos transferidos al Provider:

```text
FLOORPLAN_IMAGE
FLYER_INITIAL_IMAGE
FLYER_QR_IMAGE
FLIPBOOK_PAGE_IMAGE
```

### Lectura permanece permitida

Mantener para esos cuatro tipos:

```http
GET /api/v1/events/:eventId/file-assets
GET /api/v1/events/:eventId/file-assets/:fileAssetId
GET /api/v1/events/:eventId/file-assets/:fileAssetId/content
```

Esto es obligatorio: `GET /floorplan` usa un `contentPath` Planner al FileAsset y las vistas read-only necesitan leer los bytes ya asociados. Operator-led retira control técnico, no visibilidad operativa.

### Mutación se bloquea

`POST /events/:eventId/file-assets` sigue existiendo para dominios Planner como Álbum, pero debe rechazar antes de staging/storage cualquiera de los cuatro tipos técnicos con `403` estable, recomendado:

```text
FILE_ASSET_PROVIDER_MANAGED
```

No crear fila `UPLOADING` ni escribir bytes para un upload rechazado.

`DELETE /events/:eventId/file-assets/:fileAssetId` sigue existiendo para assets Planner permitidos, pero dentro del row lock actual debe rechazar esos cuatro tipos con `403 FILE_ASSET_PROVIDER_MANAGED` antes de mutar a `DELETED`.

No aplicar ese guard a los métodos Admin OP-02B/C. `ALBUM_PHOTO_IMAGE` y otros tipos Planner no transferidos conservan las reglas actuales.

## packages/api-client

Regenerar `packages/api-client/src/generated/schema.ts` desde OpenAPI.

Debe conservar lecturas Planner y Seating, eliminar paths Planner de mutación Floorplan/Invitation y conservar todas las rutas Admin OP-02A/B/C.

No eliminar a ciegas en OP-03A los métodos manuales históricos de `packages/api-client/src/wizard.ts` si eso rompe `apps/client` antes de OP-03B. El backend es la frontera de seguridad de este ticket. No agregar fallbacks que recreen permisos Planner.

## QA obligatorio

Probar como Planner:

- GET Floorplan sigue funcionando;
- Seating GET/mutaciones siguen funcionando;
- mutaciones de geometría Floorplan ya no existen;
- GET Design/readiness/hotspots siguen funcionando;
- mutaciones Flyer/Flipbook/pages/Hotspots ya no existen;
- upload de cada uno de los cuatro tipos técnicos => `403 FILE_ASSET_PROVIDER_MANAGED` y sin staging row;
- delete de esos cuatro tipos => `403 FILE_ASSET_PROVIDER_MANAGED`;
- list/get/content de `FLOORPLAN_IMAGE` y de imágenes Flyer/Flipbook siguen funcionando;
- `ALBUM_PHOTO_IMAGE` no regresiona.

Regresión Admin:

- OP-02A Event Setup;
- OP-02B Floorplan + `FLOORPLAN_IMAGE`;
- OP-02C Invitation + sus tres tipos de imagen.

Además ejecutar integración relevante de Floorplan, Invitation Design, FileAssets, Seating/Scanner/Public RSVP; OpenAPI/api-client generate+check; format; lint; typecheck; build; suite global disponible separando fallos preexistentes.

## Fuera de alcance

No tocar UI/routing, Croquis V2 visual, `SeatingWorkspace`, Contactos, distribución, RSVP operativo, Public RSVP, Scanner, Staff, Finance, credits, activation, Prisma/migrations, roles ni política por campo de `PATCH /events/:eventId`.

## Definition of Done

```text
Planner = personas + operación + lectura de infraestructura + Seating
Provider = preparación técnica + Invitación + geometría de Croquis
```

La separación debe existir en backend, no sólo en botones. No iniciar OP-03B / #26 hasta aprobar #25.