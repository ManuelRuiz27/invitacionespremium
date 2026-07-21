# CODEX-000 — Bootstrap monorepo

## Decisión

`CODEX-000` se ejecuta en el mismo repositorio que contiene `/docs`.

## Entregables

- raíz pnpm/Turborepo;
- `apps/api`;
- `apps/client`;
- `apps/admin`;
- `apps/scanner`;
- `apps/landing`;
- `packages/ui`;
- `packages/api-client`;
- TypeScript estricto;
- lint, formato, tests y build;
- CI en GitHub Actions;
- `.env.example` raíz y por app;
- README por workspace;
- sin lógica de negocio.

## Definition of Done

- `pnpm install` termina correctamente;
- `pnpm format:check` pasa;
- `pnpm lint` pasa;
- `pnpm typecheck` pasa;
- `pnpm test` pasa;
- `pnpm build` pasa;
- health endpoint base disponible en API;
- OpenAPI base disponible;
- cada frontend compila y muestra su shell;
- `packages/ui` exporta tema y componente base;
- `packages/api-client` no contiene DTOs manuales de dominio.

## Fuera de alcance

- auth;
- entidades Prisma de negocio;
- módulos funcionales;
- rutas reales del producto;
- integración de pagos;
- storage;
- lógica Socket.IO;
- deploy.

## Continuación

Después de fusionar este bootstrap, la siguiente tarea es `CODEX-010`: base API, configuración, Prisma/PostgreSQL, manejo de errores, logging, health y OpenAPI.
