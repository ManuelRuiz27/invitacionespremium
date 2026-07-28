# Contrato de Invitaciones y Asistentes nominales

## Alcance

`InvitationsModule`, dentro de `apps/api`, administra una Invitación por Contacto y sus Asistentes
nominales. La creación del agregado se integra transaccionalmente con las altas manuales y CSV de
`ContactsModule`. La generación y consulta pública de QR se especializa en `QR_CONTRACT.md`; este contrato
no habilita diseño, archivos persistidos para QR, WhatsApp, mesas, check-in ni frontend.

## Modelos

### Invitation

- `id`: UUID;
- `eventId`: Evento propietario;
- `contactId`: Contacto principal, único globalmente;
- `mode`: `INDIVIDUAL` o `FAMILY_NOMINAL`;
- `responseStatus`: `PENDING`, `CONFIRMED` o `REJECTED`;
- `additionalAssistantLimit`: cantidad de Asistentes adicionales permitidos, entero no negativo;
- `invitationTokenNonce` y `invitationTokenVersion`: material recuperable del link público;
- `qrTokenNonce` y `qrTokenVersion`: material separado reservado para QR;
- `cancelledAt`, `cancelledByUserId` y `cancelIdempotencyKey`: cancelación específica e irreversible;
- `createdAt`, `updatedAt` y `deletedAt`.

`additionalAssistantLimit` no incluye al Asistente principal. Un límite cero significa que no hay
acompañantes. `INDIVIDUAL` puede conservar cupo para acompañantes que se nombrarán en el flujo público
futuro y `FAMILY_NOMINAL` permite precargar varios nombres. Cambiar el modo o el límite no crea ni elimina
Asistentes.

### Assistant

- `id`: UUID;
- `eventId` e `invitationId`: pertenencia al mismo Evento;
- `name`: nombre nominal, nullable únicamente después de anonimizar;
- `isPrimary`: identifica al único Asistente principal activo;
- `responseStatus`: `PENDING`, `CONFIRMED` o `REJECTED`;
- `anonymizedAt`, `createdAt`, `updatedAt` y `deletedAt`.

Cada Invitación activa conserva exactamente un Asistente principal activo. El principal representa al
Contacto y no puede editarse o eliminarse mediante las operaciones de Asistentes adicionales. No existe
Asistente anónimo, asignación de mesa, check-in ni QR individual en este alcance.

## Aprovisionamiento desde Contactos

`InvitationProvisioningService` es exportado por `InvitationsModule` y consumido por `ContactsModule`;
evita una dependencia circular y mantiene las reglas del agregado en Invitaciones.

- alta manual o commit CSV: crea Invitación `INDIVIDUAL`, respuestas `PENDING`, límite cero y Asistente
  principal dentro de la misma transacción que el Contacto;
- cambio de nombre del Contacto: sincroniza el nombre del principal;
- borrado lógico del Contacto: marca con el mismo instante la Invitación y todos sus Asistentes;
- cualquier error revierte Contacto, Invitación, Asistente y auditoría.

La migración aprovisiona de forma idempotente Contactos preexistentes activos, eliminados y ya
anonimizados. Conserva la condición de privacidad y el borrado lógico de cada Contacto.

## Tokens

Los nonces son 32 bytes aleatorios criptográficamente seguros, recuperables por la aplicación y únicos en
PostgreSQL. El token firmado usa HMAC-SHA-256 y contiene versión, UUID y nonce. La firma incorpora un
propósito explícito:

- `INVITATION` para el link público;
- `QR` para el material reservado de QR.

Los prefijos y propósitos son distintos, por lo que ambos tokens son diferentes y no intercambiables. El
secreto `INVITATION_TOKEN_SIGNING_SECRET` debe contener al menos 32 bytes y
`PUBLIC_INVITATION_BASE_URL` define la URL usada para reconstruir el link. Nonces, versiones, tokens,
nombres y teléfonos no se escriben en auditoría o logs.

En `development` y `test` existen defaults exclusivamente locales. En `production`, ambas variables son
obligatorias y explícitas:

- el secreto debe ser único, tener al menos 32 bytes y no puede ser el default local ni el placeholder de
  los archivos `.env.example`;
- la URL debe usar HTTPS, incluir un path público como `/invitacion` y no puede incluir credenciales,
  query o fragment;
- `localhost`, `127.0.0.1` y `::1` están rechazados;
- un error de arranque identifica la variable inválida sin imprimir el secreto.

Instancias distintas con el mismo secreto verifican el mismo token; otro secreto no lo verifica. La
rotación de secretos permanece diferida.

## Operaciones y estados

Las consultas operativas y mutaciones requieren ownership exacto del Evento. Pueden operar:

- `INDEPENDENT_PLANNER` sobre su Cliente;
- `ORGANIZATION_ADMIN` y `ORGANIZATION_PLANNER` sobre su Organización.

`PLATFORM_ADMIN` no recibe acceso operativo a estas rutas y Staff no puede usarlas. Crear, editar o
eliminar Asistentes y cambiar modo/límite solo está permitido en `DRAFT`, `CONFIGURED` o
`READY_TO_ACTIVATE`. CODEX-051 no calcula ni vuelve alcanzable `READY_TO_ACTIVATE`.

| Método | Ruta | Efecto |
| --- | --- | --- |
| `GET` | `/api/v1/events/:eventId/invitations` | Lista Invitaciones activas |
| `GET` | `/api/v1/events/:eventId/invitations/:invitationId` | Consulta el agregado |
| `PATCH` | `/api/v1/events/:eventId/invitations/:invitationId` | Cambia solo modo o límite |
| `POST` | `/api/v1/events/:eventId/invitations/:invitationId/cancel` | Cancela con idempotencia |
| `POST` | `/api/v1/events/:eventId/invitations/:invitationId/assistants` | Agrega un nominal |
| `PATCH` | `/api/v1/events/:eventId/invitations/:invitationId/assistants/:assistantId` | Cambia su nombre |
| `DELETE` | `/api/v1/events/:eventId/invitations/:invitationId/assistants/:assistantId` | Borrado lógico |

Las respuestas operativas incluyen el link reconstruido, pero nunca el teléfono del Contacto ni el token
QR.

## Cancelación e idempotencia

La cancelación específica se permite en `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE`, `ACTIVE` y
`EVENT_DAY`. Requiere `Idempotency-Key`, conserva Invitación, Asistentes, respuestas y material de tokens,
no altera finanzas y es irreversible.

- la respuesta estable contiene exclusivamente `invitationId`, `eventId`, `status = CANCELLED` y
  `cancelledAt`;
- misma llave e Invitación: devuelve exactamente esa misma respuesta y no duplica auditoría;
- misma llave para otra Invitación: `409 INVITATION_CANCEL_IDEMPOTENCY_CONFLICT`;
- otra llave sobre una Invitación cancelada: `409 INVITATION_ALREADY_CANCELLED`;
- la serialización y los locks garantizan una sola cancelación/auditoría bajo concurrencia.

El replay se resuelve antes de las validaciones operativas de estado o borrado lógico. Tras localizar la
llave, se autoriza de nuevo el Evento con la política exacta, incluyendo registros eliminados. Por ello, el
propietario puede repetir una cancelación después de cambios de estado o soft delete del Evento, Contacto
o Invitación. Una llave no permite descubrir recursos de otro Cliente: fuera de ownership siempre se
responde `404`. Las operaciones nuevas mantienen las consultas normales y reciben `404` sobre recursos
eliminados.

El resultado idempotente se deriva de los campos inmutables de cancelación; no existe snapshot adicional
y nunca contiene nombre, link, nonces, tokens, teléfono o información financiera.

## Vista pública y Confirmación

`GET /api/v1/public/invitations/:invitationToken` no requiere sesión:

- Evento `ACTIVE` o `EVENT_DAY`: `AVAILABLE` con Evento mínimo, datos técnicos de la Invitación y sus
  Asistentes;
- Invitación cancelada: `CANCELLED` con mensaje específico;
- Evento `CANCELLED`: `CANCELLED` con mensaje global;
- Evento `CLOSED` o `ALBUM_PUBLISHED`: `CLOSED`;
- preparación, archivado, token inválido, Evento/Contacto/Invitación eliminado: `404
  INVITATION_NOT_FOUND`.

La respuesta no expone teléfono, nonces, token QR, otras Invitaciones ni datos de otro Evento. Incluye el
diseño activo, páginas y Hotspots autorizados, además de la apertura de Confirmación.

`POST /confirm`, `POST /reject` y `PATCH /assistants` reconcilian nominalmente principal y acompañantes
activos en una transacción `Serializable`, respetando límite y capacidad global. `PUT
/events/:eventId/invitations/:invitationId/confirmation` permite el override del usuario operativo incluso
con Confirmación pública cerrada. Confirmar no escribe material QR nuevo: hace disponible el nonce ya
aprovisionado, y `InvitationQrService` genera el SVG bajo demanda. Detalle en `PUBLIC_RSVP_CONTRACT.md` y
`QR_CONTRACT.md`.

## Privacidad y auditoría

Toda mutación operativa se audita en la misma transacción con actor, identificadores, conteos, estado
técnico y timestamps; no contiene PII ni secretos.

El proceso de privacidad de Contactos anonimiza también, después de 30 días, nombres de Asistentes activos
y eliminados del Evento: establece `name = NULL` y `anonymizedAt`, conserva relaciones, respuestas y
métricas, y registra `ASSISTANTS_ANONYMIZED` con actor `SYSTEM` solo cuando hubo cambios. La operación es
idempotente y no duplica la anonimización del Contacto principal.

## Invariantes PostgreSQL

- una Invitación por Contacto y pertenencia compuesta Invitación/Contacto/Evento;
- Asistente e Invitación pertenecen al mismo Evento mediante FK compuesta;
- nonces de Invitación y QR únicos, no vacíos, con versiones positivas;
- identidad, pertenencia, nonces y versiones de Invitación inmutables;
- forma completa y coherente de cancelación, sin reactivación;
- actor inicial de cancelación activo, del Cliente del Evento y con rol operativo permitido;
- un `ORGANIZATION_PLANNER` solo puede figurar como cancelador si creó el Evento; Platform Admin queda
  rechazado;
- `additionalAssistantLimit >= 0` y consistencia entre modo y límite;
- índice parcial único para un principal activo;
- trigger diferible que exige exactamente un principal activo y máximo `1 + additionalAssistantLimit`;
- trigger diferible que impide bajar el límite por debajo de los adicionales activos;
- principal protegido contra edición/borrado directo;
- nombre obligatorio antes de anonimizar, nullable después, sin restauración;
- pertenencia e identidad de Asistente inmutables.

Los triggers diferibles permiten que aprovisionamiento, borrado lógico y anonimización actualicen el
agregado completo en una sola transacción sin observar estados intermedios inválidos.

## Alcance diferido

Quedan fuera QR por Asistente, persistencia del SVG, WhatsApp, `StaffToken`, scanner, check-in, mesas,
Álbum, frontend y efectos financieros propios de RSVP.
