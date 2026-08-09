# Contrato de Eventos

## Alcance

`EventsModule`, dentro de `apps/api`, implementa el modelo, CRUD, activación transaccional y ciclo de vida
posterior de Evento. Cliente, creador, estado, precio y fuentes financieras se resuelven en backend.

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
Los snapshots de activación son la fuente histórica del Evento: una vez activado no dependen de cambios
posteriores en precios, servicios ni configuración.

## Proyección del servicio contratado

`EventResponseDto` incluye `serviceCode`, nullable y tipado con el enum `ServiceCode` existente. Se deriva
directamente de `Event.serviceId → Service.code`, sin exigir que el Servicio permanezca activo ni que
exista un precio o promoción vigente. `serviceId` nulo produce `serviceCode` nulo; no se inventa un
servicio por defecto.

`Event.serviceId` representa el Servicio contratado actual. `activatedServiceId` conserva el Servicio de
la activación inicial como parte del snapshot financiero inmutable y no sustituye a la relación actual.
El futuro commit del upgrade Flyer → Flipbook deberá actualizar `Event.serviceId` atómicamente conforme a
`SERVICE_UPGRADE_FLOW.md`; ese workflow no se implementa en CODEX-124A-R1.

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

La persistencia exige snapshots de activación completamente nulos en `DRAFT`, `CONFIGURED` y
`READY_TO_ACTIVATE`, y completos en `ACTIVE`, `EVENT_DAY`, `CLOSED`, `ALBUM_PUBLISHED` y `ARCHIVED`.
`CANCELLED` admite ambos casos completos: sin snapshot cuando la cancelación precede a la activación o con
snapshot cuando ocurre después. Nunca se permite un snapshot parcial.

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

Después de establecer `activatedAt`, un trigger PostgreSQL protege individualmente todos los campos del
snapshot mediante `IS DISTINCT FROM`. La protección aplica también contra SQL directo, permite cambios
legítimos de estado y conserva el snapshot durante todo estado posterior. Otro trigger valida al establecerlo
que servicio y precio coincidan, que el precio corresponda al tipo real del Cliente, que el comprobante
pertenezca al Cliente y Evento correctos y que el actor tenga ownership y rol operativo autorizado.

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
POST   /api/v1/events/:eventId/close
POST   /api/v1/events/:eventId/reopen
POST   /api/v1/events/:eventId/cancel
POST   /api/v1/events/:eventId/archive
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

Crear, editar, activar, cerrar, reabrir, cancelar, archivar, borrar, restaurar, expirar un borrador y entrar
automáticamente a `EVENT_DAY` generan auditoría transaccional con Cliente, Evento, recurso, actor y
snapshots aplicables.

## Activación

`POST /events/:eventId/activate` exige `Idempotency-Key`, estado `READY_TO_ACTIVATE`, Cliente activo, servicio real activo, precio vigente y capacidad financiera suficiente. Consume primero saldo comprado y luego línea de crédito. Ledger, comprobante, balance, snapshots, estado `ACTIVE` y auditoría se confirman en una transacción `Serializable`.

El detalle normativo se encuentra en `EVENT_ACTIVATION_CONTRACT.md`.

## Ciclo de vida posterior

Cierre, reapertura, cancelación y archivado requieren `Idempotency-Key`. La entrada a `EVENT_DAY` es
automática según la fecha local de la zona IANA del Evento. PostgreSQL restringe las transiciones, los
estados terminales y la conservación de snapshots.

Un replay confirmado de activación o ciclo de vida autoriza ownership incluso si el Evento fue eliminado
lógicamente después y devuelve el snapshot original. Esto no habilita operaciones nuevas sobre Eventos
eliminados ni permite consultar llaves de Eventos fuera del ownership.

El detalle normativo se encuentra en `EVENT_LIFECYCLE_CONTRACT.md`.

## Errores

- `VALIDATION_ERROR`: payload, UUID, fecha, zona o capacidad inválidos;
- `EVENT_NOT_FOUND`: Evento inexistente, borrado o fuera de ownership;
- `EVENT_SERVICE_NOT_AVAILABLE`: servicio inexistente o inactivo;
- `EVENT_INVALID_STATE_TRANSITION`: edición o borrado incompatible con el estado;
- `EVENT_DEMO_NOT_ACTIVATABLE`: un Evento Demo no admite activación real;
- `EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT`: llave usada por otro Evento u operación;
- `EVENT_STATE_IDEMPOTENCY_CONFLICT`: llave de ciclo de vida usada por otro Evento o acción;
- `EVENT_STATE_TRANSITION_CONFLICT`: la transición no pudo serializarse después de reintentos;
- `ROLE_FORBIDDEN`: rol sin acceso al grupo de rutas.

## Alcance diferido

No se implementan todavía:

- promociones económicas;
- Croquis o Mesas;
- StaffTokens, QR y scanner;
- cambio de servicio después de activar;
- frontend.

## Configuración y cierre de Confirmación

`Event` incluye `locationUrl`, `giftRegistryUrl`, `confirmationClosedAt` y
`confirmationClosedByUserId`. Los destinos son HTTPS controlados, se configuran durante preparación, no
se auditan y quedan congelados al activar. Se normalizan antes de persistir; permiten query, no
fragmentos, y rechazan credenciales, barra inversa y material de token, invitación, nombre, teléfono o
WhatsApp en segmentos de path o claves de query incluso con cambios de caja, guiones, guiones bajos o
codificación porcentual.

La validación decodifica cada componente hasta cuatro rondas y rechaza controles ASCII `0x00-0x1F` y
`0x7F`, además de `/`, `\`, `#` o material reservado revelado por la decodificación. El espacio literal
es inválido; `%20` solo es válido en path y valores de query, nunca en claves o autoridad. Las migraciones
`20260728210000_harden_public_rsvp_urls` y
`20260728220000_reject_encoded_destination_controls` protegen `INSERT` y `UPDATE` directos. Un corpus
compartido verifica el mismo resultado en normalizador, DTO/API y PostgreSQL. El cierre de Confirmación
es un subestado independiente y completo; solo opera en `ACTIVE` o `EVENT_DAY`.

La migración `20260728230000_validate_destination_url_encoding` añade paridad estricta: todo `%` requiere
dos dígitos hexadecimales y los bytes deben ser UTF-8 válido. Se acepta UTF-8 válido como `%C3%B3`; se
rechazan secuencias truncadas, sobrelargas o continuaciones aisladas. PostgreSQL evalúa la subcadena
completa después del primer `?`, aunque existan otros signos `?`, y solo valida: no reescribe ni normaliza
el texto almacenado. Antes de aplicar las funciones revisa ambos destinos heredados y revierte con un
error técnico sin URLs si alguna fila viola la política. Los 54 casos del corpus se ejecutan contra
`locationUrl` y `giftRegistryUrl`, incluido el valor previo intacto tras un `UPDATE` rechazado.

Para Flyer/Flipbook, activación exige Confirmación habilitada, ambos destinos, diseño completo y al menos
una Invitación activa antes de cualquier efecto financiero. Las rutas `GET /confirmation`, `POST
/confirmation/close` y `POST /confirmation/reopen` siguen `EventAccessPolicy`, bloquean el Evento y son
idempotentes sin duplicar auditoría. Detalle en `PUBLIC_RSVP_CONTRACT.md`.
