# Contrato de la aplicacion Platform Admin

## Estado y alcance

CODEX-130 permanece **EN PROGRESO** y el corte CODEX-130A permanece pendiente de aceptacion. Este corte
entrega shell, sesion, Clientes, Eventos y finanzas por Cliente. `apps/admin` es exclusiva para una
identidad `PLATFORM_ADMIN` cuyo `clientId` es `null`; no representa ni impersona a un Cliente.

Quedan diferidos a cortes posteriores: servicios/precios/promociones, reportes, auditoria y
configuracion. Auditoria depende primero de endpoints publicados por OpenAPI. Tambien quedan fuera
Scanner, Landing, Socket.IO, refunds, reversals y acciones operativas de Planner.

## Sesion y autorizacion

La sesion usa `/auth/login`, `/auth/me` y `/auth/logout` con cookie HttpOnly. El frontend no crea ni
persiste tokens. Sus estados son `loading`, `authenticated`, `anonymous`, `forbidden` y `unavailable`.
Solo un `401` acredita ausencia de sesion; `403`, un rol Cliente o un Platform Admin con `clientId`
incompatible producen acceso denegado sin montar el shell ni solicitar `/admin/**`. Red, timeout,
`429`, `5xx` y respuestas inesperadas conservan un estado no verificable y nunca ejecutan logout.

El retorno posterior al login acepta solo rutas internas que comienzan en `/`, y rechaza URLs
externas, protocol-relative, backslashes y `/login`; conserva `pathname + search` y elimina el hash.
El logout explicito limpia toda la cache privada.

El `ApiClient` administrativo conecta el requester con un controlador estable de expiracion. Despues
de construir un `ApiError 401`, cada request autenticado notifica al controlador y vuelve a lanzar el
mismo error. El provider acepta la primera notificacion solo si la sesion ya esta autenticada: limpia la
cache de queries y el registro financiero efimero, elimina al usuario, desmonta el shell y navega una
sola vez a login. No llama `/auth/logout`. Los `401` de login y de la restauracion inicial conservan sus
flujos propios; `403`, `429`, `5xx`, red, abortos y respuestas inesperadas no disparan la transicion.
Los requests publicos con `credentials: omit` no notifican al controlador.

## Navegacion y propiedad de datos

Rutas: `/login`, `/`, `/clientes`, `/clientes/:clientId`, `/eventos` y `/eventos/:eventId`. El shell
muestra solamente Resumen, Clientes y Eventos. Cada detalle usa una query key ligada al parametro de
URL; las respuestas obsoletas son abortables y no se muestran bajo otro Cliente o Evento.

Las mutaciones usan un scope reutilizable con tipo e identificador de entidad, generacion,
`AbortController` y estado de montaje. Cambiar `clientId`, `eventId` o desmontar aborta el request y hace
invalido todo callback posterior. Antes de mostrar mensajes, cerrar dialogos o invalidar queries se
comprueba que el scope siga vigente. Cada accion sensible obtiene ademas un lock sincrono previo a
`mutate()`, por lo que dos clics antes del siguiente render producen un solo request. No hay estado
optimista.

TanStack Query opera exclusivamente en memoria con las claves `admin-session`, `admin-clients`,
`admin-client/:id`, `admin-client-users/:id`, `admin-events`, `admin-event/:id` y
`admin-client-finance/:id`. No existe persistencia de cache.

## SDK y endpoints

`packages/api-client` deriva tipos de `generated/schema.ts` y expone:

- `adminClients`: listado/detalle, creacion de Organizacion, edicion, suspension, restauracion y usuarios;
- `adminEvents`: listado global, detalle y restauracion;
- `adminFinance`: balance, asignacion gratuita, linea, pago manual y reconstruccion.

Se consumen exclusivamente estas rutas:

```text
GET/PATCH/POST /admin/clients/**
GET/POST       /admin/events/**
GET/POST       /admin/finance/clients/**
```

Los wrappers codifican segmentos, propagan `AbortSignal`, usan el requester con cookies y validan una
forma minima de cada respuesta. El OpenAPI actual no define query params ni metadata de paginacion en
los listados administrativos; por ello la UI identifica la coleccion visible como la respuesta completa
del contrato y no ofrece busqueda, filtros o paginacion locales que aparenten cobertura global.

## Operaciones

El dashboard se construye solo con `GET /admin/clients` y `GET /admin/events`; no inventa tendencias.
Clientes permite los campos de sus DTO generados, crea Organizaciones con su Admin, crea planners
internos solo para Organizaciones y nunca cambia roles a Platform Admin. Eventos es global y de solo
lectura; restaurar aparece solo con `deletedAt` y no altera el estado de negocio.

Finanzas presenta el balance autoritativo: creditos comprados, linea, deuda en creditos y MXN, secuencia
y reconciliacion. Los centavos se construyen con parsing decimal exacto y se presentan con `Intl`.
Asignacion gratuita, linea, pago manual y reconstruccion requieren dialogo y confirmacion; no hay saldo
optimista. La reconstruccion modifica solo el cache desde el ledger.

## Idempotencia y errores

Cada intencion financiera genera una llave en memoria. Un bloqueo sincrono impide doble submit. Red,
`429`, `5xx` o un aborto local posterior al inicio conservan en un registro efimero el `clientId`, accion,
fingerprint del payload, llave y estado `uncertain`. El registro esta aislado por Cliente, nunca se
persiste ni muestra la llave completa, y sobrevive a la navegacion dentro de la sesion. Al volver al
mismo Cliente se consulta el balance autoritativo y el Admin puede reintentar exactamente la misma
intencion con la misma llave o descartarla de forma explicita. Un payload materialmente distinto genera
otra llave; un exito autoritativo elimina la intencion. Un `401` tiene prioridad y vacia el registro junto
con el resto de datos privados. No hay retry automatico ni actualizacion optimista del balance.

La UI traduce los codigos de autorizacion, Cliente, usuario, Evento, balance, idempotencia, validacion y
respuesta inesperada. Puede mostrar `operationId`, pero no payloads, stack, secretos o detalles Prisma.
