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
rechazan credenciales, fragmentos, controles, barra inversa y componentes semánticos de token,
invitación, nombre, teléfono o WhatsApp. La comparación ignora mayúsculas, guiones, guiones bajos y
codificación porcentual. Se normalizan antes de persistir y Zod y PostgreSQL aplican el mismo contrato.
Los destinos no forman parte de snapshots de auditoría.

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

La integración prueba las once intercalaciones críticas con barreras controladas en auditoría o storage:
la primera operación se detiene después de adquirir locks, la competidora permanece pendiente, y solo
entonces se libera. No usa sleeps, timeouts ni endpoints de producción auxiliares. Cubre confirm/confirm,
confirm/reject, confirm/close, modify/close, último cupo, reducción/incremento, mismo UUID, confirm/cancel,
close/reopen, override/público y asset/cancel.

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
