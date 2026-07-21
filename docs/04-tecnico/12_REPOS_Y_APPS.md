# 12 — Repos y apps

## Repos finales

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

## invitacionespremium-api

Contiene:

- NestJS
- Prisma
- PostgreSQL schema
- REST API
- Socket.IO
- auth local temporal
- módulos backend
- migraciones
- seeds demo
- tests backend
- OpenAPI

## invitacionespremium-client

Contiene:

- dashboard cliente;
- Planner independiente;
- Admin de Organización;
- Planner de Organización;
- wizard de eventos;
- créditos/finanzas cliente;
- demo interna conectada a seeds;
- perfil;
- reportes operativos;
- invitación pública por token;
- álbum público por token.

Rutas:

- `/dashboard`
- `/events`
- `/events/new`
- `/events/:id`
- `/credits`
- `/finance`
- `/reports`
- `/demo`
- `/profile`
- `/invitacion/:token`
- `/album/:token`

## invitacionespremium-admin

Solo para Platform Admin.

Contiene:

- clientes;
- organizaciones;
- usuarios;
- eventos;
- finanzas;
- créditos;
- deuda;
- pagos;
- precios/promos;
- reportes generales;
- auditoría;
- configuración.

Rutas:

- `/dashboard`
- `/clients`
- `/events`
- `/finance`
- `/prices-promos`
- `/payments`
- `/reports`
- `/audit`
- `/users`
- `/settings`

## invitacionespremium-scanner

Microapp pública para:

- abrir token staff;
- validar token;
- escanear QR;
- buscar invitación exacta;
- registrar check-in;
- ver plano;
- escanear QR pase físico.

## invitacionespremium-landing

Landing pública.

Contiene:

- información del producto;
- precios;
- mock visual de demo;
- botón registro;
- botón login.

## shared-ui

Repo separado de componentes compartidos Material UI.

## Login

Login único con redirección según rol/tipo de usuario.

## Demo

- Demo visual mock en landing sin backend.
- Demo interna en dashboard cliente conectada a seeds API.

## Tipos compartidos

Futuro. No MVP.

## Contratos API

SDK generado desde OpenAPI.

## Variables de entorno

Cada app debe tener `.env.example`.

## CI/CD

MVP:

- lint
- tests
- build

## Testing por repo

- API: unitarias + integración.
- Client: E2E flujos críticos.
- Admin: E2E operaciones críticas.
- Scanner: E2E escaneo/check-in.

## Seeds

Seeds demo viven en API.

Frontends consumen desde API.

## Archivos

Los archivos suben vía API.

Frontend nunca guarda archivos directo.
