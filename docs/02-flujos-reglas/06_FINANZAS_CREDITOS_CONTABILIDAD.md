# 06 — Finanzas, créditos y contabilidad interna

## Valor del crédito

Valor inicial:

- 1 crédito = $20 MXN

Cambios futuros al precio del crédito no afectan créditos ya comprados.

## Compra de créditos

- No hay compra mínima.
- Cliente puede comprar la cantidad exacta que necesita.
- Mercado Pago futuro comprará créditos, no eventos directamente.
- En MVP temprano, Platform Admin asigna créditos manualmente.

## Consumo

Los créditos se consumen al activar evento.

Orden de consumo:

1. saldo comprado;
2. línea de crédito disponible.

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

## Línea de crédito

Solo Platform Admin la asigna.

Datos:

- límite;
- usado;
- disponible;
- fecha de asignación;
- notas internas;
- estado activa/suspendida;
- vencimiento opcional.

## Deuda

Cuando se usa línea de crédito, se genera deuda.

La deuda es visible solo para:

- Admin de Organización;
- Planner independiente si le aplica;
- Platform Admin.

El Planner de Organización no ve deuda.

## Pago de deuda

El pago de deuda:

- reduce deuda;
- no aumenta saldo.

Puede hacerse:

- manual fuera del sistema y registrado por Platform Admin;
- vía Mercado Pago en futuro.

## Promociones

Pueden aplicar a:

- compra de créditos;
- activación de evento;
- Cliente específico;
- servicio contratado específico;
- rango de fechas;
- Organizaciones;
- acumulación si Platform Admin lo permite.

Descuento automático Organización + promoción solo acumula si la promoción permite acumulación y aplica a Organización.

## Ledger

Todo movimiento financiero genera ledger.

El saldo visible puede guardarse como balance cache, pero el ledger es la fuente de verdad.

Movimientos mínimos:

- compra de créditos;
- asignación manual;
- consumo por evento;
- uso de línea;
- pago de deuda;
- devolución;
- reverso de cargo;
- promoción aplicada.

## Evento cobrado

Al activar evento registrar:

- Cliente;
- Evento;
- servicio contratado;
- costo base;
- descuento aplicado;
- costo final;
- fuente: saldo / línea / mixto;
- fecha;
- usuario que activó.

## Devoluciones

Solo créditos internos en MVP.

Se registran como reverso del cargo del Evento.

No hay reembolso de dinero en MVP.

## Comprobante interno

Generar comprobante interno para:

- compra de créditos;
- consumo de créditos por evento;
- pago de deuda;
- devoluciones.

Debe tener folio consecutivo global.

## Pagos

Estados:

- pending
- approved
- rejected
- cancelled
- refunded

## Cortes contables

Corte diario y mensual debe calcular:

- ingresos reales MXN;
- créditos vendidos;
- créditos consumidos;
- créditos prestados;
- deuda generada;
- deuda pagada;
- saldo pendiente;
- devoluciones.

## Dashboard Platform Admin

Métricas mínimas:

- ingresos del mes;
- créditos vendidos;
- créditos consumidos;
- créditos prestados;
- deuda pendiente;
- eventos activados;
- clientes activos;
- clientes con deuda;
- promociones activas;
- uso por servicio contratado.
