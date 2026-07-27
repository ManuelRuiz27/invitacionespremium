# Contrato financiero

## Alcance

`FinanceModule`, dentro de `apps/api`, concentra ledger, balance cache, línea de crédito, deuda por lotes, pagos manuales, comprobantes y cortes contables. El ledger confirmado es la fuente de verdad. Ningún frontend calcula ni modifica saldos o deuda.

Los créditos son enteros. Todos los importes MXN se almacenan en centavos. Cuando una operación valora créditos en MXN conserva `creditUnitValueMxnCentsSnapshot`; cambiar el valor comercial futuro del crédito no altera movimientos ni deuda históricos.

## Modelos

### LedgerEntry

Movimiento financiero inmutable con:

- `sequence` global;
- Cliente y actor;
- tipo de movimiento;
- deltas de saldo comprado, línea utilizada, deuda y efectivo MXN;
- snapshot opcional del valor unitario;
- moneda `MXN`;
- referencias de operación e idempotencia;
- relaciones opcionales a Pago y otros movimientos;
- comprobante obligatorio;
- vencimiento y metadata;
- fecha de creación.

El ledger confirmado no admite `UPDATE`, `DELETE` ni `TRUNCATE`.

### FinanceBalance

Proyección de lectura por Cliente:

- créditos comprados;
- límite y uso de línea;
- deuda en créditos;
- deuda en centavos MXN históricos;
- máxima secuencia de ledger aplicada;
- fecha de actualización.

No es una fuente contable independiente. Se actualiza mediante el trigger del ledger y puede reconstruirse con `rebuild_finance_balance(clientId)`.

### CreditLine

Una fila por Cliente con:

- límite entero en créditos;
- estado `ACTIVE` o `SUSPENDED`;
- fecha de asignación;
- vencimiento opcional;
- notas;
- fechas de creación y actualización.

El límite no puede quedar por debajo de la línea utilizada. Una línea suspendida o vencida tiene disponibilidad operativa cero.

### Payment

Registro de dinero recibido:

- proveedor/origen `MANUAL`;
- estado `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` o `REFUNDED`;
- importe en centavos y moneda;
- referencia externa conservada;
- llave idempotente;
- metadata JSON opcional;
- actor, Cliente, comprobante y fecha de aprobación.

El endpoint implementado crea exclusivamente pagos `MANUAL` en estado `APPROVED`. Solo `APPROVED` puede respaldar `CREDIT_PURCHASE` o `DEBT_PAYMENT`. Un Pago confirmado es inmutable.

La pareja `(provider, externalReference)` es única. Reutilizar la misma referencia `MANUAL` con otra `Idempotency-Key` responde `409 FINANCE_DUPLICATE_PAYMENT_REFERENCE` y revierte Pago, comprobante, ledger, auditoría y efecto en balance.

### Receipt

Comprobante interno por operación con:

- folio global consecutivo asignado bajo bloqueo PostgreSQL;
- Cliente;
- tipo y referencia de operación;
- llave idempotente global;
- snapshot de la respuesta original;
- fecha de creación.

### DebtPaymentAllocation

Aplicación inmutable de un `DEBT_PAYMENT` a un lote `CREDIT_LINE_USAGE`:

- movimiento origen del lote;
- movimiento de pago;
- créditos enteros liquidados;
- importe calculado con el valor unitario histórico;
- fecha de creación.

La pareja lote/pago es única. Una porción ya asignada no se puede actualizar, eliminar ni volver a pagar.

## Tipos del ledger

El enum usa exclusivamente los valores definidos en `LEDGER_TYPES.md`:

| Tipo | Saldo comprado | Línea usada | Deuda | Efectivo MXN | Estado operativo |
|---|---:|---:|---:|---:|---|
| `CREDIT_PURCHASE` | positivo | 0 | 0 | positivo | Implementado |
| `MANUAL_CREDIT_GRANT` | positivo | 0 | 0 | 0 | Implementado |
| `EVENT_ACTIVATION_CHARGE` | negativo | 0 | 0 | 0 | Diferido |
| `CREDIT_LINE_USAGE` | 0 | positivo | positivo | 0 | Creación desde Evento diferida |
| `DEBT_PAYMENT` | 0 | negativo | negativo | positivo | Implementado |
| `EVENT_CREDIT_REFUND` | según origen | según origen | según origen | 0 | Diferido |
| `LEDGER_REVERSAL` | inverso del original | inverso | inverso | inverso | Diferido |
| `PROMOTION_DISCOUNT` | 0 | 0 | 0 | 0 | Diferido |

Que un valor exista en el enum no habilita una operación dependiente de Evento.

## Efectos de las operaciones implementadas

### Asignación gratuita

`MANUAL_CREDIT_GRANT` aumenta exclusivamente `purchasedCredits`, no registra ingreso MXN y exige motivo. Genera ledger, comprobante y auditoría en una transacción `Serializable`.

### Compra manual pagada

El sistema crea un `Payment` `MANUAL` y `APPROVED`, después un `CREDIT_PURCHASE`. Los créditos y el importe cumplen:

```text
amountMxnCents = credits × creditUnitValueMxnCentsSnapshot
```

La compra aumenta saldo comprado y registra ingreso real. Es distinta de una asignación gratuita.

### Configuración de línea

Platform Admin asigna, actualiza o suspende la línea. La configuración no crea saldo comprado ni deuda. El balance conserva límite y uso; el uso no puede superar el límite.

### Pago manual de deuda

El sistema crea un `Payment` `MANUAL` y `APPROVED`, un `DEBT_PAYMENT` y asignaciones explícitas a lotes. Reduce `creditLineUsed` y `debtCredits` en la misma cantidad, reduce la deuda MXN histórica por el importe pagado y nunca aumenta `purchasedCredits`.

Cada asignación usa:

```text
amountMxnCents = credits × lot.creditUnitValueMxnCentsSnapshot
```

La suma solicitada debe coincidir con el importe aprobado.

### Consultas, cortes y reconstrucción

Balance, movimientos y comprobantes son consultas paginadas por secuencia o folio. Los cortes diarios y mensuales derivan sus métricas del ledger. La reconstrucción vuelve a calcular la proyección y devuelve reconciliación verificable contra el ledger.

## Idempotencia y atomicidad

Las mutaciones exigen `Idempotency-Key` de 8 a 128 caracteres.

- La misma llave, Cliente y tipo de operación devuelve el snapshot previo.
- Reutilizar la llave para otra operación responde `409 FINANCE_DUPLICATE_OPERATION`.
- La llave se conserva en `Receipt`, `LedgerEntry` y, cuando existe, `Payment`.
- La referencia externa del Pago se deduplica de forma independiente por proveedor.
- Ledger, balance, Pago, asignaciones, comprobante y auditoría se confirman juntos.
- Las mutaciones financieras usan aislamiento `Serializable` y reintentan conflictos serializables acotados.

## Constraints y triggers PostgreSQL

- checks de no negatividad para saldo comprado, línea utilizada, deuda y deuda MXN;
- check de límite no negativo y `creditLineUsed <= creditLineLimit`;
- checks por tipo de ledger para signos, deltas permitidos, Pago aprobado y snapshots obligatorios;
- FKs financieras con `ON DELETE RESTRICT`;
- protección append-only de ledger y asignaciones;
- protección de Pagos confirmados;
- protección del balance contra escrituras fuera del contexto de ledger o reconstrucción;
- trigger de ledger que actualiza balance atómicamente;
- `lastLedgerSequence = GREATEST(COALESCE(currentValue, 0), NEW.sequence)`;
- validación previa de tipo, Cliente, valor histórico y saldo pendiente de cada asignación;
- constraint trigger sobre `ledger_entry`, `DEFERRABLE INITIALLY DEFERRED`, que exige asignaciones completas al confirmar un `DEBT_PAYMENT`;
- constraint trigger sobre inserción en `debt_payment_allocation`, `DEFERRABLE INITIALLY DEFERRED`, que también valida:

```text
SUM(allocation.credits) = -DEBT_PAYMENT.debtDelta
SUM(allocation.amountMxnCents) = DEBT_PAYMENT.cashMxnDelta
```

El segundo trigger impide anexar asignaciones después de confirmar el pago: PostgreSQL rechaza y revierte íntegramente la transacción.

## Endpoints

Cliente autenticado:

```http
GET /api/v1/finance/balance
GET /api/v1/finance/movements
GET /api/v1/finance/receipts
```

Platform Admin:

```http
GET  /api/v1/admin/finance/clients/:clientId/balance
POST /api/v1/admin/finance/clients/:clientId/assign-credits
POST /api/v1/admin/finance/clients/:clientId/credit-line
POST /api/v1/admin/finance/clients/:clientId/manual-payment
POST /api/v1/admin/finance/clients/:clientId/rebuild-balance
GET  /api/v1/admin/finance/cuts/daily
GET  /api/v1/admin/finance/cuts/monthly
```

## Permisos

- `INDEPENDENT_PLANNER`: consulta finanzas de su propio Cliente;
- `ORGANIZATION_ADMIN`: consulta finanzas de su Organización;
- `ORGANIZATION_PLANNER`: no consulta saldo, deuda, movimientos ni comprobantes;
- `PLATFORM_ADMIN`: usa exclusivamente endpoints administrativos para consultar cualquier Cliente y ejecutar mutaciones;
- Staff y público no tienen acceso financiero.

Platform Admin no impersona al Cliente.

## Alcance diferido hasta Eventos

Quedan fuera de este contrato operativo:

- modelo y CRUD de Evento;
- activación;
- creación operativa de `EVENT_ACTIVATION_CHARGE`;
- creación operativa de `CREDIT_LINE_USAGE` desde Evento;
- promociones económicas;
- `EVENT_CREDIT_REFUND`;
- `LEDGER_REVERSAL`;
- upgrade de servicio;
- Mercado Pago;
- frontend.
