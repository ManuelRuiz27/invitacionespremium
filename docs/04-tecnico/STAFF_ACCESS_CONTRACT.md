# Contrato de StaffAccess

## Alcance

`StaffAccessModule` administra credenciales efímeras de Staff asociadas a un único Evento. Staff no es
un usuario permanente, no tiene subtipos, roles configurables ni permisos persistidos. Este contrato
incluye creación, listado, resolución pública mínima y expiración automática. Scanner, QR, búsqueda,
check-in, Asistentes y Socket.IO permanecen diferidos a `CODEX-081` y `CODEX-082`.

## Modelo

`StaffToken` contiene `id` UUID, `eventId`, `alias`, `tokenDigestSha256`, `tokenVersion`,
`createdByUserId`, `createdAt` y `expiredAt`. Evento y creador usan FK restrictiva. No existen
`deletedAt`, revocación, rotación, restauración, subtipo, permisos ni `lastUsedAt`.

El estado se deriva: `EXPIRED` cuando `expiredAt` tiene valor; en otro caso es utilizable únicamente si
el Evento no está eliminado y está `ACTIVE` o `EVENT_DAY`. Reabrir nunca borra `expiredAt`.

## Secreto

El servicio genera 32 bytes criptográficamente aleatorios y entrega `st1.<43 caracteres base64url>`.
La sintaxis exacta es `^st1\.[A-Za-z0-9_-]{43}$`. PostgreSQL conserva exclusivamente el SHA-256
hexadecimal en minúsculas. El secreto y `sessionPath` aparecen una sola vez en la respuesta de creación;
no se pueden reconstruir desde un listado. Auditoría, logs y errores nunca contienen secreto, digest,
URL completa ni cookie.

## Gestión autenticada

| Operación                                   | Autorización                                                                                                                              | Resultado                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/v1/events/:eventId/staff-tokens`  | Planner independiente sobre su Cliente; Admin de Organización sobre su Organización; Planner de Organización sobre Eventos creados por él | Activos y expirados, ordenados por creación e id, sin secreto, digest, creador ni `sessionPath` |
| `POST /api/v1/events/:eventId/staff-tokens` | Los mismos roles y ownership; Evento no eliminado en `ACTIVE` o `EVENT_DAY`                                                               | `201` con identidad, alias, estado, timestamps y secreto/`sessionPath` de una sola entrega      |

Platform Admin no usa estas rutas operativas. Un recurso ajeno responde `404`; rol no permitido, `403`;
estado no operativo, `409 STAFF_EVENT_NOT_OPERATIONAL`; el cuarto activo,
`409 STAFF_TOKEN_LIMIT_REACHED`. No hay endpoints `PATCH`, `DELETE`, revoke, rotate o get individual.
El alias se colapsa y recorta, debe contener entre 1 y 80 caracteres.

## Resolución pública

`GET /api/v1/scanner/:staffToken/session` no requiere sesión de usuario. Valida sintaxis, digest,
existencia, vigencia y Evento. Un token malformado, desconocido, manipulado o expirado produce la misma
respuesta `401 STAFF_TOKEN_INVALID_OR_EXPIRED`. Una fila activa asociada a un Evento inconsistente produce
`409 STAFF_EVENT_NOT_OPERATIONAL`.

La respuesta `AVAILABLE` contiene solo alias y `event.id`, `name`, `status`, `eventDateTime`, `timeZone`
y `floorplanEnabled`. No expone id del StaffToken, Cliente, creador, Contactos, Invitaciones, Asistentes,
teléfonos, diseño, QR, finanzas o auditoría. La lectura no escribe ni audita.

La operación interna `resolveStaffToken(rawToken)` devuelve únicamente `staffTokenId`, `eventId` y
`alias`, o `null`; queda disponible para `CODEX-081`, sin implementar todavía scanner ni check-in.

## Límite, concurrencia y ciclo de vida

Cada Evento admite como máximo tres filas con `expiredAt IS NULL`; el historial expirado no cuenta.
Creación y resolución usan transacciones `Serializable` y orden de locks Evento → StaffToken. La
creación bloquea el Evento antes de autorizar, contar, insertar y auditar.

`ACTIVE → CLOSED`, `EVENT_DAY → CLOSED` y cancelación operativa asignan un único timestamp a todos los
tokens activos, dentro de la misma transacción del cambio de estado. Solo se registra
`STAFF_TOKENS_EXPIRE` cuando había filas activas. Fallar expiración o auditoría revierte la transición.
Cerrar Confirmación, cancelar una Invitación o consultar QR no expira tokens. Reabrir conserva el
historial expirado y permite crear nuevos tokens hasta el límite.

El workflow separa `stateResolutionAt`, usado exclusivamente para decidir si una reapertura termina en
`ACTIVE` o `EVENT_DAY`, de `transitionCommittedAt`. Este último se obtiene desde PostgreSQL mediante
`clock_timestamp()` después de adquirir el lock del Evento. Es el único timestamp aplicado a todas las
filas del lote y al snapshot `STAFF_TOKENS_EXPIRE`; por ello nunca puede preceder el `createdAt` de un
token cuya creación se confirmó mientras la transición esperaba.

## PostgreSQL

La migración `20260729000000_add_staff_tokens` agrega:

- checks de alias normalizado/no vacío/máximo 80, digest SHA-256 hexadecimal minúsculo,
  `tokenVersion > 0` y `expiredAt >= createdAt`;
- unicidad del digest e índices por Evento/vigencia;
- trigger de inserción que bloquea el Evento y valida estado, borrado, creador activo, Cliente, rol,
  ownership del Planner de Organización y máximo de tres activos;
- trigger de inmutabilidad de Evento, creador, alias, digest y versión, y transición irreversible de
  `expiredAt`;
- rechazo estable de `DELETE` y `TRUNCATE`;
- trigger de Evento que expira filas activas al cerrar o cancelar, también ante SQL directo.

La migración `20260729010000_fix_staff_token_expiration_clock` reemplaza la función del trigger para
capturar una sola vez `clock_timestamp()`. No usa `transaction_timestamp()` ni `CURRENT_TIMESTAMP`,
porque ambos pueden representar el inicio de una transacción anterior a la espera del lock.

## Auditoría

`STAFF_TOKEN_CREATE` se escribe en la transacción de creación.
`STAFF_TOKENS_EXPIRE` registra cantidad, ids técnicos y timestamp en la transacción de ciclo de vida.
Ninguna auditoría contiene secretos, digest, rutas de sesión, datos personales o finanzas.
