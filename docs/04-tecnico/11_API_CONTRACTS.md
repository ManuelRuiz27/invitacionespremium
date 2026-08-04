# 11 — API Contracts

## Principio

La API NestJS debe organizarse por módulos de negocio, no por pantallas.

Los endpoints `/events/**` corresponden a operación del Cliente. Platform Admin no debe reutilizarlos como si impersonara al Cliente; sus consultas globales usan rutas `/admin/**` explícitas.

Todos los contratos deben documentarse en OpenAPI. Los estados, permisos, finanzas, archivos y payloads se rigen por sus documentos especializados.

## Módulos backend finales

- AuthModule
- ClientsModule
- ClientUsersModule
- ServicesPricingModule
- FinanceModule
- EventsModule
- ContactsModule
- InvitationsModule
- InvitationDesignModule
- PublicRsvpModule
- FloorplanModule
- StaffAccessModule
- ScannerModule
- PhysicalPassesModule
- AlbumsModule
- ReportsModule
- AuditModule
- FileAssetsModule
- RealtimeModule
- DemoModule

## Convenciones transversales

- UUID para IDs.
- Timestamps API en UTC ISO 8601.
- Zona horaria IANA en Evento.
- `Idempotency-Key` obligatoria en activación, compras, pagos, devoluciones, reversos y operaciones críticas definidas.
- Recurso fuera de ownership: `404` o política equivalente que no revele existencia.
- Rol sin capacidad: `403`.
- Sesión/token inválido: `401`.
- Estado incompatible: `409` con código de dominio.
- Validaciones de DTO no sustituyen reglas de dominio.
- Nunca devolver tokens secretos completos después de su creación inicial cuando no sea necesario.

## AuthModule

Endpoints:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## ClientsModule

Endpoints:

- `POST /clients/register-planner`
- `GET /clients`
- `GET /clients/:clientId`
- `PATCH /clients/:clientId`
- `POST /clients/:clientId/suspend`
- `POST /clients/:clientId/restore`

`GET /clients` y acciones globales son administrativas. Los DTOs/rutas deben aplicar `ACCESS_MATRIX.md` y no permitir enumeración a Clientes.

## ClientUsersModule

Endpoints:

- `GET /clients/:clientId/users`
- `POST /clients/:clientId/users/planner`
- `PATCH /clients/:clientId/users/:userId`

## ServicesPricingModule

Endpoints:

- `GET /services`
- `POST /admin/services`
- `PATCH /admin/services/:serviceId`
- `GET /admin/prices`
- `POST /admin/prices`
- `PATCH /admin/prices/:priceId`
- `GET /admin/promotions`
- `POST /admin/promotions`
- `PATCH /admin/promotions/:promotionId`
- `POST /admin/promotions/:promotionId/activate`
- `POST /admin/promotions/:promotionId/deactivate`

## FinanceModule

Cliente:

- `GET /finance/balance`
- `GET /finance/movements`
- `GET /finance/receipts`
- `POST /finance/buy-credits-request`

Platform Admin:

- `GET /admin/finance/clients/:clientId/balance`
- `POST /admin/finance/clients/:clientId/assign-credits`
- `POST /admin/finance/clients/:clientId/credit-line`
- `POST /admin/finance/clients/:clientId/manual-payment`
- `POST /admin/finance/events/:eventId/refund`
- `POST /admin/finance/ledger/:ledgerEntryId/reverse`
- `GET /admin/finance/cuts/daily`
- `GET /admin/finance/cuts/monthly`

Reglas:

- efectos conforme a `LEDGER_TYPES.md`;
- compra manual pagada y asignación gratuita son acciones distintas;
- Pago debe estar `approved` antes del movimiento confirmado;
- activación y operaciones financieras críticas son idempotentes/transaccionales;
- no aceptar montos de saldo/deuda calculados por frontend como fuente de verdad.

## EventsModule

Operación Cliente:

- `GET /events`
- `POST /events`
- `GET /events/:eventId`
- `PATCH /events/:eventId`
- `POST /events/:eventId/activate`
- `POST /events/:eventId/close`
- `POST /events/:eventId/reopen`
- `POST /events/:eventId/archive`
- `POST /events/:eventId/cancel`
- `DELETE /events/:eventId`
- `POST /events/:eventId/change-service`

Consulta Platform Admin:

- `GET /admin/events`
- `GET /admin/events/:eventId`

Reglas:

- Platform Admin tiene lectura global mediante rutas administrativas y no usa sesión de Cliente;
- transiciones exactas según `EVENT_STATE_MACHINE.md`;
- activación requiere `Idempotency-Key`;
- `PATCH` no permite cambiar status arbitrariamente;
- zona horaria del Evento es parte de datos operativos;
- `POST /events` y `PATCH /events/:eventId` recomputan la proyección de readiness digital para
  `FLYER|FLIPBOOK`;
- activación bloquea el Evento, recomputa readiness y exige `READY_TO_ACTIVATE` antes de resolver precio
  o producir ledger, recibo y cambio de balance.

## ContactsModule

Endpoints:

- `GET /events/:eventId/contacts`
- `POST /events/:eventId/contacts`
- `POST /events/:eventId/contacts/import/preview`
- `POST /events/:eventId/contacts/import/commit`
- `GET /events/:eventId/contacts/import-template`
- `PATCH /events/:eventId/contacts/:contactId`
- `DELETE /events/:eventId/contacts/:contactId`
- `GET /events/:eventId/groups`
- `POST /events/:eventId/groups`
- `PATCH /events/:eventId/groups/:groupId`

Reglas:

- preview no persiste Contactos definitivos;
- commit usa un preview válido/no expirado o payload validado equivalente;
- archivo que excede 150 se bloquea completo;
- teléfono nunca llega a Staff/Socket.IO/reportes;
- crear el primer Contacto, eliminar el último y confirmar un import CSV recomputan readiness digital
  dentro de la transacción causante.

## InvitationsModule

Endpoints:

- `GET /events/:eventId/invitations`
- `GET /events/:eventId/invitations/:invitationId`
- `PATCH /events/:eventId/invitations/:invitationId`
- `POST /events/:eventId/invitations/:invitationId/cancel`
- `POST /events/:eventId/invitations/:invitationId/assistants`
- `PATCH /events/:eventId/invitations/:invitationId/assistants/:assistantId`
- `DELETE /events/:eventId/invitations/:invitationId/assistants/:assistantId`

Cada Contacto se aprovisiona transaccionalmente con una Invitación individual y un Asistente principal.
Las mutaciones de modo, límite y Asistentes adicionales solo operan durante la preparación. La cancelación
es irreversible, requiere `Idempotency-Key`, conserva el link para renderizar el mensaje de cancelación y
bloquea Confirmación, edición pública y QR.
Cancelar una Invitación durante preparación recomputa readiness digital en la misma transacción; una
Invitación cancelada no cuenta como activa.

`POST /events/:eventId/invitations/:invitationId/cancel` devuelve únicamente `invitationId`, `eventId`,
`status = CANCELLED` y `cancelledAt`. El replay autorizado conserva exactamente esos valores incluso tras
cambios de estado o soft delete; no devuelve PII, links, nonces, tokens ni datos financieros. El replay
vuelve a comprobar ownership incluyendo eliminados, mientras una operación nueva conserva el `404`
operativo sobre recursos eliminados.

CODEX-051 implementa únicamente la lectura pública mínima:

- `GET /public/invitations/:invitationToken`

En `active` y `event_day` devuelve contenido mínimo; diferencia cancelación específica/global y cierre;
oculta preparación, archivado, borrado lógico y tokens inválidos. Confirmación, rechazo, edición pública y
consulta de QR permanecen diferidos al `PublicRsvpModule`.

## InvitationDesignModule

Endpoints:

- `POST /events/:eventId/design/flyer`
- `POST /events/:eventId/design/flipbook`
- `GET /events/:eventId/design`
- `GET /events/:eventId/design/readiness`
- `PATCH /events/:eventId/design/flyer/initial-image`
- `PATCH /events/:eventId/design/flyer/qr-image`
- `POST /events/:eventId/design/flipbook/pages`
- `PATCH /events/:eventId/design/flipbook/pages/reorder`
- `PATCH /events/:eventId/design/flipbook/pages/:pageId/asset`
- `DELETE /events/:eventId/design/flipbook/pages/:pageId`
- `GET /events/:eventId/hotspots`
- `POST /events/:eventId/hotspots`
- `PATCH /events/:eventId/hotspots/:hotspotId`
- `DELETE /events/:eventId/hotspots/:hotspotId`

Reglas:

- mutaciones solo en `draft`, `configured`, `ready_to_activate`;
- Flyer/Flipbook quedan congelados al activar;
- archivos se validan/vinculan conforme a `FILE_ASSET_POLICY.md`;
- Hotspot es entidad separada;
- Flyer requiere ambas variantes READY y Flipbook usa páginas relacionales con orden continuo y máximo 10;
- Flyer requiere `RSVP`, `LOCATION`, `GIFT_REGISTRY` y `QR_AREA`;
- Flipbook requiere `RSVP`, `LOCATION` y `GIFT_REGISTRY` en la portada activa (posición `1`) y una página
  activa derivada por `QR_AREA`;
- `EXTERNAL_LINK` es opcional, máximo tres, y solo admite HTTPS sin credenciales, query, fragment,
  espacios ni controles;
- `PATCH` con `url` exige acción actual o resultante `EXTERNAL_LINK`; no acepta `null` ni descarta el campo;
- Hotspots de Flipbook solo operan sobre portada o página QR y nunca sobre páginas eliminadas;
- la activación recalcula readiness antes de cualquier efecto financiero;
- todas las mutaciones de Flyer, Flipbook, páginas y Hotspots recomputan la proyección digital completa,
  por lo que pueden promover o degradar el Evento;
- detalle completo en `INVITATION_DESIGN_CONTRACT.md`.

## PublicRsvpModule

Endpoints públicos con token de Invitación:

- `GET /public/invitations/:invitationToken`
- `POST /public/invitations/:invitationToken/confirm`
- `POST /public/invitations/:invitationToken/reject`
- `PATCH /public/invitations/:invitationToken/assistants`
- `GET /public/invitations/:invitationToken/qr.svg`

Restricciones:

- `GET` puede renderizar el mensaje de cancelación para Evento o Invitación cancelados;
- Confirmación, rechazo y edición pública requieren Evento `active` o `event_day` y Confirmación abierta;
- QR requiere Evento `active` o `event_day`, Invitación confirmada y agregado nominal coherente;
- Evento `closed` bloquea Confirmación/QR operativo;
- Evento `archived` o recurso con borrado lógico no expone contenido;
- token de Invitación no funciona como token de Álbum, Staff o QR;
- auditoría identifica actor `PUBLIC_TOKEN` sin almacenar el secreto.

La vista `AVAILABLE` proyecta `qr.available`; solo agrega `contentPath` cuando el QR está disponible.
`qr.svg` genera bytes vectoriales deterministas bajo demanda, no persiste FileAsset y devuelve cache
privado, `nosniff`, `no-referrer`, CSP `default-src 'none'` y ETag SHA-256. El token QR se emite
internamente con propósito `QR` y nunca aparece en JSON, headers, errores o texto SVG. Contrato normativo:
`QR_CONTRACT.md`.

## FloorplanModule

Endpoints Planner:

- `POST /events/:eventId/floorplan`
- `GET /events/:eventId/floorplan`
- `PATCH /events/:eventId/floorplan`
- `POST /events/:eventId/floorplan/lock`
- `POST /events/:eventId/floorplan/unlock`
- `POST /events/:eventId/floorplan/shapes`
- `PATCH /events/:eventId/floorplan/shapes/:shapeId`
- `DELETE /events/:eventId/floorplan/shapes/:shapeId`
- `POST /events/:eventId/seating/assign`
- `POST /events/:eventId/seating/assign-family`
- `POST /events/:eventId/seating/assign-group`
- `PATCH /events/:eventId/seating/:assistantId`

Las mutaciones de seating requieren `Idempotency-Key`. Planner independiente opera su Cliente; Admin de
Organización opera su Organización; Planner de Organización solo Eventos creados por él. Platform Admin,
Staff y público no usan estas rutas.

Un Croquis reclama un FileAsset `FLOORPLAN/FLOORPLAN_IMAGE` JPG/PNG `READY` del mismo Cliente y Evento.
El reemplazo reclama primero el nuevo asset, actualiza el Croquis y oculta el anterior en una sola
transacción. Lock/unlock solo congela imagen y shapes; no bloquea asignaciones.

Las Mesas tienen capacidad positiva; las zonas decorativas capacidad cero y nunca son asignables.
Asignación individual, familiar y por Grupo selecciona únicamente Asistentes nominales, activos y
confirmados y aplica el lote completo. `PATCH .../seating/:assistantId` acepta Mesa o `null`. El cambio
posterior al check-in está permitido y queda señalado en auditoría.

Con `floorplanEnabled=true`, activación exige Croquis, imagen lista y al menos una Mesa; cerrar
Confirmación falla con `EVENT_FLOORPLAN_PENDING_SEATING` y solo `pendingCount` si quedan confirmados sin
Mesa. Rechazo de Invitación, borrado de Asistente adicional y cancelación de Invitación limpian todas
las asignaciones afectadas en la misma transacción. La auditoría de negocio se conserva y se agrega
`SEATING_IMPLICIT_RELEASE`; solo un cambio real publica `seating.updated` después del commit.

Endpoints Staff de solo lectura:

- `GET /scanner/:staffToken/floorplan`
- `GET /scanner/:staffToken/floorplan/content`

Requieren token válido del mismo Evento `active | event_day`. La respuesta contiene Croquis, shapes,
capacidad, ocupación y coordenadas sin Contactos, teléfono, rutas ni claves de storage. Los resultados
Scanner de Invitación/Asistentes agregan únicamente `table: {id,name} | null`.

Las mutaciones estructurales del Croquis —creación, reemplazo de imagen y alta, edición o eliminación de
Mesa/shape— recomputan readiness digital cuando `floorplanEnabled=true`. Los cambios de seating que no
alteran la validez estructural no recalculan la proyección.

## StaffAccessModule

Contrato normativo: `STAFF_ACCESS_CONTRACT.md`.

Endpoints:

- `GET /events/:eventId/staff-tokens`
- `POST /events/:eventId/staff-tokens`

Reglas:

- máximo tres tokens activos por Evento;
- solo se crean cuando Evento está `active` o `event_day`;
- expiran al cerrar/cancelar;
- expirados no se reactivan al reabrir ni cuentan como activos;
- no existe revocación manual en MVP;
- secreto completo se devuelve únicamente al crear/copiar conforme a estrategia segura; no se registra en logs.
- `GET /scanner/:staffToken/session` ya expone exclusivamente la sesión pública mínima; scan, search y
  check-in permanecen diferidos a `CODEX-081`.

## ScannerModule

Endpoints públicos:

- `GET /scanner/:staffToken/session`
- `POST /scanner/:staffToken/scan`
- `POST /scanner/:staffToken/search`
- `POST /scanner/:staffToken/check-in`

Check-in y reversión conservan aislamiento `Serializable`; scan y search usan lecturas bloqueadas
`READ COMMITTED` para observar la mutación que obtuvo primero el lock. El replay de check-in devuelve
directamente un snapshot mínimo validado con los nombres ya mostrados originalmente, sin consultar PII
mutable ni generar otra auditoría. Las cinco FK físicas y el trigger de inserción de la migración 26
refuerzan pertenencia y orden Evento → StaffToken → Invitación → Contacto → Asistente.

Todos requieren:

- token Staff válido/no expirado;
- Evento `active` o `event_day`;
- recurso perteneciente al mismo Evento;
- respuesta sin teléfono, finanzas ni reportes.

Check-in es parcial por Asistente, atómico, idempotente y protegido contra concurrencia. Con Croquis
habilitado, toda la selección debe apuntar a Mesas activas del mismo Evento y Croquis; de otro modo
responde `409 SCANNER_TABLE_ASSIGNMENT_REQUIRED` sin filas, auditoría ni realtime. Con Croquis
deshabilitado, `table=null` sigue permitido. La migración 28 replica la misma precondición para INSERT
directo con `check_in_floorplan_table_required`. La reversión
autenticada vive en `POST /events/:eventId/check-ins/:checkInId/revert`. Scanner también expone Croquis
privado y Mesa mínima conforme a `FloorplanModule`; Socket.IO publica los cambios post-commit. Contrato
normativo de check-in: `SCANNER_CHECKIN_CONTRACT.md`.

## PhysicalPassesModule

Endpoints:

- `POST /events/:eventId/physical-passes/generate`
- `GET /events/:eventId/physical-passes`
- `GET /events/:eventId/physical-passes/:passId/svg`
- `POST /scanner/:staffToken/physical-passes/scan`

Segundo uso y concurrencia deben bloquearse.

La generación requiere `Idempotency-Key` y `{quantity, tableShapeId|null}`; devuelve rango consecutivo y
pases mínimos sin secretos. Listado y SVG usan ownership operativo. Scanner deriva el Evento solo desde
StaffToken, registra un único primer uso y conserva replay exacto. Contrato normativo:
`PHYSICAL_PASSES_CONTRACT.md`.

La edición del Evento y la generación —incluido replay— recomputan la proyección física de readiness en
la transacción. PostgreSQL rechaza generación terminal con `physical_pass_generation_state`, primer uso
fuera de `active|event_day` con `physical_pass_use_event_not_operational` y StaffToken expirado con
`physical_pass_use_staff_expired`; la API los traduce a errores de dominio estables.

## AlbumsModule

Operación Cliente:

- `GET /events/:eventId/album`
- `POST /events/:eventId/album`
- `PATCH /events/:eventId/album`
- `POST /events/:eventId/album/photos`
- `DELETE /events/:eventId/album/photos/:photoId`
- `POST /events/:eventId/album/publish`
- `POST /events/:eventId/album/unpublish`

Acceso público:

- `GET /public/albums/:albumToken`
- `GET /public/albums/:albumToken/photos/:photoId/content`

Reglas del token de Álbum:

- distinto del token de Invitación;
- se genera para una Invitación elegible al publicar;
- Invitación elegible = al menos un Asistente ingresado;
- solo funciona con Evento `album_published`;
- expira a los 30 días o antes si Evento se archiva/Álbum se despublica;
- no habilita datos de otras Invitaciones;
- al expirar 30 días, el proceso de Evento lo archiva conforme a la máquina de estados.

La implementación usa `EventStateOperation` para replay exacto de publicación/despublicación, entrega
fotos con cache privado `no-store` y aplica el contrato normativo `ALBUMS_CONTRACT.md`.

## ReportsModule

### Operación por Evento

- `GET /events/:eventId/reports`
- `POST /events/:eventId/reports/attendance-pdf`
- `POST /events/:eventId/reports/physical-passes-pdf`
- `POST /events/:eventId/reports/:reportId/file`
- `GET /events/:eventId/reports/:reportId/download`

### Consulta Platform Admin

- `GET /admin/reports`
- `GET /admin/reports/events/:eventId`

### Semántica de generación

`POST /events/:eventId/reports/attendance-pdf` y `physical-passes-pdf` no reciben el PDF terminado. Crean una solicitud autorizada de generación y devuelven:

- `reportId`;
- `reportType`;
- `templateVersion`;
- `generatedAtSnapshot`;
- dataset autorizado;
- parámetros aprobados;
- fecha de expiración de la autorización de carga.

El frontend autorizado:

1. renderiza plantilla HTML;
2. exporta PDF;
3. envía el archivo a `POST /events/:eventId/reports/:reportId/file`.

El endpoint de archivo:

- acepta solo PDF generado para ese `reportId`;
- valida sesión, ownership, Evento, tipo, tamaño, checksum y autorización vigente;
- rechaza reuso entre Eventos/Clientes;
- almacena FileAsset tipo `GENERATED_REPORT_PDF`;
- marca reporte `ready` únicamente después de almacenamiento exitoso;
- coordina cargas iguales sin polling y bloquea bytes distintos después de que exista un ganador;
- una carga fallida elimina bytes, libera el owner de la reserva y permite un FileAsset nuevo;
- no permite que frontend cambie dataset/template/actor.

Descarga:

- vuelve a validar ownership/rol y ventana de privacidad;
- no expone `storage_key`;
- usa API o URL firmada corta futura;
- reportes detallados con nombres dejan de estar disponibles 30 días post-Evento;
- historial de seis meses conserva metadata y versiones agregadas/anónimas;
- nunca incluye teléfonos.

`GENERATED_REPORT_PDF` no aparece ni se resuelve mediante `/events/:eventId/file-assets/**`. La única
lectura binaria permitida es el endpoint de descarga del Reporte. Autorización, replay, listados, carga
y descarga aplican la misma proyección basada en reloj PostgreSQL aun si el scheduler todavía no
persistió `HIDDEN` o `EXPIRED`. `fileUploadPath` solo existe durante una autorización utilizable.

Estas rutas administrativas/Cliente no implican impersonación.

La implementación normativa, errores estables, datasets v1, binding PDF, ventanas `[inicio, fin)`,
idempotencia y triggers PostgreSQL se detallan en `REPORTS_CONTRACT.md`.

## AuditModule

Operacion administrativa de solo lectura:

- `GET /admin/audit-logs`

Solo `PLATFORM_ADMIN`. Acepta `clientId`, `eventId`, `actorType`, `actorId`, `resourceType`,
`resourceId`, `action`, `operationId`, `createdFrom`, `createdTo`, `cursor` y `limit`. El limite
predeterminado es 50 y el maximo es 100. Ordena por `occurredAt DESC, id DESC`; el cursor opaco
conserva ambas columnas para no omitir ni repetir registros con el mismo timestamp.

La respuesta proyecta exclusivamente `id`, `createdAt`, actor, recurso, Cliente, Evento, accion,
operacion y los tres documentos JSON sanitizados. No resuelve identidades, no agrega PII y no publica
mutaciones, descarga ni consulta individual.

## FileAssetsModule

Operación autenticada del Cliente:

- `POST /events/:eventId/file-assets`
- `GET /events/:eventId/file-assets`
- `GET /events/:eventId/file-assets/:fileAssetId`
- `GET /events/:eventId/file-assets/:fileAssetId/content`
- `DELETE /events/:eventId/file-assets/:fileAssetId`

La subida es multipart, acepta únicamente JPEG/PNG reales y no recibe Cliente, storage, checksum, MIME
confiable, tamaño, actor ni owner ID. Opera solo durante preparación del Evento. Metadata y contenido
requieren ownership; las respuestas nunca incluyen `storageKey`, ruta física ni checksum completo.

La asociación usa el método interno `claimReadyAsset` y resolvers especializados. No existe endpoint para
que el frontend asigne `ownerId`. Los tipos PDF/SVG generados solo se crean por métodos internos. La
limpieza técnica reclama atómicamente cada huérfano como `DELETED` antes de eliminar sus bytes, sin mantener
la transacción abierta durante filesystem y sin tocar assets asociados ni reaccionar a
cancelación/archivado. El borrado genérico y el claim serializan sobre la fila.

La descarga autenticada devuelve `Content-Type`, `Content-Length`, `ETag`, `Content-Disposition: inline`,
`Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`, sin nombres ni identificadores
internos. Detalle completo en `FILE_ASSETS_CONTRACT.md`.

## RealtimeModule

Socket.IO v1 conectado al servidor HTTP existente:

```text
namespace: /realtime
path: /socket.io
```

El handshake declara en `auth` exactamente un modo:

- `USER`: `protocolVersion`, `actorMode`, `roomType`, `eventId`, `administrative`; la sesión se obtiene
  únicamente de la cookie Auth;
- `STAFF_TOKEN`: `protocolVersion`, `actorMode`, `roomType`, `staffToken`; el Evento se resuelve desde el
  token y no se acepta `eventId` del cliente.

No existe `join-room`, room público, credencial en query string ni evento de dominio entrante.
La cookie Auth es `HttpOnly` y usa obligatoriamente `Path=/` para cubrir `/socket.io`; los clientes web
conectan con credenciales y nunca copian el session token a `auth`, query o JavaScript.

Canales:

- `event:{eventId}:dashboard`
- `event:{eventId}:scanner`
- `event:{eventId}:floorplan`

Eventos/payloads únicamente conforme a `REALTIME_PAYLOADS.md`.

Las mutaciones siguen siendo REST y fuente de verdad. El broadcast se realiza después del commit,
se deduplica por `eventName + operationId` y no revierte la operación si falla el transporte. No hay
replay histórico: ante pérdida o reconexión se recupera el snapshot por REST.

No enviar teléfonos, nombres, finanzas ni tokens. Cerrar o cancelar notifica primero y después
desconecta los sockets Staff; toda reconexión vuelve a validar token, ownership y estado del Evento.
La resolución Staff se serializa bajo locks Evento → StaffToken. Los handshakes autorizados pero aún no
registrados se coordinan como conexiones pendientes y se revalidan antes y después del registro, de modo
que cierre/cancelación observa sockets conectados y pendientes sin dejar acceso Staff estable.

## DemoModule

Endpoints:

- `GET /demo`
- `GET /demo/invitation`
- `GET /demo/album`
- `GET /demo/scanner`

Demo usa datos mock/seed, no consume créditos ni genera tokens reales.

## PublicRsvpModule

Rutas públicas por token:

- `GET /public/invitations/:invitationToken`;
- `GET /public/invitations/:invitationToken/assets/:fileAssetId/content`;
- `GET /public/invitations/:invitationToken/qr.svg`;
- `POST /public/invitations/:invitationToken/confirm`;
- `POST /public/invitations/:invitationToken/reject`;
- `PATCH /public/invitations/:invitationToken/assistants`.

Rutas operativas:

- `GET /events/:eventId/confirmation`;
- `POST /events/:eventId/confirmation/close`;
- `POST /events/:eventId/confirmation/reopen`;
- `PUT /events/:eventId/invitations/:invitationId/confirmation`.

La resolución pública es mínima; las mutaciones nominales usan transacciones serializables, capacidad por
Asistente y auditoría sin PII. La entrega de assets revalida token, Evento, Invitación, diseño y referencia
actual. Las referencias devueltas incluyen un `contentPath` inmediatamente consumible con el token actual
codificado; un fallo de storage devuelve `500 FILE_STORAGE_FAILURE` sin datos internos. Los destinos del
Evento se normalizan y excluyen fragmentos y componentes semánticos privados en path o query. Tras hasta
cuatro rondas de decodificación rechazan controles ASCII `0x00-0x1F`/`0x7F`, `/`, `\` y `#`; `%20`
solo se admite en path y valores de query. Un corpus único verifica normalizador, DTO/API, `INSERT` y
`UPDATE` directos.

Todo escape porcentual debe estar completo y representar UTF-8 válido; `%C3%B3` es válido, mientras
secuencias no hexadecimales, truncadas, sobrelargas o continuaciones aisladas se rechazan. Se procesa
todo el query posterior al primer `?`. PostgreSQL valida sin normalizar ni reescribir el valor. Los 54
casos se prueban para `locationUrl` y `giftRegistryUrl`; la migración revisa filas heredadas y falla sin
exponer destinos si detecta incompatibilidades.

Las once carreras de RSVP usan una barrera posterior a los locks de la primera operación y una señal
explícita de que la competidora alcanzó el método que ejecuta `SELECT ... FOR UPDATE`. No dependen de
`nextTick`, sleeps, temporizadores ni lógica de producción exclusiva de pruebas.
Contrato normativo: `PUBLIC_RSVP_CONTRACT.md`.

`InvitationQrService` reutiliza el orden Evento → Invitación y las transacciones críticas para generar el
SVG solo en `ACTIVE`/`EVENT_DAY` y resolver internamente tokens de propósito `QR`. No crea endpoint de
scanner ni validación pública del token QR. Contrato normativo: `QR_CONTRACT.md`.
