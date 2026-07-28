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
- `GET http://localhost:3000/api/v1/auth/me` devuelve usuario, rol y contexto del Cliente;
- `POST http://localhost:3000/api/v1/clients/register-planner` registra un Planner independiente;
- `/api/v1/admin/clients/**` concentra las acciones globales de Platform Admin;
- `/api/v1/clients/:clientId/**` concentra las acciones del Cliente autenticado;
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

`CODEX-020` agregó autenticación local temporal:

- usuarios y sesiones persistidas;
- contraseñas derivadas con `scrypt` y sal aleatoria;
- tokens de sesión opacos almacenados únicamente como SHA-256;
- cookie `HttpOnly`, `SameSite` y `Secure` según ambiente;
- login, logout y `me`;
- guard global con rutas públicas explícitas;
- protección de origen para métodos inseguros;
- auditoría de login/logout y no enumeración de usuarios;
- seed local de Platform Admin.

`CODEX-021` agregó Clientes Planner y Organización:

- entidad `Client`, tipo y estado operativo;
- FK formal de Usuario a Cliente;
- compatibilidad rol/tipo reforzada en PostgreSQL;
- registro público de Planner independiente;
- creación administrativa de Organización;
- usuarios Planner internos;
- suspensión/restauración auditada;
- roles y ownership sin impersonación.

`CODEX-030` agregó servicios, precios y promociones:

- catálogo cerrado de Flipbook, Flyer, QR físico y Demo;
- precios vigentes e historial por tipo de Cliente;
- intervalos de vigencia `[validFrom, validUntil)`;
- constraints PostgreSQL contra solapamientos y precios no válidos de Demo;
- promociones base con elegibilidad, vigencia y acumulación controlada;
- administración exclusiva de Platform Admin;
- seed idempotente de cuatro servicios y ocho precios iniciales.

`CODEX-031` agregó el núcleo financiero:

- ledger append-only e inmutable;
- balance cache reconstruible;
- línea de crédito y deuda por lotes históricos;
- pagos manuales aprobados, asignaciones gratuitas y comprobantes;
- folio global, idempotencia y auditoría transaccional;
- cortes diarios y mensuales derivados del ledger;
- constraints PostgreSQL para balances, pagos y asignaciones de deuda.

`CODEX-040` agregó el modelo y CRUD de Evento:

- borradores con datos básicos progresivos;
- estados `DRAFT` y `CONFIGURED` calculados por backend;
- ownership por Cliente, Organización y usuario creador;
- servicio activo, zona horaria IANA y capacidad validada;
- borrado lógico, restauración administrativa y limpieza idempotente de borradores vencidos;
- auditoría transaccional y consulta global de Platform Admin.

`CODEX-041` agregó la activación transaccional de Evento:

- consumo ordenado de saldo comprado y línea de crédito;
- ledger, comprobante, balance, snapshots y estado `ACTIVE` atómicos;
- precio vigente según tipo real de Cliente;
- valor histórico MXN para deuda financiada;
- ownership, idempotencia y concurrencia sin doble cobro;
- rechazo de Demo y rollback completo ante cualquier error;
- hardening PostgreSQL cerrado para inmutabilidad, estados y consistencia referencial de snapshots.

`CODEX-042` agregó el ciclo de vida posterior del Evento:

- entrada automática e idempotente a `EVENT_DAY` según la zona IANA;
- cierre y reapertura con resolución por fecha local;
- cancelación sin refund y con conservación de datos y snapshots;
- archivado desde cierre o publicación de Álbum;
- estados terminales y transiciones reforzados mediante PostgreSQL;
- ownership, idempotencia, concurrencia y auditoría transaccional;
- replay seguro después de borrado lógico y protección append-only contra `UPDATE`, `DELETE` y `TRUNCATE`.

`CODEX-042` quedó completamente cerrado.

`CODEX-050` agregó Contactos, grupos e importación CSV:

- CRUD con ownership exacto y mutaciones limitadas a la preparación del Evento;
- teléfonos WhatsApp normalizados a E.164 sin unicidad artificial;
- grupos únicos por nombre normalizado dentro de cada Evento;
- límite concurrente de 150 Contactos activos;
- preview CSV temporal y commit transaccional idempotente;
- descarte transaccional de filas normalizadas al confirmar;
- auditoría sin PII y anonimización agregada de Contactos y snapshots después de 30 días;
- replay redactado después de la retención y protección PostgreSQL contra reintroducir PII;
- limpieza irreversible de previews vencidos.

`CODEX-050` quedó completamente cerrado.

`CODEX-051` agregó Invitaciones y Asistentes nominales:

- aprovisionamiento transaccional desde altas manuales y CSV de Contactos;
- una Invitación y un Asistente principal por Contacto, con modos individual y familiar nominal;
- límites de Asistentes protegidos frente a concurrencia y pertenencia cruzada;
- tokens de Invitación y QR separados por propósito, firmados y no intercambiables;
- cancelación irreversible, idempotente y auditada;
- lectura pública mínima según estado del Evento, cancelación y borrado lógico;
- ownership operativo exacto y auditoría sin PII ni secretos;
- migración idempotente de Contactos existentes y anonimización de Asistentes a 30 días;
- constraints y triggers PostgreSQL para pertenencia, cardinalidad, principal e inmutabilidad.

`CODEX-051` quedó completamente cerrado.

El hardening final de `CODEX-051` agregó:

- configuración obligatoria, explícita y segura de tokens en producción;
- respuesta mínima e inmutable para cancelaciones, sin PII ni tokens;
- replay idempotente con ownership después de cambios de estado y soft delete;
- validación PostgreSQL del Cliente, rol, estado y ownership del actor de cancelación.

La siguiente tarea es `CODEX-060 — FileAssets y storage local`.

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
