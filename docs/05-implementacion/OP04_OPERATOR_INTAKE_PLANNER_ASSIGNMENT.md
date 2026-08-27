# OP-04 — Operator Intake + Planner Assignment

## Estado

Contrato técnico autorizado para CODE después de COM-01 y COM-02.

Base funcional mínima: COM-02 cerrado y `main` contiene Pricing V2 + autorización comercial + price lock.

## Objetivo

Permitir que Provider/Platform Admin dé de alta un Evento para un Client explícito, registre al actor real como creador, acepte y congele términos comerciales autoritativos y asigne responsabilidad operativa a una Planner sin impersonation ni falsificación de provenance.

La separación es obligatoria:

- `clientId` = tenant propietario;
- `createdByUserId` = actor real que creó el registro;
- `assignedPlannerUserId` = Planner responsable operativa, nullable cuando una Organización todavía no tiene responsable;
- Commercial Price Lock = términos aceptados del Evento, independiente de creator/assignment.

`createdByUserId` nunca vuelve a utilizarse como ownership operativo de `ORGANIZATION_PLANNER`.

## Decisión de integración comercial

COM-02 implementa autorización Event-scoped. Para preservar la secuencia comercial `cotización → aceptación → Evento` sin introducir Quote/Order, el intake Admin se resuelve con **preview pre-Event + alta/price-lock atómica**:

1. Platform Admin selecciona Client, SKU y capacidad.
2. Backend devuelve preview autoritativo para ese Client usando Pricing V2 y cobertura financiera actual, sin crear Event, Ledger ni Receipt.
3. UI conserva el `servicePriceId` mostrado.
4. Platform Admin confirma la aceptación.
5. `POST` de intake vuelve a resolver Pricing V2 dentro de una transacción `Serializable` y exige que el `servicePriceId` vigente sea exactamente el aceptado.
6. Si cambió el Price Book, se rechaza con conflicto explícito; nunca se congela silenciosamente un precio distinto al mostrado.
7. Si coincide y existe cobertura, se crea el Event y su commercial lock en la misma transacción.
8. Se auditan `EVENT_CREATE` y `EVENT_COMMERCIAL_AUTHORIZE` con el Platform Admin real.
9. No se mueve Ledger, no se crea Receipt y no se reserva saldo hasta activación.

Los endpoints COM-02 Event-scoped permanecen para Eventos existentes, Planner-created y legacy. No se sustituyen.

## Modelo de datos

Agregar a `Event`:

```text
assignedPlannerUserId UUID NULL
```

Relación Prisma sugerida:

```text
Event.assignedPlannerUser -> User @relation("EventAssignedPlanner")
User.assignedEvents       -> Event[] @relation("EventAssignedPlanner")
```

FK `ON DELETE RESTRICT`.

Índice requerido para la consulta operativa:

```text
(client_id, assigned_planner_user_id, status, deleted_at)
```

Conservar el índice de `createdByUserId`: provenance/auditoría siguen siendo válidos.

## Backfill histórico

No inventar ownership.

Backfill únicamente cuando el creador ya es inequívocamente una Planner válida del mismo Client:

- `INDEPENDENT_PLANNER` creadora → `assignedPlannerUserId = createdByUserId`;
- `ORGANIZATION_PLANNER` creadora → `assignedPlannerUserId = createdByUserId`;
- `ORGANIZATION_ADMIN` creador → dejar `assignedPlannerUserId = NULL`;
- cualquier registro que no cumpla de forma inequívoca → `NULL`.

El backfill no modifica `createdByUserId`.

## Invariantes PostgreSQL

### Creator

Actualizar `validate_event_context()` y su trigger existente.

Debe permitir:

- creator `PLATFORM_ADMIN` activo con `client_id IS NULL` creando para un Client explícito;
- cualquier creator no Platform Admin debe conservar `creator.client_id = event.client_id`.

No permitir creator inexistente o soft-deleted.

### Assigned Planner

Si `assignedPlannerUserId IS NULL`, no hay Planner operativa asignada.

Si existe:

- User debe existir y `deleted_at IS NULL`;
- `assignedUser.client_id = Event.client_id`;
- si `Client.type = PLANNER`, el User debe ser `INDEPENDENT_PLANNER`;
- si `Client.type = ORGANIZATION`, el User debe ser `ORGANIZATION_PLANNER`;
- `ORGANIZATION_ADMIN` y `PLATFORM_ADMIN` nunca son valores válidos de `assignedPlannerUserId`.

El trigger de contexto debe ejecutarse en INSERT y en cambios de `client_id`, `created_by_user_id`, `assigned_planner_user_id` o `time_zone`.

### Activation actor

Actualizar `validate_event_activation_snapshot_references()`.

La regla antigua:

```text
ORGANIZATION_PLANNER activatedByUserId == createdByUserId
```

queda eliminada.

La nueva regla para `ORGANIZATION_PLANNER` es:

```text
activatedByUserId == assignedPlannerUserId
```

`ORGANIZATION_ADMIN` conserva acceso organizacional y puede activar conforme al contrato existente.

`INDEPENDENT_PLANNER` conserva acceso de su Client; los Eventos nuevos deben quedar asignados inequívocamente a la Planner independiente correspondiente, pero su autorización de tenant no se estrecha artificialmente si el Client sólo representa su cuenta.

No tocar snapshots financieros ni el momento del cargo.

## Política de acceso

`eventOwnedWhere(principal)` queda como punto central de autorización de Event y módulos dependientes.

Reglas:

- sin `principal.clientId` → `EVENT_NOT_FOUND`;
- `INDEPENDENT_PLANNER` → todos los Eventos activos/no eliminados de su propio Client, comportamiento actual preservado;
- `ORGANIZATION_ADMIN` → todos los Eventos de su Client, comportamiento actual preservado;
- `ORGANIZATION_PLANNER` → únicamente `{ clientId, assignedPlannerUserId: principal.userId }`;
- `PLATFORM_ADMIN` no usa `/events/**`; opera superficies `/admin/**` explícitas.

Como Contacts, Invitations, Invitation Design, FileAssets, Floorplan, Reports y Staff reutilizan `EventAccessPolicy` o `eventOwnedWhere`, no duplicar filtros en cada módulo. Agregar pruebas de regresión en al menos un recurso hijo para demostrar propagación de la nueva policy.

## Creación desde rutas Planner existentes

`POST /api/v1/events` conserva `createdByUserId = principal.userId`.

Asignación inicial:

- `INDEPENDENT_PLANNER` → `assignedPlannerUserId = principal.userId`;
- `ORGANIZATION_PLANNER` → `assignedPlannerUserId = principal.userId`;
- `ORGANIZATION_ADMIN` → `assignedPlannerUserId = NULL`.

No cambiar el tenant ni falsificar creator.

## Admin pre-Event quote

Agregar endpoint Platform Admin:

```http
GET /api/v1/admin/clients/:clientId/events/intake-quote?serviceCode=FLYER&capacity=100
```

Parámetros estrictos:

- `serviceCode`: `FLYER | FLIPBOOK | PHYSICAL_QR`;
- `DEMO` no se admite;
- `capacity`: entero positivo dentro de la cobertura soportada por Pricing V2.

La respuesta mínima contiene:

- Client ID/nombre;
- commercial channel;
- Service ID + code;
- capacity;
- ServicePrice ID;
- bracket/tier;
- créditos base/final;
- MXN cents;
- cobertura financiera comprada/línea/total/sufficient.

No crea Event, Ledger, Receipt, Payment, deuda ni Audit de aceptación.

La implementación debe reutilizar el resolver y `coverage` de `EventCommercialService`; no duplicar Pricing V2.

## Admin create + authorize

Agregar:

```http
POST /api/v1/admin/clients/:clientId/events
```

Body estricto mínimo:

```json
{
  "name": "Boda Ana y Luis",
  "serviceCode": "FLIPBOOK",
  "capacity": 100,
  "acceptedServicePriceId": "uuid-del-preview",
  "assignedPlannerUserId": "uuid-o-null",
  "acceptanceConfirmed": true
}
```

`name` puede ser nullable/opcional conforme al modelo de Draft. `serviceCode`, `capacity`, `acceptedServicePriceId` y `acceptanceConfirmed: true` son obligatorios.

Dentro de una única transacción `Serializable`:

1. validar Client existente, no eliminado y activo;
2. resolver Service activo por `serviceCode`; rechazar DEMO;
3. validar Planner assignment contra Client/role;
4. volver a resolver Pricing V2 + cobertura;
5. exigir `resolvedPrice.id === acceptedServicePriceId`; si no, `EVENT_COMMERCIAL_QUOTE_STALE`;
6. construir commercial lock usando exactamente esos términos;
7. crear Event con:
   - `clientId` del path;
   - `createdByUserId = principal.userId` (Platform Admin real);
   - `assignedPlannerUserId` validado;
   - `serviceId` resuelto;
   - `capacity`;
   - `name`;
   - commercial lock completo;
   - estado derivado por el resolver existente, sin nuevo EventStatus;
8. recomputar readiness existente si corresponde;
9. auditar `EVENT_CREATE` y `EVENT_COMMERCIAL_AUTHORIZE` con el mismo actor real y snapshot;
10. si hay assignment inicial no nulo, incluirlo en el snapshot de Event; no es necesario crear una tercera entidad.

No debe existir un Event persistido si cualquiera de los pasos comerciales falla.

## Assignment Admin

Agregar endpoint explícito:

```http
PATCH /api/v1/admin/clients/:clientId/events/:eventId/assignment
```

Body estricto:

```json
{ "assignedPlannerUserId": "uuid-o-null" }
```

Reglas:

- Platform Admin only;
- resolver target exacto `clientId + eventId + deletedAt IS NULL`;
- lock de Event antes de validar y escribir;
- aplicar las mismas invariantes Client/role;
- `NULL` permitido para Organization;
- para Client `PLANNER`, no dejar un Evento nuevo deliberadamente ambiguo: una asignación Admin debe resolver a `INDEPENDENT_PLANNER` del mismo Client;
- no modifica `createdByUserId`;
- no modifica Service, capacity, commercial lock, readiness, status, Ledger ni Receipt;
- auditar `EVENT_PLANNER_ASSIGNMENT_UPDATE` con before/after de IDs;
- replay del mismo assignment es idempotente a nivel de estado y no debe producir side effects comerciales.

La asignación es metadata de autorización/ownership, no una transición de EventStatus. Puede actualizarse en un Event no eliminado sin repricing; no altera el price lock.

## DTO/Event projection

`EventResponseDto` agrega:

```text
assignedPlannerUserId: string | null
```

No ocultar `createdByUserId`: ambos campos deben coexistir para diferenciar provenance y responsabilidad.

Los Audit snapshots de Event deben incluir ambos.

## Admin user discovery

`GET /api/v1/admin/clients/:clientId/users` debe servir también para Client tipo `PLANNER`.

- para `PLANNER`: devolver usuarios activos `INDEPENDENT_PLANNER` del Client;
- para `ORGANIZATION`: conservar `ORGANIZATION_ADMIN` + `ORGANIZATION_PLANNER`;
- rutas Client-owned de gestión de usuarios Organization no cambian.

La UI filtra candidatos asignables y nunca ofrece Organization Admin ni Platform Admin como Planner responsable.

## Admin UI

### Lista global de Eventos

`AdminEventsPage` deja de declararse solo lectura.

Agregar CTA `Nuevo evento`.

El formulario Intake debe:

1. cargar Clients existentes;
2. seleccionar Client;
3. cargar usuarios Admin del Client;
4. seleccionar SKU contractual: QR/EventOps, Flyer o Flipbook;
5. capturar capacidad;
6. solicitar `intake-quote` únicamente cuando Client + SKU + capacity sean válidos;
7. mostrar canal, regla/tier, créditos, MXN y cobertura;
8. para Client `PLANNER`, exigir una `INDEPENDENT_PLANNER`; si existe exactamente una, puede preseleccionarse;
9. para `ORGANIZATION`, permitir `Sin asignar` o una `ORGANIZATION_PLANNER`;
10. al confirmar enviar `acceptedServicePriceId` del preview visible;
11. bloquear double-submit;
12. si backend devuelve `EVENT_COMMERCIAL_QUOTE_STALE`, refrescar preview y exigir una nueva confirmación; nunca reenviar automáticamente;
13. éxito → invalidar lista de Eventos y navegar a `/eventos/:eventId/preparar/comercial`.

No hardcodear Service IDs ni precios. Los Service codes son SKU contractuales y pueden tiparse desde OpenAPI.

### Detalle administrativo

`AdminEventDetailPage` debe mostrar por separado:

- Creador;
- Planner asignada / Sin asignar.

Agregar `Cambiar planner` usando el endpoint Admin de assignment y la lista de usuarios del Client.

No usar endpoints Planner.

## API client/OpenAPI

Regenerar OpenAPI.

Agregar al Admin API client:

- `quoteIntake(clientId, input)`;
- `createForClient(clientId, input)`;
- `updateAssignment(clientId, eventId, input)`.

Actualizar validadores runtime para exigir `assignedPlannerUserId` nullable en Event responses.

No crear wrappers Planner para mutaciones Admin.

## QA obligatorio

### Migración/PostgreSQL

1. migración aplica sobre base limpia y sobre esquema actual;
2. backfill conserva visibilidad histórica de Organization Planner;
3. Platform Admin real puede ser creator con `clientId = NULL` en User;
4. creator tenant no Platform Admin sigue obligado al mismo Client;
5. assignment cross-client rechazado por PostgreSQL;
6. Organization Admin/Platform Admin rechazados como assigned Planner;
7. tipo Planner ↔ Independent y Organization ↔ Organization Planner reforzado;
8. activation snapshot acepta Organization Planner asignada aunque no sea creator;
9. activation rechaza Organization Planner no asignada.

### API

10. intake quote no crea Event/Ledger/Receipt;
11. quote Standard/Partner/Venue usa Pricing V2 real;
12. create Admin persiste `createdByUserId = Platform Admin`;
13. create Admin congela exactamente `acceptedServicePriceId`;
14. cambio de precio entre preview y POST devuelve `EVENT_COMMERCIAL_QUOTE_STALE` y no crea Event;
15. cobertura insuficiente no crea Event;
16. cross-client assignment devuelve 404/409 sin fuga;
17. Organization Planner asignada ve/get/patch su Event;
18. Organization Planner no asignada recibe 404;
19. Organization Admin ve todos los Eventos del tenant;
20. Independent Planner conserva su flujo;
21. Planner-created historical Events siguen visibles tras backfill;
22. assignment update cambia acceso inmediatamente y queda auditado;
23. recurso hijo, mínimo Contacts o Floorplan, aplica nueva policy;
24. Platform Admin continúa recibiendo 403 en `/events/**` Planner.

### Frontend

25. Nuevo Evento muestra quote antes de confirmación;
26. no permite confirmar cobertura insuficiente;
27. double click produce un POST;
28. stale quote exige nueva confirmación;
29. Planner options respetan Client type;
30. success navega a Comercial;
31. detalle distingue creator y assigned Planner;
32. reassignment actualiza UI sin tocar Commercial.

## No hacer

- no Quote/Order entity;
- no nuevo EventStatus;
- no impersonation;
- no credenciales compartidas;
- no falsificar `createdByUserId`;
- no convertir ClientType en pricing;
- no reserva de créditos;
- no Ledger/Receipt antes de activación;
- no tocar Croquis, Seating, RSVP, Scanner, Staff, Reporting salvo regresión de access policy demostrada;
- no empezar PILOT-03 en este ticket.

## Commit esperado

Un commit funcional focalizado en OP-04, o como máximo dos si la migración/invariante y la superficie Admin necesitan separación clara. Cada commit debe ser reversible y `main` debe quedar limpio.