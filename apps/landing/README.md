# @invitaciones/landing

Landing pública de InvitacionesPremium. `CODEX-132` está implementado y pendiente de aceptación; no
contiene reglas de negocio ni duplica contratos del API.

## Estructura

- `src/config/landing-config.ts`: punto público único para identidad, contenido comercial, servicios,
  precios, límites, FAQ, URLs y SEO.
- `src/components/`: secciones visuales, demo mock y modal de registro.
- `src/registration-client.ts`: adaptación mínima del wrapper público de `@invitaciones/api-client`.
- `src/app-metadata.ts`: tags URL opcionales para el build.
- `public/`: favicon y preview Open Graph.

El demo y el modal se cargan con imports dinámicos. El demo no usa backend, no crea Eventos, no consume
créditos y no genera accesos reales.

## Variables de entorno

| Variable              | Uso                                                                                |
| --------------------- | ---------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`   | Base del API que contiene `/api/v1`; obligatoria en producción para registrar.     |
| `VITE_CLIENT_APP_URL` | Base HTTP/HTTPS del panel Cliente para `/login`; obligatoria en producción.         |
| `VITE_APP_URL`        | URL pública de la Landing para canonical, `og:url` y `og:image`; opcional.          |
| `VITE_SOCKET_URL`     | Compatibilidad del entorno; la Landing y su demo no usan Socket.IO.                |

Los fallbacks `localhost` existen solo en desarrollo. Producción rechaza URLs locales, credenciales,
query, fragmentos y esquemas distintos de HTTP/HTTPS. Si `VITE_APP_URL` falta o es inválida, el build
omite canonical, `og:url` y `og:image` en vez de publicar localhost.

## Registro público

Solo registra Planner independiente mediante `POST /api/v1/clients/register-planner`. El SDK usa
`operations['ClientsController_registerPlanner']` y
`components['schemas']['RegisterPlannerRequestDto']`, `credentials: omit`, `AbortSignal` y validación
de la respuesta exitosa. Errores JSON/no JSON se convierten a `ApiError`; React traduce validación,
conflicto, rate limit, indisponibilidad, red y respuesta inesperada sin mostrar mensajes técnicos.

El modal mantiene un lock síncrono y una generación propietaria por intento. Cerrar o desmontar aborta
la request; una respuesta tardía no puede afectar una apertura posterior. Nombre, correo, contraseña,
errores y respuesta viven solo en memoria. La contraseña se limpia al cerrar, completar o desmontar.

El alta crea la cuenta; el onboarding restante ocurre después del login. La confirmación visible es:
“Tu cuenta fue creada. Inicia sesión para continuar con la configuración de tu perfil.”

## Desarrollo y validación

```bash
pnpm --filter @invitaciones/landing dev
pnpm --filter @invitaciones/landing test
pnpm --filter @invitaciones/landing typecheck
pnpm --filter @invitaciones/landing build
```
