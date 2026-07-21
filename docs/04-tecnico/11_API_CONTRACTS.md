# 11 — API Contracts

## Principio

La API NestJS debe organizarse por módulos de negocio, no por pantallas.

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
- `GET /admin/finance/cuts/daily`
- `GET /admin/finance/cuts/monthly`

## EventsModule

Endpoints:

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

## ContactsModule

Endpoints:

- `GET /events/:eventId/contacts`
- `POST /events/:eventId/contacts`
- `POST /events/:eventId/contacts/import`
- `PATCH /events/:eventId/contacts/:contactId`
- `DELETE /events/:eventId/contacts/:contactId`
- `GET /events/:eventId/groups`
- `POST /events/:eventId/groups`
- `PATCH /events/:eventId/groups/:groupId`

## InvitationsModule

Endpoints:

- `GET /events/:eventId/invitations`
- `GET /events/:eventId/invitations/:invitationId`
- `PATCH /events/:eventId/invitations/:invitationId`
- `POST /events/:eventId/invitations/:invitationId/cancel`

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

## PublicRsvpModule

Endpoints públicos:

- `GET /public/invitations/:token`
- `POST /public/invitations/:token/confirm`
- `POST /public/invitations/:token/reject`
- `PATCH /public/invitations/:token/assistants`
- `GET /public/invitations/:token/qr`
- `GET /public/invitations/:token/album`

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

No revocación manual en MVP.

## ScannerModule

Endpoints públicos:

- `GET /scanner/:staffToken/session`
- `POST /scanner/:staffToken/scan`
- `POST /scanner/:staffToken/search`
- `POST /scanner/:staffToken/check-in`
- `GET /scanner/:staffToken/floorplan`

## PhysicalPassesModule

Endpoints:

- `POST /events/:eventId/physical-passes/generate`
- `GET /events/:eventId/physical-passes`
- `GET /events/:eventId/physical-passes/:passId/svg`
- `POST /scanner/:staffToken/physical-passes/scan`

## AlbumsModule

Endpoints:

- `GET /events/:eventId/album`
- `POST /events/:eventId/album`
- `PATCH /events/:eventId/album`
- `POST /events/:eventId/album/photos`
- `DELETE /events/:eventId/album/photos/:photoId`
- `POST /events/:eventId/album/publish`
- `POST /events/:eventId/album/unpublish`

## ReportsModule

Endpoints:

- `GET /events/:eventId/reports`
- `POST /events/:eventId/reports/attendance-pdf`
- `POST /events/:eventId/reports/physical-passes-pdf`
- `GET /events/:eventId/reports/:reportId/download`

## AuditModule

Endpoints:

- `GET /admin/audit`
- `GET /admin/audit/:auditId`

## FileAssetsModule

Endpoints internos/administrativos:

- `POST /files`
- `GET /files/:fileId`
- `DELETE /files/:fileId`

## RealtimeModule

Socket.IO con canales por evento.

Canales:

- `event:{eventId}:dashboard`
- `event:{eventId}:scanner`
- `event:{eventId}:floorplan`

No enviar teléfonos ni datos sensibles.

## DemoModule

Endpoints:

- `GET /demo`
- `GET /demo/invitation`
- `GET /demo/album`
- `GET /demo/scanner`
