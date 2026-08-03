# @invitaciones/admin

Aplicacion operativa exclusiva para `PLATFORM_ADMIN`. El corte CODEX-130A incluye sesion por cookie
HttpOnly, shell responsive, dashboard, Clientes y usuarios, Eventos globales de solo lectura y finanzas
por Cliente.

## Desarrollo

Configura `VITE_API_BASE_URL`; en desarrollo local se admite el valor normalizado por defecto. La app no
guarda tokens, llaves idempotentes ni respuestas privadas en Web Storage.

```bash
pnpm --filter @invitaciones/admin dev
pnpm --filter @invitaciones/admin test
pnpm --filter @invitaciones/admin typecheck
pnpm --filter @invitaciones/admin build
```

Rutas: `/login`, `/`, `/clientes`, `/clientes/:clientId`, `/eventos` y `/eventos/:eventId`.

Servicios/precios/promociones, reportes, auditoria y configuracion pertenecen a cortes posteriores de
CODEX-130. No hay impersonacion ni acciones operativas de Cliente.
