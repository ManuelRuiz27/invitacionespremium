# 08 — TRD

## Stack confirmado

### Frontend cliente

- React
- Vite
- Material UI

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Socket.IO/WebSockets

### Deploy inicial

- Netlify para frontend
- Railway para backend

### Repos

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

## Arquitectura

Apps separadas consumiendo API REST común.

Tiempo real mediante Socket.IO por canales de evento.

## Auth

### Desarrollo

- auth local temporal;
- email/password;
- sesión/cookie.

### Producción

- Auth0;
- email/password;
- Google;
- sin WhatsApp/SMS en MVP.

## API

- REST API
- OpenAPI
- SDK generado desde OpenAPI

## Base de datos

- PostgreSQL
- Prisma ORM
- UUID como identificador
- enums controlados
- JSON para metadata/configuraciones variables

## Storage

- local en desarrollo
- S3 compatible futuro
- proveedor futuro no definido

## QR

- generado en backend principal
- formato SVG

## Reportes PDF

- generados desde plantilla HTML/export a PDF en frontend
- bajo demanda

## Tiempo real

Socket.IO.

Canales mínimos:

- `event:{eventId}:dashboard`
- `event:{eventId}:scanner`
- `event:{eventId}:floorplan`

Eventos:

- `checkin.created`
- `checkin.reverted`
- `rsvp.updated`
- `seating.updated`
- `event.closed`
- `event.cancelled`

No enviar teléfonos ni datos sensibles por socket.

## Archivos

Todos los archivos suben vía API.

Frontend nunca guarda archivos directo.

## PDF a imagen

MVP temprano:

- rechazar PDF;
- pedir imagen JPG/PNG.

Futuro:

- aceptar PDF una página;
- convertir a imagen.

## Testing

- unitarias;
- integración;
- E2E para flujos críticos.

Por repo:

- API: unitarias + integración;
- Client: E2E flujos críticos;
- Admin: E2E operaciones críticas;
- Scanner: E2E escaneo/check-in.

## Logs técnicos

TRD debe contemplar logs técnicos para:

- auth;
- activación de evento;
- consumo de créditos;
- pagos;
- scanner;
- check-in;
- sockets;
- errores de archivo;
- fallos de PDF;
- errores de storage.

## CI/CD

MVP:

- lint;
- tests;
- build.

## Ambientes

- local
- staging
- producción
