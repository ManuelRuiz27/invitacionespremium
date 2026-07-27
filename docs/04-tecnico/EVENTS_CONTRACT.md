# Contrato de Eventos

## Alcance

`EventsModule`, dentro de `apps/api`, implementa el modelo, CRUD y activación transaccional de Evento. Cliente, creador, estado, precio y fuentes financieras se resuelven en backend.

## Modelo Event

- `id`: UUID;
- `clientId`: FK restrictiva a `Client`;
- `createdByUserId`: FK restrictiva a `User`;
- `serviceId`: FK nullable y restrictiva a `Service`;
- `name`: nullable durante un borrador incompleto;
- `socialType`: nullable;
- `status`: estado técnico;
- `eventDateTime`: instante UTC nullable;
- `timeZone`: identificador IANA nullable;
- `capacity`: entero positivo nullable;
- `confirmationEnabled`: configuración básica de Confirmación;
- `floorplanEnabled`: flag de Croquis/Mesas;
- snapshots de activación, precio, fuentes financieras, comprobante e idempotencia;
- `createdAt`, `updatedAt` y `deletedAt`.

No existe una entidad adicional de “servicio contratado”. El Evento referencia directamente `Service`.

## Tipos sociales

| Código API | Nombre de producto |
|---|---|
| `WEDDING` | Boda |
| `QUINCEANERA` | XV años |
| `CORPORATE` | Corporativo |
| `BIRTHDAY` | Cumpleaños |
| `OTHER` | Otro |

## Estados técnicos

El enum contiene exactamente:

```text
DRAFT
CONFIGURED
READY_TO_ACTIVATE
ACTIVE
EVENT_DAY
CLOSED
ALBUM_PUBLISHED
ARCHIVED
CANCELLED
```

PostgreSQL los persiste como `draft`, `configured`, `ready_to_activate`, `active`, `event_day`, `closed`, `album_published`, `archived` y `cancelled`.

## Estado calculado

El frontend no envía `status`.

- falta nombre, servicio, tipo social, fecha/hora, zona horaria o capacidad: `DRAFT`;
- todos esos datos están completos: `CONFIGURED`;
- `READY_TO_ACTIVATE` permanece inaccesible en CODEX-040.

El resolver expone un checklist extensible. Contactos, diseño, Confirmación completa, validación de Croquis/Mesas y validación financiera permanecen en `false` hasta sus tareas correspondientes. No se simulan requisitos.

## Validaciones

- `clientId` y `createdByUserId` se derivan de `AuthPrincipal`;
- el creador debe pertenecer al mismo Cliente, reforzado mediante trigger PostgreSQL;
- el servicio indicado debe existir y estar activo;
- el servicio puede cambiar mientras el Evento permanezca en preparación;
- `eventDateTime` se recibe como ISO 8601 con offset y se persiste en `TIMESTAMPTZ`;
- `timeZone` debe existir en el catálogo IANA aceptado por runtime y `pg_timezone_names`;
- la capacidad, cuando existe, es un entero mayor que cero;
- `PATCH` solo opera en `DRAFT`, `CONFIGURED` o `READY_TO_ACTIVATE`;
- las consultas operativas siempre exigen `deletedAt IS NULL`.

## Ownership

- `INDEPENDENT_PLANNER`: Eventos de su Cliente;
- `ORGANIZATION_ADMIN`: todos los Eventos de su Organización;
- `ORGANIZATION_PLANNER`: únicamente Eventos de su Organización creados por su propio usuario;
- `PLATFORM_ADMIN`: no usa `/events/**`; consulta mediante `/admin/events/**`.

Un recurso existente fuera del ownership responde `404 EVENT_NOT_FOUND`.

## Endpoints

Operación Cliente:

```http
GET    /api/v1/events
POST   /api/v1/events
POST   /api/v1/events/:eventId/activate
GET    /api/v1/events/:eventId
PATCH  /api/v1/events/:eventId
DELETE /api/v1/events/:eventId
```

Platform Admin:

```http
GET  /api/v1/admin/events
GET  /api/v1/admin/events/:eventId
POST /api/v1/admin/events/:eventId/restore
```

Las rutas administrativas son de lectura global, excepto la restauración explícita exigida por la política común de soft delete.

## Borrado lógico y restauración

`DELETE` establece `deletedAt`; nunca elimina físicamente. No modifica `status` y genera auditoría en la misma transacción.

Solo Platform Admin puede restaurar. La restauración limpia `deletedAt`, conserva estado y datos, y genera auditoría.

## Borradores vencidos

`EventsService.softDeleteExpiredDrafts(at?)` elimina lógicamente Eventos que:

- están en `DRAFT`;
- tienen `eventDateTime < at`;
- no están borrados.

La operación usa actor `SYSTEM`, aislamiento `Serializable` y un registro de auditoría por Evento afectado. Repetirla no actualiza ni audita nuevamente filas ya procesadas.

## Auditoría

Crear, editar, activar, borrar, restaurar y expirar un borrador generan auditoría transaccional con Cliente, Evento, recurso, actor y snapshots aplicables.

## Activación

`POST /events/:eventId/activate` exige `Idempotency-Key`, estado `READY_TO_ACTIVATE`, Cliente activo, servicio real activo, precio vigente y capacidad financiera suficiente. Consume primero saldo comprado y luego línea de crédito. Ledger, comprobante, balance, snapshots, estado `ACTIVE` y auditoría se confirman en una transacción `Serializable`.

El detalle normativo se encuentra en `EVENT_ACTIVATION_CONTRACT.md`.

## Errores

- `VALIDATION_ERROR`: payload, UUID, fecha, zona o capacidad inválidos;
- `EVENT_NOT_FOUND`: Evento inexistente, borrado o fuera de ownership;
- `EVENT_SERVICE_NOT_AVAILABLE`: servicio inexistente o inactivo;
- `EVENT_INVALID_STATE_TRANSITION`: edición o borrado incompatible con el estado;
- `EVENT_DEMO_NOT_ACTIVATABLE`: un Evento Demo no admite activación real;
- `EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT`: llave usada por otro Evento u operación;
- `ROLE_FORBIDDEN`: rol sin acceso al grupo de rutas.

## Alcance diferido

No se implementan todavía:

- promociones económicas;
- Contactos e Invitaciones;
- diseño Flyer/Flipbook;
- Confirmación pública;
- Croquis o Mesas;
- StaffTokens, QR y scanner;
- cierre, reapertura, cancelación o archivado;
- cambio de servicio después de activar;
- frontend.
