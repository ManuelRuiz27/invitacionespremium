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
| Platform Admin | Lectura administrativa | No | Solo lectura administrativa si aplica |
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
    "checkInId": "uuid",
    "assistantId": "uuid",
    "invitationId": "uuid",
    "tableId": "uuid-or-null",
    "delta": 1
  }
}
```

Reglas:

- `delta` representa el cambio producido por esta operación, no el total del Evento;
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
    "status": "confirmed",
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
2. emitir a sockets ya conectados en `scanner` y `dashboard`;
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

1. Validar token.
2. Verificar que no esté expirado.
3. Verificar que el Evento esté `active` o `event_day`.
4. Resolver `event_id` desde token.
5. Permitir únicamente rooms `scanner` y `floorplan` del mismo Evento.
6. Nunca aceptar `event_id` alterno enviado por cliente.
7. Nunca permitir room `dashboard`.

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
- pérdida de un evento se recupera mediante snapshot REST.