# Contrato técnico de Scanner y CheckIn

## Alcance

`ScannerModule` resuelve acceso temporal mediante `StaffToken`, escanea el token QR firmado de una
Invitación, realiza búsqueda exacta y registra entrada individual por Asistente. No existe
`ScannerSession` persistida. Socket.IO, Floorplan, mesas, pases físicos y frontend quedan fuera.

## Modelo

`CheckIn` conserva `id`, `eventId`, `invitationId`, `assistantId`, `staffTokenId`, `checkedInAt`,
`idempotencyKey`, firma técnica de solicitud, snapshot técnico sin nombres, campos completos de
reversión y `createdAt`. Sus relaciones compuestas prueban que Evento, Invitación, Asistente y
StaffToken pertenecen al mismo agregado. El estado vigente se deriva de `revertedAt IS NULL`; una
reversión nunca elimina ni modifica la identidad del registro.

## Endpoints

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/api/v1/scanner/:staffToken/session` | StaffToken |
| POST | `/api/v1/scanner/:staffToken/scan` | StaffToken |
| POST | `/api/v1/scanner/:staffToken/search` | StaffToken |
| POST | `/api/v1/scanner/:staffToken/check-in` | StaffToken + `Idempotency-Key` |
| POST | `/api/v1/events/:eventId/check-ins/:checkInId/revert` | cookie de usuario + `Idempotency-Key` |

`scan` recibe `{qrToken}` y devuelve `AVAILABLE` o `NO_PENDING`. `search` recibe `{query}` y devuelve
`MATCHES` o `NO_MATCHES`. Ambas proyectan solo Invitación, modo, conteos y Asistentes confirmados
pendientes (`id`, `name`, `isPrimary`). `check-in` recibe una Invitación y una selección UUID no vacía
ni duplicada; responde `CHECKED_IN`, las entradas creadas y los pendientes restantes. La selección
completa se confirma o revierte atómicamente.

## Resolución y locks

`resolveStaffTokenInTransaction()` y `resolveQrTokenInTransaction()` reutilizan digest, firma, nonce,
versión y reglas de disponibilidad existentes dentro de la transacción consumidora. El orden es:
Evento → StaffToken → Invitación → Asistentes por UUID → CheckIns activos. Una lectura preliminar solo
descubre identificadores; la autorización y el estado se vuelven a evaluar bajo locks. Todas las
operaciones críticas usan aislamiento `Serializable`.

## Búsqueda exacta

El texto se recorta, colapsa espacios y acepta 1–160 caracteres. Se compara de manera exacta y sin
distinguir mayúsculas contra `Contact.name` y nombres activos de Asistente del Evento. Los acentos sí
distinguen; no hay teléfono, prefijo, `contains` ni fuzzy. Se deduplica por Invitación y se ordena por
creación e id.

## Idempotencia

La llave de creación identifica globalmente una solicitud. Una firma SHA-256 liga StaffToken, Evento,
Invitación y selección ordenada; el replay compatible reconstruye la misma respuesta desde el snapshot
técnico y las relaciones, sin otra fila ni auditoría. Cualquier reutilización incompatible produce
`409 CHECK_IN_IDEMPOTENCY_CONFLICT`. Las filas adicionales de una selección múltiple reciben llaves
técnicas derivadas y únicas sin persistir el secreto Staff.

La reversión usa una llave parcial única. El replay del mismo CheckIn devuelve el timestamp persistido;
otra fila produce `CHECK_IN_REVERT_IDEMPOTENCY_CONFLICT` y una segunda llave sobre una reversión ya
confirmada produce `CHECK_IN_ALREADY_REVERTED`.

## PostgreSQL

La migración `20260729120000_add_scanner_check_ins` agrega:

- relaciones compuestas en Prisma y triggers PostgreSQL de pertenencia;
- único CheckIn activo por Asistente mediante índice parcial;
- llaves de idempotencia únicas;
- orden temporal y conjunto completo de campos de reversión;
- trigger de inserción que exige Evento operativo no eliminado, StaffToken activo, Invitación/Contacto
  activos y Asistente nominal confirmado;
- trigger de mutación que permite una sola reversión completa, valida usuario activo, rol y ownership,
  y rechaza Platform Admin;
- inmutabilidad de identidad, creación y snapshot;
- rechazo de `DELETE` y `TRUNCATE`.

## Reversión y permisos

Solo Planner independiente sobre su Cliente, Admin de Organización sobre su Organización y Planner de
Organización sobre Eventos creados por él pueden revertir. Los estados permitidos son `ACTIVE`,
`EVENT_DAY` y `CLOSED`. StaffToken y Platform Admin no usan esta operación; `ALBUM_PUBLISHED`,
`ARCHIVED`, `CANCELLED` y borrado lógico la bloquean.

## Auditoría y privacidad

Cada selección, aunque incluya varios Asistentes, genera una sola auditoría `CHECK_IN_CREATE` con actor
`STAFF_TOKEN`; cada reversión genera una `CHECK_IN_REVERT` con actor `USER`. Solo contienen ids,
conteos, timestamps y estado técnico. Session, scan y search no auditan.

Ninguna respuesta, snapshot o auditoría contiene teléfono, Cliente, secretos/digest Staff, QR, nonce,
finanzas, mesa, croquis o payload público completo. Los nombres solo se proyectan al Staff autorizado
en la respuesta necesaria y nunca se almacenan en el snapshot técnico.

## Errores estables

- `STAFF_TOKEN_INVALID_OR_EXPIRED`;
- `STAFF_EVENT_NOT_OPERATIONAL`;
- `SCANNER_QR_NOT_FOUND`;
- `SCANNER_SELECTION_NOT_FOUND`;
- `ASSISTANT_ALREADY_CHECKED_IN`;
- `CHECK_IN_IDEMPOTENCY_CONFLICT`;
- `CHECK_IN_REVERT_IDEMPOTENCY_CONFLICT`;
- `CHECK_IN_ALREADY_REVERTED`;
- `VALIDATION_ERROR`.

QR inválido, adulterado, no disponible o de otro Evento comparte `SCANNER_QR_NOT_FOUND`.

## Fronteras diferidas

`CODEX-081` no crea rutas Floorplan, Socket.IO, rooms, dashboard, asistencia global, reportes,
PaseFisicoQR ni frontend. `CODEX-082` permanece sin iniciar.
