# Contrato de la aplicación Cliente

## Alcance

`apps/client` contiene la aplicación autenticada de:

- Planner independiente;
- Admin de Organización;
- Planner de Organización.

CODEX-120 implementa shell, sesión, navegación, dashboard de Eventos y consulta financiera. CODEX-121
agrega el wizard y CODEX-122 agrega dos experiencias públicas aisladas. Scanner, Platform Admin y
Socket.IO frontend permanecen fuera de alcance.

## Cliente API

`packages/api-client` se genera desde el OpenAPI producido por `apps/api`:

```text
API OpenAPI → openapi-typescript → src/generated/schema.ts → wrappers de runtime
```

Los tipos generados son la única definición frontend de DTOs. Los wrappers implementados cubren:

- `POST /auth/login`;
- `POST /auth/logout`;
- `GET /auth/me`;
- `GET /events`;
- `GET /events/:eventId`;
- `GET /finance/balance`;
- `GET /finance/movements`;
- `GET /finance/receipts`.

Los requests autenticados usan `credentials: include`; los públicos usan `credentials: omit`. Todos
aceptan `AbortSignal` y traducen el error uniforme a
`ApiError { status, code, message, operationId? }`. Una respuesta exitosa vacía, no JSON o incompatible
se rechaza como `UNEXPECTED_API_RESPONSE`. El JSON OpenAPI no se incluye en el build productivo.

Generación y drift:

```bash
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate
pnpm --filter @invitaciones/api-client generate:check
```

CI regenera el SDK y comprueba que `generated/schema.ts` no cambie respecto del commit.

Las operaciones públicas usan un scope por token y generación. Cada lectura o mutación conserva su
`AbortController`; cambiar de token, repetir o desmontar invalida la generación, aborta lo anterior y
descarta cualquier resolución tardía. Los validadores públicos comprueban la forma mínima discriminada
antes de entregar un `200` a React. Además, cada estado cargado conserva su token propietario y el
subárbol público se remonta con ese token: durante la navegación se muestra loading neutro sin esperar a
un efecto y no se renderiza metadata, diálogo o asset del recurso anterior.

## Sesión

La credencial es exclusivamente la cookie HttpOnly emitida por AuthModule. La app nunca almacena cookie,
session token, contraseña o bearer token en localStorage, sessionStorage, IndexedDB, estado persistido o
logs.

Al iniciar se ejecuta `GET /auth/me` y la sesión adopta uno de estos estados:

- `loading`;
- `authenticated`;
- `anonymous`;
- `forbidden`;
- `unavailable`.

La restauración inicial y el reintento manual comparten `restoreSession()` y propagan un `AbortSignal`.
Una respuesta abortada al desmontar no modifica el estado. No existen reintentos automáticos.

| Resultado de `GET /auth/me` | Estado o efecto |
| --- | --- |
| `200` con rol Cliente compatible | `authenticated` |
| `200` con `PLATFORM_ADMIN` | redirección externa a Admin |
| `200` con rol incompatible | logout best-effort, limpieza de cache y `forbidden` |
| `401` | limpieza de cache y `anonymous` |
| `403` | `forbidden` |
| error de red, `429`, `5xx` o `UNEXPECTED_API_RESPONSE` | `unavailable` |
| otro error que no demuestre ausencia de sesión | `unavailable` |

`unavailable` muestra una pantalla sin campos de credenciales, con el mensaje “No pudimos verificar tu
sesión” y la acción `Reintentar`. Esa acción vuelve a ejecutar únicamente `GET /auth/me`. Una falla de
infraestructura no ejecuta logout, no elimina la cookie, no limpia Query Cache, no monta rutas privadas y
no redirige a `/login`.

Login muestra un error no enumerante: `Correo o contraseña incorrectos.` Logout revoca la sesión, limpia
TanStack Query y el usuario en memoria, y redirige a `/login`.

Solo un `401` durante una consulta autenticada se clasifica como sesión expirada: limpia sesión/caché y
conserva un `returnTo` interno. Errores de red, `5xx` y payloads inválidos permanecen en Dashboard o
Finanzas con su estado de error y acción de reintento. Se rechazan URLs absolutas, protocol-relative, con
backslash o de otro origen para evitar redirecciones abiertas y ciclos.

## Roles y rutas

| Ruta | Planner independiente | Admin Organización | Planner Organización | Platform Admin |
| --- | --- | --- | --- | --- |
| `/login` | Sí | Sí | Sí | redirección Admin |
| `/eventos` | propio | Organización | creados | no |
| `/finanzas` | propio | Organización | no | no |

La API conserva la autorización final. Platform Admin se redirige a `VITE_ADMIN_APP_URL` tanto desde
restauración como desde login, sin cerrar su sesión y sin montar login, acceso no permitido o dashboard
Cliente. Un rol incompatible recibido desde cualquiera de esos dos flujos ejecuta logout best-effort,
limpia la cache y muestra acceso no permitido, incluso en `/login`.

La arquitectura mantiene `/invitacion/:invitationToken`, `/album/:albumToken` y el 404 público fuera de
`AuthProvider`. `/login` queda dentro de sesión pero fuera de `ProtectedRoute`; `/` redirige a
`/eventos` únicamente después de pasar los guards privados.

## Navegación y shell

Desktop/tablet usan sidebar persistente. Móvil usa AppBar y Drawer temporal. El shell muestra
`InvitacionesPremium`, correo, rol y logout. La navegación agrega `aria-current`, conserva foco visible,
usa targets táctiles suficientes y evita scroll horizontal.

Planner de Organización solo recibe navegación Eventos. La ruta Finanzas queda protegida antes de montar
sus componentes, de modo que ese rol ejecuta cero requests financieros.

## Dashboard de Eventos

`GET /events` ya devuelve el alcance autorizado. El frontend no filtra permisos y no muestra IDs,
ownership, claves de idempotencia ni referencias financieras.

Indicadores derivados de la respuesta:

- En preparación: `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE`;
- Activos: `ACTIVE`, `EVENT_DAY`;
- Finalizados: `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED`;
- `CANCELLED` no cuenta como finalizado.

La lista usa tabla desde desktop y cards en móvil. Ofrece filtros locales, búsqueda por nombre y panel de
resumen de solo lectura. No crea ni modifica Eventos.

Estados visibles:

| Estado API | Texto |
| --- | --- |
| `DRAFT`, `CONFIGURED` | En preparación |
| `READY_TO_ACTIVATE` | Listo para activar |
| `ACTIVE` | Activo |
| `EVENT_DAY` | Día del evento |
| `CLOSED` | Cerrado |
| `ALBUM_PUBLISHED` | Álbum publicado |
| `ARCHIVED` | Archivado |
| `CANCELLED` | Cancelado |

Tipos sociales: Boda, XV años, Corporativo, Cumpleaños y Otro. Las fechas usan `es-MX` y
`Event.timeZone`; si fecha o zona están pendientes no se reinterpreta el instante.

## Finanzas

Solo Planner independiente y Admin de Organización consultan en paralelo:

```http
GET /finance/balance
GET /finance/movements?limit=20
GET /finance/receipts?limit=20
```

La vista muestra saldo comprado, deuda en créditos/MXN, línea disponible/utilizada, movimientos y
comprobantes. Créditos se presentan como enteros y MXN se deriva únicamente de centavos recibidos. No se
recalcula deuda ni se ofrecen mutaciones.

Alertas permitidas:

- deuda mayor a cero;
- línea suspendida;
- línea expirada;
- saldo comprado cero.

No existe umbral inventado de saldo bajo.

## Estados, errores y accesibilidad

Dashboard y Finanzas contemplan carga, vacío, éxito, error, conectividad, `401`, `403` y reintento seguro.
`operationId` puede mostrarse como referencia secundaria, nunca como mensaje principal.

La aplicación usa landmarks, headings jerárquicos, labels asociados, navegación por teclado, foco
visible, `aria-current`, menús/drawers administrados por MUI y textos que no dependen solo del color.
El tema respeta `prefers-reduced-motion`.

## Variables

```text
VITE_API_BASE_URL
VITE_SOCKET_URL
VITE_ADMIN_APP_URL
VITE_LANDING_URL
```

Son obligatorias y se validan en producción. Los defaults documentados solo aplican al desarrollo local.
CODEX-120 conserva `VITE_SOCKET_URL`, pero no inicia la integración de tiempo real.

CODEX-121 quedó implementado conforme a `EVENT_WIZARD_CONTRACT.md`. El shell incorpora las rutas
`/eventos/nuevo` y `/eventos/:eventId/configuracion/:step`; su dashboard lleva `DRAFT`/`CONFIGURED` a
Datos, `READY_TO_ACTIVATE` a Revisión y estados posteriores al resumen. La creación concurrente comparte
una promesa; las llaves existen solo durante intentos no resueltos. `PHYSICAL_QR` no monta ni consulta
módulos digitales y Planner de Organización no consulta Finanzas.

CODEX-122 quedó implementado conforme a `PUBLIC_CLIENT_CONTRACT.md`: rutas públicas fuera de sesión,
tokens no persistidos, requester sin cookies, RSVP nominal, QR bajo demanda, operaciones latest-wins,
assets reintentables, transiciones RSVP autoritativas y pool de fotos con URLs/cargas concurrentes
acotadas, prioridad visible y expulsión sin falso error.
