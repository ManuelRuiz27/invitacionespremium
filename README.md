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

- Node.js 22.13 o superior
- Corepack
- pnpm 11.15.1
- PostgreSQL para las fases que requieran persistencia

## Inicio

```bash
corepack enable
corepack prepare pnpm@11.15.1 --activate
pnpm install
pnpm dev
```

Comandos principales:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

Filtrar una app:

```bash
pnpm turbo build --filter=@invitaciones/api
pnpm turbo dev --filter=@invitaciones/client
```

## Estado del bootstrap

Este corte implementa `CODEX-000`:

- workspace pnpm;
- pipeline Turborepo;
- TypeScript estricto;
- ESLint y Prettier;
- Vitest;
- CI;
- cinco apps base;
- paquetes `ui` y `api-client`;
- `.env.example` por app;
- estructura sin lógica de negocio.

La implementación funcional comienza después con `CODEX-010`.

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
