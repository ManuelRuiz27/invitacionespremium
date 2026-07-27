# Contrato de activación de Evento

## Alcance

`CODEX-041` implementa la transición transaccional `READY_TO_ACTIVATE → ACTIVE`. La operación resuelve ownership, Cliente, servicio, precio y capacidad financiera exclusivamente en backend. No implementa el checklist que lleva un Evento a `READY_TO_ACTIVATE`; mientras los módulos diferidos no existan, solo fixtures de prueba pueden preparar ese estado.

## Endpoint

```http
POST /api/v1/events/:eventId/activate
Idempotency-Key: activation-example-001
```

`Idempotency-Key` es obligatorio, se recorta y admite de 8 a 128 caracteres.

La respuesta contiene:

- Evento activado;
- costo base, descuento y costo final en créditos;
- créditos consumidos de saldo comprado y de línea;
- uno o dos movimientos de ledger;
- un comprobante;
- balance resultante y su reconciliación contra ledger.

## Permisos y ownership

- `INDEPENDENT_PLANNER`: Eventos de su Cliente;
- `ORGANIZATION_ADMIN`: cualquier Evento de su Organización;
- `ORGANIZATION_PLANNER`: únicamente Eventos de su Organización creados por él;
- `PLATFORM_ADMIN`: no usa el endpoint operativo.

Un Evento existente fuera del ownership responde `404 EVENT_NOT_FOUND`.

## Precondiciones

Dentro de la transacción se valida:

- Evento existente, no eliminado y en `READY_TO_ACTIVATE`;
- Cliente existente y `ACTIVE`;
- servicio configurado, existente y activo;
- servicio distinto de `DEMO`;
- precio vigente en `[validFrom, validUntil)` para el tipo real del Cliente;
- saldo comprado y línea activa, no vencida y disponible suficientes.

No existe endpoint para forzar `READY_TO_ACTIVATE`.

## Resolución de precio

La activación reutiliza `ServicesPricingService.resolveCurrentPriceInTransaction`, que comparte la misma resolución temporal de:

```typescript
resolveCurrentPrice(serviceCode, clientType, at?)
```

El tipo de Cliente se relee desde PostgreSQL. Un precio inexistente conserva el error `CURRENT_PRICE_NOT_FOUND`.

## Consumo financiero

`FinanceService.consumeEventActivation(transaction, input)` es la operación financiera reutilizable. Recibe una transacción Prisma ya abierta y:

1. bloquea balance y línea del Cliente;
2. consume primero saldo comprado;
3. asigna el remanente a línea activa y disponible;
4. crea un comprobante;
5. crea los movimientos requeridos;
6. relee el balance actualizado por triggers.

Saldo comprado:

```text
EVENT_ACTIVATION_CHARGE
purchasedCreditDelta = -purchasedCreditsUsed
```

Línea de crédito:

```text
CREDIT_LINE_USAGE
creditLineUsedDelta = creditLineCreditsUsed
debtDelta = creditLineCreditsUsed
```

La activación mixta crea ambos movimientos con el mismo `eventId`, `receiptId`, `operationReference` e `idempotencyKey`. Un solo comprobante agrupa la operación.

## Valor histórico de la deuda

La variable central:

```text
CREDIT_UNIT_VALUE_MXN_CENTS
```

tiene default `2000`. No se recibe desde frontend.

La porción financiada guarda ese valor en:

- `Event.creditUnitValueMxnCentsSnapshot`;
- `CREDIT_LINE_USAGE.creditUnitValueMxnCentsSnapshot`.

El vencimiento del lote usa el vencimiento de la línea cuando existe. Cambiar posteriormente el valor del crédito no modifica el lote ni el snapshot del Evento.

## Snapshots de Event

Una activación confirmada conserva:

- `activatedAt`;
- `activatedByUserId`;
- `activatedServiceId`;
- `activatedServicePriceId`;
- `baseCostCredits`;
- `promotionDiscountCredits`;
- `finalCostCredits`;
- `purchasedCreditsUsed`;
- `creditLineCreditsUsed`;
- `creditUnitValueMxnCentsSnapshot`, solo cuando hubo financiamiento;
- `activationReceiptId`;
- `activationIdempotencyKey`.

En CODEX-041:

```text
promotionDiscountCredits = 0
finalCostCredits = baseCostCredits
purchasedCreditsUsed + creditLineCreditsUsed = finalCostCredits
```

Una vez establecido `activatedAt`, PostgreSQL trata todos los campos anteriores como inmutables. No pueden
modificarse, limpiarse ni eliminarse mediante Prisma, SQL directo u otro proceso. Los snapshots permanecen
durante `EVENT_DAY`, `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y una cancelación posterior a la activación.

El snapshot es la fuente histórica del Evento activado. No se recalcula durante consultas y no cambia si
después se modifican precios, servicios, el valor central del crédito u otra configuración.

## Atomicidad

Una única transacción PostgreSQL `Serializable`:

1. bloquea y relee el Evento;
2. valida ownership y estado;
3. valida Cliente, servicio y precio;
4. bloquea y relee balance y línea;
5. calcula las fuentes;
6. crea comprobante y ledger;
7. deja que los triggers actualicen balance;
8. guarda snapshots;
9. cambia el Evento a `ACTIVE`;
10. guarda el snapshot de respuesta;
11. crea auditoría `EVENT_ACTIVATE`.

Los conflictos `P2034` y los `TransactionWriteConflict` del adaptador PostgreSQL se reintentan de forma acotada. Cualquier error revierte Evento, comprobante, ledger, balance y auditoría.

## Idempotencia y concurrencia

- misma llave y mismo Evento: devuelve exactamente `Receipt.resultSnapshot`;
- no crea nuevos movimientos, comprobantes ni auditorías;
- misma llave para otro Evento u operación: `409 EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT`;
- un índice único protege la llave de activación del Evento;
- el comprobante conserva la llave única global;
- el bloqueo del Evento y el aislamiento serializable impiden doble cobro concurrente;
- un Evento ya activo con otra llave responde `EVENT_INVALID_STATE_TRANSITION`.

## PostgreSQL

Las migraciones de activación agregan:

- FKs restrictivas desde snapshots hacia Usuario, Servicio, Precio y Comprobante;
- FK real `ledger_entry.event_id → event.id` con `ON DELETE RESTRICT`;
- unicidad para comprobante y llave idempotente de activación;
- check de completitud y coherencia del snapshot;
- check de costos no negativos, descuento cero y suma exacta de fuentes;
- snapshot MXN obligatorio y positivo únicamente cuando se usa línea;
- `event_activation_state_snapshot_check`, que exige snapshots nulos en `DRAFT`, `CONFIGURED` y
  `READY_TO_ACTIVATE`, y completos desde `ACTIVE` hasta `ARCHIVED`;
- excepción controlada para `CANCELLED`: snapshot completamente nulo si se canceló antes de activar o
  completamente establecido si se canceló después;
- `event_activation_snapshot_immutable_trigger`, que usa `IS DISTINCT FROM` sobre cada campo protegido y
  rechaza también el borrado físico de un Evento activado;
- `event_activation_snapshot_references_trigger`, que al establecer el snapshot comprueba que precio,
  servicio, tipo real de Cliente, comprobante, Evento, idempotencia y actor pertenecen a la misma operación;
- validación del rol operativo del actor; un `ORGANIZATION_PLANNER` solo puede figurar como activador de un
  Evento creado por él.

Continúan aplicando los triggers financieros de ledger inmutable, balance derivado, línea activa y comprobante con folio global.

## Errores

- `EVENT_NOT_FOUND`;
- `EVENT_INVALID_STATE_TRANSITION`;
- `EVENT_SERVICE_NOT_AVAILABLE`;
- `EVENT_DEMO_NOT_ACTIVATABLE`;
- `CLIENT_NOT_ACTIVE`;
- `CURRENT_PRICE_NOT_FOUND`;
- `FINANCE_INSUFFICIENT_CREDITS`;
- `EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT`;
- `EVENT_ACTIVATION_CONFLICT`;
- `ROLE_FORBIDDEN`;
- `VALIDATION_ERROR`.

## Alcance diferido

No se implementan:

- promociones económicas;
- Contactos o Invitaciones;
- Flyer, Flipbook o diseño;
- RSVP;
- Croquis o Mesas;
- pases físicos, QR o StaffTokens;
- cierre, reapertura, cancelación o archivado;
- devoluciones o reversos;
- upgrade de servicio;
- frontend.
