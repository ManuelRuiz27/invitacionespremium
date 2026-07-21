# 08 — TRD

## Stack confirmado

### Monorepo

- pnpm workspaces;
- Turborepo;
- Node.js 22;
- TypeScript estricto;
- estructura definida en `MONOREPO_ARCHITECTURE.md`.

### Frontends

- React;
- Vite;
- Material UI;
- Vitest.

Aplica a `apps/client`, `apps/admin`, `apps/scanner`, `apps/landing` y `packages/ui`.

### Backend

- NestJS;
- PostgreSQL;
- Prisma;
- Socket.IO;
- REST + OpenAPI.

Vive en `apps/api`.

### Deploy

- Railway para API y PostgreSQL;
- Netlify para cada frontend;
- deploys independientes desde el mismo repositorio.

## Arquitectura

- backend concentra reglas, ownership, estados y persistencia;
- frontends no deciden permisos ni efectos financieros;
- SDK se genera desde OpenAPI en `packages/api-client`;
- Socket.IO notifica cambios persistidos;
- REST y base de datos son fuente de verdad;
- no crear microservicios adicionales en MVP.

## Auth

### Desarrollo temprano

- email/password;
- sesión/cookie;
- hash seguro;
- guards por rol y ownership.

### Producción

- Auth0;
- email/password y Google;
- login único con redirección;
- sin WhatsApp/SMS en MVP;
- Platform Admin no impersona Clientes.

## API

- prefijo `/api/v1`;
- OpenAPI disponible;
- errores de dominio estables;
- validación backend;
- idempotencia en operaciones críticas;
- SDK generado, no DTOs duplicados.

Operaciones transaccionales incluyen activación, movimientos financieros, check-in, PaseFisicoQR y transiciones.

## Base de datos

- UUID;
- enums controlados;
- JSON solo para metadata variable;
- soft delete en entidades principales;
- ledger y auditoría inmutables;
- constraints para concurrencia e idempotencia.

## Fecha y zona horaria

- timestamps técnicos en UTC;
- Evento conserva zona IANA;
- reglas se evalúan en zona del Evento;
- no asumir zona del servidor.

## Storage y archivos

Desarrollo usa storage local controlado por API. Producción usará S3 compatible privado y URLs firmadas cortas.

Todos los archivos obedecen `FILE_ASSET_POLICY.md`. Frontend no guarda directo, no decide `storage_key` y no recibe credenciales.

MVP temprano acepta JPG/PNG para Flyer, Flipbook y Croquis; rechaza PDF de usuario. Conversión PDF de una página queda para fase futura.

## QR

- generado en backend;
- SVG;
- token opaco;
- sin nombre/teléfono;
- QR de Invitación y PaseFisicoQR son propósitos distintos;
- protección contra doble uso.

## Reportes PDF

1. frontend solicita reporte;
2. API autoriza y entrega dataset/snapshot;
3. frontend renderiza HTML y exporta PDF;
4. frontend envía PDF al API con `report_id`;
5. API valida y almacena como FileAsset;
6. descarga posterior vuelve a autorizarse.

No incluir teléfonos. Reportes detallados con nombres se limitan a 30 días post-Evento; historial de seis meses conserva versiones agregadas/anónimas.

## Tiempo real

Canales:

- `event:{eventId}:dashboard`;
- `event:{eventId}:scanner`;
- `event:{eventId}:floorplan`.

Eventos autorizados se definen en `REALTIME_PAYLOADS.md`. No enviar teléfonos, nombres, finanzas ni tokens.

## Procesos programados

Dentro de módulos existentes:

- borrador vencido → soft delete;
- `active` → `event_day`;
- expiración de upgrade pendiente;
- expiración/archivo de Álbum;
- expiración de tokens;
- anonimización;
- reemplazo de reportes detallados;
- limpieza de bytes huérfanos;
- backups.

Deben ser idempotentes, observables y seguros ante ejecución duplicada.

## Testing

- API: unitarias, integración, concurrencia e invariantes;
- Client: wizard, Invitación, Confirmación, QR, Álbum y reportes;
- Admin: Clientes, finanzas, reportes y auditoría;
- Scanner: token, escaneo, check-in, cierre/cancelación;
- Landing: navegación, performance y accesibilidad;
- UI: componentes críticos y accesibilidad.

Vertical slice obligatorio:

`Evento → Contacto → Invitación → Confirmación → QR → Scanner → Check-in`.

## Logs y seguridad

- logs estructurados sin contraseñas, tokens completos ni teléfonos;
- CORS por ambiente;
- cookies seguras y estrategia CSRF;
- rate limiting;
- validación MIME y límites de upload;
- secretos solo en variables;
- autorización por recurso;
- backups y restauración probados.

## CI/CD

Raíz monorepo:

- format;
- lint;
- typecheck;
- tests;
- build.

Después se añaden validación Prisma, OpenAPI, integración y smoke tests. No desplegar si falla una verificación obligatoria.

## Ambientes

Local, staging y producción usan base de datos, storage, credenciales y orígenes separados. Nunca copiar datos reales a desarrollo sin anonimización.
