# Contrato técnico de RSVP público

## Alcance

`PublicRsvpModule` es la única implementación de la vista pública y de la Confirmación de asistencia de
`CODEX-070`. Reutiliza `InvitationTokenService`, Invitación, Asistente, diseño, FileAsset,
`EventAccessPolicy`, auditoría y transacciones críticas. No crea una entidad RSVP.

Quedan fuera `CODEX-071`, generación o entrega de QR, scanner, `StaffToken`, check-in, frontend, mesas,
Álbum, WhatsApp y upgrade.

## Configuración del Evento

`Event` conserva `confirmationEnabled` y agrega:

- `locationUrl` y `giftRegistryUrl`;
- `confirmationClosedAt`;
- `confirmationClosedByUserId`.

La Confirmación está abierta si está habilitada y no tiene cierre. Los dos campos de cierre son ambos
nulos o ambos no nulos. Los destinos se editan solo durante `DRAFT`, `CONFIGURED` o
`READY_TO_ACTIVATE`; después de activar son inmutables. Aceptan HTTPS absoluto y query string, pero
rechazan credenciales, fragmentos, barra inversa y componentes semánticos de token, invitación, nombre,
teléfono o WhatsApp. Cada componente porcentual se decodifica hasta cuatro rondas y en cada ronda se
rechazan controles ASCII `0x00-0x1F` y `0x7F`, incluidos CR, LF, TAB y NUL, sin importar caja o
codificación doble/triple. Un espacio literal nunca es válido. `%20` se permite exclusivamente en
segmentos de path y valores de query; se rechaza en claves de query y autoridad. También se rechazan
`/`, `\`, `#` y material reservado que aparezca tras decodificar. Cada `%` debe iniciar dos dígitos
hexadecimales y los bytes contiguos deben formar UTF-8 válido: secuencias truncadas, sobrelargas,
continuaciones aisladas o no hexadecimales son inválidas. UTF-8 válido como `%C3%B3` se acepta.
Después de cuatro rondas no puede quedar otra secuencia porcentual pendiente.

La aplicación devuelve la forma de `URL.href`. PostgreSQL únicamente valida y conserva el valor textual
recibido; no se atribuye normalización a la base. El query se procesa completo desde el primer `?`,
incluidos signos `?` posteriores, claves sin `=`, valores con `=` y partes separadas por múltiples `&`.
Los destinos no forman parte de snapshots de auditoría.

La equivalencia entre normalización, DTO/API y constraints PostgreSQL se mantiene mediante un único
corpus compartido de 54 casos. Cada caso se ejecuta contra el normalizador y, para ambos campos
`locationUrl` y `giftRegistryUrl`, contra creación por API, `INSERT` directo y `UPDATE` directo. Un
`UPDATE` rechazado debe conservar la fila completa anterior. Solo después de aprobar todas las
superficies se considera equivalente.

Para Flyer y Flipbook, el preflight se ejecuta antes del ledger y exige Confirmación habilitada, ambos
destinos válidos, diseño completo y al menos una Invitación activa. Un Hotspot no sustituye su destino.
El error es `EVENT_PUBLIC_INVITATION_PREFLIGHT_INCOMPLETE` y enumera bloqueos técnicos estables.

## Resolución pública

`GET /api/v1/public/invitations/:invitationToken` verifica el token con `InvitationTokenService`.

- token inválido, preparación, archivado o borrado lógico: `404 INVITATION_NOT_FOUND`;
- Invitación cancelada: `CANCELLED`, `Esta invitación fue cancelada por el organizador.`;
- Evento cancelado: `CANCELLED`, `Este evento ha sido cancelado por el organizador.`;
- Evento `CLOSED` o `ALBUM_PUBLISHED`: `CLOSED`;
- Evento `ACTIVE` o `EVENT_DAY`: `AVAILABLE`.

La cancelación de Invitación tiene precedencia. `AVAILABLE` contiene solo fecha pública del Evento, modo
y estado de la Invitación, límite, Asistentes activos, apertura de Confirmación, diseño, páginas ordenadas
y Hotspots con destino resuelto. Cuando está cerrada usa:
`La confirmación de asistencia ya fue cerrada. Contacta al organizador.`

No expone teléfono, `contactId`, `clientId`, claves o rutas de storage, checksum, nonce, token QR,
finanzas, cookies ni datos de otra Invitación.

## Assets del diseño

`GET /api/v1/public/invitations/:invitationToken/assets/:fileAssetId/content` entrega únicamente un asset
`READY`, no eliminado, del mismo Evento y Cliente y actualmente referenciado por el diseño activo.
Invitación o Evento cancelado, estado no operativo, asset oculto, histórico, no referenciado o cruzado
responden como recurso no encontrado.

Cada referencia de Flyer —imagen inicial y QR— y cada página activa de Flipbook incluye un
`contentPath` funcional:
`/api/v1/public/invitations/<token-actual-codificado>/assets/<assetId>/content`. No contiene placeholders;
el consumidor puede usarlo directamente y la autorización continúa vinculada al token y al asset.

Headers: `Content-Type`, `Content-Length`, `ETag`, `Content-Disposition: inline`,
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` y
`Referrer-Policy: no-referrer`. Nunca se devuelve la clave interna.
Si la lectura privada falla, responde `500 FILE_STORAGE_FAILURE` sin revelar storage keys, rutas,
checksum completo ni nombres internos.

## Mutaciones públicas

Operaciones:

```http
POST  /api/v1/public/invitations/:invitationToken/confirm
POST  /api/v1/public/invitations/:invitationToken/reject
PATCH /api/v1/public/invitations/:invitationToken/assistants
```

El payload nominal representa solo acompañantes adicionales. El principal permanece activo y no es
editable. Un UUID se acepta únicamente si pertenece a la misma Invitación y no es principal. Los UUID
omitidos se eliminan lógicamente; una entrada sin UUID crea un Asistente; proporcionar un UUID conserva
su identidad. Los nombres se recortan y normalizan, pero pueden repetirse.

Confirmar deja Invitación, principal y adicionales activos en `CONFIRMED`. Rechazar conserva los
registros y nombres y deja todos en `REJECTED`. Modificar acompañantes requiere una Invitación confirmada.
Repetir el mismo estado y conjunto nominal produce el mismo resultado sin duplicar Asistentes ni
auditoría.

Todas requieren Evento `ACTIVE` o `EVENT_DAY`, Confirmación habilitada y abierta y recursos activos.
Cada aumento respeta `additionalAssistantLimit` y la capacidad global, calculada por Asistentes activos
`CONFIRMED`.

## Operación autenticada

```http
GET  /api/v1/events/:eventId/confirmation
POST /api/v1/events/:eventId/confirmation/close
POST /api/v1/events/:eventId/confirmation/reopen
PUT  /api/v1/events/:eventId/invitations/:invitationId/confirmation
```

Planner independiente opera su Cliente; Admin de Organización, su Organización; Planner de Organización,
solo Eventos creados por él. Platform Admin, Staff y Público no usan estas rutas.

Cerrar y reabrir aplica solo a `ACTIVE` y `EVENT_DAY`, bloquea la fila, no cambia el estado del Evento ni
genera finanzas. Repetir el estado actual no duplica auditoría. El `PUT` es el override explícito del
organizador, funciona con Confirmación abierta o cerrada y conserva límite y capacidad.

## Transacciones, capacidad y concurrencia

Las mutaciones usan aislamiento `Serializable`, reintentos acotados y orden de bloqueo Evento →
Invitación. Dentro de la misma transacción se calcula ocupación, se reconcilian Asistentes, se actualiza
la respuesta y se escribe auditoría. Dos Invitaciones por el último lugar producen un solo éxito; la otra
recibe `409 RSVP_EVENT_CAPACITY_EXCEEDED`.

Cancelación de Invitación y acceso público usan el mismo orden de bloqueo. Close/reopen, operaciones
públicas y override terminan en uno de los resultados serializables completos, nunca en un agregado
mixto.

La integración prueba las once intercalaciones críticas con barreras controladas en auditoría o storage.
La primera operación se detiene después de adquirir sus locks. Un spy de prueba sobre el método privado
que ejecuta el lock real señala que la competidora llegó a ese punto; se comprueba que aún no terminó y
solo entonces se libera la primera. No se sustituye el lock, no hay lógica auxiliar en producción y no se
usan `nextTick`, sleeps ni temporizadores arbitrarios. Cubre confirm/confirm, confirm/reject,
confirm/close, modify/close, último cupo, reducción/incremento, mismo UUID, confirm/cancel, close/reopen,
override/público y asset/cancel. Los spies de lock, auditoría y storage se restauran en `finally`.

## PostgreSQL

La migración `20260728200000_add_public_rsvp` agrega:

- check de forma completa del cierre y FK restrictiva al actor;
- checks de destinos mediante función estricta e inmutable;
- trigger que congela destinos post-activación y valida Cliente, rol y ownership del actor de cierre;
- constraint triggers diferibles de coherencia Invitación/Asistentes y cardinalidad;
- protección contra restauración directa y contra `TRUNCATE` de Invitación y Asistente.

La migración `20260728210000_harden_public_rsvp_urls` conserva intacta la migración anterior y endurece
`is_valid_event_destination_url`: decodifica componentes ASCII porcentuales, normaliza mayúsculas,
guiones y guiones bajos, rechaza fragmentos y bloquea material privado tanto en segmentos de path como
en claves de query. Los checks existentes de `location_url` y `gift_registry_url` adoptan la función
reemplazada para `INSERT` y `UPDATE`.

La migración `20260728220000_reject_encoded_destination_controls` conserva las 20 migraciones previas y
reemplaza las funciones de validación para aplicar hasta cuatro rondas de decodificación. Rechaza
controles ASCII, separadores y material reservado decodificado; distingue path, clave de query y valor
de query para permitir `%20` únicamente donde corresponde. Los checks existentes protegen tanto
`INSERT` como `UPDATE` sin modificar el schema Prisma.

La migración `20260728230000_validate_destination_url_encoding` conserva las 21 migraciones publicadas,
valida sintaxis porcentual y UTF-8, y obtiene el query mediante la subcadena completa posterior al primer
`?`. Antes del commit revisa `event.location_url` y `event.gift_registry_url`. Si encuentra filas
heredadas incompatibles, toda la migración revierte con `P0001` y
`EVENT_DESTINATION_URL_LEGACY_INVALID count=<n>`; no incluye URLs ni las modifica silenciosamente.

Al commit, una Invitación `CONFIRMED` tiene principal y todos sus Asistentes activos confirmados; una
`REJECTED`, todos rechazados; una `PENDING`, todos pendientes. Existe exactamente un principal activo y
el total no supera `1 + additionalAssistantLimit`.

## Auditoría

Mutaciones públicas usan actor `PUBLIC_TOKEN` y solo guardan SHA-256 contextual del token. Mutaciones
operativas usan actor `USER`. Se guardan estado, conteos e IDs técnicos afectados, sin nombres,
teléfonos, destinos, tokens, nonces, diseño ni cookies. La auditoría es transaccional: su fallo revierte
la operación.

## Errores estables

- `INVITATION_NOT_FOUND`;
- `RSVP_NOT_AVAILABLE`;
- `RSVP_CLOSED`;
- `RSVP_ASSISTANT_LIMIT_EXCEEDED`;
- `RSVP_EVENT_CAPACITY_EXCEEDED`;
- `RSVP_ASSISTANT_NOT_FOUND`;
- `RSVP_ASSISTANT_MISMATCH`;
- `RSVP_INVITATION_CANCELLED`;
- `RSVP_EVENT_CANCELLED`;
- `RSVP_EVENT_STATE_INVALID`.
- `FILE_STORAGE_FAILURE`.

Close y reopen son naturalmente idempotentes, por lo que devuelven el estado actual en vez de
`CONFIRMATION_ALREADY_OPEN` o `CONFIRMATION_ALREADY_CLOSED`.
