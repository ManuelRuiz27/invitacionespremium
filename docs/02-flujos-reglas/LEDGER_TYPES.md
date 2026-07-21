# Tipos de movimientos del ledger

## Objetivo

Definir los movimientos financieros permitidos y su efecto exacto sobre saldo comprado, línea de crédito, deuda e ingresos reales.

El ledger es la fuente de verdad financiera. El balance cache es solo una proyección optimizada para lectura.

## Principios obligatorios

1. Ningún saldo se modifica fuera del ledger.
2. Todo movimiento es inmutable después de confirmarse.
3. Las correcciones se realizan con un movimiento compensatorio, nunca editando o eliminando el original.
4. Todo movimiento debe tener `client_id`.
5. Los movimientos relacionados con un Evento deben tener `event_id`.
6. Todo movimiento debe registrar actor, fecha/hora, moneda y referencia idempotente.
7. Los movimientos que afectan saldo/deuda y la activación del Evento deben ejecutarse en una sola transacción.
8. El balance cache debe recalcularse o actualizarse atómicamente después de escribir el ledger.
9. Los importes en créditos deben almacenarse como enteros. No se permiten créditos fraccionarios en MVP.
10. Los importes MXN deben almacenarse en centavos para evitar errores de punto flotante.

## Convención de efectos

- `purchased_credit_delta`: cambio en créditos comprados.
- `credit_line_used_delta`: cambio en línea utilizada.
- `debt_delta`: cambio en deuda pendiente.
- `cash_mxn_delta`: cambio en ingresos o egresos reales en centavos MXN.

Valores positivos aumentan el concepto. Valores negativos lo reducen.

## Enum `ledger_movement_type`

### `CREDIT_PURCHASE`

Compra de créditos con dinero real.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Positivo |
| `credit_line_used_delta` | 0 |
| `debt_delta` | 0 |
| `cash_mxn_delta` | Positivo |

Requiere:

- referencia de pago;
- precio del crédito aplicado;
- cantidad de créditos;
- comprobante interno.

En MVP temprano puede originarse por registro manual de Platform Admin. En producción se originará por pago aprobado de Mercado Pago.

### `MANUAL_CREDIT_GRANT`

Asignación manual de créditos sin ingreso real registrado en el sistema.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Positivo |
| `credit_line_used_delta` | 0 |
| `debt_delta` | 0 |
| `cash_mxn_delta` | 0 |

Solo Platform Admin.

Requiere:

- motivo obligatorio;
- usuario actor;
- notas internas;
- comprobante interno.

### `EVENT_ACTIVATION_CHARGE`

Consumo de saldo comprado al activar un Evento.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Negativo |
| `credit_line_used_delta` | 0 |
| `debt_delta` | 0 |
| `cash_mxn_delta` | 0 |

Requiere:

- `event_id`;
- servicio contratado;
- precio base;
- promoción aplicada si existe;
- costo final;
- snapshot del precio vigente;
- comprobante interno.

El valor absoluto no puede exceder el saldo comprado disponible.

### `CREDIT_LINE_USAGE`

Uso de línea de crédito para completar o cubrir la activación de un Evento.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | 0 |
| `credit_line_used_delta` | Positivo |
| `debt_delta` | Positivo |
| `cash_mxn_delta` | 0 |

Requiere:

- `event_id`;
- línea activa;
- disponibilidad suficiente;
- fecha de vencimiento si aplica;
- comprobante interno.

Puede coexistir con `EVENT_ACTIVATION_CHARGE` para un pago mixto. Ambos movimientos deben compartir la misma referencia de operación.

### `DEBT_PAYMENT`

Pago de deuda existente.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | 0 |
| `credit_line_used_delta` | Negativo |
| `debt_delta` | Negativo |
| `cash_mxn_delta` | Positivo |

El pago reduce deuda y línea utilizada. No aumenta créditos comprados.

Requiere:

- referencia de pago;
- monto aplicado;
- Platform Admin actor si es manual;
- comprobante interno.

El movimiento no puede reducir la deuda por debajo de cero.

### `EVENT_CREDIT_REFUND`

Devolución en créditos internos asociada a un Evento.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Positivo, por la porción originalmente pagada con saldo |
| `credit_line_used_delta` | Negativo, por la porción originalmente pagada con línea |
| `debt_delta` | Negativo, por la porción originalmente pagada con línea |
| `cash_mxn_delta` | 0 |

Solo Platform Admin.

Requiere:

- `event_id`;
- referencia a los movimientos originales;
- motivo;
- desglose saldo/línea;
- comprobante interno.

No existe devolución automática por cancelación.

### `LEDGER_REVERSAL`

Movimiento técnico que compensa exactamente un movimiento incorrecto.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Inverso del original |
| `credit_line_used_delta` | Inverso del original |
| `debt_delta` | Inverso del original |
| `cash_mxn_delta` | Inverso del original, si aplica |

Requiere:

- `reverses_ledger_entry_id`;
- motivo obligatorio;
- actor Platform Admin;
- metadata de corrección.

No sustituye `EVENT_CREDIT_REFUND`: el reversal corrige un error contable; el refund ejecuta una decisión comercial/administrativa.

### `PROMOTION_DISCOUNT`

Registro informativo de la promoción aplicada a una compra o activación.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | 0 |
| `credit_line_used_delta` | 0 |
| `debt_delta` | 0 |
| `cash_mxn_delta` | 0 |

Debe guardar:

- promoción;
- costo antes del descuento;
- descuento;
- costo final;
- operación relacionada.

No modifica balance por sí mismo. El cargo real se registra con `EVENT_ACTIVATION_CHARGE` y/o `CREDIT_LINE_USAGE`.

## Activación con pago mixto

Ejemplo: Evento cuesta 30 créditos, Cliente tiene 18 créditos comprados y 20 disponibles en línea.

La transacción genera:

1. `EVENT_ACTIVATION_CHARGE` por `-18` créditos comprados.
2. `CREDIT_LINE_USAGE` por `+12` créditos utilizados y `+12` de deuda.
3. `PROMOTION_DISCOUNT` solo si existió descuento.
4. Comprobante interno que agrupa la operación completa.
5. Cambio del Evento a `active`.

Si cualquiera de estas escrituras falla, toda la transacción debe revertirse.

## Campos mínimos del registro

- `id` UUID;
- `client_id`;
- `event_id` opcional;
- `actor_user_id` opcional;
- `movement_type`;
- `purchased_credit_delta`;
- `credit_line_used_delta`;
- `debt_delta`;
- `cash_mxn_delta` en centavos;
- `currency`, inicialmente `MXN`;
- `operation_reference`;
- `idempotency_key`;
- `related_ledger_entry_id` opcional;
- `promotion_id` opcional;
- `payment_id` opcional;
- `receipt_id` opcional;
- `metadata`;
- `created_at`.

## Idempotencia

Las siguientes operaciones requieren llave idempotente única:

- compra de créditos;
- activación de Evento;
- pago de deuda;
- devolución;
- webhook futuro de Mercado Pago.

Una repetición con la misma llave debe devolver el resultado original, no escribir otro movimiento.

## Balance cache

Debe mantener al menos:

- créditos comprados disponibles;
- límite de línea;
- línea utilizada;
- línea disponible;
- deuda pendiente;
- fecha de última actualización;
- versión o secuencia del último ledger aplicado.

## Invariantes

- créditos comprados disponibles `>= 0`;
- línea utilizada `>= 0`;
- deuda pendiente `>= 0`;
- línea disponible = límite - línea utilizada;
- línea utilizada no puede exceder el límite activo;
- un Evento activado debe tener operación financiera asociada, excepto Demo;
- un Evento Demo no genera movimientos de consumo;
- ningún reversal puede aplicarse dos veces al mismo movimiento.

## Códigos de error recomendados

- `FINANCE_INSUFFICIENT_PURCHASED_CREDITS`
- `FINANCE_CREDIT_LINE_INACTIVE`
- `FINANCE_CREDIT_LINE_EXCEEDED`
- `FINANCE_DUPLICATE_OPERATION`
- `FINANCE_INVALID_REVERSAL`
- `FINANCE_DEBT_UNDERFLOW`
- `FINANCE_LEDGER_INVARIANT_VIOLATION`