# 20 — Roadmap de piloto comercial y ajuste operativo

Estado: **Roadmap de ejecución propuesto sobre baseline técnico ya certificado**  
Fecha: **24 agosto 2026**  
Objetivo: adaptar pricing, funnel de venta, intake y medición económica al modelo comercial aprobado sin reabrir ni reescribir el núcleo técnico operator-led.

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

La etapa técnica permanece **10/10 DONE**. Los nuevos bloques no reabren esos cierres.

## 2. Nueva tesis de ejecución

```text
modelo técnico operator-led certificado
        +
pricing comercial correcto
        +
landing/funnel alineado a SKU y canal
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

La meta ya no es demostrar únicamente que el software funciona. Debemos demostrar que puede **venderse, cotizarse, operarse y medirse** sin contradicciones.

## 3. Fuentes obligatorias

Antes de ejecutar cualquier bloque de esta etapa leer:

1. `AGENTS.md`;
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`;
3. `docs/01-producto/05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`;
4. `docs/01-producto/05A_PRICING_RESOLUTION_CLARIFICATION.md`;
5. `docs/01-producto/05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` cuando la tarea toque landing/adquisición;
6. `docs/01-producto/04_OPERATOR_LED_MVP.md`;
7. `docs/02-flujos-reglas/06_FINANZAS_CREDITOS_CONTABILIDAD.md`;
8. contrato técnico especializado del módulo;
9. `docs/05-implementacion/14_CODEX_RULES.md`;
10. `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`.

`05A_PRICING_RESOLUTION_CLARIFICATION.md` prevalece sobre fórmulas generales que obliguen a inventar cruces no aprobados. `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` prevalece sobre el copy comercial histórico de `apps/landing`.

## 4. GOV-COM-01 — Gobierno comercial

Estado: **IN REVIEW / rama `docs/commercial-business-rules-2026-08`**.

Objetivo:

- integrar a `main` las decisiones comerciales;
- indexar precedencia;
- incluir contrato de landing/funnel;
- no modificar runtime en este bloque.

Criterio de salida:

- `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` en `main`;
- `05A_PRICING_RESOLUTION_CLARIFICATION.md` en `main`;
- `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` en `main`;
- `20_COMMERCIAL_PILOT_ROADMAP.md` en `main`;
- `docs/INDEX.md` actualizado;
- sin contradicción pendiente sobre pricing/canal/landing.

## 5. COM-01 — Pricing V2 por SKU, canal y volumen

Issue: **#36**  
Prioridad: **P0**  
Estado: **QUEUED / bloqueado por GOV-COM-01**.

Objetivo: adaptar `ServicePrice`/resolver sin reescribir ledger, créditos, deuda, Payments o Receipts.

### Standard/PVP

- SKU + bracket de capacidad + vigencia;
- 1–50, 51–100, 101–150.

### Planner/agencia

- tarifa partner explícita;
- actualmente sólo hay hipótesis aprobada para hasta 100;
- no inferir tarifas ausentes.

### Venue

- QR/EventOps por tier M-1 de volumen efectivo;
- 1–2, 3–5, 6–10, 11+;
- sin matriz Venue × capacidad durante piloto;
- sin repricing retroactivo.

Además debe existir una forma segura de proyectar **PVP público** para la landing sin exponer pricing privado, deuda, líneas de crédito, COGS ni wholesale no publicado.

Conservar 1 crédito = $20 MXN, créditos enteros, activación transaccional, snapshots y Promotions después del precio base.

## 6. LAND-01 — Landing comercial V2

Issue: **#40**  
Prioridad: **P0**  
Dependencias: **GOV-COM-01 + #36 para pricing público autoritativo**.

Objetivo: alinear `apps/landing` al nuevo modelo de venta sin reescribir el design system.

Cambios obligatorios:

- dejar de posicionar el producto principalmente como SaaS self-service;
- vender servicio gestionado de logística digital/operación;
- presentar QR/EventOps, Flyer y Flipbook como SKU;
- retirar `DEMO` como producto pagado comparable;
- reemplazar tabla `Planner vs Organization`;
- mostrar PVP estándar por capacidad en MXN;
- créditos pasan a información secundaria;
- sección Planner/agencia enfocada a alianza/partner;
- sección Venue enfocada a recurrencia/volumen;
- no prometer partner pricing automático por `ClientType.PLANNER`;
- no prometer registro público de Venue/Organization;
- actualizar SEO, Hero, Services, Pricing, Planner, Organization/Venue, FAQ, CTA y demo copy;
- pricing público debe provenir de la fuente autoritativa definida por #36 o una proyección pública mínima equivalente, no de números divergentes hardcodeados en componentes.

Criterio de salida: un visitante entiende SKU, PVP estándar, diferencia Planner/Venue y siguiente paso comercial correcto.

## 7. LAND-02 — Intake comercial B2B desde landing

Issue: **#41**  
Prioridad: **P1**  
Dependencia: **#40**.

Objetivo: evitar que Planner partner/Venue terminen en un CTA sin salida comercial.

Superficie mínima:

- `Quiero trabajar como Planner partner` / `Conocer condiciones para Planners`;
- `Solicitar propuesta para mi venue` / `Cotizar operación recurrente`;
- formulario B2B separado del registro Planner.

Datos mínimos autorizados:

- contacto;
- empresa/venue/agencia;
- tipo de oportunidad;
- email;
- teléfono/WhatsApp opcional;
- volumen estimado opcional;
- notas opcionales;
- consentimiento/aviso de privacidad cuando corresponda.

Reglas:

- no crear automáticamente Client/User/Event;
- no otorgar tarifa partner/venue automáticamente;
- rate limit/anti-spam;
- acceso restringido a Platform Admin;
- sin CRM externo ni WhatsApp API durante piloto.

Criterio de salida: el lead B2B llega a un intake administrable sin falsear registro/roles/pricing.

## 8. COM-02 — Autorización comercial y price lock

Issue: **#37**  
Prioridad: **P0**  
Dependencia: **#36**.

Objetivo: evitar trabajo personalizado sin aceptación comercial y congelar términos antes de que cambios posteriores del price book afecten el Evento.

- no nuevo `EventStatus`;
- ledger sigue moviéndose al activar;
- Flyer/Flipbook requieren autorización antes de design kickoff;
- price lock Event-scoped;
- cambio de SKU antes del kickoff recalcula;
- después del kickoff exige re-cotización explícita.

DoD: activación cobra exactamente los términos autorizados y no existen cargos sorpresa.

## 9. OP-04 — Operator intake y asignación de Planner

Issue: **#34**  
Prioridad: **P0**  
Dependencias: **#36 + #37**.

Decisión:

- `clientId` = tenant propietario;
- `createdByUserId` = provenance real;
- Platform Admin puede crear;
- no falsificar Planner creator;
- ownership operativo mediante assignment explícito.

Objetivo: eliminar el workaround donde Planner debe crear el shell inicial.

DoD: Provider crea Evento comercialmente autorizado, asigna Planner y entra a preparación sin impersonación.

## 10. OPS-01 — Staff access en Client

Issue: **#35**  
Prioridad: **P1**  
Estado: **READY FOR CODE / paralelizable**.

Objetivo: sección Staff en Evento activo usando backend vigente.

No cambiar Staff roles, Scanner, check-in, límite 3, secreto one-time ni permisos Provider.

DoD: desaparece el workaround de crear StaffToken manualmente por API.

## 11. FIN-OPS-01 — Unit economics por Evento

Issue: **#38**  
Prioridad: **P1**  
Dependencia: **#36**; PILOT-02 ya cerrado.

Medir:

- ingreso comercial;
- costo diseñador;
- otros COGS;
- costo tecnológico marginal estimado;
- rondas de diseño;
- tiempo operador/soporte;
- trabajo manual;
- SKU/canal/bracket/tier;
- devolución comercial;
- contribution margin.

No mezclar COGS con ledger del Cliente.

## 12. PILOT-03 — UAT comercial de Evento pagado

Issue: **#39**  
Prioridad: **P1**  
Dependencias: **#34, #35, #36, #37, #38, #40, #41**.

Escenarios mínimos:

1. Planner/agencia — Flyer hasta 100 con tarifa partner explícita.
2. Venue — QR/EventOps con tier por volumen efectivo.

El journey debe comenzar desde la landing/funnel correspondiente:

```text
Landing
  ↓
Canal / lead o registro
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
Planner operación
  ↓
Staff / Scanner
  ↓
Cierre
  ↓
COGS + tiempo + margen
```

DoD: recorrido sin workarounds P0/P1 desde adquisición hasta cierre, con precio, actor, costos y margen auditables.

## 13. Estado de capacidades que no se reabren

Salvo regresión reproducible:

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

## 14. Not now

- Mercado Pago;
- CFDI automático;
- add-ons automáticos;
- fee no recuperable automático de diseño;
- Venue × capacidad pricing;
- partner pricing inferido;
- QR/EventOps + RSVP público;
- WhatsApp API;
- CRM externo;
- BI/warehouse;
- nueva contabilidad general;
- marketplace;
- nuevos roles;
- Planner Croquis Builder;
- Seat/SeatAssignment persistente.

## 15. Orden de ejecución

### Camino crítico de pricing/operación

```text
GOV-COM-01
    ↓
COM-01 #36
    ├─────────────→ LAND-01 #40 → LAND-02 #41 ───────┐
    ↓                                                │
COM-02 #37                                          │
    ↓                                                │
OP-04 #34                                           │
    └────────────────────────────────────────────────┤
                                                     ↓
                                                PILOT-03 #39
```

### Paralelo autorizado

```text
OPS-01 #35 ──────────────────────────────────────────┐
FIN-OPS-01 #38 (después de #36) ─────────────────────┤
                                                     └→ PILOT-03 #39
```

## 16. Dashboard de esta etapa

La etapa comercial tiene **nueve bloques**:

1. GOV-COM-01;
2. COM-01;
3. LAND-01;
4. LAND-02;
5. COM-02;
6. OP-04;
7. OPS-01;
8. FIN-OPS-01;
9. PILOT-03.

No mezclar su porcentaje con el roadmap técnico 10/10 sin explicar denominadores.

## 17. Definición de éxito

InvitacionesPremium debe poder:

- explicar y vender correctamente sus SKU desde la landing;
- convertir Planner/agencia y Venue por rutas distintas;
- cotizar correctamente por canal/SKU;
- proteger margen antes de COGS;
- crear/asignar Eventos desde Provider sin impersonación;
- operar Staff desde Planner;
- ejecutar un Evento pagado;
- medir tiempo, COGS y contribution margin;
- usar recompra y volumen sostenido como evidencia comercial posterior.
