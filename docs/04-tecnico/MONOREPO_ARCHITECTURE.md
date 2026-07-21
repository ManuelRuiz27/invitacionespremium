# Arquitectura monorepo

## Decisión

InvitacionesPremium se implementa en un único repositorio. La documentación y el código comparten historial, revisiones y CI.

El repositorio contiene:

```txt
apps/
  api/
  client/
  admin/
  scanner/
  landing/

packages/
  ui/
  api-client/

docs/
```

Esta decisión sustituye cualquier instrucción anterior de crear seis repositorios separados. Los nombres antiguos se interpretan como estas rutas:

| Nombre anterior | Ruta monorepo |
|---|---|
| `invitacionespremium-api` | `apps/api` |
| `invitacionespremium-client` | `apps/client` |
| `invitacionespremium-admin` | `apps/admin` |
| `invitacionespremium-scanner` | `apps/scanner` |
| `invitacionespremium-landing` | `apps/landing` |
| `shared-ui` | `packages/ui` |

## Herramientas

- pnpm workspaces;
- Turborepo;
- Node.js 22;
- TypeScript estricto;
- ESLint;
- Prettier;
- Vitest;
- GitHub Actions.

## Límites

1. Ninguna app importa código fuente de otra app.
2. Código reutilizable vive únicamente en `packages/*`.
3. `apps/api` concentra dominio, autorización, estados, finanzas y persistencia.
4. Los frontends consumen API/OpenAPI; no importan Prisma ni módulos NestJS.
5. `packages/ui` contiene solo presentación, tema y patrones visuales.
6. `packages/api-client` se genera desde OpenAPI y no es fuente manual paralela.
7. No crear otro workspace/package sin responsabilidad explícita y aprobación documental.
8. `/docs` permanece como fuente de verdad y debe actualizarse en el mismo PR cuando cambia producto.

## Despliegue

El monorepo no implica un despliegue único:

- Railway despliega `apps/api`;
- Netlify despliega por separado `apps/client`, `apps/admin`, `apps/scanner` y `apps/landing`;
- cada despliegue usa variables de entorno independientes;
- Turborepo puede filtrar la app y sus dependencias.

## CI

La raíz ejecuta:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Todos los workspaces deben pasar. La optimización por cambios afectados puede añadirse después de estabilizar el bootstrap.

## Dependencias compartidas

- las versiones base se coordinan desde el workspace;
- paquetes internos usan `workspace:*`;
- no se publica `packages/ui` ni `packages/api-client` durante MVP;
- un cambio en contrato API debe regenerar el cliente desde OpenAPI.

## Regla para Codex

Cuando backlog o documentación nombren un repo anterior, Codex debe operar en la ruta correspondiente de esta tabla. No debe crear repositorios separados.
