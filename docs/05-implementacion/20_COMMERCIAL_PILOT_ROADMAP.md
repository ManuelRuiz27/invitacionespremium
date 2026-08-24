# 20 — Roadmap de piloto comercial y ajuste operativo

Estado: **Roadmap de ejecución propuesto sobre baseline técnico ya certificado**  
Fecha: **24 agosto 2026**  
Objetivo: adaptar pricing, intake y medición económica al modelo comercial aprobado sin reabrir ni reescribir el núcleo técnico operator-led.

## 1. Punto de partida

El roadmap técnico anterior (`19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`) se considera completado para su objetivo original:

- OP-01 baseline: DONE;
- OP-02 provider capabilities: DONE;
- OP-03 separación Provider/Planner: DONE;
- FP-01 shell Croquis V2: DONE;
- FP-02 Sticker catalog: DONE;
- FP-03 robustez Croquis: DONE;
- FP-04 Seating Workspace: DONE;
- FP-05 escala/operación: DONE;
- PILOT-01 readiness E2E: DONE;
- PILOT-02 instrumentación operativa: DONE.

El producto ya dispone de un recorrido técnico operator-led certificado. Esta segunda etapa no invalida esos cierres.

## 2. Nueva tesis de ejecución

La prioridad deja de ser construir infraestructura base y pasa a:

```text
modelo técnico operator-led certificado
        +
pricing comercial correcto
        +
autorización/price lock antes de COGS
        +
intake Provider sin workaround
        +
Staff usable por Planner
        +
unit economics por Evento
        +
piloto comercial medible
```

## 3. Fuentes obligatorias

Antes de ejecutar cualquier bloque de esta etapa leer:

1. `AGENTS.md`;
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`;
3. `docs/01-producto/05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`;
4. `docs/01-producto/05A_PRICING_RESOLUTION_CLARIFICATION.md`;
5. `docs/01-producto/04_OPERATOR_LED_MVP.md`;
6. `docs/02-flujos-reglas/06_FINANZAS_CREDITOS_CONTABILIDAD.md`;
7. contrato técnico especializado del módulo;
8. `docs/05-implementacion/14_CODEX_RULES.md`;
9. `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`.

Para pricing, `05A_PRICING_RESOLUTION_CLARIFICATION.md` prevalece sobre cualquier fórmula general que obligue a inventar cruces de canal/capacidad no aprobados.

## 4. Bloque GOV-COM-01 — Gobierno comercial

Estado actual: **IN REVIEW / documentación en rama `docs/commercial-business-rules-2026-08`**.

Objetivo:

- integrar a `main` las decisiones comerciales del 24 agosto 2026;
- indexar precedencia;
- no modificar código en este bloque;
- evitar que Codex implemente pricing sobre reglas históricas Planner/Organization.

Criterio de salida:

- `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` y `05A_PRICING_RESOLUTION_CLARIFICATION.md` existen en `main`;
- `docs/INDEX.md` los referencia;
- no hay contradicción no documentada sobre standard/partner/venue.

## 5. COM-01 — Pricing V2 por SKU, canal y volumen

Issue: **#36**  
Prioridad: **P0**  
Estado: **QUEUED / bloqueado por GOV-COM-01**.

Objetivo:

Adaptar `ServicePrice`/resolver de pricing sin reescribir ledger, créditos, deuda, Payments o Receipts.

Reglas:

### Standard/PVP

- precio por SKU + bracket de capacidad + vigencia;
- brackets 1–50, 51–100, 101–150.

### Planner/agencia

- tarifa partner explícita;
- actualmente sólo existe hipótesis aprobada para hasta 100;
- no inferir descuento para brackets sin tarifa aprobada;
- ausencia de tarifa partner no crea precio derivado automáticamente.

### Venue

- QR/EventOps por tier de volumen efectivo M-1;
- 1–2, 3–5, 6–10, 11+;
- sin matriz venue por capacidad durante piloto;
- venue nuevo inicia tier 1–2;
- sin repricing retroactivo.

Conservar:

- 1 crédito = $20 MXN;
- créditos enteros;
- activación transaccional;
- snapshots históricos;
- Promotions después del precio base;
- compatibilidad histórica.

Criterio de salida:

- `ClientType` deja de decidir por sí solo pricing comercial;
- price book configurable y temporal;
- tier venue autoritativo;
- tests Finance/Activation sin regresión.

## 6. COM-02 — Autorización comercial y price lock

Issue: **#37**  
Prioridad: **P0**  
Dependencia: **#36**.

Objetivo:

Evitar trabajo personalizado sin aceptación comercial y congelar el precio aceptado antes de que un cambio posterior del price book afecte al Evento.

Reglas:

- no nuevo `EventStatus`;
- el movimiento contable sigue ocurriendo al activar;
- antes de design kickoff debe existir autorización comercial;
- Flyer/Flipbook adquieren price lock al iniciar preparación personalizada;
- QR/EventOps no requiere kickoff de diseño personalizado;
- cambio de SKU antes del kickoff recalcula términos;
- después del kickoff requiere re-cotización explícita.

Criterio de salida:

- términos Event-scoped auditables;
- activación cobra exactamente los términos autorizados;
- ledger no se mueve antes de activar;
- no existen cargos sorpresa por cambios posteriores del price book.

## 7. OP-04 — Operator intake y asignación de Planner

Issue: **#34**  
Prioridad: **P0**  
Dependencias: **#36 + #37**.

Decisión resuelta:

- `clientId` = tenant propietario;
- `createdByUserId` = actor/provenance real;
- Platform Admin puede crear el registro desde superficie Admin;
- no falsificar Planner creator;
- ownership operativo se separa mediante asignación explícita de Planner.

Objetivo:

Eliminar el workaround actual donde Planner debe crear el shell del Evento antes de que Provider lo prepare.

Alcance:

- Admin create event para Client explícito;
- contexto comercial autorizado;
- SKU/servicio y capacidad inicial;
- Planner assignment cuando corresponda;
- tenant isolation/auditoría;
- compatibilidad de Eventos históricos creados por Planner.

Criterio de salida:

- Provider puede iniciar el Evento completo sin credenciales Planner;
- Organization Planner sólo opera Eventos asignados;
- Organization Admin mantiene visibilidad correspondiente;
- no regresión de ownership histórico.

## 8. OPS-01 — Staff access en Client

Issue: **#35**  
Prioridad: **P1**  
Estado: **READY FOR CODE / paralelizable**.

Este bloque es independiente de Pricing V2 y puede ejecutarse mientras #36/#37 avanzan.

Objetivo:

Añadir superficie `Staff` al Evento activo para que Planner pueda listar y crear accesos usando backend vigente.

No cambiar:

- Staff roles;
- Scanner;
- check-in;
- límite 3;
- secreto one-time;
- permisos Provider.

Criterio de salida:

- desaparece el workaround de crear StaffToken manualmente por API.

## 9. FIN-OPS-01 — Unit economics por Evento

Issue: **#38**  
Prioridad: **P1**  
Dependencia: **#36** y PILOT-02 ya cerrado.

Objetivo:

Extender instrumentación operativa para medir contribution margin sin convertir el ledger del Cliente en contabilidad de COGS.

Registrar/derivar:

- costo diseñador;
- otros costos externos;
- costo tecnológico marginal estimado;
- rondas de diseño;
- tiempo operador;
- soporte;
- trabajo manual;
- SKU/canal;
- bracket/tier cuando correspondan;
- cargo final;
- devolución comercial si existe.

Costo sombra del fundador:

`horas operador × tarifa interna de referencia`.

Criterio de salida:

- por Evento se puede comparar ingreso, COGS, tiempo y contribution margin;
- ningún costo interno genera movimiento en ledger del Cliente.

## 10. PILOT-03 — UAT comercial de Evento pagado

Issue: **#39**  
Prioridad: **P1**  
Dependencias: **#34, #35, #36, #37, #38**.

Escenarios mínimos:

1. Planner/agencia — Flyer hasta 100 con tarifa partner explícita.
2. Venue — QR/EventOps con tier por volumen efectivo.

Journey objetivo:

```text
Canal
  ↓
SKU / precio
  ↓
Aceptación comercial
  ↓
Price lock
  ↓
Provider intake
  ↓
Preparación operator-led
  ↓
Planner invitados / operación
  ↓
Staff / Scanner
  ↓
Cierre
  ↓
COGS + tiempo + margen
```

Criterio de salida:

- recorrido sin workarounds P0/P1;
- precio y actor auditables;
- no cargo sorpresa;
- unit economics calculables;
- incidencias capturadas;
- decisión posterior basada en evidencia.

## 11. Estado de capacidades existentes

No reabrir salvo regresión reproducible:

- Invitation Design provider-led;
- Croquis V2 Builder;
- Sticker catalog;
- Floorplan robustness;
- Seating Workspace;
- RSVP público;
- QR;
- Scanner/check-in;
- reportes;
- AuditLog;
- credit ledger;
- line of credit/debt;
- privacidad/anonimización.

## 12. Not now

Hasta evidencia comercial:

- Mercado Pago;
- CFDI automático;
- add-ons automáticos;
- fee no recuperable automático de diseño;
- price matrix venue × capacidad;
- partner pricing inferido para brackets no aprobados;
- QR/EventOps + RSVP público;
- WhatsApp API;
- BI/warehouse;
- nueva contabilidad general;
- marketplace;
- roles nuevos;
- Planner Croquis Builder;
- Seat/SeatAssignment persistente.

## 13. Orden de ejecución

Camino crítico:

```text
GOV-COM-01
    ↓
COM-01 #36
    ↓
COM-02 #37
    ↓
OP-04 #34
    ↓
PILOT-03 #39
```

Paralelo autorizado:

```text
OPS-01 #35 ───────────────┐
                          ├─→ PILOT-03 #39
FIN-OPS-01 #38 (tras #36) ┘
```

## 14. Dashboard de esta etapa

La etapa técnica anterior no se recalcula: permanece **10/10 DONE**.

La etapa comercial nueva tiene siete bloques:

1. GOV-COM-01;
2. COM-01;
3. COM-02;
4. OP-04;
5. OPS-01;
6. FIN-OPS-01;
7. PILOT-03 como gate final de validación.

No utilizar un único porcentaje global mezclando ambos roadmaps sin explicar el denominador.

## 15. Definición de éxito

El objetivo ya no es demostrar únicamente que el software funciona.

Es demostrar que InvitacionesPremium puede:

- cotizar correctamente por canal/SKU;
- proteger margen antes de incurrir en diseño/operación;
- crear y asignar Eventos desde Provider sin impersonación;
- operar Staff desde Planner sin workaround;
- ejecutar un Evento real/pagado;
- medir tiempo, COGS y margen de contribución;
- usar recompra y volumen sostenido como evidencia comercial posterior.