# Matriz de acceso y ownership

## Objetivo

Convertir `03_ROLES_PERMISOS_ACCESO.md` en reglas verificables por guards, policies, controllers y pruebas.

Este documento no crea roles nuevos.

## Actores

- **Platform Admin**
- **Planner independiente**
- **Admin de Organización**
- **Planner de Organización**
- **Staff por token**
- **Público por token de Invitación o Álbum**

## Leyenda

- `Sí`: permitido.
- `Propio`: permitido solo para recursos del Cliente o usuario autorizado.
- `Organización`: permitido para recursos pertenecientes a la Organización.
- `Creados`: permitido solo para Eventos creados por ese Planner de Organización.
- `Lectura`: consulta sin modificación operativa.
- `Token`: permitido únicamente con token válido y vigente.
- `No`: prohibido.
- `No aplica`: el actor todavía no existe o la capacidad no corresponde a ese rol.

## Reglas de ownership

### Planner independiente

Puede operar únicamente recursos cuyo `client_id` corresponda a su propio Cliente Planner.

### Admin de Organización

Puede operar recursos cuyo `client_id` corresponda a su Organización, sin importar qué usuario interno creó el Evento.

### Planner de Organización

Puede operar únicamente Eventos:

- pertenecientes a su Organización; y
- creados por su propio `user_id`.

No puede ampliar su alcance manipulando `client_id`, `created_by` o identificadores recibidos desde frontend.

### Platform Admin

Puede consultar Clientes, Eventos, finanzas, reportes y auditoría de toda la plataforma.

No impersona al Cliente y no usa los endpoints operativos del Planner como si fuera el Cliente. Las modificaciones globales deben existir como acciones administrativas explícitas.

### Staff por token

Su alcance está limitado al `event_id` asociado al token. El token nunca concede acceso a otros Eventos del mismo Cliente.

Solo puede operar cuando el Evento está en `active` o `event_day`. Los tokens expirados por cierre o cancelación permanecen expirados.

### Público

Su alcance está limitado al recurso identificado por un token público válido y no adivinable.

Los tokens públicos tienen propósitos separados:

- token de Invitación;
- token de Álbum;
- token QR contenido dentro del QR;
- token Staff.

Un token no puede reutilizarse como otro tipo de acceso.

## Matriz general por capacidad

| Capacidad | Platform Admin | Planner independiente | Admin Organización | Planner Organización | Staff token | Público |
|---|---|---|---|---|---|---|
| Registrarse como Planner | No | No aplica | No | No | No | Sí, mediante landing |
| Crear Organización | Sí | No | No | No | No | No |
| Editar datos del Cliente | Sí, acción admin | Propio | Organización | No | No | No |
| Suspender/restaurar Cliente | Sí | No | No | No | No | No |
| Crear usuario interno Planner | Sí | No | Organización | No | No | No |
| Ver saldo comprado | Sí | Propio | Organización | No | No | No |
| Ver deuda/línea | Sí | Propio si existe | Organización | No | No | No |
| Comprar créditos | No como Cliente; administra integración | Propio | Organización | No | No | No |
| Asignar créditos manualmente | Sí | No | No | No | No | No |
| Asignar línea de crédito | Sí | No | No | No | No | No |
| Registrar pago manual | Sí | No | No | No | No | No |
| Gestionar precios/promociones | Sí | No | No | No | No | No |
| Crear Evento | No por operación cliente | Propio | Organización | Organización/Creados | No | No |
| Ver Evento | Lectura global | Propio | Organización | Creados | Token, datos operativos mínimos | Token público, vista limitada |
| Editar Evento | No por operación cliente | Propio | Organización | Creados | No | No |
| Activar Evento | No por operación cliente | Propio | Organización | Creados | No | No |
| Cerrar/reabrir Evento | No por operación cliente | Propio | Organización | Creados | No | No |
| Cancelar/archivar Evento | No por operación cliente | Propio | Organización | Creados | No | No |
| Restaurar Evento con borrado lógico | Sí | No | No | No | No | No |
| Gestionar Contactos/Invitaciones | Lectura administrativa si aplica | Propio | Organización | Creados | No | Token limitado a su Invitación |
| Gestionar diseño Flyer/Flipbook | No por operación cliente | Propio | Organización | Creados | No | Solo lectura pública renderizada |
| Gestionar Confirmación de asistencia | No por operación cliente | Propio | Organización | Creados | No | Token de Invitación |
| Gestionar croquis/mesas | No por operación cliente | Propio | Organización | Creados | Solo lectura operativa | No |
| Crear tokens staff | No por operación cliente | Propio | Organización | Creados | No | No |
| Escanear QR y registrar entrada | No | No | No desde panel; usa token Staff si participa | No desde panel; usa token Staff si participa | Token | No |
| Revertir check-in | No por operación cliente | Propio | Organización | Creados | No | No |
| Generar pases físicos | No por operación cliente | Propio | Organización | Creados | No | No |
| Gestionar álbum | No por operación cliente | Propio | Organización | Creados | No | Token de Álbum, lectura |
| Generar reportes operativos | Lectura global/admin | Propio | Organización | Creados | No | No |
| Ver reportes financieros | Sí | Propio | Organización | No | No | No |
| Ver auditoría global | Sí | No | No | No | No | No |
| Usar demo | Lectura administrativa si aplica | Sí | Sí | Sí | No | Landing: mock visual |

## Matriz de endpoints conceptuales

### Auth y Clientes

| Endpoint | Platform Admin | Planner independiente | Admin Organización | Planner Organización | Staff/Público |
|---|---|---|---|---|---|
| `POST /clients/register-planner` | No | No aplica | No | No | Público |
| `GET /clients` | Sí | No | No | No | No |
| `GET /clients/:clientId` | Sí | Propio | Organización | No | No |
| `PATCH /clients/:clientId` | Sí, acción admin | Propio | Organización | No | No |
| `POST /clients/:clientId/suspend` | Sí | No | No | No | No |
| `POST /clients/:clientId/restore` | Sí | No | No | No | No |
| `GET /clients/:clientId/users` | Sí | No | Organización | No | No |
| `POST /clients/:clientId/users/planner` | Sí | No | Organización | No | No |
| `PATCH /clients/:clientId/users/:userId` | Sí | No | Organización | No | No |

### Finanzas

| Endpoint | Platform Admin | Planner independiente | Admin Organización | Planner Organización | Staff/Público |
|---|---|---|---|---|---|
| `GET /finance/balance` | No | Propio | Organización | No | No |
| `GET /finance/movements` | No | Propio | Organización | No | No |
| `GET /finance/receipts` | No | Propio | Organización | No | No |
| `POST /finance/buy-credits-request` | No | Propio | Organización | No | No |
| `/admin/finance/**` | Sí | No | No | No | No |
| `/admin/prices/**` | Sí | No | No | No | No |
| `/admin/promotions/**` | Sí | No | No | No | No |

### Eventos y recursos hijos

| Endpoint o grupo | Platform Admin | Planner independiente | Admin Organización | Planner Organización | Staff/Público |
|---|---|---|---|---|---|
| `GET /events` | No; usa ruta administrativa | Propio | Organización | Creados | No |
| `POST /events` | No | Propio | Organización | Organización/Creados | No |
| `GET /events/:eventId` | No; usa ruta administrativa | Propio | Organización | Creados | No |
| `PATCH /events/:eventId` | No | Propio | Organización | Creados | No |
| `POST /events/:eventId/activate` | No | Propio | Organización | Creados | No |
| `POST /events/:eventId/close` | No | Propio | Organización | Creados | No |
| `POST /events/:eventId/reopen` | No | Propio | Organización | Creados | No |
| `POST /events/:eventId/archive` | No | Propio | Organización | Creados | No |
| `POST /events/:eventId/cancel` | No | Propio | Organización | Creados | No |
| `DELETE /events/:eventId` | No | Propio | Organización | Creados | No |
| `POST /events/:eventId/change-service` | No | Propio | Organización | Creados | No |
| `GET /admin/events` | Lectura global | No | No | No | No |
| `GET /admin/events/:eventId` | Lectura global | No | No | No | No |
| `/events/:eventId/contacts/**` | Lectura admin mediante contexto explícito si aplica | Propio | Organización | Creados | No |
| `/events/:eventId/invitations/**` | Lectura admin mediante contexto explícito si aplica | Propio | Organización | Creados | No |
| `/events/:eventId/design/**` | No | Propio | Organización | Creados | No |
| `/events/:eventId/hotspots/**` | No | Propio | Organización | Creados | No |
| `/events/:eventId/floorplan/**` | Lectura admin si aplica | Propio | Organización | Creados | Staff solo por endpoint scanner |
| `/events/:eventId/seating/**` | No | Propio | Organización | Creados | No |
| `/events/:eventId/staff-tokens/**` | Lectura admin si aplica | Propio | Organización | Creados | No |
| `/events/:eventId/physical-passes/**` | Lectura admin si aplica | Propio | Organización | Creados | Staff escanea por endpoint scanner |
| `/events/:eventId/album/**` | Lectura admin si aplica | Propio | Organización | Creados | Público solo por token de Álbum separado |
| `/events/:eventId/reports/**` | Lectura global/admin | Propio | Organización | Creados | No |
| `/admin/reports/**` | Sí | No | No | No | No |

### Público y Scanner

| Endpoint | Regla de acceso |
|---|---|
| `GET /public/invitations/:token` | Token de Invitación válido. `active`, `event_day`, `closed` y `album_published` muestran la vista correspondiente; `cancelled` muestra únicamente el mensaje de cancelación; `archived` o borrado lógico ocultan el acceso. |
| `POST /public/invitations/:token/confirm` | Token válido, Evento `active` o `event_day`, Confirmación abierta, cupo y límites de Invitación. |
| `POST /public/invitations/:token/reject` | Token válido, Evento `active` o `event_day` y Confirmación abierta. |
| `PATCH /public/invitations/:token/assistants` | Token válido, Evento `active` o `event_day`, Confirmación abierta y límites permitidos. |
| `GET /public/invitations/:token/qr` | Token válido, Evento `active` o `event_day` e Invitación confirmada. |
| `GET /public/albums/:albumToken` | Token de Álbum separado, Evento `album_published`, token no expirado e Invitación asociada con al menos un Asistente ingresado. |
| `GET /scanner/:staffToken/session` | Token Staff válido y Evento `active` o `event_day`. |
| `POST /scanner/:staffToken/scan` | Token válido, Evento `active` o `event_day` y QR perteneciente al mismo Evento. |
| `POST /scanner/:staffToken/search` | Token válido, Evento `active` o `event_day` y coincidencia exacta dentro del mismo Evento. |
| `POST /scanner/:staffToken/check-in` | Token válido, Evento `active` o `event_day` y Asistente pendiente. |
| `GET /scanner/:staffToken/floorplan` | Token válido, Evento `active` o `event_day` y croquis perteneciente al mismo Evento. |
| `POST /scanner/:staffToken/physical-passes/scan` | Token válido, Evento `active` o `event_day`, pase del mismo Evento y pase no utilizado. |

## Respuesta ante acceso no permitido

- Recurso fuera del ownership autenticado: responder `404` o política equivalente que no revele existencia.
- Rol sin capacidad: responder `403`.
- Sesión o token inválido/expirado: responder `401`.
- Estado del Evento incompatible: responder error de dominio `409`.

## Reglas de implementación

1. No confiar en IDs enviados por frontend para determinar ownership.
2. Resolver `client_id`, `organization_id`, `created_by` y `event_id` desde base de datos.
3. Aplicar guards globales y policies por recurso.
4. Probar cada endpoint con casos permitidos y denegados.
5. Staff y Público usan guards separados de la sesión de usuarios.
6. Nunca devolver teléfonos a Staff ni por Socket.IO.
7. Platform Admin no debe reutilizar la sesión de un Cliente ni impersonarlo.
8. El máximo de Staff es tres tokens activos por Evento; tokens expirados no cuentan como activos.
9. Los tokens de Invitación, Álbum, QR y Staff deben ser distintos y no intercambiables.