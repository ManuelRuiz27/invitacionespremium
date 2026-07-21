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

## Canales autorizados

### `event:{eventId}:dashboard`

Consumidores:

- Planner independiente con ownership;
- Admin de Organización para Eventos de su Organización;
- Planner de Organización para Eventos creados por él;
- Platform Admin solo en vista administrativa autorizada.

Uso:

- métricas operativas;
- cambios de confirmación;
- check-ins;
- cambios de asiento;
- cierre/cancelación.

### `event:{eventId}:scanner`

Consumidores:

- Staff con token válido para el Evento.

Uso:

- invalidación de sesión por cierre/cancelación;
- sincronización mínima de operación;
- actualización de disponibilidad después de check-in.

No transmite teléfonos ni listas completas de asistentes.

### `event:{eventId}:floorplan`

Consumidores:

- usuarios con permiso de lectura/edición de croquis;
- Staff del mismo Evento con permiso de lectura.

Uso:

- cambios de mesa/asignación;
- actualización visual del plano.

## Envelope estándar

Todo evento emitido debe usar este sobre:

```json
{
  "eventName": "checkin.created",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:00:00.000Z",
  "operationId": "uuid",
  "actorType": "USER",
  "data": {}
}
```

### Campos

- `eventName`: nombre estable del evento.
- `version`: versión entera del contrato.
- `eventId`: Evento afectado.
- `occurredAt`: timestamp UTC ISO 8601.
- `operationId`: identificador de la operación de backend para deduplicación.
- `actorType`: `USER`, `STAFF_TOKEN` o `SYSTEM`.
- `data`: payload específico.

No incluir `actorUserId` o `staffTokenId` salvo que el consumidor autorizado lo necesite. Nunca incluir el token secreto.

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
    "checkedInCount": 1
  }
}
```

Reglas:

- no incluir teléfono;
- no incluir token QR;
- no incluir nombres en broadcast general;
- dashboard puede recuperar detalle por REST si tiene permiso.

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
    "invitationId": "uuid"
  }
}
```

### `rsvp.updated`

Se emite cuando cambia la Confirmación de asistencia o la lista nominal dentro de los límites permitidos.

```json
{
  "eventName": "rsvp.updated",
  "version": 1,
  "eventId": "uuid",
  "occurredAt": "2026-07-20T18:20:00.000Z",
  "operationId": "uuid",
  "actorType": "SYSTEM",
  "data": {
    "invitationId": "uuid",
    "status": "CONFIRMED",
    "confirmedAssistants": 3,
    "previousConfirmedAssistants": 2
  }
}
```

El enum de `status` debe corresponder al contrato definitivo de Confirmación.

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
    "assistantIds": ["uuid"],
    "fromTableId": "uuid-or-null",
    "toTableId": "uuid-or-null",
    "toTableOccupancy": 8,
    "toTableCapacity": 10
  }
}
```

No incluir nombres ni teléfonos en el broadcast.

### `event.closed`

Se emite después de cerrar el Evento.

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

Efecto en scanner:

- bloquear nuevas operaciones;
- mostrar estado cerrado;
- desconectar o invalidar room si corresponde.

### `event.cancelled`

Se emite después de cancelar el Evento.

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

## Eventos no autorizados en MVP

No crear eventos adicionales sin documentarlos y aprobarlos.

En particular, no emitir por Socket.IO:

- compras o pagos;
- saldo o deuda;
- líneas de crédito;
- promociones detalladas;
- teléfonos;
- contenido completo de invitaciones;
- URLs firmadas de archivos;
- tokens QR;
- tokens staff.

## Autorización de conexión

### Usuarios autenticados

1. Validar sesión.
2. Resolver rol y Cliente.
3. Verificar acceso al Evento según `ACCESS_MATRIX.md`.
4. Unir al room permitido.

### Staff por token

1. Validar token.
2. Verificar estado activo y expiración.
3. Resolver `event_id` desde token.
4. Unir solo a rooms autorizados del mismo Evento.
5. Nunca aceptar `event_id` alterno enviado por cliente.

## Reconexión y consistencia

Al reconectar:

1. autenticar nuevamente;
2. volver a verificar permisos/estado;
3. recuperar snapshot actual por REST;
4. reanudar eventos nuevos.

No depender de replay completo de Socket.IO en MVP.

## Deduplicación

Consumidores deben usar `operationId` para ignorar eventos repetidos.

Backend debe emitir una sola vez después de confirmar la transacción. Si existe retry técnico, conservar el mismo `operationId`.

## Manejo de errores

Errores de autorización de socket deben usar códigos estables:

- `SOCKET_UNAUTHORIZED`
- `SOCKET_EVENT_FORBIDDEN`
- `SOCKET_STAFF_TOKEN_EXPIRED`
- `SOCKET_EVENT_CLOSED`
- `SOCKET_EVENT_CANCELLED`
- `SOCKET_PAYLOAD_VERSION_UNSUPPORTED`

## Testing mínimo

- usuario sin ownership no entra al room;
- Planner de Organización no entra a Evento creado por otro Planner;
- Staff no entra a room de otro Evento;
- cerrar Evento invalida operación scanner;
- cancelar Evento bloquea scanner y confirmación;
- payload no contiene teléfono ni token;
- eventos duplicados se deduplican por `operationId`;
- reconexión vuelve a validar permisos.