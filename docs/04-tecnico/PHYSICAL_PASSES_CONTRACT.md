# Contrato técnico de pases físicos

## Alcance

`PhysicalPassesModule` implementa `CODEX-100` exclusivamente para Eventos con servicio contratado
`PHYSICAL_QR`. Un `PhysicalPass` pertenece directamente al Evento, puede apuntar a una Mesa y tiene uso
individual único. No crea Contacto, Invitación, Asistente, Confirmación, CheckIn, acceso a Álbum,
FileAsset ni evento Socket.IO.

## Modelos

`PhysicalPass` conserva UUID, Evento, número consecutivo, Mesa nullable, nonce y versión del token,
campos completos de primer uso, creador, timestamps y borrado lógico. Son únicos
`(eventId, passNumber)`, `qrTokenNonce` y la llave parcial `useIdempotencyKey`.

Los campos `usedAt`, `usedByStaffTokenId`, `useIdempotencyKey`, `useRequestSignature` y
`useResultSnapshot` son todos nulos o todos completos. Una vez usados son inmutables; PostgreSQL rechaza
segundo uso, cambio de identidad/Mesa/token/actor/timestamp/snapshot y hard delete.

La identidad `eventId`, `passNumber`, `qrTokenNonce`, `qrTokenVersion`, `createdByUserId` y `createdAt`
queda congelada desde el INSERT y tampoco puede cambiar antes del primer uso.

`PhysicalPassGenerationOperation` es técnica e inmutable. Conserva Evento, llave global, firma SHA-256,
snapshot mínimo y fecha. No es un recurso comercial ni expone tokens.

## Generación y numeración

```http
POST /api/v1/events/:eventId/physical-passes/generate
Idempotency-Key: <8..128>

{ "quantity": 10, "tableShapeId": "uuid-or-null" }
```

La transacción `Serializable` bloquea Evento → Croquis → Mesa, calcula el máximo histórico y crea el
rango siguiente completo. Los números no se reutilizan y un rollback no consume rango. La misma llave,
Evento, cantidad y Mesa devuelve exactamente el snapshot; otra solicitud devuelve
`PHYSICAL_PASS_GENERATION_IDEMPOTENCY_CONFLICT`.

Solo se genera en `draft`, `configured`, `ready_to_activate`, `active` o `event_day`. Estados cerrados o
terminales conservan los pases en lectura, pero impiden lotes nuevos. Flyer, Flipbook y Demo responden
`PHYSICAL_PASS_SERVICE_MISMATCH`.

El total activo no supera `Event.capacity`. Sin Croquis, Mesa debe ser nula. Con Croquis, todo el lote
requiere una Mesa `TABLE` activa del Croquis activo y con cupo completo. La ocupación de Mesa es:

```text
Asistentes activos asignados + PhysicalPass activos asignados
```

Servicio y triggers aplican la misma suma para generación, seating, reducción de capacidad, eliminación
de Mesa y `availableCapacity`.

## Lectura y ownership

```http
GET /api/v1/events/:eventId/physical-passes
GET /api/v1/events/:eventId/physical-passes/:passId/svg
```

Planner independiente opera su Cliente; Admin de Organización, su Organización; Planner de Organización,
solo Eventos creados por él. Platform Admin no impersona. Fuera de ownership responde `404`.

El listado ordena por `passNumber` y solo devuelve identidad mínima, `UNUSED|USED`, Mesa mínima,
`usedAt` y `createdAt`. Omite nonce, versión, token, firma, llave, snapshot, StaffToken, PII, finanzas y
storage.

## Token y SVG

El token usa propósito exclusivo `PHYSICAL_PASS`, prefijo `pp`, versión `1`, payload
`physicalPassId + nonce + version`, HMAC-SHA256, comparación timing-safe y separación:

```text
InvitacionesPremium:PHYSICAL_PASS
```

No se almacena completo ni funciona como token de Invitación, QR de Invitación, Álbum o Staff.

El SVG se deriva bajo demanda con nombre del Evento, número, QR y Mesa opcional. Escapa XML, usa una
estructura controlada, no contiene el token como texto, PII, scripts, imágenes o URLs externas y no se
persiste. `PHYSICAL_PASS_QR_SVG` continúa reservado sin crear FileAsset.

Headers: `image/svg+xml`, `Content-Length`, `Content-Disposition: inline`, ETag SHA-256,
`private, no-store`, `nosniff`, `no-referrer` y CSP `default-src 'none'`.

## Scanner y primer uso

```http
POST /api/v1/scanner/:staffToken/physical-passes/scan
Idempotency-Key: <8..128>

{ "qrToken": "token-opaco" }
```

El Evento se deriva únicamente del StaffToken. La transacción bloquea Evento → StaffToken → PhysicalPass
→ Mesa, exige Evento `active|event_day`, mismo Evento, pase activo/no usado y Mesa operativa cuando hay
Croquis. Un único `clock_timestamp()` fija uso y auditoría.

El primer uso devuelve `USED`, id, número, timestamp y Mesa mínima. Otra llave devuelve
`PHYSICAL_PASS_ALREADY_USED`. La misma llave y solicitud devuelve el snapshot exacto aun después de
cierre/expiración, sin nueva auditoría. Reutilizarla con otro StaffToken o pase devuelve
`PHYSICAL_PASS_IDEMPOTENCY_CONFLICT`. Token inválido, alterado, de otro propósito o Evento responde
`404 PHYSICAL_PASS_NOT_FOUND`.

## Readiness y activación

`resolvePhysicalPassReadiness()` exige datos básicos, capacidad positiva, al menos un pase activo,
cantidad dentro de capacidad, numeración consistente y ningún uso previo a activación. Con Croquis exige
Croquis e imagen READY, al menos una Mesa, todos los pases en Mesas activas y ninguna sobreocupación.

La generación puede promover `configured → ready_to_activate`. La activación vuelve a calcular el
readiness dentro de su transacción antes de finanzas. Flyer/Flipbook conservan su preflight; Demo no se
activa.

`EventsService.update()` reutiliza la misma recomputación en su transacción: datos básicos incompletos
producen `draft`; datos completos con blockers producen `configured`; readiness completo produce
`ready_to_activate`. La generación y su replay también reparan exclusivamente esta proyección derivada;
el replay no crea pases ni auditoría.

## Auditoría, PostgreSQL y concurrencia

Cada lote registra una sola `PHYSICAL_PASS_GENERATE`; el primer uso, una sola `PHYSICAL_PASS_USE` con
actor `STAFF_TOKEN`. Solo contienen IDs técnicos, cantidad/rango/Mesa o número/Mesa/timestamp. Cualquier
fallo revierte la operación.

La migración 29 agrega FKs compuestas Evento–Mesa y Evento–StaffToken, checks de número/versión/nonce,
completitud de uso, índices únicos y triggers para servicio, capacidad del Evento, modo Croquis,
capacidad combinada, inmutabilidad y configuración del Evento. Las operaciones usan aislamiento
`Serializable`, orden de locks estable y reintento de `40001`, `40P01` y colisiones idempotentes.

La migración 30 reemplaza las funciones conservando triggers, constraints e índices. El INSERT bloquea y
revalida el Evento y solo admite `draft|configured|ready_to_activate|active|event_day`
(`physical_pass_generation_state`). El primer uso exige Evento no eliminado `active|event_day`, servicio
`PHYSICAL_QR`, StaffToken del mismo Evento y no expirado
(`physical_pass_use_event_not_operational`, `physical_pass_use_staff_expired`). Identidad y uso quedan
protegidos por triggers.

Las carreras se arrancan detrás de locks PostgreSQL reales y la prueba verifica los waiters mediante
`pg_stat_activity`; cubren rangos concurrentes, último cupo de Evento y Mesa, misma llave concurrente y
dos StaffTokens sobre un Pase, además de los locks cruzados con configuración de Evento/Mesa. Las
integraciones SQL prueban estados terminales, expiración, ownership cruzado, inmutabilidad y rollback sin
auditoría. Los vertical slices HTTP con y sin Croquis descargan el SVG, lo rasterizan, decodifican el QR
con `jsQR` y usan el token decodificado; no crean FileAsset de QR.

## Fuera de alcance

Contactos, Invitaciones, Asistentes artificiales, Confirmación, Álbum, PDF, frontend, WhatsApp,
transferencia/reversión de pase, offline, Redis, outbox, Socket.IO nuevo y `CODEX-110`.
