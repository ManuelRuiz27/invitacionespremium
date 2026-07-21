# 12 — Monorepo, apps y packages

## Repositorio único

InvitacionesPremium usa un solo repositorio con documentación y código.

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

La relación completa y el mapeo de nombres anteriores están en `MONOREPO_ARCHITECTURE.md`.

## `apps/api`

NestJS, Prisma, PostgreSQL, REST, OpenAPI y Socket.IO.

Responsabilidades exclusivas:

- reglas de negocio;
- ownership y autorización;
- estados y transiciones;
- ledger y efectos financieros;
- persistencia y concurrencia;
- generación y validación de QR;
- autorización de archivos y reportes;
- auditoría, anonimización y procesos automáticos.

No comparte código interno con los frontends.

## `apps/client`

Contiene:

- dashboard de Planner independiente y Organización;
- wizard de Evento;
- créditos y finanzas según permisos;
- Invitación pública;
- Confirmación de asistencia;
- Álbum público;
- reportes operativos dentro del Evento.

Rutas conceptuales:

- `/dashboard`;
- `/events`;
- `/events/new`;
- `/events/:id`;
- `/credits`;
- `/finance`;
- `/demo`;
- `/profile`;
- `/invitacion/:invitationToken`;
- `/album/:albumToken`.

No existe módulo global `/reports` para Planner en MVP.

## `apps/admin`

Solo Platform Admin.

Contiene:

- Clientes y Organizaciones;
- usuarios;
- Eventos en lectura administrativa;
- finanzas, créditos, deuda y pagos;
- precios y promociones;
- reportes generales;
- auditoría y configuración.

No implementa impersonación.

## `apps/scanner`

Microapp pública por StaffToken.

Ruta conceptual:

- `/scanner/:staffToken`.

Puede validar token, escanear QR, buscar Invitación exacta, registrar check-in por Asistente y consultar plano/mesa. No muestra teléfonos, finanzas, reportes ni auditoría.

## `apps/landing`

Sitio público comercial:

- propuesta de valor;
- servicios y precios visibles;
- demo visual sin backend;
- información para Planners y Organizaciones;
- FAQ;
- registro/login.

Registro público solo para Planner independiente.

## `packages/ui`

Tema, tokens visuales, layouts y componentes Material UI reutilizables.

No contiene reglas de negocio, llamadas API, Prisma, permisos ni estados financieros.

## `packages/api-client`

Cliente generado desde OpenAPI.

Durante el bootstrap solo contiene infraestructura mínima. Cuando la API tenga contratos, el código de endpoints se genera; no se mantienen DTOs manuales divergentes.

## Reglas de dependencia

- apps no importan otras apps;
- frontends pueden importar `packages/ui` y `packages/api-client`;
- API no depende de paquetes frontend;
- código compartido adicional requiere responsabilidad clara y aprobación;
- los tipos de dominio derivan de OpenAPI o del backend, no de una copia manual.

## Login

Login único con redirección:

- Platform Admin → `apps/admin`;
- Planner independiente → `apps/client`;
- Admin de Organización → `apps/client`;
- Planner de Organización → `apps/client`.

Staff y Público usan tokens, no login.

## Variables de entorno

Cada app tiene `.env.example` sin secretos. Base de datos y storage solo se configuran en API.

## CI/CD

La raíz valida todo el workspace:

- format;
- lint;
- typecheck;
- tests;
- build.

API añadirá validación de migraciones/OpenAPI. Cada frontend mantiene build y despliegue independiente.

## Deploy

- Railway: `apps/api`;
- Netlify: `apps/client`;
- Netlify: `apps/admin`;
- Netlify: `apps/scanner`;
- Netlify: `apps/landing`.

## Seeds

Viven en `apps/api`, solo local/staging autorizado y sin datos personales reales.

## Archivos

Todos los archivos pasan por `apps/api` y obedecen `FILE_ASSET_POLICY.md`.
