# 06 — Finanzas, créditos y contabilidad interna

## Valor del crédito

Valor inicial:

- 1 crédito = $20 MXN

Cambios futuros al valor comercial del crédito:

- no afectan créditos ya comprados;
- no afectan cargos de Eventos ya activados;
- no recalculan deuda originada previamente por línea de crédito.

Toda compra o uso de línea debe guardar el valor unitario MXN aplicado como snapshot histórico.

## Compra de créditos

- No hay compra mínima.
- Cliente puede comprar la cantidad exacta que necesita.
- Mercado Pago futuro comprará créditos, no Eventos directamente.
- En MVP temprano, Platform Admin puede registrar una compra pagada fuera del sistema.
- Una compra manual pagada se registra como `CREDIT_PURCHASE` con Pago aprobado y referencia externa.
- Una asignación gratuita o ajuste comercial sin ingreso se registra como `MANUAL_CREDIT_GRANT` y requiere motivo.
- No mezclar compra pagada con asignación gratuita.

## Consumo

Los créditos se consumen al activar Evento.

Orden de consumo:

1. saldo comprado;
2. línea de crédito disponible.

La activación puede usar ambas fuentes en una sola operación mixta y transaccional.

## Servicios y precios iniciales

### Planner

- Flipbook: 30 créditos
- Flyer: 20 créditos
- QR pase físico: 15 créditos

### Organización

- Flipbook: 27 créditos
- Flyer: 17 créditos
- QR pase físico: 10 créditos

Platform Admin puede editar precios y promociones.

El Evento activado conserva snapshot del costo base, descuentos y costo final en créditos.

## Línea de crédito

Solo Platform Admin la asigna.

Datos:

- límite en créditos;
- usado en créditos;
- disponible en créditos;
- fecha de asignación;
- notas internas;
- estado activa/suspendida;
- vencimiento opcional.

La línea no representa saldo comprado. Solo habilita créditos prestados que generan deuda al utilizarse.

## Deuda

Cuando se usa línea de crédito, se genera deuda.

Cada uso de línea constituye un lote histórico con:

- créditos utilizados;
- valor unitario MXN vigente al momento del uso;
- principal MXN;
- saldo pendiente en créditos;
- fecha de origen;
- vencimiento si aplica.

La deuda pendiente puede mostrarse en:

- créditos adeudados;
- equivalente MXN calculado con los valores históricos de los lotes pendientes.

Cambiar posteriormente el valor del crédito no modifica deuda existente.

La deuda es visible solo para:

- Admin de Organización;
- Planner independiente si le aplica;
- Platform Admin.

El Planner de Organización no ve deuda.

## Pago de deuda

El pago de deuda:

- requiere Pago en estado `approved`;
- reduce deuda en créditos;
- reduce línea utilizada en la misma cantidad de créditos;
- registra ingreso real MXN;
- no aumenta saldo comprado;
- se asigna a lotes de deuda específicos usando el valor unitario histórico de cada lote.

Puede hacerse:

- manual fuera del sistema y registrado por Platform Admin;
- vía Mercado Pago en futuro.

No se permiten créditos fraccionarios en MVP. El importe aprobado debe corresponder a una cantidad entera de créditos dentro de los lotes asignados.

Si el sistema asigna automáticamente un pago, aplica primero a lotes vencidos y después a los más antiguos.

## Promociones

Pueden aplicar a:

- compra de créditos;
- activación de Evento;
- Cliente específico;
- servicio contratado específico;
- rango de fechas;
- Organizaciones;
- acumulación si Platform Admin lo permite.

Descuento automático Organización + promoción solo acumula si la promoción permite acumulación y aplica a Organización.

Toda promoción aplicada conserva snapshot de:

- costo anterior;
- descuento;
- costo final;
- regla de acumulación utilizada.

## Ledger

Todo movimiento financiero genera ledger.

El saldo visible puede guardarse como balance cache, pero el ledger es la fuente de verdad.

Movimientos permitidos:

- `CREDIT_PURCHASE`;
- `MANUAL_CREDIT_GRANT`;
- `EVENT_ACTIVATION_CHARGE`;
- `CREDIT_LINE_USAGE`;
- `DEBT_PAYMENT`;
- `EVENT_CREDIT_REFUND`;
- `LEDGER_REVERSAL`;
- `PROMOTION_DISCOUNT`.

Los efectos exactos están definidos en `LEDGER_TYPES.md`. No crear tipos adicionales sin aprobación.

## Evento cobrado

Al activar Evento registrar:

- Cliente;
- Evento;
- servicio contratado;
- costo base en créditos;
- descuento aplicado;
- costo final en créditos;
- fuente: saldo / línea / mixto;
- valor unitario MXN para cualquier porción financiada;
- fecha;
- usuario que activó;
- referencia idempotente;
- comprobante interno.

La activación y todos sus movimientos deben confirmarse en una sola transacción.

## Devoluciones

Solo créditos internos en MVP.

Una devolución comercial usa `EVENT_CREDIT_REFUND`; no usa `LEDGER_REVERSAL`.

Reglas:

- la porción originalmente pagada con saldo vuelve como saldo comprado;
- la porción financiada todavía adeudada reduce deuda y línea utilizada;
- la porción financiada que ya fue pagada vuelve como saldo comprado;
- no existe devolución automática por cancelación;
- no se devuelve dinero en MVP;
- no se puede devolver más del costo final ni dos veces la misma porción.

`LEDGER_REVERSAL` se reserva para corregir errores contables y debe compensar exactamente el movimiento incorrecto.

## Comprobante interno

Generar comprobante interno para:

- compra de créditos;
- asignación manual;
- consumo de créditos por Evento;
- uso de línea;
- pago de deuda;
- devoluciones;
- reversos.

Debe tener folio consecutivo global.

Un mismo comprobante puede agrupar varios movimientos de una operación transaccional, por ejemplo activación mixta.

## Pagos

Estados:

- pending
- approved
- rejected
- cancelled
- refunded

Reglas:

- solo `approved` genera movimiento financiero confirmado;
- un Pago rechazado, cancelado o pendiente no cambia saldo ni deuda;
- `refunded` queda reservado para integraciones futuras que permitan devolución de dinero;
- en MVP no se ejecuta reembolso monetario al Cliente.

## Cortes contables

Corte diario y mensual debe calcular:

- ingresos reales MXN;
- créditos vendidos;
- créditos asignados sin ingreso;
- créditos consumidos;
- créditos prestados;
- deuda generada en créditos y MXN histórico;
- deuda pagada en créditos y MXN;
- deuda pendiente en créditos y MXN histórico;
- saldo comprado pendiente;
- devoluciones internas;
- reversos contables.

Los cortes deben derivarse del ledger, no de sumar únicamente caches.

## Dashboard Platform Admin

Métricas mínimas:

- ingresos del mes;
- créditos vendidos;
- créditos consumidos;
- créditos prestados;
- deuda pendiente en créditos;
- deuda pendiente en MXN histórico;
- Eventos activados;
- Clientes activos;
- Clientes con deuda;
- promociones activas;
- uso por servicio contratado.