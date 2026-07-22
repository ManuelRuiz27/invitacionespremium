# @invitaciones/api

Backend NestJS de InvitacionesPremium. `CODEX-010` configura la infraestructura base, `CODEX-011` agrega auditoría y soft delete, y `CODEX-020` incorpora autenticación local temporal.

## Stack

- NestJS 11;
- Prisma ORM 7 con `@prisma/adapter-pg`;
- PostgreSQL 16;
- OpenAPI/Swagger;
- Vitest unitario e integración.

## Ejecución local

Desde la raíz del monorepo:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm --filter @invitaciones/api db:migrate:deploy
pnpm --filter @invitaciones/api auth:seed-local-admin
pnpm --filter @invitaciones/api dev
```

La API queda disponible en `http://localhost:3000/api/v1`.

Rutas iniciales:

- `GET /api/v1/health`: valida proceso y PostgreSQL;
- `POST /api/v1/auth/login`: crea sesión local y cookie;
- `POST /api/v1/auth/logout`: revoca la sesión actual;
- `GET /api/v1/auth/me`: devuelve usuario, rol y `clientId`;
- `/docs`: Swagger UI cuando `SWAGGER_ENABLED=true`;
- `/docs-json`: documento OpenAPI cuando Swagger está habilitado.

## Comandos

```bash
pnpm --filter @invitaciones/api db:validate
pnpm --filter @invitaciones/api db:generate
pnpm --filter @invitaciones/api db:migrate:deploy
pnpm --filter @invitaciones/api auth:seed-local-admin
pnpm --filter @invitaciones/api test
pnpm --filter @invitaciones/api test:integration
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api build
```

## Autenticación local temporal

- contraseña derivada con `scrypt`, sal aleatoria y comparación en tiempo constante;
- sesión opaca aleatoria; PostgreSQL conserva únicamente SHA-256 del token;
- cookie `HttpOnly`, `SameSite` y `Secure` según ambiente;
- cookie sin atributo `Domain` y con `Path` configurable;
- `SameSite=None` exige `Secure=true`;
- credenciales inválidas no revelan si el correo existe;
- rutas protegidas usan guard global y las públicas se declaran explícitamente;
- métodos inseguros con cabecera `Origin` requieren un origen incluido en `CORS_ORIGINS`;
- login y logout generan auditoría; el correo de intentos fallidos se sustituye por fingerprint;
- el comando de seed revoca sesiones previas del Platform Admin local.

Este mecanismo es exclusivo del desarrollo temprano. Producción v1 migrará a Auth0 conforme a la documentación del producto.

## Convenciones de persistencia

Las entidades deben aplicar:

- UUID de PostgreSQL/Prisma como identificador;
- timestamps técnicos como instantes UTC;
- zona horaria de Evento como identificador IANA, nunca zona del servidor;
- constraints e índices PostgreSQL para invariantes;
- transacciones `Serializable` en operaciones críticas;
- idempotencia y `operationId` en operaciones sensibles.

### Auditoría

`AuditModule` registra eventos append-only con:

- actor `USER`, `STAFF_TOKEN`, `PUBLIC_TOKEN` o `SYSTEM`;
- Cliente y Evento afectados cuando existan;
- recurso, acción, `before_data`, `after_data` y metadata;
- `operationId` para correlación;
- timestamp PostgreSQL con zona horaria.

Los actores públicos se guardan como fingerprint SHA-256. Los payloads eliminan automáticamente contraseñas, secretos, tokens, cookies, teléfonos y WhatsApp.

La tabla `audit_log` no tiene `updated_at` ni `deleted_at`. Triggers PostgreSQL rechazan cualquier `UPDATE` o `DELETE`. `AuditedMutationService` ejecuta mutación y auditoría en una transacción `Serializable`.

### Borrado lógico

Los repositorios de entidades principales deben extender `SoftDeleteRepository`:

- consultas operativas fuerzan `deletedAt: null`;
- borrar solo asigna `deletedAt`;
- restaurar solo limpia `deletedAt` y conserva el estado anterior;
- únicamente Platform Admin puede restaurar;
- restaurar no reactiva tokens expirados.

No usar este patrón para auditoría, ledger, pagos aprobados ni comprobantes confirmados.

## Logging y errores

- Nest usa salida JSON;
- cada respuesta incluye `x-operation-id`;
- solo se registra la plantilla de ruta, no la URL real;
- no se registran bodies, teléfonos, contraseñas, tokens ni connection strings;
- errores HTTP usan `statusCode`, `code`, `message`, `timestamp` y `operationId`.

## Procesos programados

`ScheduleModule` está habilitado como infraestructura. Los jobs pertenecen al módulo de negocio propietario, deben ser idempotentes y no pueden asumir la zona horaria del servidor.
