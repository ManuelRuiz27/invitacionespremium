# @invitaciones/client

Aplicación Cliente para Planner independiente, Admin de Organización y Planner de Organización.

## Rutas

- `/login`: acceso único y restauración de sesión;
- `/eventos`: dashboard autorizado de Eventos;
- `/finanzas`: balance, movimientos y comprobantes para roles financieros.

La sesión usa exclusivamente la cookie HttpOnly emitida por la API. No se persisten tokens, contraseñas
ni cookies en storage del navegador. Platform Admin se redirige a `VITE_ADMIN_APP_URL`.

## Variables

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
VITE_ADMIN_APP_URL=http://localhost:5174
VITE_LANDING_URL=http://localhost:5176
```

Todas son obligatorias en producción. `VITE_SOCKET_URL` queda reservada para una integración posterior;
CODEX-120 no conecta Socket.IO.

## Comandos

```bash
pnpm --filter @invitaciones/client dev
pnpm --filter @invitaciones/client lint
pnpm --filter @invitaciones/client typecheck
pnpm --filter @invitaciones/client test
pnpm --filter @invitaciones/client build
```

El frontend proyecta contratos autorizados; ownership, estados, balances y deuda siguen siendo
responsabilidad de la API.
