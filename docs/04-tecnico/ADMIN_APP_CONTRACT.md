# Contrato de la aplicacion Platform Admin

## Estado y alcance

CODEX-130 permanece **EN PROGRESO**. El corte CODEX-130A entrega shell, sesion, Clientes, Eventos y
finanzas por Cliente. `apps/admin` es exclusiva para una identidad `PLATFORM_ADMIN` cuyo `clientId` es
`null`; no representa ni impersona a un Cliente.

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
externas, protocol-relative, backslashes y `/login`. El logout explicito limpia toda la cache privada.

## Navegacion y propiedad de datos

Rutas: `/login`, `/`, `/clientes`, `/clientes/:clientId`, `/eventos` y `/eventos/:eventId`. El shell
muestra solamente Resumen, Clientes y Eventos. Cada detalle usa una query key ligada al parametro de
URL; las respuestas obsoletas son abortables y no se muestran bajo otro Cliente o Evento.

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
`429` o `5xx` conservan la misma llave para reintentar el mismo payload; un cambio material de payload o
un exito confirmado genera otra. Tras cada resultado se vuelve a consultar el balance cuando es seguro.
Las llaves nunca se almacenan ni se imprimen.

La UI traduce los codigos de autorizacion, Cliente, usuario, Evento, balance, idempotencia, validacion y
respuesta inesperada. Puede mostrar `operationId`, pero no payloads, stack, secretos o detalles Prisma.
