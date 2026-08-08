# Contrato técnico de Scanner y CheckIn

## Alcance

`ScannerModule` resuelve acceso temporal mediante `StaffToken`, escanea el token QR firmado de una
Invitación, realiza búsqueda exacta y registra entrada individual por Asistente. No existe
`ScannerSession` persistida. Se integra con Socket.IO y `FloorplanModule` para proyectar la Mesa mínima
y exigir una asignación operativa cuando el Evento tiene Croquis habilitado.

## Modelo

`CheckIn` conserva `id`, `eventId`, `invitationId`, `assistantId`, `staffTokenId`, `checkedInAt`,
`idempotencyKey`, firma técnica de solicitud, snapshot mínimo estable, campos completos de
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
pendientes (`id`, `name`, `isPrimary`, `table: {id,name} | null`). `check-in` recibe una Invitación y
una selección UUID no vacía ni duplicada; responde `CHECKED_IN`, las entradas creadas con esa misma
Mesa mínima y los pendientes restantes. La selección completa se confirma o revierte atómicamente.

## Resolución y locks

`resolveStaffTokenInTransaction()` y `resolveQrTokenInTransaction()` reutilizan digest, firma, nonce,
versión y reglas de disponibilidad existentes dentro de la transacción consumidora. El orden es:
Evento → StaffToken → Invitación → Contacto → Asistentes por UUID → FloorplanShapes por UUID →
CheckIns activos. Una lectura preliminar solo
descubre identificadores; la autorización y el estado se vuelven a evaluar bajo locks. Check-in y
reversión usan `Serializable`. Scan y search son lecturas con locks en `READ COMMITTED`, para que una
lectura que esperó a una mutación ganadora observe su commit en vez de conservar un snapshot anterior.

## Búsqueda exacta

El texto se recorta, colapsa espacios y acepta 1–160 caracteres. Se compara de manera exacta y sin
distinguir mayúsculas contra `Contact.name` y nombres activos de Asistente del Evento. Los acentos sí
distinguen; no hay teléfono, prefijo, `contains` ni fuzzy. Se deduplica por Invitación y se ordena por
creación e id.

## Idempotencia

La llave de creación identifica globalmente una solicitud. Una firma SHA-256 liga StaffToken, Evento,
Invitación y selección ordenada. El snapshot conserva exactamente `status`, `invitationId`, los
CheckIns creados (`checkInId`, `assistantId`, `name`, `checkedInAt`, `table: {id,name} | null`), los
pendientes restantes (`id`, `name`, `isPrimary`, `table: {id,name} | null`) y su conteo. El replay
valida esa estructura y la devuelve directamente, sin
consultar nombres o estados actuales, ni crear otra fila o auditoría. Cualquier reutilización incompatible produce
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

La migración `20260729140000_harden_scanner_check_ins`, número 26 acumulado:

- aborta con `P0001` y solo conteos si detecta huérfanos antes de instalar constraints;
- agrega las FK físicas `check_in_event_fkey`, `check_in_invitation_event_fkey`,
  `check_in_assistant_event_invitation_fkey`, `check_in_staff_token_event_fkey` y
  `check_in_reverted_by_user_fkey`, todas `ON DELETE RESTRICT`;
- reemplaza `validate_check_in_insert()` para bloquear y revalidar Evento → StaffToken → Invitación →
  Contacto → Asistente;
- prohíbe crear un CheckIn con cualquier campo de reversión ya establecido.

La migración 28 `20260729203000_harden_floorplan_seating` reemplaza nuevamente
`validate_check_in_insert()` sin perder esas garantías. Si `event.floorplan_enabled=true`, bloquea y
valida la `FloorplanShape` después del Asistente: debe ser una Mesa activa, del mismo Evento y de un
Croquis activo. Un INSERT incompatible falla con `check_in_floorplan_table_required`; el precheck de
instalación informa solo el conteo de incompatibilidades históricas activas. Si el Evento no usa
Croquis, `floorplanShapeId=null` continúa permitido.

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
finanzas, Croquis completo o payload público completo. La única proyección de seating es
`table: {id,name} | null`; no incluye geometría, capacidad ni ocupación. Como excepción de
idempotencia, el snapshot mínimo conserva únicamente los nombres y esa Mesa mínima ya entregados al
Staff en la respuesta original. Las auditorías nunca contienen nombres.

## Carreras verificadas

Con conexiones PostgreSQL y espera real observada en `pg_stat_activity`, INSERT se serializa en ambos
órdenes contra cierre, cancelación, expiración de StaffToken y cancelación de Invitación. A nivel de
servicio se cubren esos cambios, scan contra check-in/cancelación, selecciones superpuestas, dos
reversiones, nuevo check-in tras reversión y lecturas simultáneas. No se usan sleeps ni temporizadores
arbitrarios.

El hardening de CODEX-090 agrega carreras deterministas entre check-in sin Mesa y asignación, y entre
cambio de Mesa posterior al check-in y reversión. El resultado nunca deja un CheckIn activo sin Mesa
cuando el Evento usa Croquis.

## Errores estables

- `STAFF_TOKEN_INVALID_OR_EXPIRED`;
- `STAFF_EVENT_NOT_OPERATIONAL`;
- `SCANNER_QR_NOT_FOUND`;
- `SCANNER_SELECTION_NOT_FOUND`;
- `ASSISTANT_ALREADY_CHECKED_IN`;
- `SCANNER_TABLE_ASSIGNMENT_REQUIRED`;
- `CHECK_IN_IDEMPOTENCY_CONFLICT`;
- `CHECK_IN_REVERT_IDEMPOTENCY_CONFLICT`;
- `CHECK_IN_ALREADY_REVERTED`;
- `VALIDATION_ERROR`.

QR inválido, adulterado, no disponible o de otro Evento comparte `SCANNER_QR_NOT_FOUND`.

## Proyección visual del Croquis en Scanner

El frontend Scanner usa la misma función presentacional que el editor Client para proyectar el rectángulo visual
antes de aplicar borde, `clip-path` y rotación. `CIRCLE` y `SQUARE` conservan `width === height` en el DTO, pero su
lado físico se calcula como `width * min(renderedWidth, renderedHeight)` y se convierte a proporciones distintas
del ancho y alto del owner. De este modo no se deforman en planos no cuadrados. `x` y `y` permanecen relativos al
owner real; `RECTANGLE` y `POLYGON` conservan sus proporciones directas, `polygonPoints` continúa local al bounding
box proyectado y `rotation` mantiene origen central. La medición se actualiza mediante `ResizeObserver` sin cambiar
API, StaffToken, check-in, realtime ni selección de Asistentes.

## Fronteras diferidas

PaseFisicoQR, frontend, canvas, modo offline y reportes permanecen fuera de este contrato. La lectura
del Croquis para Staff está definida por `FloorplanModule`; Scanner solo incorpora la Mesa mínima en
sus resultados.
