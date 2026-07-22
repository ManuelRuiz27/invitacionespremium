# InvitacionesPremium bt Soft-Monky

Monorepo del SaaS InvitacionesPremium. La documentación de `/docs` es la fuente de verdad del producto y el código se organiza en `/apps` y `/packages`.

## Estructura

```txt
apps/
  api/       NestJS + Prisma + PostgreSQL + Socket.IO
  client/    Panel de Planner/Organización e interfaces públicas
  admin/     Platform Admin
  scanner/   Microapp de check-in
  landing/   Sitio comercial

packages/
  ui/          Tema y componentes Material UI compartidos
  api-client/  Base del SDK generado desde OpenAPI

docs/         Producto, reglas, arquitectura y backlog
```

## Requisitos

- Node.js 22.13 o superior;
- Corepack;
- pnpm 11.15.1;
- Docker Compose para PostgreSQL local.

## Inicio local

```bash
corepack enable
corepack prepare pnpm@11.15.1 --activate
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm --filter @invitaciones/api db:migrate:deploy
pnpm --filter @invitaciones/api auth:seed-local-admin
pnpm dev
```

Servicios locales:

| Workspace | Puerto |
|---|---:|
| API | 3000 |
| Client | 5173 |
| Admin | 5174 |
| Scanner | 5175 |
| Landing | 5176 |

API disponible:

- `GET http://localhost:3000/api/v1/health` valida API y PostgreSQL;
- `POST http://localhost:3000/api/v1/auth/login` crea una sesión local temporal;
- `POST http://localhost:3000/api/v1/auth/logout` revoca la sesión actual;
- `GET http://localhost:3000/api/v1/auth/me` devuelve el usuario autenticado;
- `http://localhost:3000/docs` expone Swagger cuando está habilitado;
- `http://localhost:3000/docs-json` expone OpenAPI cuando está habilitado.

## Comandos principales

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm ci
```

Comandos de API:

```bash
pnpm --filter @invitaciones/api dev
pnpm --filter @invitaciones/api db:validate
pnpm --filter @invitaciones/api db:migrate:deploy
pnpm --filter @invitaciones/api auth:seed-local-admin
pnpm --filter @invitaciones/api test:integration
pnpm --filter @invitaciones/api openapi:generate
```

Filtrar una app:

```bash
pnpm turbo build --filter=@invitaciones/api
pnpm turbo dev --filter=@invitaciones/client
```

## Estado de implementación

`CODEX-000` completó:

- workspace pnpm y Turborepo;
- TypeScript estricto;
- ESLint, Prettier y Vitest;
- CI reproducible con lockfile congelado;
- cinco apps base;
- paquetes `ui` y `api-client`;
- `.env.example` por app.

`CODEX-010` agregó la base operativa de API:

- configuración validada por ambiente;
- Prisma 7 conectado a PostgreSQL;
- health API + DB;
- logging JSON y `operationId`;
- errores HTTP uniformes;
- OpenAPI reproducible;
- PostgreSQL local y pruebas de integración;
- soporte base para procesos programados idempotentes.

`CODEX-011` agregó auditoría y borrado lógico:

- tabla `audit_log` append-only;
- actores `USER`, `STAFF_TOKEN`, `PUBLIC_TOKEN` y `SYSTEM`;
- redacción de secretos y datos de contacto;
- mutaciones auditadas dentro de transacciones `Serializable`;
- triggers PostgreSQL contra modificación o eliminación de auditoría;
- repositorio base que excluye `deletedAt` por defecto;
- restauración exclusiva de Platform Admin sin reactivar tokens expirados.

`CODEX-020` agrega autenticación local temporal:

- usuarios y sesiones persistidas;
- contraseñas derivadas con `scrypt` y sal aleatoria;
- tokens de sesión opacos almacenados únicamente como SHA-256;
- cookie `HttpOnly`, `SameSite` y `Secure` según ambiente;
- login, logout y `me`;
- guard global con rutas públicas explícitas;
- protección de origen para métodos inseguros;
- auditoría de login/logout y no enumeración de usuarios;
- seed local de Platform Admin.

Después de fusionar `CODEX-020` corresponde `CODEX-021 — Clientes Planner y Organización`.

## Fuente de verdad

Orden inicial obligatorio:

1. `docs/01-producto/01_GLOSARIO_Y_MODELO_CONCEPTUAL.md`
2. `docs/01-producto/02_PRD.md`
3. `docs/01-producto/03_ROLES_PERMISOS_ACCESO.md`
4. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md`
5. `docs/05-implementacion/14_CODEX_RULES.md`
6. tarea aplicable de `docs/05-implementacion/15_BACKLOG_CODEX.md`
7. enmiendas y contratos especializados del módulo

No se deben inventar entidades, roles, módulos, estados, permisos ni flujos.
