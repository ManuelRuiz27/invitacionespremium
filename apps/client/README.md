# @invitaciones/client

Aplicación Cliente para Planner independiente, Admin de Organización y Planner de Organización.

## Rutas

- `/invitacion/:invitationToken`: Invitación pública, Confirmación y QR;
- `/album/:albumToken`: Álbum postevento público elegible;
- `/login`: acceso único y restauración de sesión;
- `/eventos`: dashboard autorizado de Eventos;
- `/eventos/nuevo`: creación diferida de un Evento;
- `/eventos/:eventId/configuracion/:step`: wizard reanudable con paso en la URL;
- `/finanzas`: balance, movimientos y comprobantes para roles financieros.

### Demo local Flipbook Magazine

Para QA visual del renderer Flipbook sin backend:

```bash
pnpm --filter @invitaciones/client dev
```

Abrir:

```text
http://localhost:5173/demo/flipbook-magazine
```

Alias técnico:

```text
http://localhost:5173/__dev/flipbook-magazine
```

El fixture incluye seis páginas gráficas autocontenidas: portada, historia, RSVP/QR, ubicación, mesa de regalos/enlace y contraportada. Los assets se generan localmente como SVG Blob y no dependen de API, storage ni datos seed.

Estas rutas se habilitan en Vite DEV y también cuando un build/preview corre desde un hostname loopback (`localhost`, `127.0.0.1`, `0.0.0.0` o `::1`). No se registran como demo en un hostname de producción.

Si Vite informa que 5173 está ocupado y el usuario inicia un servidor que permite cambio automático de puerto, usar el puerto mostrado por la consola. Para una prueba determinista conviene cerrar el proceso que ocupa 5173 y levantar únicamente `@invitaciones/client`.

La sesión usa exclusivamente la cookie HttpOnly emitida por la API. No se persisten tokens, contraseñas
ni cookies en storage del navegador. Sus estados visibles son `loading`, `authenticated`, `anonymous`,
`forbidden` y `unavailable`.

Las dos rutas públicas son hermanas del árbol autenticado: no montan `AuthProvider`, `ClientShell` ni
guards, y no consultan sesión, Eventos o Finanzas. Sus tokens portadores permanecen en memoria, sus
requests usan `credentials: omit` y sus assets/SVG se liberan mediante `URL.revokeObjectURL`.
Cada ruta pública coordina lecturas y mutaciones por token y generación: al navegar, desmontar o
reintentar se aborta la operación anterior y una respuesta obsoleta no puede actualizar React. Las
mutaciones RSVP tienen protección síncrona contra doble envío. QR, Flyer, Flipbook y fotos ofrecen
reintento local sin recargar la ruta. El estado y el subárbol visual pertenecen expresamente al token:
una navegación pinta loading neutro antes de efectos y nunca reutiliza metadata, diálogos o assets del
recurso anterior. El Álbum conserva como máximo ocho Object URLs y cuatro descargas concurrentes; su
pool distingue `idle`, `loading`, `ready`, `error` y `evicted`, y prioriza preview, viewport y cercanía.
Los errores RSVP que invalidan la proyección resuelven nuevamente el token original y proyectan
autoritativamente Confirmación cerrada, cancelación, cierre o recurso no disponible.

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

CODEX-121 está implementado. El wizard separa cada dominio, excluye Contactos de `PHYSICAL_QR`, coordina
una sola creación en vuelo y usa llaves por intento solo mientras el resultado sea incierto. Incluye
editores visuales Flyer/Flipbook/Hotspots/Croquis, wall-clock IANA, pases por lotes y Revisión global.
Solo `DRAFT`, `CONFIGURED` y `READY_TO_ACTIVATE` son editables. Véase
`docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`.

CODEX-122 implementa Flyer/Flipbook, Hotspots HTTPS, Confirmación nominal, QR bajo demanda y galería de
Álbum, con aislamiento latest-wins y reduced motion real. Su contrato de privacidad, routing, errores y accesibilidad está en
`docs/04-tecnico/PUBLIC_CLIENT_CONTRACT.md`.

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
