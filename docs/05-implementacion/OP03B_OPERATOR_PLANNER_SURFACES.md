# OP-03B — Superficie de lanzamiento Operator / Planner

Estado: **READY FOR CODE**  
Issue: **#26**  
Base funcional: OP-03A aprobado en `edbb0494fd4b2c5b8a202ef4791c971b9c551c60`  
Workflow: `main` directo.

## 1. Objetivo

Reflejar en frontend la separación que OP-03A ya hace cumplir en backend:

- Planner controla personas y operación;
- Provider prepara infraestructura técnica mediante OP-02A/B/C;
- ninguna restricción crítica depende sólo de ocultar UI.

Este ticket NO rediseña Croquis V2. Deja una ruta Admin estable para que FP-01 monte ahí el Builder real.

## 2. Planner — launch surface

Conservar:

- Dashboard/Eventos;
- creación/configuración de datos de Evento conforme al contrato vigente;
- Invitados/Contactos;
- confirmación/RSVP operativo;
- revisión/activación vigente;
- distribución de invitaciones en workspace activo;
- Croquis read-only en `SeatingWorkspace`;
- Seating completo.

Retirar del flujo normal de lanzamiento:

- paso `invitacion` del Wizard;
- paso `croquis` del Wizard;
- `DesignStep` y `FloorplanStep` NO se eliminan del código.

La implementación preferida es gating mediante `stepsForService()` / modelo equivalente:

- digital: `datos -> contactos -> confirmacion -> revision`;
- physical QR: `datos -> pases -> revision`.

`wizardSteps` puede conservar los nombres históricos para componentes reutilizables.

Una URL directa como `/eventos/:eventId/configuracion/invitacion` o `/croquis` debe redirigir con `replace` a una etapa Planner válida; no debe montar el editor retirado ni dejar una pantalla rota.

## 3. ReviewStep

Readiness técnica sigue consultándose en modo lectura:

- `design.readiness()`;
- `floorplan.get()` cuando aplique.

Los checks administrados por Provider (`Invitación`, `Mesas listas`) deben mostrarse como informativos cuando están pendientes. No mostrar CTA `Corregir` que intente navegar a `invitacion`/`croquis`.

No duplicar ni reinterpretar readiness. No habilitar activación si el backend/Event todavía no está `READY_TO_ACTIVATE`.

Los checks que sí controla Planner pueden conservar `Corregir` a una etapa disponible.

## 4. Active Event Workspace

No reconstruir `ActiveEventWorkspacePage` ni `SeatingWorkspace`.

Conservar:

- distribución de invitaciones;
- consulta RSVP;
- sección Mesas y distribución;
- Croquis read-only;
- seating individual/familia/grupo, movimiento/desasignación, capacidad, concurrencia y realtime.

## 5. Gap explícito de Event PATCH

OP-03B NO redefine autorización por campo de `PATCH /events/:eventId`.

En particular, el flujo histórico puede cambiar `serviceId` y usar `resetInvitationDesign: true`. Eso puede interactuar con infraestructura preparada por Provider. No inventar una nueva política en este ticket ni modificar backend para resolverla.

Registrar el riesgo en la entrega como **PRODUCT DECISION REQUIRED / fuera de alcance** para una matriz posterior de campos Planner/Provider si sigue siendo necesario.

## 6. Admin — routing

Agregar rutas protegidas dentro de `apps/admin`:

- `/eventos/:eventId/preparar`
- `/eventos/:eventId/preparar/datos`
- `/eventos/:eventId/preparar/invitacion`
- `/eventos/:eventId/preparar/croquis`

`AdminEventDetailPage` debe ofrecer CTA inequívoco **Preparar evento** para Evento no eliminado.

La pantalla de preparación carga primero el Evento mediante Admin API y toma de ahí `clientId`. Toda mutación técnica conserva explícitamente `clientId + eventId`.

No impersonar Planner y no navegar al Client app para preparar.

## 7. Admin API client

`packages/api-client` debe exponer una superficie tipada administrativa de preparación usando el OpenAPI ya generado. Puede llamarse `adminEventPreparation` o equivalente.

Debe usar exclusivamente paths Admin de OP-02:

### OP-02A

- PATCH `/admin/clients/:clientId/events/:eventId`

### OP-02C Invitación

- GET design/readiness/hotspots;
- Flyer create/replace;
- Flipbook create/add/reorder/replace/delete pages;
- Hotspots create/update/delete;
- Invitation FileAssets upload/list/content/delete.

### OP-02B Croquis en este ticket

Sólo lo necesario para mostrar estado/entrada estable a la futura superficie Croquis. No adelantar shell FP-01 ni reimplementar motor. El cliente puede incluir `getFloorplan()` si la pantalla de estado lo requiere; las mutaciones completas del Builder pueden esperar a FP-01.

No usar endpoints Planner `/events/...`, `/services`, `/file-assets`, `/design` o `/floorplan` desde Admin.

No editar manualmente tipos OpenAPI: consumir `generated/schema.ts` vigente.

## 8. Admin — Preparar evento

La pantalla es un hub pequeño, no otro dashboard.

Debe mostrar:

- identidad del Evento/Cliente;
- estado;
- progreso técnico por secciones;
- navegación `Datos`, `Invitación`, `Croquis`;
- estados loading/error/empty.

### 8.1 Datos

Usar OP-02A.

Puede editar campos ya presentes en `UpdateEventRequestDto` que puedan representarse sin inventar catálogos o permisos nuevos, por ejemplo:

- nombre;
- tipo social;
- fecha/hora;
- zona horaria;
- capacidad;
- confirmación habilitada;
- ubicación;
- mesa de regalos;
- floorplan habilitado.

El servicio contratado se muestra en lectura en este ticket. **No consumir `GET /services`**, porque esa ruta es Planner-only y no existe todavía un catálogo Admin read equivalente autorizado para selección de servicio.

No inventar endpoint para resolverlo.

### 8.2 Invitación

La UI Admin debe ser funcional para dejar Flyer/Flipbook preparados usando OP-02C, pero deliberadamente más simple que el editor histórico Client.

Reglas:

- el tipo se deriva de `event.serviceCode`; no permitir cambiar el servicio desde esta sección;
- Flyer: upload initial/QR, create y replace;
- Flipbook: create, upload/add pages, replace page asset, delete, reorder dentro de 1..10;
- listar/servir assets privados sólo por Admin Invitation FileAssets;
- Hotspots: listar, crear, editar y eliminar usando los cinco tipos ya existentes;
- coordenadas normalizadas siguen siendo payload, pero la interacción preferida es sobre preview/overlay; no crear reglas nuevas ni copiar validaciones de backend;
- el backend es autoridad para owner compatibility, bounds, URLs, cover/QR page placement y readiness;
- errores de dominio se muestran en lenguaje útil sin reinterpretar el contrato.

No importar `DesignStep`, `HotspotEditor`, `FloorplanStep` ni ningún source de `apps/client`.

No copiar un segundo conjunto de reglas de negocio al frontend Admin. Helpers puramente visuales ya existentes en `packages/ui` pueden reutilizarse; no crear package nuevo.

### 8.3 Croquis

`/preparar/croquis` es el punto estable provider-led.

En OP-03B puede mostrar:

- estado actual del Croquis;
- si existe/no existe;
- readiness/lock resumido si está disponible por Admin GET;
- contexto Client/Event;
- mensaje/entrypoint preparado para el Builder.

NO construir un editor paralelo. FP-01 sustituirá esta superficie mínima por el shell visual real sobre el engine existente.

No montar componentes Planner ni llamar endpoints Planner.

## 9. Arquitectura

Prohibido:

- `apps/admin` importando source de `apps/client`;
- `apps/client` importando source de Admin;
- crear un nuevo workspace/package en este ticket;
- mover reglas de negocio a `packages/ui`;
- duplicar DTOs manualmente;
- introducir Prisma, roles o backend nuevo;
- crear un provider role persistido;
- hacer que Admin use un principal Planner.

## 10. QA mínimo

### Client

Probar:

- steps digitales ya no contienen `invitacion`/`croquis`;
- physical QR ya no contiene `croquis`;
- deep-link `invitacion` redirige a etapa válida;
- deep-link `croquis` redirige a etapa válida;
- `DesignStep` y `FloorplanStep` siguen presentes en código pero no se montan en launch flow;
- ReviewStep no ofrece `Corregir` para readiness Provider-managed;
- Contactos/confirmación/revisión siguen navegables;
- Active workspace Invitations sigue disponible;
- `SeatingWorkspace` regression verde.

### Admin

Probar:

- Event Detail muestra `Preparar evento`;
- preparation route está protegida por Admin auth/role;
- carga Event y conserva `clientId/eventId`;
- Datos usa exclusivamente PATCH Admin OP-02A;
- Invitation usa exclusivamente Admin OP-02C;
- no request a Planner `/services`, `/events/:id/design`, `/events/:id/file-assets`, `/events/:id/floorplan`;
- Flyer happy path;
- Flipbook page happy path y reorder/delete;
- Hotspot CRUD básico;
- Croquis route usa sólo Admin read/status y no expone Builder Planner;
- loading/error/404/403 manejados.

### Gates

Ejecutar tests Client/Admin/api-client relevantes, `format:check`, `lint`, `typecheck`, `build` y suite global disponible. Separar fallos preexistentes.

## 11. Fuera de alcance

- FP-01/Croquis V2 shell;
- catálogo Sticker;
- reescritura del engine;
- SeatingWorkspace redesign;
- backend/Prisma/migrations;
- cambios de roles;
- Contacts/distribution/RSVP/Scanner/Staff/Finance;
- field-level authorization nueva para Event PATCH;
- nuevo catálogo Admin de servicios;
- borrar componentes históricos Client.

## 12. Definition of Done

Planner ya no recibe editores técnicos en su launch flow; mantiene personas, operación y Seating. Platform Admin obtiene un punto explícito `Preparar evento` que opera Datos e Invitación sólo mediante OP-02 y deja una ruta Croquis provider-led estable para FP-01, sin impersonación, imports cruzados ni rewrite del motor.