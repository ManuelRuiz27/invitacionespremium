# PR03 — Cobros comerciales Managed

## Alcance

Admin permite consultar y gestionar cobros de un contrato PR02 de una Organización Managed:
implementación, doce mensualidades y extraordinarios confirmados individualmente. Los importes
son **MXN netos antes de IVA**, derivados exclusivamente de `ManagedPlanContract.terms`.
El catálogo vigente no revaloriza contratos aceptados. No se genera deuda operativa ni se consulta
este registro para activar eventos, usar Scanner, RSVP o conceder permisos.

## Modelo y calendario

La migración aditiva `20261028120000_add_managed_collections` crea dos tablas:

- `managed_collection_payment`: contrato y cliente, concepto, mensualidad o cargo extraordinario,
  importe positivo en centavos, fecha efectiva civil, método, referencia y notas opcionales,
  administrador y fecha de registro. La reversión conserva todos los campos originales y agrega
  una sola fecha, administrador y motivo; siempre es completa.
- `managed_extraordinary_charge`: contrato, cliente, evento único por contrato, importe contractual,
  vencimiento, administrador y fecha de confirmación. El cargo confirmado es inmutable.

Las trece obligaciones base se proyectan, sin almacenar filas de calendario. Implementación y
mensualidad 1 vencen en `startsOn`; las siguientes usan `addContractMonths(startsOn, n - 1)`,
siempre desde el ancla original. El 31 de enero produce 28/29 de febrero y luego 31 de marzo.
El fin exclusivo del contrato, sus cuotas y sus fechas no cambian al registrar pagos.

Los extraordinarios se obtienen de la misma proyección PR02 que muestra el consumo. Se rechazan
eventos inexistentes, de otro cliente/contrato, sin activar o incluidos en la cuota. Se presenta
nombre, fecha del evento, precio contractual y cancelación. Un evento cancelado conserva consumo
y requiere revisión comercial humana. La confirmación fija el precio y hace exigible el cargo
en la fecha local de confirmación; no se confirma automáticamente. Una cancelación posterior
no elimina el cargo ni revierte un pago.

La fecha de negocio usa `America/Mexico_City`. Un saldo vence cuando `dueOn < today`; el propio
día de vencimiento es exigible, pero todavía no vencido. Los pagos admiten fechas efectivas
anteriores o actuales y anticipos sobre cuotas futuras, nunca fechas futuras. No se prorratea,
descuenta ni cobra interés. PostgreSQL asigna las fechas de registro/confirmación/reversión;
la fecha efectiva aportada por Admin se conserva separadamente.

La API deriva `PAID` con saldo cero, `PARTIAL` con abonos y saldo, `OVERDUE` sin abonos y vencido,
y `PENDING` en los demás casos. `overdue` es independiente del estado para conservar la condición
de mora en pagos parciales. El resumen incluye total contractual más extras confirmados, pagado
sin reversiones, saldo pendiente, vencido, exigible hasta hoy y de vencimiento futuro.

Los avisos incluyen mensualidades vencidas, fin contractual dentro de los próximos 30 días y
contrato concluido sin contratación posterior del mismo cliente (`startsOn >= endsOn`).
La renovación se acepta como un nuevo contrato PR02, con vigencia adyacente; no modifica el anterior.

## Escrituras, permisos y aislamiento

Todos los endpoints exigen `PLATFORM_ADMIN`, y el servicio comprueba además que el usuario siga
existiendo como administrador de plataforma, sin cliente ni borrado lógico. Se verifica la
cadena cliente → contrato → concepto → pago; los contratos de clientes borrados no son accesibles.
El seguimiento de contratos históricos no requiere que el cliente esté actualmente activo.

Las escrituras reutilizan `ManagedPlanMutationsService`: transacción Serializable, bloqueo
de idempotencia, bloqueo de la fila del contrato antes de leer saldos, auditoría y resultado
del intento en la misma transacción. La firma incluye actor, cliente, contrato, objetivo y cuerpo.
Repetir la misma clave/intención devuelve el mismo resultado; cambiar su intención produce 409.
Claves distintas se serializan por contrato y nunca pueden superar el saldo. Fallar la auditoría
revierte también el pago y su registro de idempotencia.

Las claves foráneas compuestas validan pertenencia al contrato/cliente. La unicidad de
`(contract_id, event_id)` impide cargos extraordinarios duplicados. Índices de contrato/registro
y cargo soportan saldos e historial. Los triggers impiden borrar pagos/cargos, alterar datos
originales, revertir dos veces, aplicar importes no positivos, superar el saldo o cambiar precios
confirmados. La clasificación extraordinaria continúa en la proyección PR02 dentro de la
transacción API; no se replica en SQL. No se modifican tablas ni servicios de Finance.

## API y SDK

Base: `/api/v1/admin/clients/{clientId}/managed-contracts/{contractId}/collections`.

| Método | Ruta relativa | Resultado |
| --- | --- | --- |
| GET | `/` | Resumen, obligaciones, alertas, candidatos e historial |
| GET | `/history` | Historial cronológico de pagos, reversiones y confirmaciones |
| POST | `/payments` | Registrar abono o liquidación de un concepto |
| POST | `/payments/{paymentId}/reverse` | Reversión completa con motivo obligatorio |
| POST | `/extraordinary-charges` | Confirmar el cargo de un `eventId` |

Cada POST exige `Idempotency-Key` y responde 201 con el estado comercial. Fechas efectivas
futuras, sobrepagos, conceptos ajenos, cargos repetidos y segundas reversiones se rechazan;
cuerpos inválidos responden 400 y recursos ajenos/inexistentes, 404. No hay rutas públicas.

Ejemplo de abono:

```json
{
  "concept": "MONTHLY",
  "installmentNumber": 1,
  "extraordinaryChargeId": null,
  "amountMxnCents": 100000,
  "effectiveOn": "2027-01-31",
  "method": "TRANSFER",
  "reference": "Transferencia revisada",
  "notes": null
}
```

OpenAPI se genera con `pnpm --filter @invitaciones/api openapi:generate` sobre PostgreSQL
migrado y aislado; el SDK con `pnpm --filter @invitaciones/api-client generate`. Sus tipos
proceden del esquema generado. Los wrappers validan respuestas y conservan cookies, cancelación
y claves idempotentes. Las verificaciones de drift y rutas permanecen obligatorias.

## Admin

`ManagedClientCommercialPanel` incorpora **Cobros y pagos** bajo los términos del contrato.
Muestra cuatro resúmenes, saldo exigible/futuro, tabla con desplazamiento horizontal en móvil,
alertas, candidatos y movimientos cronológicos. Cada pago requiere concepto seleccionado,
importe neto, fecha efectiva, método y confirmación explícita. La reversión exige motivo.
El historial muestra actor, referencia, fecha efectiva y fecha de registro; no oculta el pago revertido.

El diálogo conserva cuerpo y clave ante resultados inciertos y bloquea edición, cierre, navegación
y cambio de contrato hasta reconciliar. Después del éxito se utiliza la respuesta API y se consulta
de nuevo para evitar mostrar un snapshot de reintento antiguo. Una actualización fallida conserva
los datos anteriores y cualquier diálogo pendiente. **Actualizar cobros** permite renovar la consulta.

## Ejemplo contractual

Contrato Esencial iniciado el 31/01/2027: implementación $4,900.00, doce mensualidades de
$7,900.00 y extraordinario contractual $1,250.00, todo neto. Total base: $99,700.00.
El 01/02/2027, un abono de $1,000.00 a mensualidad 1 deja $6,900.00 parciales y vencidos;
implementación pendiente agrega $4,900.00 vencidos. Saldo vencido total: $11,800.00.
Las once mensualidades futuras suman $86,900.00 y vencen desde 28/02/2027 hasta 31/12/2027.
El saldo pendiente total es $98,700.00. Revertir ese abono devuelve el saldo a $99,700.00,
conservando ambas entradas del historial. Confirmar un extraordinario agrega $1,250.00 al total
y al saldo exigible; detectar un candidato por sí solo no agrega deuda.

## Archivos y verificación

- API: nuevos DTO, controlador, servicio y proyección `managed-collection*`; registro en el módulo
  Managed Plans. La consulta de consumo existente se extrae sin cambiar filtros, orden ni clasificación.
- Persistencia: dos modelos Prisma y migración aditiva; relaciones con contrato y evento.
- SDK: `admin/managed-collections.ts`, métodos de `adminManagedPlans` y esquema generado.
- Admin: `ManagedCollectionsPanel.tsx`, inserción en el panel contractual y mensajes de error.
- Pruebas: calendario/validación, integración PostgreSQL, SDK, interacción Admin y recorrido PR03
  añadido a `e2e/public-catalog.spec.ts`. Los mocks tipados de Admin y Client incorporan los métodos nuevos.
- Guías M02: las capturas se regeneran mediante el harness oficial para conservar la verificación
  de hash del código ejecutado; no se exime el control de vigencia de las guías.

Las pruebas específicas cubren calendario de 28/29/30/31 días, años bisiestos, implementación sin
importe, pagos parciales/completos, sobrepago concurrente, reintentos idempotentes, reversión,
fallo de auditoría y rollback, precios históricos, tenencia, permisos y ausencia de movimientos
en Finance. El recorrido móvil registra, liquida, revierte, activa cinco eventos sin exigir pagos,
confirma un extraordinario y comprueba persistencia tras recargar.

Certificación local final: `pnpm qa:full` aprobó en 3,481.96 s. Incluyó formato, lint,
typecheck, generación Prisma/OpenAPI/SDK, unidades, integraciones PostgreSQL reales, builds de los
ocho workspaces, journeys Managed y de acceso, PR01/PR02/PR03, 74 pruebas de Flipbook y la
verificación/render de las guías. La referencia remota se registra tras el único push de validación.

## Límites

Registro comercial manual, sin conciliación bancaria, intereses, descuentos, prorrateos, impuestos,
CFDI, pasarelas, cargos automáticos, cron ni avisos externos. No hay compensaciones, reversiones
parciales, eliminación de cargos confirmados ni abonos repartidos automáticamente entre conceptos.
Un error de pago se corrige mediante reversión completa y un nuevo registro. La resolución comercial
de un cargo extraordinario confirmado por error requerirá un alcance posterior; la UI advierte su
inmutabilidad antes de confirmar. La renovación y las cancelaciones permanecen manuales.
