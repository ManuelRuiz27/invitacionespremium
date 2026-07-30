# @invitaciones/client

Aplicación Cliente para Planner independiente, Admin de Organización y Planner de Organización.

## Rutas

- `/login`: acceso único y restauración de sesión;
- `/eventos`: dashboard autorizado de Eventos;
- `/eventos/nuevo`: creación diferida de un Evento;
- `/eventos/:eventId/configuracion/:step`: wizard reanudable con paso en la URL;
- `/finanzas`: balance, movimientos y comprobantes para roles financieros.

La sesión usa exclusivamente la cookie HttpOnly emitida por la API. No se persisten tokens, contraseñas
ni cookies en storage del navegador. Sus estados visibles son `loading`, `authenticated`, `anonymous`,
`forbidden` y `unavailable`.

Solo un `401` de `GET /auth/me` demuestra ausencia de sesión. Un error de red, `429`, `5xx`, una
respuesta inesperada o cualquier error que no demuestre ausencia muestra “No pudimos verificar tu
sesión” y permite reintentar exclusivamente `/auth/me`; no ejecuta logout ni redirige al formulario.
Un rol incompatible muestra acceso no permitido incluso si fue recibido en `/login`. Platform Admin se
redirige a `VITE_ADMIN_APP_URL` sin cerrar su sesión.

## Variables

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
VITE_ADMIN_APP_URL=http://localhost:5174
VITE_LANDING_URL=http://localhost:5176
```

Todas son obligatorias en producción. `VITE_SOCKET_URL` queda reservada para una integración posterior;
CODEX-120 no conecta Socket.IO.

CODEX-121 está implementado. El wizard deriva sus pasos del servicio, obtiene el estado desde la API,
guarda cambios en serie y usa llaves estables para CSV, pases y activación. Solo `DRAFT`, `CONFIGURED` y
`READY_TO_ACTIVATE` son editables. Véase `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`.

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
