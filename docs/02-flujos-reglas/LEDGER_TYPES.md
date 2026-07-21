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
11. Solo un Pago en estado `approved` puede generar `CREDIT_PURCHASE` o `DEBT_PAYMENT`.
12. Cambiar el valor comercial futuro del crédito no modifica compras, cargos ni deuda históricos.

## Unidades y valoración histórica

- `purchased_credit_delta`: créditos comprados disponibles; unidad entera.
- `credit_line_used_delta`: créditos utilizados de la línea; unidad entera.
- `debt_delta`: créditos adeudados; unidad entera.
- `cash_mxn_delta`: ingreso o egreso real; centavos MXN.
- `credit_unit_value_mxn_cents_snapshot`: valor de un crédito en centavos MXN aplicado a la operación.

Valores positivos aumentan el concepto. Valores negativos lo reducen.

### Regla de deuda por lotes

Cada movimiento `CREDIT_LINE_USAGE` constituye un lote de deuda y debe guardar:

- créditos utilizados;
- valor unitario MXN del crédito al momento de uso;
- principal MXN del lote;
- fecha de origen;
- vencimiento si aplica;
- créditos pendientes de pago.

No se requiere una entidad comercial nueva: el movimiento original del ledger es la referencia del lote.

El valor monetario pendiente de la deuda se calcula sumando:

`créditos pendientes del lote × valor unitario histórico del lote`.

Un cambio posterior en el valor del crédito no altera ese cálculo.

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

- referencia de Pago aprobado;
- valor unitario del crédito aplicado;
- cantidad de créditos;
- total MXN;
- comprobante interno.

La relación obligatoria es:

`cash_mxn_delta = purchased_credit_delta × credit_unit_value_mxn_cents_snapshot`, salvo promoción documentada sobre la compra.

En MVP temprano puede originarse por registro manual de Platform Admin de un pago realizado fuera del sistema. En producción se originará por pago aprobado de Mercado Pago.

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

No debe utilizarse para registrar una compra pagada fuera del sistema. Ese caso usa `CREDIT_PURCHASE` con Pago manual aprobado.

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
- precio base en créditos;
- promoción aplicada si existe;
- costo final en créditos;
- snapshot del precio del servicio vigente;
- comprobante interno.

El valor absoluto no puede exceder el saldo comprado disponible.

Este movimiento registra consumo de créditos, no un nuevo ingreso MXN. El ingreso real se registró cuando se compraron los créditos.

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
- cantidad entera de créditos utilizados;
- `credit_unit_value_mxn_cents_snapshot`;
- principal MXN calculado;
- fecha de vencimiento si aplica;
- comprobante interno.

Puede coexistir con `EVENT_ACTIVATION_CHARGE` para un pago mixto. Ambos movimientos deben compartir la misma referencia de operación.

El principal MXN del lote queda fijo al confirmar el movimiento.

### `DEBT_PAYMENT`

Pago con dinero real aplicado a deuda existente.

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | 0 |
| `credit_line_used_delta` | Negativo |
| `debt_delta` | Negativo |
| `cash_mxn_delta` | Positivo |

El pago reduce deuda y línea utilizada. No aumenta créditos comprados.

Requiere:

- referencia de Pago aprobado;
- monto MXN recibido;
- asignación explícita a uno o varios movimientos `CREDIT_LINE_USAGE`;
- créditos enteros liquidados por cada lote;
- valor unitario histórico de cada lote;
- Platform Admin actor si es manual;
- comprobante interno.

La suma de las asignaciones debe cumplir:

`cash_mxn_delta = Σ(créditos liquidados del lote × valor unitario histórico del lote)`.

Reglas:

- no se permiten créditos fraccionarios;
- no puede pagar más créditos de los pendientes en cada lote;
- no puede reducir deuda ni línea utilizada por debajo de cero;
- una misma porción de deuda no puede liquidarse dos veces;
- si se aplica una estrategia automática, debe usar primero los lotes vencidos y después los más antiguos;
- el Pago y el movimiento de ledger se confirman en una sola transacción.

### `EVENT_CREDIT_REFUND`

Devolución en créditos internos asociada a un Evento.

Solo Platform Admin. No existe reembolso de dinero en MVP.

Requiere:

- `event_id`;
- referencia a los movimientos originales de activación;
- motivo obligatorio;
- desglose de la fuente original;
- estado pendiente/pagado de la porción financiada;
- comprobante interno.

#### Porción originalmente pagada con saldo comprado

Se devuelve como créditos comprados:

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Positivo |
| `credit_line_used_delta` | 0 |
| `debt_delta` | 0 |
| `cash_mxn_delta` | 0 |

#### Porción originalmente pagada con línea y todavía adeudada

Se cancela la deuda pendiente:

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | 0 |
| `credit_line_used_delta` | Negativo |
| `debt_delta` | Negativo |
| `cash_mxn_delta` | 0 |

#### Porción originalmente pagada con línea pero ya liquidada

Como no hay devolución de dinero en MVP, se devuelve como créditos comprados:

| Campo | Efecto |
|---|---|
| `purchased_credit_delta` | Positivo |
| `credit_line_used_delta` | 0 |
| `debt_delta` | 0 |
| `cash_mxn_delta` | 0 |

Una devolución puede combinar los efectos anteriores. No puede devolver más créditos que el costo final del Evento ni aplicarse dos veces sobre la misma porción.

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

No sustituye `EVENT_CREDIT_REFUND`: el reversal corrige un error contable; el refund ejecuta una decisión comercial o administrativa.

Antes de aplicar un reversal se deben validar movimientos dependientes. Por ejemplo, no se puede revertir directamente un `CREDIT_LINE_USAGE` cuya deuda ya fue pagada sin compensar también las aplicaciones relacionadas.

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
2. `CREDIT_LINE_USAGE` por `+12` créditos utilizados y `+12` de deuda, con valor unitario MXN histórico.
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
- `credit_unit_value_mxn_cents_snapshot` opcional según movimiento;
- `currency`, inicialmente `MXN`;
- `operation_reference`;
- `idempotency_key`;
- `related_ledger_entry_id` opcional;
- `reverses_ledger_entry_id` opcional;
- `promotion_id` opcional;
- `payment_id` opcional;
- `receipt_id` opcional;
- `due_at` opcional;
- `allocation_metadata` para pagos y devoluciones;
- `metadata`;
- `created_at`.

## Idempotencia

Las siguientes operaciones requieren llave idempotente única:

- compra de créditos;
- activación de Evento;
- pago de deuda;
- devolución;
- reversal;
- webhook futuro de Mercado Pago.

Una repetición con la misma llave debe devolver el resultado original, no escribir otro movimiento.

## Balance cache

Debe mantener al menos:

- créditos comprados disponibles;
- límite de línea en créditos;
- línea utilizada en créditos;
- línea disponible en créditos;
- deuda pendiente en créditos;
- deuda pendiente calculada en centavos MXN;
- fecha de última actualización;
- versión o secuencia del último ledger aplicado.

El monto MXN de deuda debe poder reconstruirse desde los lotes `CREDIT_LINE_USAGE` y sus pagos, no solo desde el cache.

## Invariantes

- créditos comprados disponibles `>= 0`;
- línea utilizada `>= 0`;
- deuda pendiente `>= 0`;
- línea disponible = límite - línea utilizada;
- línea utilizada no puede exceder el límite activo;
- deuda pendiente en créditos coincide con la suma de créditos pendientes de los lotes;
- línea utilizada y deuda pendiente disminuyen por las mismas porciones al pagar o cancelar deuda;
- un Evento activado debe tener operación financiera asociada, excepto Demo;
- un Evento Demo no genera movimientos de consumo;
- ningún reversal puede aplicarse dos veces al mismo movimiento;
- ninguna porción de deuda puede pagarse o devolverse dos veces;
- ningún Pago rechazado, pendiente o cancelado genera movimiento confirmado.

## Códigos de error recomendados

- `FINANCE_INSUFFICIENT_PURCHASED_CREDITS`
- `FINANCE_CREDIT_LINE_INACTIVE`
- `FINANCE_CREDIT_LINE_EXCEEDED`
- `FINANCE_DUPLICATE_OPERATION`
- `FINANCE_INVALID_REVERSAL`
- `FINANCE_DEBT_UNDERFLOW`
- `FINANCE_PAYMENT_ALLOCATION_INVALID`
- `FINANCE_REFUND_EXCEEDS_ORIGINAL_CHARGE`
- `FINANCE_LEDGER_INVARIANT_VIOLATION`