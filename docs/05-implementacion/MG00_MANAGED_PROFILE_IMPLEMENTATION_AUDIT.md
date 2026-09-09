# MG-00 — Managed Profile Implementation Audit

Estado: **COMPLETE — TECHNICAL OWNER AUDIT / PENDIENTE DE APROBACIÓN PARA CODE**  
Fecha: **9 de septiembre de 2026**  
Roadmap activo: `24_MANAGED_M01_LAUNCH_ROADMAP.md`  
Dirección de producto: `../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`

## 0. Dictamen ejecutivo

El runtime actual **sí contiene la mayor parte del producto M01**. No se requiere reconstruir InvitacionesPremium ni revertir el trabajo reciente de Croquis/SVG/Seating.

El problema principal es que el repositorio mezcla tres generaciones de superficie Client:

1. operator-led / Provider-managed;
2. autoservicio histórico del Planner;
3. workspace operativo moderno.

Eso produce una experiencia incoherente: el Provider ya tiene infraestructura administrativa suficiente para preparar Invitación y Croquis, pero el Client todavía ofrece creación técnica, selección de SKU, edición de Invitación, configuración de Evento, Finance y un Wizard con siete llamadas de Croquis que apuntan a rutas retiradas.

Para M01 la decisión funcional queda cerrada:

```text
PLATFORM_ADMIN / PROVIDER
crea Client/Event
configura producto
prepara Invitación
prepara Croquis / Mesas / Seats
revisa readiness
habilita Evento

INDEPENDENT_PLANNER
consulta Eventos asignados
administra invitados y acompañantes
opera RSVP
administra distribución
asigna personas a Mesas/Seats
crea Staff
opera Evento
cierra Evento cuando corresponda

STAFF
Scanner / check-in
```

Los bloqueos P0 reales son:

1. **MISSING:** no existe un `operatingProfile` explícito; `Client` sólo persiste `type` y `commercialChannel`.
2. **HIDE_FOR_MANAGED + ADAPT:** Client sigue exponiendo creación/configuración técnica y Finance.
3. **HIDE_FOR_MANAGED + ADAPT:** API Planner conserva mutaciones de Invitation Design, FileAssets técnicos y configuración de Event.
4. **BROKEN_REPAIR:** siete métodos Client/SDK de Croquis llaman rutas que ya no existen.
5. **MISSING:** el CI/API client no verifica que los wrappers manuales correspondan a operaciones OpenAPI reales.
6. **MISSING/ADAPT:** si se oculta el Wizard, el Planner pierde el CRUD principal de invitados, porque `ContactsStep` vive dentro de esa superficie.
7. **ADAPT:** varias operaciones existentes de Invitations/Assistants/RSVP/lifecycle no tienen superficie operativa Client completa.
8. **FINANCE_COUPLED:** el intake Admin actual exige Pricing V2 + cobertura financiera antes de crear Event.
9. **FINANCE_COUPLED:** Activation exige commercial lock, consumo financiero, Ledger y Receipt, y el trigger PostgreSQL exige esos snapshots.
10. **MISSING:** no existe fixture reproducible completo `Elena & Mateo` para M01 Managed.

El resultado de MG-00 es que **M01 se puede construir principalmente mediante gating, reuso y desacoplamiento**, no mediante nuevas entidades de negocio masivas.

---

# 1. Base auditada y validez de la auditoría Astra

## 1.1 Runtime

Astra auditó:

`main@9cfde0152004448db1f4fc86b45a500873b935bc`

El `main` al iniciar MG-00 era:

`8789df72439f3b38a5d9f62a8e1efcce66ce3275`

La comparación `9cfde015… → 8789df724…` contiene únicamente cambios en documentación y `AGENTS.md`; no hay cambios de runtime en `apps/**`, `packages/**`, Prisma ni migrations. Por tanto los hallazgos de código de Astra continúan aplicando al runtime actual, salvo contradicciones documentales ya saneadas.

## 1.2 Evidencia Astra reutilizada

La auditoría estática reportó:

- 192 operaciones HTTP implementadas;
- 192/192 presentes en OpenAPI;
- 151 con referencia de aplicación vía SDK;
- 2 consumidores técnicos directos;
- 28 operaciones sin wrapper operativo;
- 11 wrappers sin uso localizado;
- 7 llamadas SDK hacia rutas inexistentes;
- 0 rutas Controller ausentes en OpenAPI;
- 0 duplicados método+ruta;
- 0 controllers sin módulo;
- 0 imports de source entre apps;
- 0 ciclos entre módulos NestJS detectados.

MG-00 **no convierte los 39 endpoints sin consumidor en backlog automático**. Cada capability se clasifica según M01.

## 1.3 Archaeology adicional de Technical Owner

Se inspeccionaron directamente, entre otros:

- `apps/api/prisma/schema.prisma`;
- `apps/api/src/auth/auth.types.ts`;
- `apps/api/src/auth/auth.dto.ts`;
- `apps/api/src/auth/auth.service.ts`;
- `apps/api/src/clients/clients.dto.ts`;
- `apps/api/src/clients/clients.service.ts`;
- `apps/api/src/events/events.controller.ts`;
- `apps/api/src/events/admin-client-events.controller.ts`;
- `apps/api/src/events/event-access.policy.ts`;
- `apps/api/src/events/events.dto.ts`;
- `apps/api/src/events/events.service.ts`;
- `apps/api/src/invitation-design/invitation-design.controller.ts`;
- `apps/api/src/invitation-design/admin-invitation-design.controller.ts`;
- `apps/api/src/floorplan/floorplan.controller.ts`;
- `apps/api/src/floorplan/admin-floorplan.controller.ts`;
- `apps/api/src/physical-passes/physical-passes.controller.ts`;
- `apps/api/prisma/migrations/20260827120000_add_event_planner_assignment/migration.sql`;
- `packages/api-client/src/wizard.ts`;
- `apps/client/src/app/router.tsx`;
- `apps/client/src/layout/ClientNavigation.tsx`;
- `apps/client/src/dashboard/DashboardPage.tsx`;
- `apps/client/src/wizard/wizard-model.ts`;
- `apps/client/src/wizard/WizardPage.tsx`;
- `apps/client/src/wizard/design/DesignStep.tsx`;
- `apps/client/src/wizard/floorplan/PhysicalQrTablesStep.tsx`;
- `apps/client/src/wizard/review/ReviewStep.tsx`;
- `apps/client/src/workspace/ActiveEventWorkspacePage.tsx`.

También se revisó el inventario de suites PostgreSQL bajo `apps/api/test/`.

## 1.4 Límites

MG-00 es archaeology/documentación. No se ejecutaron mutaciones de negocio ni UAT de navegador dentro de esta tarea.

Las clasificaciones de consumo se apoyan en código actual + inventario Astra. La ausencia de un consumidor localizado no demuestra que nunca haya existido un caller externo.

---

# 2. Clasificaciones

| Clasificación | Significado |
|---|---|
| `EXISTS` | Capability compatible con M01 ya existe y puede reutilizarse sin cambio funcional relevante. |
| `ADAPT` | Existe, pero requiere ajuste para el reparto Provider/Planner Managed. |
| `MISSING` | Falta una capability necesaria para M01. |
| `HIDE_FOR_MANAGED` | Existe para Self-Service/histórico, pero no debe exponerse a un Client MANAGED. |
| `FINANCE_COUPLED` | El comportamiento necesario está bloqueado por Pricing/Finance/Ledger actual. |
| `BROKEN_REPAIR` | El flujo ofrecido actualmente está roto y debe repararse/eliminarse del recorrido. |
| `FUTURE_PRESERVE` | Capability válida para futuro; conservar código/contrato, no implementar UI ahora. |
| `OUT_OF_SCOPE` | No pertenece al lanzamiento M01. |

Una capability puede tener más de una clasificación, por ejemplo `ADAPT + HIDE_FOR_MANAGED`.

---

# 3. Matriz de responsabilidades M01 cerrada

Esta tabla elimina ambigüedad sobre quién puede modificar qué durante M01.

| Capability | Provider / Platform Admin | Planner Managed | Staff | Decisión M01 |
|---|---|---|---|---|
| Crear Client Planner | Sí | No como operación interna; registro público puede crear cuenta MANAGED | No | Provider o registro público |
| Operating Profile | Sí | Read-only | No | Admin-only |
| Crear Event | Sí | **No** | No | Provider |
| Datos técnicos Event | Sí | **No** mediante PATCH genérico | No | Provider |
| SKU / serviceId | Sí | **No** | No | Provider |
| Capacidad técnica | Sí | **No** | No | Provider |
| Confirmation enable / URLs | Sí durante preparación | Operación RSVP por endpoints dedicados, no PATCH técnico | No | Separar setup vs operación |
| Invitation Design | Sí | Read-only/distribución | No | Provider |
| Technical FileAssets | Sí | **No** | No | Provider |
| Hotspots | Sí | Read-only indirecto | No | Provider |
| Croquis image/SVG | Sí | Read-only | Read-only limitado por token | Provider |
| Shapes / tables structure | Sí | **No** | No | Provider |
| Seat structure / renumber | Sí | **No** | No | Provider |
| Seating assignment | Supervisión | **Sí** | Read-only/operación cuando corresponda | Planner |
| Contacts / Guests | Puede asistir | **Sí** | No | Planner |
| Groups | Puede asistir | **Sí** | No | Planner |
| Invitations nominales | Puede asistir | **Sí** | No | Planner |
| Assistants | Puede asistir | **Sí** | No | Planner |
| RSVP público | No | Observa/opera | Invitado público | Público + Planner |
| RSVP close/reopen/override | Supervisión | **Sí** | No | Planner |
| Physical pass generation | Provider en Managed | No para M01 base | No | Provider; preservar API histórica |
| Staff tokens | Supervisión | **Sí** | Consume token | Planner |
| Scanner/check-in | Observa | Observa | **Sí** | Staff |
| Check-in revert | Soporte | P1 si existe recuperación durable | No | No bloquea primer demo salvo incidente |
| Activate Managed Event | **Sí** | No | No | Provider/Admin |
| Close Event | Puede supervisar | **Sí** | No | Planner para journey M01 |
| Finance/Wallet | Admin interno futuro | **Oculto** | No | Fuera experiencia M01 |
| Reports | Provider/Planner según contrato futuro | P1 | No | MG-06 |
| Album | Provider/Planner según contrato futuro | P1 | No | MG-07 |

---

# 4. Audit detallado por dominio

## 4.1 Operating Profile

**Clasificación:** `MISSING`  
**Ticket:** MG-01.1

### Estado actual

`Client` persiste:

- `type`;
- `commercialChannel`;
- `status`.

No existe `MANAGED` / `SELF_SERVICE` en Prisma, DTO, AuthPrincipal ni AuthUser.

`AuthPrincipal` sólo carga:

- `role`;
- `clientId`;
- `clientType`;
- `clientStatus`.

### Objetivo M01

El runtime debe distinguir explícitamente capacidad operativa sin reutilizar `ClientType`, `CommercialChannel`, Pricing o credits.

### Decisión técnica recomendada

Agregar:

```text
ClientOperatingProfile
- MANAGED
- SELF_SERVICE
```

Persistir en `Client.operatingProfile`.

#### Migración recomendada

Para **no falsificar comportamiento histórico**:

- backfill de todos los Clients existentes a `SELF_SERVICE`;
- campo final `NOT NULL`;
- `registerPlanner()` nuevo durante M01 crea `MANAGED` explícitamente;
- `createOrganization()` conserva `SELF_SERVICE` explícitamente porque M02 está congelado;
- el Client objetivo del demo/piloto se cambia a `MANAGED` por Platform Admin.

No usar un default SQL silencioso que haga imposible saber qué caller omitió la decisión.

### Contexto Auth

Agregar `operatingProfile` a:

- `AuthPrincipal`;
- `AuthUserDto`;
- login/session resolution;
- schema/api-client generado.

Esto permite UX gating inmediato.

**Importante:** el backend no debe confiar exclusivamente en el valor de la sesión para autorizar mutaciones, porque un Platform Admin puede cambiar el profile mientras una sesión Planner sigue abierta. El gate de escritura debe resolver el `Client.operatingProfile` actual desde DB dentro del target/transaction.

### Administración

`PATCH /api/v1/admin/clients/:clientId` puede adaptarse para actualizar `operatingProfile`.

`PATCH /api/v1/clients/:clientId` **no** debe aceptar ese campo.

### Archivos principales

- `apps/api/prisma/schema.prisma`
- nueva migration
- `apps/api/src/auth/auth.types.ts`
- `apps/api/src/auth/auth.dto.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/clients/clients.dto.ts`
- `apps/api/src/clients/clients.service.ts`
- `packages/api-client/**` generado/wrappers Admin
- `apps/admin/src/clients/AdminClientDetailPage.tsx`
- fixtures/tests Client/Admin/Auth

### Seguridad

- sólo Platform Admin cambia profile;
- Planner no puede autoelevarse a Self-Service;
- cross-client sigue no-leaking;
- cambio de profile debe auditar before/after;
- no derive profile de pricing/channel.

### Tests existentes relevantes

- `apps/api/test/clients.integration-spec.ts`
- `apps/api/test/auth.integration-spec.ts`
- `apps/api/test/events.integration-spec.ts`
- tests Admin Client y api-client.

### Tests faltantes

- register Planner nuevo → MANAGED;
- historical backfill → SELF_SERVICE;
- Admin cambia profile;
- Planner no cambia profile;
- sesión existente + cambio Admin → mutation backend usa profile DB actual;
- Auth `me` expone profile correcto.

### Riesgo Self-Service futuro

Bajo si se conserva `SELF_SERVICE` y los gates son profile-based. No borrar endpoints históricos.

---

## 4.2 Event creation y configuración técnica

**Clasificación:** `ADAPT + HIDE_FOR_MANAGED + FINANCE_COUPLED`  
**Tickets:** MG-01.2, MG-03A

### Estado actual Planner

`EventsController` permite a roles Planner:

- `POST /events`;
- `PATCH /events/:eventId`;
- `DELETE /events/:eventId`;
- `POST /events/:eventId/activate`.

`WizardPage`:

- carga catálogo de Services;
- puede crear Event mediante `apiClient.events.create()`;
- autosavea `apiClient.events.update()`;
- permite cambiar `serviceId`;
- permite `resetInvitationDesign`;
- expone configuración técnica.

`DashboardPage` muestra `Nuevo evento`.

### Estado actual Provider

Existe Admin intake:

- `GET /admin/clients/:clientId/events/intake-quote`;
- `POST /admin/clients/:clientId/events`;
- `PATCH /admin/clients/:clientId/events/:eventId`;
- `PATCH .../assignment`.

Pero `createAdminIntake()` exige:

1. resolver Pricing V2;
2. `acceptedServicePriceId` vigente;
3. cobertura suficiente;
4. commercial lock.

Por tanto **crear un Event Provider ya está finance/commercial-coupled antes de Activation**.

### Objetivo M01

Planner MANAGED:

- lista/consulta Events asignados;
- no crea Event;
- no cambia datos técnicos ni SKU mediante PATCH genérico;
- no soft-delete técnico.

Provider:

- crea Event Managed sin quote, credits o cobertura;
- configura datos por Admin;
- asigna Planner.

### Gate recomendado

Crear una policy central de capability, por ejemplo:

`ClientOperatingProfilePolicy` o `ManagedCapabilityPolicy`.

No dispersar `if (profile === MANAGED)` por controllers.

Para Client MANAGED bloquear:

- `EventsService.create()`;
- `EventsService.update()` genérico;
- `EventsService.softDelete()` como preparación técnica.

Lectura y lifecycle dedicado siguen separados.

### Managed Admin intake

No modificar el contrato comercial actual para fingir que no tiene Finance.

Recomendación: agregar un path/método Admin focalizado para Managed, o un servicio interno explícito con DTO propio, por ejemplo:

```text
POST /admin/clients/:clientId/events/managed
```

Request mínimo:

- name;
- serviceCode;
- capacity;
- assignedPlannerUserId;
- datos iniciales opcionales autorizados.

Debe:

- exigir Client `MANAGED`;
- validar Service activo;
- crear Event con creator Platform Admin real;
- asignar Planner;
- **no** crear commercial lock;
- **no** consultar Finance;
- **no** crear Ledger/Receipt;
- auditar.

El endpoint commercial intake existente se preserva para `SELF_SERVICE`/Commercial futuro.

### Archivos principales

- `apps/api/src/events/events.controller.ts`
- `apps/api/src/events/admin-client-events.controller.ts`
- `apps/api/src/events/events.dto.ts`
- `apps/api/src/events/events.service.ts`
- capability policy nueva
- Admin intake UI/client
- Client Dashboard/Router/Wizard

### Tests existentes

- `events.integration-spec.ts`
- `operator-intake.integration-spec.ts`
- `event-commercial.integration-spec.ts`
- `commercial-pilot.integration-spec.ts`

### Tests faltantes

- MANAGED Planner POST Event → 403/409 contractual sin crear fila;
- MANAGED Planner PATCH técnico → bloqueado;
- SELF_SERVICE histórico conserva behavior;
- Platform Admin managed intake → Event sin Ledger/Receipt/commercial lock;
- creator y assignment correctos;
- cross-client exacto;
- profile actual de DB gobierna mutation.

---

## 4.3 Client Wizard / navegación técnica

**Clasificación:** `HIDE_FOR_MANAGED + BROKEN_REPAIR`  
**Ticket:** MG-02.1

### Estado actual

Router Client publica:

- `/eventos/nuevo`;
- `/eventos/:eventId/configuracion/:step`;
- `/finanzas`.

Wizard contiene:

- Datos;
- Contactos;
- Invitación;
- Confirmación;
- Croquis;
- Pases;
- Revisión.

`ActiveEventWorkspacePage` redirige estados `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE` al Wizard.

### Objetivo M01

Para `MANAGED`:

- no `Nuevo evento`;
- no Wizard técnico;
- URL directa al Wizard no debe permitir entrar;
- `/finanzas` no debe aparecer ni ser ruta ordinaria;
- Event en preparación debe tener una vista read-only tipo `En preparación por InvitacionesPremium`, no redirigir a configuración técnica;
- Event operativo entra a workspace normal.

### Decisión de UX

No borrar Wizard: preservarlo para `SELF_SERVICE`.

Agregar routing/profile guard explícito.

El profile llega desde Auth para rendering, pero el backend sigue siendo autoridad.

### Archivos

- `apps/client/src/app/router.tsx`
- `apps/client/src/dashboard/DashboardPage.tsx`
- `apps/client/src/dashboard/EventsList.tsx`
- `apps/client/src/layout/ClientNavigation.tsx`
- `apps/client/src/workspace/ActiveEventWorkspacePage.tsx`
- `apps/client/src/wizard/**` sólo para preservar Self-Service y quitar dependencias rotas

### Tests faltantes

- MANAGED no ve Nuevo Evento;
- direct `/eventos/nuevo` bloqueado/redirigido;
- direct `/configuracion/*` bloqueado;
- SELF_SERVICE mantiene Wizard;
- MANAGED no ve Finanzas y direct route no da superficie financiera;
- Managed Event pre-active muestra estado Provider-managed;
- browser back/refresh no atraviesa gate.

---

## 4.4 Invitation Design / technical FileAssets / Hotspots

**Clasificación:** `ADAPT + HIDE_FOR_MANAGED`  
**Ticket:** MG-01.2 API gate + MG-02.1 UI

### Estado actual

El Provider ya tiene `AdminInvitationDesignController` con superficie administrativa completa bajo:

`/admin/clients/:clientId/events/:eventId/**`

Sin embargo `InvitationDesignController` Planner conserva mutaciones para:

- crear Flyer;
- crear Flipbook;
- reemplazar assets Flyer;
- agregar/reordenar/reemplazar/eliminar pages;
- crear/update/delete hotspots.

`DesignStep` del Client ejecuta además uploads técnicos mediante `apiClient.fileAssets.upload()`.

### Objetivo M01

Provider prepara diseño.

Planner Managed puede:

- ver resultado final cuando sea útil;
- compartir/distribuir Invitaciones;
- no editar estructura.

### API gate

Para MANAGED bloquear mutaciones Planner de Design.

GET/readiness pueden permanecer si se reutilizan para visualización/readiness no sensible.

Para `POST /events/:eventId/file-assets`, no bloquear indiscriminadamente cualquier futuro uso. Bloquear en MANAGED los tipos técnicos de preparación:

- `FLYER_INITIAL_IMAGE`;
- `FLYER_QR_IMAGE`;
- `FLIPBOOK_PAGE_IMAGE`;
- `FLOORPLAN_IMAGE`;
- `FLOORPLAN_SVG`.

Album/reportes se mantienen fuera de este ticket y conservan sus políticas especializadas.

### Seguridad

UI oculta + backend gate obligatorio.

No redirigir Client a endpoints Admin.

No impersonation.

### Tests existentes

- `invitation-design.integration-spec.ts`
- `file-assets.integration-spec.ts`
- `op02c-provider-invitation.integration-spec.ts`
- `op02c-provider-invitation-file-assets.integration-spec.ts`

### Tests faltantes

- MANAGED Planner read design → permitido cuando corresponda;
- cada mutation design → bloqueada;
- technical upload → bloqueado;
- Provider Admin mutations siguen verdes;
- SELF_SERVICE conserva mutaciones históricas.

---

## 4.5 Croquis / Shapes / Tables / Detailed Seats / SVG

**Clasificación:** Provider builder `EXISTS`; Planner seating `EXISTS`; Client technical builder `BROKEN_REPAIR + HIDE_FOR_MANAGED`  
**Tickets:** MG-02.1 + MG-01A

### Estado actual Provider

`AdminFloorplanController` ya tiene superficie Platform Admin para:

- crear/reemplazar Floorplan;
- lock/unlock;
- seating mode;
- crear/update/delete seats;
- batch seats;
- renumber;
- SVG mappings;
- shapes y demás builder técnico.

El trabajo reciente de SVG/detailed seating es compatible con M01 y debe conservarse.

### Estado actual Planner correcto

`FloorplanController` Planner conserva:

- `GET floorplan`;
- `GET floorplan/svg-source`;
- seating workspace;
- assign;
- assign-seats;
- assign-family;
- assign-group;
- update seating.

Ese reparto es correcto para M01: consulta + seating, no builder.

### Bug Astra confirmado

`packages/api-client/src/wizard.ts` todavía expone métodos:

- `setImage`;
- `replaceImage`;
- `addShape`;
- `updateShape`;
- `removeShape`;
- `lock`;
- `unlock`.

`FloorplanStep` los consume.

Las rutas Planner correspondientes ya no existen.

### Decisión

**NO restaurar rutas.**

Para MANAGED:

- quitar `FloorplanStep` técnico del recorrido;
- usar lectura/seating existente;
- eliminar después los siete wrappers rotos.

Para Self-Service futuro, las mutaciones deberán rediseñarse/autorizarse explícitamente; no se preservan wrappers que hoy apuntan a 404.

### Dependencia de tickets

El cierre de MG-01A depende de que MG-02.1 deje de compilar contra esos métodos. Por eso la secuencia refinada de MG-00 es:

```text
MG-01
→ MG-02.1 surface/gating
→ MG-01A transport guard + delete dead wrappers
→ MG-02A operations
```

No conviene introducir un allowlist permanente para wrappers rotos sólo para respetar un orden documental anterior.

### Tests existentes

- `floorplan.integration-spec.ts`
- suites Client de Floorplan/Seating
- Scanner floorplan tests.

### Tests faltantes

- MANAGED direct Croquis wizard no monta builder;
- seating sigue funcionando;
- Admin builder completo sigue funcionando;
- SDK guard falla si reaparece `POST /events/:eventId/floorplan`.

---

## 4.6 Guests / Contacts / Groups

**Clasificación:** backend `EXISTS`; UX Managed `ADAPT`  
**Ticket:** MG-02A.1

### Estado actual

Contacts tiene CRUD, Groups, import preview/commit y tests PostgreSQL.

El problema no es backend.

El principal componente operativo actual (`ContactsStep`) vive en el Wizard que M01 debe ocultar.

`ActiveEventWorkspacePage` sólo tiene:

- Resumen;
- Invitaciones;
- Mesas;
- Staff.

No tiene sección `Invitados` con CRUD/import.

### Objetivo

Mover/reutilizar la gestión de invitados dentro del workspace Managed sin duplicar reglas de negocio.

### Recomendación

Extraer del Wizard una superficie reusable, por ejemplo `GuestManagementPanel`, y montar esa misma lógica desde workspace.

No crear un segundo CRUD paralelo.

### Groups

`PATCH groups/:groupId` existe en SDK pero no tiene consumidor. Renombrar Grupo es P2; no bloquea M01 si create/list y asignación cubren demo.

### Tests existentes

- `contacts.integration-spec.ts`
- tests Client Contacts/import.

### Tests faltantes

- Planner MANAGED puede CRUD guests desde workspace;
- import continúa funcionando;
- cross-event/cross-client no leak;
- no requiere Wizard;
- refresh conserva estado autoritativo.

---

## 4.7 Invitations / Assistants / Distribution

**Clasificación:** `ADAPT`  
**Ticket:** MG-02A.2

### Estado actual

Backend/SDK ya tiene:

- list Invitation;
- get Invitation;
- update Invitation;
- create/update/delete Assistant.

Astra no localizó consumidores de varias de esas operaciones.

`InvitationDistribution` sí cubre compartir/listar estados, pero no reemplaza la gestión nominal completa.

`POST .../invitations/:id/cancel` existe backend sin wrapper operativo.

### Objetivo M01

Planner puede:

- convertir/gestionar Invitaciones nominales necesarias;
- administrar acompañantes;
- consultar estado;
- distribuir enlace;
- cancelar cuando contrato lo permita.

### Scope P0

Conectar solamente operaciones necesarias para los casos de demo:

1. invitado individual;
2. familiar nominal con acompañante;
3. edición/corrección antes de Evento;
4. distribución.

No añadir WhatsApp API, delivery status o CRM.

### Tests existentes

- `invitations.integration-spec.ts`
- `invitation-qr.integration-spec.ts`
- Client distribution tests.

### Tests faltantes

- UI nominal individual/familiar;
- create/update/delete Assistant;
- cancel si se incluye en P0;
- capacity errors renderizadas naturalmente;
- cross-client.

---

## 4.8 RSVP / Confirmation

**Clasificación:** público `EXISTS`; operación Planner `ADAPT`  
**Ticket:** MG-02A.3

### Estado actual

Public RSVP está implementado y cubierto por `public-rsvp.integration-spec.ts`.

Astra identificó sin wrapper/superficie Client:

- `GET /events/:eventId/confirmation`;
- `POST /events/:eventId/confirmation/close`;
- `POST /events/:eventId/confirmation/reopen`;
- `PUT /events/:eventId/invitations/:invitationId/confirmation`.

`ConfirmationStep` del Wizard modifica setup del Event; no equivale a operación RSVP.

### Objetivo M01

Planner opera confirmaciones sin editar setup técnico del Event.

P0:

- summary de confirmación;
- close/reopen;
- override nominal si el contrato actual lo requiere para operación real.

### Dependencia SDK

`ApiRequest.method` debe soportar `PUT` antes de conectar override.

### Tests faltantes

- summary desde workspace;
- close bloquea nuevas respuestas según contrato;
- reopen;
- override nominal;
- seating/capacity coherente;
- no token público reutilizado como credencial Planner.

---

## 4.9 Planner Seating

**Clasificación:** `EXISTS`  
**Ticket:** regresión dentro de MG-02/MG-05, no feature nueva

### Estado actual

Workspace actual ya monta `SeatingWorkspace` y API dispone de:

- query por unassigned/table;
- assign;
- assign seats;
- family/group;
- update.

Detailed seats y SVG Provider ya están construidos.

### Decisión

No reescribir.

MG-02 sólo debe asegurar que el workspace Managed llega a esta superficie sin pasar por builder técnico.

### Tests existentes

- `floorplan.integration-spec.ts`
- Client seating/floorplan tests.

### Riesgo

Regresión al esconder Wizard. Debe certificarse en MG-05.

---

## 4.10 Staff

**Clasificación:** `EXISTS`  
**Ticket:** regresión MG-05

### Estado actual

Client workspace ya consume:

- list StaffToken;
- create StaffToken.

Scanner session usa token público de recurso.

El contrato actual conserva máximo de tokens activos y secreto one-time.

### Objetivo

Mantener sin cambios de dominio.

Planner Managed crea/revoca según contrato; Provider no necesita impersonación.

### Tests existentes

- `staff-access.integration-spec.ts`
- Client Staff tests
- Scanner tests.

### Riesgo

Bajo. Certificar direct URL, token one-time y límites en UAT.

---

## 4.11 Scanner / Check-in

**Clasificación:** check-in `EXISTS`; revert `FUTURE_PRESERVE/P1`  
**Ticket:** MG-05 regresión; revert sólo si se eleva a P0

### Estado actual

Scanner tiene sesión, floorplan y check-in operativo.

Astra identificó `POST check-ins/:checkInId/revert` sin wrapper Client y sin forma durable localizada de recuperar `checkInId` tras una sesión nueva.

### Decisión M01

Primer demo requiere:

- scan;
- check-in;
- idempotencia;
- realtime/REST recovery suficiente para estado visible.

Revert **no bloquea** primer demo si Producto no lo ofrece como operación estándar y MG-05 no encuentra necesidad P0.

No conectar el POST hasta definir cómo localizar el CheckIn de forma durable/autorizada.

### Tests existentes

- `scanner.integration-spec.ts`
- `realtime.integration-spec.ts`
- `staff-access.integration-spec.ts`.

---

## 4.12 Lifecycle M01

**Clasificación:** backend `EXISTS`; UI `ADAPT`  
**Ticket:** MG-02A.4

### Estado actual

Backend tiene:

- close;
- reopen;
- cancel;
- archive;
- delete.

Astra no localizó wrappers/consumidores para cinco operaciones de lifecycle.

Workspace sí puede renderizar estados CLOSED/CANCELLED/ARCHIVED, pero no ofrece las acciones que los producen.

### Decisión M01

P0 mínimo:

`ACTIVE / EVENT_DAY → CLOSED`

Planner Managed debe poder cerrar el Evento mediante UI con idempotencia/reconciliación.

P1/FUTURE salvo necesidad UAT:

- reopen;
- cancel;
- archive;
- soft delete.

### Cierre

No conectar todos los endpoints sólo porque existen.

### Tests existentes

- `event-lifecycle.integration-spec.ts`.

### Tests faltantes

- Client close UI;
- retry incierto con misma intención;
- Staff/check-in queda bloqueado al cerrar según contrato;
- reload muestra CLOSED.

---

## 4.13 Finance UI

**Clasificación:** `HIDE_FOR_MANAGED + FUTURE_PRESERVE`  
**Ticket:** MG-02.1

### Estado actual

Client Navigation muestra Finanzas para Planner independiente.

`ReviewStep` carga:

- balance;
- purchasedCredits;
- credit line;
- activation credits;
- copy de compra/crédito/deuda.

### Objetivo

M01 MANAGED no muestra:

- wallet;
- balance;
- movements;
- receipts;
- créditos requeridos;
- CTA de compra/línea.

No eliminar Finance backend ni `/finanzas` para `SELF_SERVICE`.

### Tests faltantes

- MANAGED no nav Finance;
- direct `/finanzas` bloqueado;
- SELF_SERVICE sigue accediendo.

---

## 4.14 Managed Admin Intake — acoplamiento previo a Activation

**Clasificación:** `FINANCE_COUPLED`  
**Ticket:** MG-03A — Managed Intake

### Hallazgo

El roadmap original concentraba el riesgo en Activation. MG-00 confirma un acoplamiento anterior:

`EventsService.createAdminIntake()` exige current Pricing V2 y financial coverage antes de insertar Event.

Eso contradice M01, donde el cierre comercial es externo y Provider debe poder empezar preparación sin simular saldo.

### Decisión

Crear un flujo de intake Managed separado de commercial intake.

No:

- otorgar créditos;
- crear quote falso;
- usar DEMO service para eludir Finance;
- meter `acceptedServicePriceId` sintético.

### Persistencia esperada

Managed Event pre-activation:

- `serviceId` real;
- datos técnicos reales;
- `commercial*` nullable;
- `activation*` nullable;
- creator/assignment reales.

Esto ya es compatible conceptualmente con columnas nullable del schema; el problema está en servicios/DTO/UI, no en necesidad de borrar campos.

### Tests

Nuevo managed-intake integration + regresión de `operator-intake` comercial existente.

---

## 4.15 Managed Activation

**Clasificación:** `FINANCE_COUPLED + ADAPT`  
**Ticket:** MG-03B — Managed Activation

### Estado actual service

`EventsService.activate()` hace correctamente:

1. ownership;
2. Event row lock;
3. idempotency replay;
4. active Client;
5. Service activo;
6. readiness Digital/Physical/Croquis;
7. `commercial.assertActivationLock()`;
8. `finance.consumeEventActivation()`;
9. Ledger/Receipt;
10. activation financial snapshots;
11. AuditLog.

El problema para M01 no es readiness: es el paso 7–10.

### Estado actual DB trigger

`validate_event_activation_snapshot_references()` exige cuando `activated_at` no es null:

- `activated_service_price_id` válido;
- price compatible con Client commercial context;
- `activation_receipt_id` válido;
- receipt `EVENT_ACTIVATION`;
- receipt idempotency key igual al Event;
- actor con `client_id = Event.client_id`;
- actor Planner/Admin Organization;
- Organization Planner igual a assigned Planner.

Por tanto **quitar `consumeEventActivation()` en TypeScript rompería PostgreSQL**.

Además Platform Admin tiene `clientId = null`, así que el trigger actual no puede ser actor de activation.

### Objetivo M01

Managed activation debe ser una operación Provider/Admin explícita:

```text
readiness completo
+
Client operatingProfile = MANAGED
+
Platform Admin real
+
idempotency
=
ACTIVE
```

Sin:

- ServicePrice;
- Receipt;
- Ledger;
- purchased credits;
- credit line usage.

### Diseño recomendado

**No modificar semántica del endpoint Planner financiero existente.**

Preservar `/events/:eventId/activate` para `SELF_SERVICE` histórico.

Agregar superficie Admin Managed, por ejemplo:

```text
POST /admin/clients/:clientId/events/:eventId/activate
```

con `Idempotency-Key` y respuesta Event-focused.

Extraer/reutilizar un helper de readiness/preflight común para no duplicar reglas Digital/Physical/Croquis.

### DB invariant recomendada

Actualizar `validate_event_activation_snapshot_references()` para ramificar por `Client.operatingProfile`:

#### SELF_SERVICE

Conservar **exactamente** invariantes financieras actuales.

#### MANAGED

Exigir:

- Event/Client válidos;
- `activatedServiceId` coincide con `serviceId` y Service activo;
- actor `PLATFORM_ADMIN`, activo y `clientId IS NULL`;
- `activationIdempotencyKey` presente;
- financial activation fields permanecen null:
  - `activatedServicePriceId`;
  - `baseCostCredits`;
  - `promotionDiscountCredits`;
  - `finalCostCredits`;
  - `purchasedCreditsUsed`;
  - `creditLineCreditsUsed`;
  - `creditUnitValueMxnCentsSnapshot`;
  - `activationReceiptId`.

No crear Receipt dummy.

### Idempotencia

El replay actual depende parcialmente de activation result/receipt snapshots. MG-03 debe auditar `findActivationResult()` y separar un resultado Managed que pueda reconstruirse sólo del Event/Audit sin Receipt.

No considerar cerrado hasta probar:

- doble submit;
- timeout incierto;
- race concurrente;
- no Ledger delta;
- no FinanceBalance delta;
- Self-Service sigue cobrando exactamente igual.

### Archivos principales

- `apps/api/src/events/events.service.ts`
- `apps/api/src/events/admin-client-events.controller.ts`
- DTO nuevo Managed activation
- migration que actualiza trigger
- Event activation tests
- Admin preparation UI
- api-client Admin

### Tests existentes que deben seguir verdes

- `event-activation.integration-spec.ts`
- `event-commercial.integration-spec.ts`
- `finance.integration-spec.ts`
- `commercial-pilot.integration-spec.ts`

### Nuevos tests Managed

- readiness incomplete → no activation;
- Managed Platform Admin → ACTIVE;
- Planner Managed activation endpoint → blocked;
- 0 Ledger/Receipt/FinanceBalance mutation;
- retry same key → same result;
- different concurrent key → one activation semantics contractual;
- DB direct invalid financial snapshot → reject;
- DB direct Planner actor on Managed → reject;
- historical SELF_SERVICE activation invariants unchanged.

---

## 4.16 Reports

**Clasificación:** `FUTURE_PRESERVE`  
**Ticket:** MG-06

Backend y tests existen; Astra identificó ausencia de productor frontend completo.

No bloquea primer recorrido M01 salvo decisión comercial explícita.

No conectar cinco endpoints sólo para elevar porcentaje de consumo.

Tests existentes: `reports.integration-spec.ts`.

---

## 4.17 Album

**Clasificación:** `FUTURE_PRESERVE`  
**Ticket:** MG-07

Backend/público y tests existen, gestión Client incompleta.

No bloquea M01 base.

No habilitar para `PHYSICAL_QR`.

Tests existentes: `albums.integration-spec.ts`.

---

## 4.18 Landing / CommercialLead

**Clasificación:** `EXISTS + FUTURE_PRESERVE`  
**Ticket:** ninguno P0 de M01

LAND-02 ya persiste `CommercialLead` independiente y no crea automáticamente Client/User/Event.

Eso es compatible con M01.

`register-planner` sí crea Client+User. MG-01 debe cambiar únicamente su nuevo `operatingProfile` a MANAGED; no convertir lead en provisioning.

Tests existentes:

- `commercial-leads.integration-spec.ts`;
- Landing registration tests.

---

## 4.19 Demo fixture

**Clasificación:** `MISSING`  
**Ticket:** MG-04

Existe:

- dev Flipbook fixture;
- seeds locales/staging;
- `commercial-pilot.integration-spec.ts`.

No existe evidencia de un fixture completo, idempotente y navegable de `Elena & Mateo` que deje listo el journey Managed.

Debe crearse después de MG-03, nunca antes, para no codificar workarounds financieros/transitorios dentro del seed.

---

## 4.20 SDK/OpenAPI transport drift

**Clasificación:** `MISSING + BROKEN_REPAIR`  
**Ticket:** MG-01A

### Hallazgo

OpenAPI/controller están alineados, pero wrappers de `packages/api-client` escriben método/path manualmente.

`generate:check` sólo protege artefactos generados; no valida que:

```text
method + path del wrapper
```

exista realmente en OpenAPI.

Por eso las siete llamadas Floorplan rotas compilan.

También `ApiRequest.method` no cubre el `PUT` requerido por Confirmation override.

### Solución recomendada mínima

No regenerar todo el SDK ahora.

Agregar un verifier de CI en `packages/api-client/scripts/`, generado/derivado directamente del OpenAPI actual, que:

1. extraiga todas las operaciones OpenAPI `method + normalized path`;
2. analice wrappers versionados del api-client;
3. normalice template params;
4. falle si wrapper apunta a operación inexistente;
5. cubra GET implícito y POST/PATCH/DELETE/PUT;
6. permita declarar utilidades directas no HTTP sólo explícitamente;
7. tenga fixture negativo que demuestre el fallo.

No mantener una lista manual duplicada de 192 rutas.

### Corrección concreta

Después de MG-02.1 quitar los siete métodos muertos de `createFloorplanClient` y sus llamadas Client.

### Cierre

- cero wrapper method/path inexistente;
- CI falla ante ruta retirada;
- `PUT` soportado;
- api-client tests/typecheck/generate:check verdes.

---

## 4.21 Security / anti-abuse

**Clasificación:** `OUT_OF_SCOPE` de MG-01…03, **release gate RG-01**

Astra no demostró una intrusión ni ausencia total de seguridad.

Sí encontró que documentos mencionan Auth0/rate limiting y el runtime versionado usa auth local/sesiones sin evidencia completa de rate limiter global.

Antes del primer piloto externo real se debe acreditar:

- auth strategy aprobada;
- HTTPS/cookies/origin;
- login brute-force/rate limit;
- public register-planner;
- commercial-leads;
- token endpoints;
- secretos;
- backup/restore operativo aplicable.

No implementar Auth0 automáticamente sólo porque un TRD antiguo lo menciona.

---

## 4.22 Realtime topology

**Clasificación:** `OUT_OF_SCOPE` de feature, **release gate RG-02**

El realtime actual mantiene estado local de proceso.

Para octubre se acepta explícitamente:

```text
API replica count = 1
```

No meter Redis/adapter distribuido mientras no se escale.

MG-05 debe probar recovery REST después de reload/desconexión.

---

# 5. Clasificación de hallazgos Astra

| Astra | Decisión MG-00 | Ticket |
|---|---|---|
| AUD-01 siete rutas Croquis muertas | `BROKEN_REPAIR + HIDE_FOR_MANAGED`; no restaurar | MG-02.1 + MG-01A |
| AUD-02 Planner/Provider contradictorio | Resuelto por profile Managed + API gate | MG-01.2 + MG-02.1 |
| AUD-03 SDK drift | P0 estructural | MG-01A |
| AUD-04 lifecycle sin UI | Sólo close P0 inicialmente | MG-02A.4 |
| AUD-05 Invitations nominales | P0 subset individual/familiar | MG-02A.2 |
| AUD-06 Confirmation operativa | P0 | MG-02A.3 |
| AUD-07 Album | no bloquea | MG-07 |
| AUD-08 Reports | no bloquea | MG-06 |
| AUD-09 revert check-in | P1 salvo incidente/UAT | backlog M01 P1 |
| AUD-10 Organization account/team | M02 | `FUTURE_PRESERVE` |
| AUD-11 update Group | P2 | `FUTURE_PRESERVE` |
| AUD-12 FileAsset utilities | conservar sin UI obligatoria | `FUTURE_PRESERVE` |
| AUD-13 Admin catalog | no bloquea M01 | P2 interno |
| AUD-14 docs mezclados | gobierno documental ya saneado; corregir contratos al tocarlos | Technical Owner |
| AUD-15 architecture boundaries | P2/P3 | posterior |
| AUD-16 auth/antiabuse | release gate | RG-01 |
| AUD-17 realtime process-local | una instancia permitida | RG-02 |

---

# 6. Lo que NO se debe tocar durante M01

## Preserve, no expand

- Pricing V2;
- Partner/Venue pricing;
- CommercialLead;
- Ledger;
- Receipt;
- CreditLine;
- Payment;
- Unit Economics;
- Organization team UI;
- Self-Service completo;
- Reports completos;
- Album management completo.

## No borrar

- Wizard Self-Service;
- APIs históricas válidas de Design/FileAssets/PhysicalPasses;
- commercial intake actual;
- financial activation actual.

Se bloquean por `operatingProfile`, no se destruyen.

---

# 7. Secuencia técnica refinada después de MG-00

MG-00 descubre dos dependencias que justifican refinar el orden original.

```text
MG-01.1  Operating Profile persistence + auth context
   ↓
MG-01.2  Managed API capability gates
   ↓
MG-02.1  Managed Client routing/surface
          + quitar consumo de Croquis técnico roto
   ↓
MG-01A   SDK/OpenAPI transport guard
          + eliminar 7 wrappers muertos
   ↓
MG-02A.1 Guests workspace
   ↓
MG-02A.2 Invitations/Assistants
   ↓
MG-02A.3 RSVP operations
   ↓
MG-02A.4 Close Event
   ↓
MG-03A   Managed Admin Intake sin Finance
   ↓
MG-03B   Managed Activation sin Finance
   ↓
MG-04    Elena & Mateo fixture
   ↓
MG-05    Managed E2E / Release UAT
```

`RG-01` y `RG-02` corren como release gates y deben cerrarse antes del piloto externo real.

MG-06/MG-07 siguen posteriores al primer journey demostrable.

---

# 8. Tickets propuestos — pequeños y revisables

## MG-01.1 — Operating Profile Foundation

**P0**

### Build

- enum + `Client.operatingProfile`;
- migration/backfill histórico `SELF_SERVICE`;
- register Planner nuevo `MANAGED`;
- Organization `SELF_SERVICE`;
- AuthPrincipal/AuthUser con profile;
- Admin update del profile;
- AuditLog del cambio.

### No incluir

- gates de Events/Design;
- UI Client;
- Finance.

### Archivos esperados

Aprox. 8–12 + generated/tests.

### DoD

Profile persistido, no derivado de CommercialChannel, no autoelevable.

---

## MG-01.2 — Managed Capability API Gates

**P0**

### Build

Policy central DB-authoritative.

Bloquear para MANAGED:

- create/update/delete técnico Event;
- Invitation Design mutations;
- technical FileAsset uploads/mutations;
- PhysicalPass generation si sigue expuesto como preparación Client.

Mantener:

- Event read;
- Contacts;
- Invitations/Assistants;
- Seating;
- Staff;
- lifecycle dedicado permitido.

### DoD

URL/API directa no bypassea Managed; SELF_SERVICE regressions verdes.

---

## MG-02.1 — Managed Client Surface

**P0**

### Build

- hide Nuevo Evento;
- guard `/eventos/nuevo`;
- guard `/configuracion/*`;
- pre-active Event read-only Provider-preparing state;
- hide Finance nav/route;
- no DesignStep/FloorplanStep/Review activation para MANAGED;
- conservar Self-Service branches.

### DoD

Planner Managed no ve ni alcanza builder técnico.

---

## MG-01A — SDK/OpenAPI Transport Guard

**P0 técnico**

### Build

- verifier method+path contra OpenAPI;
- PUT support;
- eliminar siete Floorplan wrappers muertos;
- tests negativos CI.

### DoD

No puede volver a compilar un wrapper hacia ruta inexistente.

---

## MG-02A.1 — Guests in Active Workspace

**P0**

Reutilizar Contacts/import fuera del Wizard.

No nuevo backend.

---

## MG-02A.2 — Invitation & Assistant Operations

**P0**

Conectar subset individual/familiar necesario para demo.

No mensajería externa.

---

## MG-02A.3 — RSVP Operations

**P0**

- summary;
- close/reopen;
- override nominal.

Requiere PUT support de MG-01A.

---

## MG-02A.4 — Close Event

**P0 pequeño**

Conectar exclusivamente `close` primero.

Reopen/cancel/archive sólo si UAT los eleva.

---

## MG-03A — Managed Event Intake

**P0**

Admin crea MANAGED Event sin quote/coverage/Ledger.

Preserva commercial intake existente.

---

## MG-03B — Managed Activation

**P0 / máximo riesgo**

Admin activation Managed + trigger branch por operatingProfile + idempotencia sin Receipt.

Preserva financial activation Self-Service.

---

# 9. Matriz de tests que debe existir antes de MG-05

| Área | Evidencia actual | Nueva evidencia M01 |
|---|---|---|
| Client/Auth | clients/auth integration | profile/backfill/admin-only/current-DB gate |
| Events | events/operator-intake | Managed create/update denied + managed intake |
| Commercial | event-commercial | Self-Service unchanged |
| Activation | event-activation/finance | Managed no Ledger + Admin actor + replay |
| Design | invitation-design/provider suites | Managed mutations denied |
| FileAssets | file-assets/provider suite | technical types denied Managed |
| Croquis | floorplan | Admin builder + Planner seating + no broken Client paths |
| Guests | contacts | workspace UX + import without Wizard |
| Invitations | invitations/QR | assistant/nominal UI |
| RSVP | public-rsvp | Planner operational controls |
| Staff | staff-access | Managed regression |
| Scanner | scanner/realtime | journey/reload |
| Lifecycle | event-lifecycle | close UI/retry |
| Reports | reports | MG-06 only |
| Album | albums | MG-07 only |
| SDK | api-client tests | method/path verifier negative fixture |
| E2E | commercial-pilot historical | new Managed Elena & Mateo journey |

---

# 10. Riesgos principales

## R1 — Capability gating sólo en frontend

**Severidad:** P0.

Mitigación: policy backend DB-authoritative + UI gating.

## R2 — Cambiar Client profile durante una sesión

**Severidad:** P0 seguridad/consistencia.

Mitigación: Auth profile sirve para UX; mutation gate consulta DB actual.

## R3 — Romper Self-Service histórico

**Severidad:** P1.

Mitigación: backfill SELF_SERVICE y tests positivos de compatibilidad.

## R4 — Desacoplar Activation sólo en TypeScript

**Severidad:** P0.

Mitigación: migration/trigger branch por profile; nunca dummy Receipt.

## R5 — Olvidar que Admin intake también depende de Finance

**Severidad:** P0.

Mitigación: MG-03A antes de MG-03B.

## R6 — Ocultar Wizard y perder Guests

**Severidad:** P0 funcional.

Mitigación: MG-02A.1 reutiliza Contacts en workspace.

## R7 — Reintroducir rutas SDK muertas

**Severidad:** P0 calidad.

Mitigación: MG-01A CI verifier.

## R8 — Convertir todos los endpoints sin consumidor en scope

**Severidad:** P0 de calendario.

Mitigación: sólo subset M01 listado en este audit.

## R9 — Multi-replica realtime sin coordinación

**Severidad:** release/scale.

Mitigación: una instancia en M01; RG-02.

---

# 11. Decisiones cerradas por MG-00

No requieren nueva pregunta de producto para empezar MG-01:

1. M01 usa `MANAGED` explícito, no Pricing/Channel.
2. Platform Admin prepara Event/SKU/Invitation/Croquis.
3. Planner Managed no crea Event.
4. Planner Managed no usa PATCH genérico de preparación.
5. Planner Managed no diseña Flyer/Flipbook.
6. Planner Managed no sube assets técnicos.
7. Planner Managed no edita Hotspots.
8. Planner Managed no construye Croquis/shapes/seats estructurales.
9. Planner sí administra Guests/Assistants/Invitations.
10. Planner sí opera RSVP.
11. Planner sí hace Seating.
12. Planner sí crea Staff.
13. Staff hace Scanner/check-in.
14. No se restauran las siete rutas Planner de Floorplan.
15. Managed no muestra Finance.
16. Managed intake no requiere quote/credits.
17. Managed activation la autoriza/ejecuta Platform Admin.
18. Managed activation no crea Ledger/Receipt fake.
19. Financial/Self-Service runtime se preserva.
20. Reports/Album no bloquean primer demo.
21. Organization M02 no se implementa.
22. Realtime M01 opera inicialmente con una API replica.

---

# 12. Decisiones diferidas explícitamente

No bloquean MG-01…MG-03:

- UX final de revert check-in;
- reopen/cancel/archive Client;
- group rename;
- Reports exactos ofrecidos comercialmente;
- Album management;
- Self-Service productization;
- M02 Organization;
- Partner/Venue pricing futuro;
- Finance V3;
- Auth0 vs auth local como estrategia definitiva de producción: se resuelve en RG-01 con evidencia del entorno.

---

# 13. Criterio de aprobación de MG-00

MG-00 puede considerarse aprobado cuando Technical Owner/PM acepten esta matriz y el orden refinado.

A partir de esa aprobación, el **único primer ticket de código autorizado** debe ser:

**MG-01.1 — Operating Profile Foundation**

No iniciar MG-03 directamente.

La razón es estructural: sin `operatingProfile` no existe una frontera segura para preservar Self-Service mientras se construye Managed.

---

# 14. Resultado final

El producto de octubre no necesita más breadth. Necesita convertir un runtime amplio en un recorrido coherente:

```text
Provider prepara
→ Planner recibe
→ Guests / Invitations / RSVP
→ Seating
→ Staff
→ Scanner / Check-in
→ Close
```

El trabajo reciente de Croquis/SVG/Seats **se conserva** y pasa a ser infraestructura Provider.

La mayor reducción de riesgo proviene de cuatro movimientos concretos:

1. profile operativo explícito;
2. gates Managed reales en API + Client;
3. completar sólo las operaciones Planner necesarias;
4. crear intake/activation Managed sin Finance ficticio.

Todo lo demás queda preservado para después del lanzamiento M01.
