# Contrato técnico de pases físicos

## Alcance

`PhysicalPassesModule` conserva `CODEX-100` para `PHYSICAL_QR + accessMode=NULL` y, desde M02-B01-DT05,
admite `ORGANIZATION + MANAGED + ACCESS_CONTROL + ANONYMOUS`. Un `PhysicalPass` pertenece directamente al Evento, puede apuntar a una Mesa y tiene uso
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

DT05 agrega `revokedAt`, `revokedByUserId`, `revocationReasonCode`, `revokeIdempotencyKey`,
`revokeRequestSignature` y `revokeResultSnapshot`, todos nullable para legacy. Forman un conjunto completo
de revocación o permanecen todos NULL. Revocar exige pase ANONYMOUS sin uso ni borrado y fecha posterior
o igual a creación. Un pase usado y uno revocado son estados excluyentes. En ANONYMOUS no se permite
DELETE, borrado lógico, reactivación ni modificación de filas usadas/revocadas. Así se conserva el folio
histórico y se libera cupo únicamente mediante revocación explícita. PHYSICAL_QR no admite revocación.

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
solo Eventos asignados a él. Platform Admin no impersona. Fuera de ownership responde `404`.

El listado ordena por `passNumber` y solo devuelve identidad mínima, `UNUSED|USED`, Mesa mínima,
`usedAt` y `createdAt`. Omite nonce, versión, token, firma, llave, snapshot, StaffToken, PII, finanzas y
storage.

En ANONYMOUS, Organization Admin consulta su tenant y Organization Planner únicamente Eventos asignados
mediante `EventAccessPolicy`. La Organización debe seguir activa y Managed. Provider no utiliza las rutas
Client. Los listados incluyen historia revocada con `REVOKED`; los campos JSON de PHYSICAL_QR conservan
su forma y sus estados anteriores. No se agregan datos personales ni material criptográfico.

## Generación Provider Managed — DT05

```http
POST /api/v1/admin/clients/:clientId/events/:eventId/physical-passes/generate
Idempotency-Key: <8..128>

{ "quantity": 10, "tableShapeId": "uuid-or-null" }
```

Solo Platform Admin autenticado, con Organización activa Managed y Evento perteneciente exactamente
al `clientId`, bajo `ACCESS_CONTROL + ANONYMOUS`. Reutiliza el dominio de generación; cada pase registra
al Provider real en `createdByUserId`. No hay impersonación ni relajación de `ClientOperatingProfilePolicy`:
la ruta Client continúa bloqueando generación Managed, incluyendo PHYSICAL_QR legacy.

Los estados permitidos son `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE`, `ACTIVE` y `EVENT_DAY`. Un lote
es indivisible y consecutivo desde el máximo histórico de `passNumber`, incluidos pases revocados.
La clave global de generación y su firma vinculan contexto Provider, actor, tenant, Evento, cantidad y
Mesa. Otro actor/contexto/solicitud produce `PHYSICAL_PASS_GENERATION_IDEMPOTENCY_CONFLICT`.
Las firmas y snapshots históricos Client PHYSICAL_QR no cambian. El replay devuelve el snapshot original,
aunque algún pase del lote haya sido revocado después; no vuelve a emitir material ni auditar.

El conteo de capacidad de Evento/Mesa excluye únicamente los pases borrados legacy y los revocados.
Los utilizados siguen ocupando capacidad y no pueden revocarse. Sin Croquis exige Mesa NULL; con
Croquis exige TABLE activa del mismo Evento y Croquis, con cupo combinado suficiente. ANONYMOUS usa
exclusivamente modo TABLE; SEAT se rechaza en API y PostgreSQL. No se habilita asignación por lugar.

## Revocación ANONYMOUS — DT05

```http
POST /api/v1/events/:eventId/physical-passes/:passId/revoke
Idempotency-Key: <8..128>

{ "revocationReasonCode": "OPERATOR_REQUEST" }
```

Organization Admin del tenant y Organization Planner asignado pueden revocar en los mismos cinco
estados de generación. Provider, Staff, otros tenants y Planners no asignados quedan excluidos.
El motivo es un código técnico con patrón `^[A-Z][A-Z0-9_]{0,63}$`, sin observaciones libres ni PII.

Respuesta mínima: `status: REVOKED`, `physicalPassId`, `passNumber`, `revokedAt` y
`revocationReasonCode`. La operación Serializable bloquea Evento → Pase; persiste timestamp, actor,
motivo y recibo en la misma fila, con una única auditoría `PHYSICAL_PASS_REVOKE`. Fallar auditoría
revierte la revocación y la liberación de cupo. No modifica Mesa, folio, nonce ni versión.

La clave de revocación es única globalmente; SHA-256 liga actor, tenant, Evento, Pase, propósito y motivo.
El replay reautoriza ownership/perfil/modalidad actuales y devuelve el snapshot exacto sin duplicar
auditoría, incluso tras cierre. Otra solicitud/actor con esa clave responde
`PHYSICAL_PASS_REVOKE_IDEMPOTENCY_CONFLICT`; otra clave sobre un revocado,
`PHYSICAL_PASS_ALREADY_REVOKED`; un pase utilizado, `PHYSICAL_PASS_ALREADY_USED`.

Los SVG de pases revocados responden `404 PHYSICAL_PASS_NOT_FOUND`. Descargar SVG bloquea Evento → Pase
y revalida autorización/material dentro de la transacción. Un SVG descargado antes de revocar mantiene
sus bytes, pero su token ya no permite ingreso. No se persiste un archivo ni se rota el nonce.

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

El Wizard autenticado puede componer bajo demanda una plantilla PDF A4 horizontal exclusivamente con
esos SVG autorizados, a razón de 30 pases por hoja (5 columnas por 6 filas). La composición ocurre en el
navegador, no persiste el PDF, no crea `FileAsset`, no agrega endpoints y conserva la descarga SVG
individual.

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

En ANONYMOUS se reutiliza exactamente esta ruta y el propósito `PHYSICAL_PASS`. Pase revocado/ajeno o
token falsificado comparte `PHYSICAL_PASS_NOT_FOUND`. Tanto ingreso nuevo como replay ANONYMOUS
exigen Staff vigente y Evento operativo actuales; el replay post-cierre de PHYSICAL_QR conserva su
comportamiento histórico. No se crea CheckIn ni se modifica RSVP. En la carrera scan/revoke, si gana
uso la revocación falla; si gana revocación el scan falla. Nunca se persisten ambos estados.

## Readiness y activación

`resolvePhysicalPassReadiness()` exige datos básicos, capacidad positiva, al menos un pase activo,
cantidad dentro de capacidad, numeración consistente y ningún uso previo a activación. Con Croquis exige
Croquis e imagen READY, al menos una Mesa, todos los pases en Mesas activas y ninguna sobreocupación.

La generación puede promover `configured → ready_to_activate`. La activación vuelve a calcular el
readiness dentro de su transacción antes de finanzas. Flyer/Flipbook conservan su preflight; Demo no se
activa.

La promoción anterior corresponde solo a PHYSICAL_QR. DT05 no promueve ACCESS_CONTROL a READY ni
implementa su readiness de activación. El resolver devuelve `complete=false` con
`EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED`; la activación real conserva expresamente
`409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED`, incluso si READY fue forzado. DT06 conserva
la responsabilidad de readiness/certificación de ambos modos. Los tests de ingreso fuerzan ACTIVE
únicamente en fixtures locales aislados, sin bypass productivo.

`EventsService.update()` reutiliza la misma recomputación en su transacción: datos básicos incompletos
producen `draft`; datos completos con blockers producen `configured`; readiness completo produce
`ready_to_activate`. La generación y su replay también reparan exclusivamente esta proyección derivada;
el replay no crea pases ni auditoría.

En el Wizard cliente, una falla de red o timeout deja el intento como incierto y conserva exactamente la
misma `Idempotency-Key`, cantidad y Mesa para el retry. Una recarga del listado puede reflejar lotes
concurrentes, pero un incremento del máximo global nunca confirma ni atribuye un lote al intento local;
solo la respuesta idempotente de `generate` resuelve la operación. Dos generaciones intencionales con la
misma cantidad continúan usando llaves nuevas.

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

La migración aditiva DT05 mantiene las FK y constraints anteriores, agrega FK restrictiva al usuario
revocador, unicidad de clave de revocación y check de completitud/tiempo/formato/snapshot. Reemplaza
las últimas definiciones instaladas de `validate_physical_pass`, `protect_physical_pass`,
`protect_event_physical_pass_configuration`, `assert_floorplan_shape_capacity` y `assert_assistant_seating`.
Valida servicio/modalidad, Provider real al insertar ANONYMOUS, actor/ownership al revocar y numeración
histórica consecutiva. TRUNCATE se rechaza siempre para proteger el historial incluso ante snapshots antiguos. Los contadores backend de
Croquis y las guardas SQL de reducción/eliminación de Mesa usan el mismo filtro de revocación.

El lock común del Evento serializa generación, revocación, uso y edición de Mesa mediante API; uso agrega
Staff → Pase → Mesa, generación bloquea Croquis → Mesa antes de insertar el lote. Los escritores SQL
directos deben adquirir Evento primero; si toman filas hijas primero, PostgreSQL puede abortar por
deadlock/serialización. No se omiten validaciones para resolver carreras. Un rechazo concurrente por cupo
no crea recibo ni consume folios; un nuevo intento evalúa la capacidad confirmada.

## Fuera de alcance

Contactos, Invitaciones, Asistentes artificiales, Confirmación, Álbum, PDF persistido o generado por
backend, frontend distinto de la composición imprimible descrita, WhatsApp,
transferencia/reversión de pase, offline, Redis, outbox, Socket.IO nuevo y `CODEX-110`.
