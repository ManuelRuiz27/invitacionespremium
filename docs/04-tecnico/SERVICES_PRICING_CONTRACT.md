# Contrato de servicios, precios y promociones

## Alcance

`ServicesPricingModule`, dentro de `apps/api`, es la fuente de verdad del catálogo de servicios, sus precios históricos y la elegibilidad base de promociones. Los frontends consumen este contrato por API y no duplican sus reglas.

Los únicos códigos de servicio autorizados son:

- `FLIPBOOK`;
- `FLYER`;
- `PHYSICAL_QR`;
- `DEMO`.

## Modelos

### Service

- `id`: UUID;
- `code`: `ServiceCode`, único e inmutable desde la API;
- `isActive`: controla si el servicio aparece en el catálogo del Cliente;
- `createdAt`;
- `updatedAt`.

### ServicePrice

- `id`: UUID;
- `serviceId`: FK restrictiva a `Service`;
- `clientType`: `PLANNER` u `ORGANIZATION`;
- `credits`: entero no negativo;
- `validFrom`;
- `validUntil`, nullable;
- `createdAt`;
- `updatedAt`.

Un cambio de precio crea una nueva fila. Un precio cerrado no se sobrescribe ni se elimina por API. `PATCH /admin/prices/:priceId` únicamente puede cerrar una vigencia abierta sin alterar servicio, tipo de Cliente, créditos ni inicio histórico.

### Promotion

- `id`: UUID;
- `name`;
- `scope`: `CREDIT_PURCHASE` o `EVENT_ACTIVATION`;
- `clientId`, opcional;
- `clientType`, opcional;
- `serviceId`, opcional;
- `validFrom`;
- `validUntil`, nullable;
- `isActive`;
- `allowsStacking`;
- `createdAt`;
- `updatedAt`.

Si una promoción define simultáneamente `clientId` y `clientType`, el tipo configurado debe coincidir con el tipo real del Cliente.

## Vigencias y resolución de precio

Todos los intervalos usan semántica semiabierta:

```text
[validFrom, validUntil)
```

Un precio es vigente en `at` cuando:

```text
validFrom <= at AND (validUntil IS NULL OR at < validUntil)
```

La operación pública reutilizable del dominio es:

```typescript
resolveCurrentPrice(serviceCode, clientType, at?)
```

Devuelve exactamente el `ServicePrice` vigente para el código y tipo de Cliente indicados. Si no existe, responde con el error estable:

```text
CURRENT_PRICE_NOT_FOUND
```

`GET /services` usa la misma resolución temporal, filtra servicios activos y obtiene `clientType` exclusivamente de `AuthPrincipal`.

## Constraints PostgreSQL

- enum cerrado `service_code`;
- enum cerrado `promotion_scope`;
- `service.code` único;
- `service_price.credits >= 0`;
- `validUntil IS NULL OR validUntil > validFrom` para precios y promociones;
- unique key de precio por servicio, tipo de Cliente e inicio;
- exclusion constraint GiST que impide solapamientos por servicio y tipo de Cliente usando `tstzrange(valid_from, valid_until, '[)')`;
- trigger que exige créditos cero para todo precio de `DEMO`;
- trigger que impide convertir un servicio a `DEMO` si conserva precios distintos de cero;
- FKs de precios y promociones con `ON DELETE RESTRICT`.

Las mutaciones del módulo usan transacciones `Serializable` y escriben auditoría dentro de la misma transacción.

## Precios iniciales

Vigencia inicial: `2026-07-24T00:00:00.000Z`.

| Servicio | Planner | Organización |
|---|---:|---:|
| `FLIPBOOK` | 30 | 27 |
| `FLYER` | 20 | 17 |
| `PHYSICAL_QR` | 15 | 10 |
| `DEMO` | 0 | 0 |

La migración crea cuatro servicios y ocho precios. El comando idempotente:

```bash
pnpm --filter @invitaciones/api services-pricing:seed
```

puede ejecutarse repetidamente sin duplicar servicios ni precios.

## Endpoints

Cliente autenticado:

```http
GET /api/v1/services
```

Platform Admin:

```http
POST  /api/v1/admin/services
PATCH /api/v1/admin/services/:serviceId

GET   /api/v1/admin/prices
POST  /api/v1/admin/prices
PATCH /api/v1/admin/prices/:priceId

GET   /api/v1/admin/promotions
POST  /api/v1/admin/promotions
PATCH /api/v1/admin/promotions/:promotionId
POST  /api/v1/admin/promotions/:promotionId/activate
POST  /api/v1/admin/promotions/:promotionId/deactivate
```

Las creaciones responden `201`. Actualizaciones y transiciones responden `200`.

## Permisos

- `GET /services`: `INDEPENDENT_PLANNER`, `ORGANIZATION_ADMIN` y `ORGANIZATION_PLANNER`;
- todas las rutas `/admin/services`, `/admin/prices` y `/admin/promotions`: únicamente `PLATFORM_ADMIN`;
- Platform Admin no impersona un Cliente;
- el frontend no envía ni decide el tipo de Cliente para resolver el catálogo.

## Elegibilidad de promociones

Una promoción es elegible cuando:

- está activa;
- su `scope` coincide;
- el instante evaluado pertenece a `[validFrom, validUntil)`;
- el Cliente coincide con `clientId` cuando está definido;
- el tipo de Cliente coincide con `clientType` cuando está definido;
- el servicio coincide con `serviceId` cuando está definido.

`allowsStacking` solo declara si la promoción admite acumulación. Este módulo no calcula efectos económicos.

## Alcance diferido

Quedan fuera de este contrato y corresponden a tareas posteriores:

- ledger y movimientos financieros;
- saldo y balance cache;
- deuda y línea de crédito;
- pagos y comprobantes;
- Eventos y activación;
- snapshots de precio o promoción en Eventos;
- porcentaje, importe fijo, bonos, cupones, prioridad, límites de uso y fórmulas económicas;
- Mercado Pago.
