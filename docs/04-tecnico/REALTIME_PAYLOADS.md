# Contratos de eventos en tiempo real

## Objetivo

Definir canales, autorización, eventos y payloads mínimos de Socket.IO para evitar exposición de datos sensibles y contratos inconsistentes entre API, client, admin y scanner.

## Principios

1. Socket.IO complementa la API REST; no sustituye validaciones ni persistencia.
2. Toda mutación se ejecuta primero por API/backend y después emite evento.
3. Los eventos son notificaciones de cambio, no la fuente de verdad.
4. El consumidor debe volver a consultar por REST cuando necesite detalle actualizado.
5. No enviar teléfonos, datos financieros, tokens públicos completos ni información de otros Eventos.
6. Todo socket debe autorizarse antes de entrar a un room.
7. El `event_id` del room se resuelve en backend, no se confía ciegamente en el cliente.
8. Los payloads deben ser versionados.
9. No existen rooms públicos de Invitación o Álbum en MVP.
10. Una falla de emisión no revierte una transacción ya confirmada; debe registrarse técnicamente y los clientes deben recuperar estado por REST.

## Transporte y handshake v1

Socket.IO se conecta directamente al servidor HTTP de NestJS con:

```text
namespace: /realtime
path: /socket.io
protocolVersion: 1
```

La conexión usa los mismos orígenes CORS de la API y credenciales habilitadas. Los clientes web conectan
con credenciales para que el navegador envíe la cookie Auth `HttpOnly`, cuyo alcance obligatorio es
`Path=/` porque Socket.IO atiende en `/socket.io`. El session token nunca se copia a JavaScript ni se
envía en `handshake.auth`, query string, URL o almacenamiento local. No existe `join-room`: cada conexión
se autentica, autoriza y une a un solo room de negocio.

Usuario autenticado:

```json
{
  "protocolVersion": 1,
  "actorMode": "USER",
  "roomType": "dashboard",
  "eventId": "uuid",
  "administrative": false
}
```

La sesión se acepta exclusivamente desde la cookie Auth. No se aceptan credenciales en `auth`, query string
o URL. `administrative=true` está reservado al Platform Admin y solo permite `dashboard`.

Staff:

```json
{
  "protocolVersion": 1,
  "actorMode": "STAFF_TOKEN",
  "roomType": "scanner",
  "staffToken": "secreto-opaco"
}
```

El StaffToken se acepta exclusivamente en `handshake.auth`; el backend resuelve el Evento y rechaza cualquier
`eventId` proporcionado por el cliente. El secreto no se conserva en `socket.data`.

## Canales autorizados

### `event:{eventId}:dashboard`

Consumidores:

- Planner independiente con ownership;
- Admin de Organización para Eventos de su Organización;
- Planner de Organización para Eventos creados por él;
- Platform Admin solo en vista administrativa de lectura autorizada.

Uso:

- métricas operativas;
- cambios de Confirmación;
- check-ins;
- cambios de asiento;
- cierre/cancelación.

### `event:{eventId}:scanner`

Consumidores:

- Staff con token válido para el Evento;
- únicamente con Evento `active` o `event_day`.

Uso:

- invalidación de sesión por cierre/cancelación;
- sincronización mínima de operación;
- actualización de disponibilidad después de check-in.

No transmite teléfonos, nombres ni listas completas de Asistentes.

### `event:{eventId}:floorplan`

Consumidores:

- usuarios con permiso de lectura/edición de croquis;
- Staff del mismo Evento con permiso de lectura y Evento `active` o `event_day`.

Uso:

- cambios de mesa/asignación;
- actualización visual del plano.

## Mapa de acceso a rooms

| Actor | dashboard | scanner | floorplan |
|---|---|---|---|
| Planner independiente autorizado | Sí | No | Sí |
| Admin de Organización autorizado | Sí | No | Sí |
| Planner de Organización autorizado | Sí | No | Sí |
| Platform Admin | Lectura administrativa explícita | No | No |
| StaffToken válido | No | Sí | Sí, lectura |
| Público por token | No | No | No |

StaffToken nunca puede solicitar el room `dashboard`.

## Envelope estándar

Todo evento emitido debe usar este sobre:

```json
{
  "eventName": "checkin.created",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:00:00.000Z",
  "operationId": "uuid",
  "actorType": "STAFF_TOKEN",
  "data": {}
}
```

### Campos

- `eventName`: nombre estable del evento.
- `version`: versión entera del contrato.
- `eventId`: Evento afectado.
- `occurredAt`: timestamp UTC ISO 8601.
- `operationId`: identificador de la operación de backend para deduplicación.
- `actorType`: `USER`, `STAFF_TOKEN`, `PUBLIC_TOKEN` o `SYSTEM`.
- `data`: payload específico.

`PUBLIC_TOKEN` identifica una acción realizada mediante token público, por ejemplo Confirmación de asistencia. No expone el token ni crea un rol autenticado nuevo.

No incluir `actorUserId`, `staffTokenId`, `contactId` ni identificadores del token salvo que el consumidor autorizado lo necesite. Nunca incluir el secreto.

## Eventos mínimos

### `checkin.created`

Se emite después de persistir un check-in válido.

```json
{
  "eventName": "checkin.created",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:00:00.000Z",
  "operationId": "uuid",
  "actorType": "STAFF_TOKEN",
  "data": {
    "checkIns": [
      {
        "checkInId": "uuid",
        "assistantId": "uuid",
        "invitationId": "uuid",
        "tableId": null
      }
    ],
    "delta": 1
  }
}
```

Reglas:

- se emite un solo envelope por operación HTTP, aunque se registren varios Asistentes;
- `checkIns` conserva el orden determinista del resultado persistido;
- `delta === checkIns.length`;
- `operationId` identifica la operación completa y no se crean IDs derivados;
- `tableId` permanece `null` hasta `CODEX-090`;
- no incluir teléfono;
- no incluir token QR;
- no incluir nombres en broadcast general;
- dashboard puede recuperar totales y detalle por REST si tiene permiso.

### `checkin.reverted`

Se emite después de marcar un check-in como revertido.

```json
{
  "eventName": "checkin.reverted",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:10:00.000Z",
  "operationId": "uuid",
  "actorType": "USER",
  "data": {
    "checkInId": "uuid",
    "assistantId": "uuid",
    "invitationId": "uuid",
    "delta": -1
  }
}
```

StaffToken no puede originar este evento porque no puede revertir check-in.

### `rsvp.updated`

Se emite cuando cambia la Confirmación de asistencia o la lista nominal dentro de los límites permitidos.

```json
{
  "eventName": "rsvp.updated",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:20:00.000Z",
  "operationId": "uuid",
  "actorType": "PUBLIC_TOKEN",
  "data": {
    "invitationId": "uuid",
    "status": "CONFIRMED",
    "confirmedAssistants": 3,
    "previousConfirmedAssistants": 2
  }
}
```

Reglas:

- `status` debe corresponder al enum técnico definitivo de Confirmación;
- no incluir nombres de Asistentes;
- no incluir teléfono del Contacto;
- una modificación hecha por Planner usa `actorType=USER`;
- una recalculación automática usa `actorType=SYSTEM`.

### `seating.updated`

Se emite cuando cambia la mesa de uno o varios Asistentes.

```json
{
  "eventName": "seating.updated",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:30:00.000Z",
  "operationId": "uuid",
  "actorType": "USER",
  "data": {
    "changes": [
      {
        "assistantId": "uuid",
        "fromTableId": "uuid-or-null",
        "toTableId": "uuid-or-null"
      }
    ],
    "affectedTables": [
      {
        "tableId": "uuid",
        "occupancy": 8,
        "capacity": 10
      }
    ]
  }
}
```

Reglas:

- `changes` permite asignaciones individuales, familiares o de grupo sin asumir una sola mesa de origen;
- `affectedTables` contiene únicamente mesas cuya ocupación cambió;
- no incluir nombres ni teléfonos;
- Staff recibe el cambio mínimo necesario y vuelve a consultar el plano por REST cuando requiera detalle.

### `event.closed`

Se emite después de confirmar el cierre del Evento y expirar sus tokens Staff activos.

```json
{
  "eventName": "event.closed",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T23:00:00.000Z",
  "operationId": "uuid",
  "actorType": "USER",
  "data": {
    "status": "closed",
    "checkInEnabled": false,
    "staffAccessEnabled": false
  }
}
```

Orden operativo:

1. confirmar transacción de cierre y expiración de tokens;
2. emitir a sockets ya conectados en `dashboard`, `scanner` y `floorplan`;
3. bloquear nuevas operaciones;
4. desconectar o invalidar sockets Staff.

La emisión permite mostrar el estado cerrado, pero no mantiene válido el token.

### `event.cancelled`

Se emite después de confirmar la cancelación del Evento y expirar tokens Staff/Álbum aplicables.

```json
{
  "eventName": "event.cancelled",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T20:00:00.000Z",
  "operationId": "uuid",
  "actorType": "USER",
  "data": {
    "status": "cancelled",
    "checkInEnabled": false,
    "rsvpEnabled": false,
    "publicQrEnabled": false,
    "staffAccessEnabled": false
  }
}
```

Orden operativo:

1. confirmar cancelación y expiración de accesos;
2. emitir a sockets ya conectados;
3. bloquear scanner y Confirmación;
4. desconectar o invalidar sockets Staff.

La Invitación pública conserva únicamente su vista de mensaje de cancelación; no requiere un room público.

## Eventos no autorizados en MVP

No crear eventos adicionales sin documentarlos y aprobarlos.

En particular, no emitir por Socket.IO:

- compras o pagos;
- saldo o deuda;
- líneas de crédito;
- promociones detalladas;
- teléfonos;
- nombres en broadcasts generales;
- contenido completo de invitaciones;
- fotos o contenido completo del Álbum;
- URLs firmadas de archivos;
- tokens de Invitación;
- tokens de Álbum;
- tokens QR;
- tokens Staff.

## Autorización de conexión

### Usuarios autenticados

1. Validar sesión.
2. Resolver rol y Cliente.
3. Verificar acceso al Evento según `ACCESS_MATRIX.md`.
4. Verificar que el tipo de room esté permitido para el actor.
5. Unir únicamente al room permitido.

### Staff por token

1. Validar sintaxis y digest del token.
2. Resolver y bloquear en una transacción PostgreSQL con orden Evento → StaffToken.
3. Revaluar bajo locks existencia, borrado lógico, estado exacto, pertenencia, expiración y
   `floorplanEnabled`.
4. Preservar la prioridad de error: token inválido; Evento cerrado/cancelado; otro estado no operativo;
   token expirado en Evento operativo.
5. Resolver `event_id` desde token.
6. Permitir únicamente rooms `scanner` y `floorplan` del mismo Evento.
7. Nunca aceptar `event_id` alterno enviado por cliente.
8. Nunca permitir room `dashboard`.

El servidor registra internamente todo handshake Staff autorizado como pendiente antes de completar la
conexión y conserva solo el identificador técnico del StaffToken, nunca su secreto. Revalida inmediatamente
antes y después del registro Socket.IO. Cierre/cancelación invalida tanto sockets conectados como pendientes:
si la conexión gana recibe el evento terminal y se desconecta; si la transición gana, el handshake falla o
se desconecta antes de quedar operativo. Ningún socket Staff permanece estable en un Evento cerrado o
cancelado.

### Platform Admin

1. Validar sesión y rol Platform Admin.
2. Usar contexto administrativo explícito.
3. Autorizar lectura del Evento solicitado.
4. No reutilizar sesión ni permisos de Cliente.

## Reconexión y consistencia

Al reconectar:

1. autenticar nuevamente;
2. volver a verificar permisos, token y estado del Evento;
3. recuperar snapshot actual por REST;
4. reanudar eventos nuevos.

No depender de replay completo de Socket.IO en MVP.

Si el cliente detecta un salto, evento duplicado o estado incompatible, debe descartar su cache operativo y recuperar snapshot REST.

## Deduplicación

Consumidores deben usar `operationId` para ignorar eventos repetidos.

Backend debe emitir una sola vez después de confirmar la transacción. Si existe retry técnico, conservar el mismo `operationId`.
La clave de deduplicación es `eventName + operationId`; el proceso mantiene una ventana acotada en memoria.
No existe persistencia, outbox ni replay histórico en este MVP.

`operationId` identifica la operación de dominio, no la conexión Socket.IO.

## Manejo de errores

Errores de autorización de socket deben usar códigos estables:

- `SOCKET_UNAUTHORIZED`
- `SOCKET_ROOM_FORBIDDEN`
- `SOCKET_EVENT_FORBIDDEN`
- `SOCKET_STAFF_TOKEN_EXPIRED`
- `SOCKET_EVENT_NOT_OPERATIONAL`
- `SOCKET_EVENT_CLOSED`
- `SOCKET_EVENT_CANCELLED`
- `SOCKET_PAYLOAD_VERSION_UNSUPPORTED`

## Testing mínimo

- usuario sin ownership no entra al room;
- Planner de Organización no entra a Evento creado por otro Planner;
- Platform Admin no usa contexto de Cliente;
- Staff no entra a room de otro Evento;
- Staff no entra a room `dashboard`;
- Staff no conecta si Evento está `draft`, `configured`, `ready_to_activate`, `closed`, `archived` o `cancelled`;
- cerrar Evento notifica e invalida operación scanner;
- cancelar Evento bloquea scanner y Confirmación;
- `rsvp.updated` público usa `PUBLIC_TOKEN` sin revelar token;
- asignación múltiple representa mesas de origen distintas;
- payload no contiene teléfono, nombre ni token prohibido;
- eventos duplicados se deduplican por `operationId`;
- reconexión vuelve a validar permisos y estado;
- cookie de login y limpieza de logout usan exactamente `Path=/`;
- session token en `handshake.auth` o query se rechaza;
- carreras Staff contra cierre/cancelación cubren conexión ganadora, transición ganadora y la ventana
  autorización–registro con barreras deterministas;
- pérdida de un evento se recupera mediante snapshot REST.

La integración E2E cubre login, creación y configuración mínima del Evento, Contacto e Invitación,
activación, RSVP público, generación y decodificación del QR SVG, creación del StaffToken, conexión
Socket.IO, scan, selección, check-in, recepción de `checkin.created`, recuperación REST y cierre con
`event.closed`, desconexión e invalidación del Staff.
