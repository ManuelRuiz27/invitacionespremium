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
- zona horaria del Evento es parte de datos operativos.

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
- teléfono nunca llega a Staff/Socket.IO/reportes.

## InvitationsModule

Endpoints:

- `GET /events/:eventId/invitations`
- `GET /events/:eventId/invitations/:invitationId`
- `PATCH /events/:eventId/invitations/:invitationId`
- `POST /events/:eventId/invitations/:invitationId/cancel`

La cancelación específica conserva el link para renderizar el mensaje de cancelación, pero bloquea Confirmación, edición pública y QR.

## InvitationDesignModule

Endpoints:

- `POST /events/:eventId/design/flyer`
- `POST /events/:eventId/design/flipbook`
- `GET /events/:eventId/design`
- `PATCH /events/:eventId/design`
- `GET /events/:eventId/hotspots`
- `POST /events/:eventId/hotspots`
- `PATCH /events/:eventId/hotspots/:hotspotId`
- `DELETE /events/:eventId/hotspots/:hotspotId`

Reglas:

- mutaciones solo en `draft`, `configured`, `ready_to_activate`;
- Flyer/Flipbook quedan congelados al activar;
- archivos se validan/vinculan conforme a `FILE_ASSET_POLICY.md`;
- Hotspot es entidad separada.

## PublicRsvpModule

Endpoints públicos con token de Invitación:

- `GET /public/invitations/:invitationToken`
- `POST /public/invitations/:invitationToken/confirm`
- `POST /public/invitations/:invitationToken/reject`
- `PATCH /public/invitations/:invitationToken/assistants`
- `GET /public/invitations/:invitationToken/qr`

Restricciones:

- `GET` puede renderizar el mensaje de cancelación para Evento o Invitación cancelados;
- Confirmación, rechazo y edición pública requieren Evento `active` o `event_day` y Confirmación abierta;
- QR requiere Evento `active` o `event_day` e Invitación confirmada;
- Evento `closed` bloquea Confirmación/QR operativo;
- Evento `archived` o recurso con borrado lógico no expone contenido;
- token de Invitación no funciona como token de Álbum, Staff o QR;
- auditoría identifica actor `PUBLIC_TOKEN` sin almacenar el secreto.

## FloorplanModule

Endpoints:

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

## StaffAccessModule

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

## ScannerModule

Endpoints públicos:

- `GET /scanner/:staffToken/session`
- `POST /scanner/:staffToken/scan`
- `POST /scanner/:staffToken/search`
- `POST /scanner/:staffToken/check-in`
- `GET /scanner/:staffToken/floorplan`

Todos requieren:

- token Staff válido/no expirado;
- Evento `active` o `event_day`;
- recurso perteneciente al mismo Evento;
- respuesta sin teléfono, finanzas ni reportes.

Check-in debe ser idempotente/protegido contra concurrencia.

## PhysicalPassesModule

Endpoints:

- `POST /events/:eventId/physical-passes/generate`
- `GET /events/:eventId/physical-passes`
- `GET /events/:eventId/physical-passes/:passId/svg`
- `POST /scanner/:staffToken/physical-passes/scan`

Segundo uso y concurrencia deben bloquearse.

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

Reglas del token de Álbum:

- distinto del token de Invitación;
- se genera para una Invitación elegible al publicar;
- Invitación elegible = al menos un Asistente ingresado;
- solo funciona con Evento `album_published`;
- expira a los 30 días o antes si Evento se archiva/Álbum se despublica;
- no habilita datos de otras Invitaciones;
- al expirar 30 días, el proceso de Evento lo archiva conforme a la máquina de estados.

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
- es idempotente o bloquea carga duplicada según estado;
- no permite que frontend cambie dataset/template/actor.

Descarga:

- vuelve a validar ownership/rol y ventana de privacidad;
- no expone `storage_key`;
- usa API o URL firmada corta futura;
- reportes detallados con nombres dejan de estar disponibles 30 días post-Evento;
- historial de seis meses conserva metadata y versiones agregadas/anónimas;
- nunca incluye teléfonos.

Estas rutas administrativas/Cliente no implican impersonación.

## AuditModule

Endpoints:

- `GET /admin/audit`
- `GET /admin/audit/:auditId`

## FileAssetsModule

Endpoints internos/administrativos:

- `POST /files`
- `GET /files/:fileId`
- `DELETE /files/:fileId`

Los módulos dueños deben preferir endpoints contextuales para vincular assets. `/files` no concede ownership por sí solo.

## RealtimeModule

Socket.IO con canales por Evento.

Canales:

- `event:{eventId}:dashboard`
- `event:{eventId}:scanner`
- `event:{eventId}:floorplan`

Eventos/payloads únicamente conforme a `REALTIME_PAYLOADS.md`.

No enviar teléfonos, nombres, finanzas ni tokens.

## DemoModule

Endpoints:

- `GET /demo`
- `GET /demo/invitation`
- `GET /demo/album`
- `GET /demo/scanner`

Demo usa datos mock/seed, no consume créditos ni genera tokens reales.