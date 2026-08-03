# Contrato de la aplicacion Platform Admin

## Estado y alcance

CODEX-130 permanece **EN PROGRESO**. CODEX-130A esta aceptado y CODEX-130B esta implementado, pendiente
de aceptacion. Los cortes entregan shell, sesion, Clientes, Eventos, finanzas por Cliente, Catalogo,
cortes financieros y metadata de reportes. `apps/admin` es exclusiva para una
identidad `PLATFORM_ADMIN` cuyo `clientId` es `null`; no representa ni impersona a un Cliente.

Quedan diferidos a cortes posteriores: auditoria y configuracion. Auditoria depende primero de
endpoints publicados por OpenAPI. Tambien quedan fuera
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

Rutas: `/login`, `/`, `/clientes`, `/clientes/:clientId`, `/eventos`, `/eventos/:eventId`, `/catalogo`,
`/reportes` y `/reportes/eventos/:eventId`. El shell muestra Resumen, Clientes, Eventos, Catalogo y
Reportes. Cada detalle usa una query key ligada al parametro de
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
- `adminCatalog`: creacion/estado de Servicio, lista/creacion/cierre de precios y gestion de promociones;
- `adminReports`: listados global y por Evento de metadata;
- `adminFinance`: tambien cortes diarios y mensuales sin parametros no publicados.

Se consumen exclusivamente estas rutas:

```text
GET/PATCH/POST /admin/clients/**
GET/POST       /admin/events/**
GET/POST       /admin/finance/clients/**
POST/PATCH     /admin/services/**
GET/POST/PATCH /admin/prices/**
GET/POST/PATCH /admin/promotions/**
GET            /admin/finance/cuts/daily|monthly
GET            /admin/reports y /admin/reports/events/:eventId
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

Catalogo no consume el endpoint Cliente `/services`. Como OpenAPI no publica `GET /admin/services`, la
vista Servicios referenciados se deriva y deduplica exclusivamente desde referencias autoritativas de
precios y respuestas de mutacion; nunca se presenta como listado completo. La coleccion vive en memoria
en el limite de `AdminCatalogPage`, sobrevive cambios de pestana y habilita el primer Precio y Promocion
de un Servicio creado. Un reload pierde Servicios sin Precio porque no hay endpoint para reconstruirlos.
Crear Servicio usa el enum cerrado y actualizar solo cambia `isActive` con un UUID recibido del API. Si
una referencia de Precio no expone estado, la UI no preselecciona ninguno y exige una decision explicita.

El historial de precios es inmutable: una fila existente solo puede cerrar su intervalo `[validFrom,
validUntil)`. Una nueva vigencia crea otra fila, exige creditos enteros no negativos y Demo igual a
cero. La UI evita solapamientos aparentes, pero PostgreSQL/API conservan la autoridad final.

Las promociones modelan solo elegibilidad, vigencia y acumulacion. No contienen porcentaje, monto,
bonos, cupones o formulas economicas. Sus intervalos se validan localmente y los objetivos usan nombres
obtenidos por rutas Admin, dejando UUID como referencia secundaria. La conversion ISO a `datetime-local`
usa componentes locales con segundos y el envio inverso conserva el instante. Los cortes diario y mensual muestran exactamente
`FinanceCutResponseDto` sin recalcular ni sumar totales. Los listados Admin de reportes muestran solo
`AdminReportListItemDto`: no hay dataset, nombres, PDF, descarga, hash completo o storage.

## Idempotencia y errores

Cada intencion financiera genera una llave en memoria. Un bloqueo sincrono impide doble submit. Red,
`429`, `5xx` o un aborto local posterior al inicio conservan en un registro efimero el `clientId`, accion,
fingerprint del payload, llave y estado `uncertain`. El registro esta aislado por Cliente, nunca se
persiste ni muestra la llave completa, y sobrevive a la navegacion dentro de la sesion. Al volver al
mismo Cliente se consulta el balance autoritativo y el Admin puede reintentar exactamente la misma
intencion con la misma llave o descartarla de forma explicita.

El registro es la unica fuente de verdad de llaves retenidas: el hook local solo bloquea el request en
vuelo. Un retry inmediato obtiene la llave por `clientId + fingerprint`; el retry de la alerta usa el
`body`, fingerprint y llave almacenados, sin reconstruir el payload desde campos del formulario. Un
segundo resultado incierto reemplaza la misma entrada y conserva la llave. Un payload materialmente
distinto genera otra llave. El exito o el descarte eliminan la entrada y liberan la llave, de modo que una
captura posterior identica crea una llave nueva. Cerrar una operacion exitosa, descartada o cancelada
antes de enviar desmonta su dialogo y limpia el borrador; cerrar una operacion incierta conserva el
payload necesario dentro del registro.

Descartar no llama al backend, no modifica el balance y solo afecta la entrada del Cliente seleccionado.
Un `401`, logout o cambio de sesion vacia el registro completo junto con el resto de datos privados. No
hay retry automatico, Web Storage, cookies, parametros URL ni actualizacion optimista del balance.

La UI traduce los codigos de autorizacion, Cliente, usuario, Evento, balance, idempotencia, validacion y
respuesta inesperada. Puede mostrar `operationId`, pero no payloads, stack, secretos o detalles Prisma.

Servicios, precios y promociones no inventan idempotencia. Usan scopes abortables, lock sincronico y
sin estado optimista. Una maquina reutilizable coordina `idle`, `submitting`, `uncertain`,
`reconciling`, `resolved_applied`, `resolved_not_applied` y `deterministic_error`. Red, timeout, `429` o
`5xx` dejan el dialogo abierto, deshabilitan Confirmar y comunican que el resultado no pudo confirmarse;
no repiten automaticamente. `Actualizar informacion` ejecuta exclusivamente una lectura autoritativa.
Una coincidencia unica adopta el resultado sin otra mutacion; una ausencia verificable habilita un nuevo
intento explicito; una respuesta ambigua o fallida permanece incierta. Servicio, que carece de listado
Admin, exige que el operador habilite de forma explicita cualquier reintento.

La resolucion de nombres de Cliente para promociones tiene estados `pending`, `success` y `error`. Un
Cliente ausente en una respuesta exitosa queda identificado como referencia no resuelta; `403` se
muestra como falta de permiso y red/`429`/`5xx` permiten reintentar la lectura. Ninguno de esos estados
oculta las promociones autoritativas ya cargadas. Un `401` conserva el manejo central de sesion.
