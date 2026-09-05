# Índice de documentación

## Regla de fuente de verdad

Repositorio canónico: `ManuelRuiz27/invitacionespremium`.

El repositorio `ManuelRuiz27/Soft-Monkey_InvitacionesPremium` es únicamente **LEGACY / VISUAL REFERENCE ONLY** y nunca prevalece sobre esta documentación.

Leer primero `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md` cuando una tarea mencione ambos repositorios o pretenda rescatar comportamiento/UI legacy.

## 01-producto

- `01_GLOSARIO_Y_MODELO_CONCEPTUAL.md`
- `02_PRD.md`
- `03_ROLES_PERMISOS_ACCESO.md`
- `04_OPERATOR_LED_MVP.md` — perfil de lanzamiento asistido/operator-led
- `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` — fuente de verdad comercial vigente para SKU vs canal, pricing, gate financiero, intake Provider y ajustes del flujo operator-led
- `05A_PRICING_RESOLUTION_CLARIFICATION.md` — standard por capacidad, partner explícito y venue QR/EventOps por volumen sin inventar matriz de capacidad
- `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` — fuente de verdad para posicionamiento público, pricing visible, funnel Planner/agencia y conversión Venue
- `ACCESS_MATRIX.md` — matriz estándar de roles/endpoints
- `ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md` — capability administrativa adicional para lanzamiento, sin nuevo rol

## 02-flujos-reglas

- `04_APP_FLOW.md`
- `05_REGLAS_NEGOCIO.md`
- `EVENT_STATE_MACHINE.md`
- `SERVICE_UPGRADE_FLOW.md`
- `06_FINANZAS_CREDITOS_CONTABILIDAD.md`
- `LEDGER_TYPES.md`

## 03-ui-ux

- `07_UI_UX_FLOW.md` — flujo UX general; para `apps/client` y `apps/scanner` queda subordinado a `CLIENT_UI_VISUAL_SYSTEM.md` en composición visual

## 03-diseno

- `CLIENT_UI_VISUAL_SYSTEM.md` — **fuente de verdad visual para Client/Scanner**: task-first, content-first, progressive disclosure y fin del card-first UI; Croquis queda fuera
- `LEGACY_UI_VISUAL_PORT_GUIDE.md` — dirección visual selectiva desde legacy sin migrar stack
- `FLOORPLAN_UX_TARGET.md` — objetivo visual/interacción Croquis V2; el modo de lugar exacto se rige por el contrato especializado vigente
- `assets/floorplan-sticker-flow-target.svg` — render de referencia subordinado a contratos vigentes

## 04-tecnico

### Gobierno y arquitectura

- `REPOSITORY_SOURCE_OF_TRUTH.md`
- `ADR_OPERATOR_LED_ACCESS.md`
- `08_TRD.md`
- `09_MODELO_DATOS_CONCEPTUAL.md`
- `10_SCHEMA_PRISMA_GUIDE.md`
- `11_API_CONTRACTS.md`
- `12_REPOS_Y_APPS.md`
- `MONOREPO_ARCHITECTURE.md`

### Contratos especializados

- `CLIENTS_CONTRACT.md`
- `SERVICES_PRICING_CONTRACT.md`
- `FINANCE_CONTRACT.md`
- `EVENTS_CONTRACT.md`
- `EVENT_ACTIVATION_CONTRACT.md`
- `EVENT_LIFECYCLE_CONTRACT.md`
- `CONTACTS_CONTRACT.md`
- `INVITATIONS_CONTRACT.md`
- `FILE_ASSETS_CONTRACT.md`
- `INVITATION_DESIGN_CONTRACT.md`
- `PUBLIC_RSVP_CONTRACT.md`
- `QR_CONTRACT.md`
- `STAFF_ACCESS_CONTRACT.md`
- `SCANNER_CHECKIN_CONTRACT.md`
- `ALBUMS_CONTRACT.md`
- `REPORTS_CONTRACT.md`
- `CLIENT_APP_CONTRACT.md`
- `ADMIN_APP_CONTRACT.md`
- `EVENT_WIZARD_CONTRACT.md`
- `ACTIVE_EVENT_WORKSPACE_CONTRACT.md`
- `FLOORPLAN_DETAILED_SEATING_CONTRACT.md` — decisión posterior y fuente de verdad para acomodo opcional por lugar exacto; sustituye cualquier `Not now` previo de asientos individuales
- `FLOORPLAN_STICKER_SEATING_CONTRACT.md` — contrato base de Croquis V2; subordinado a `FLOORPLAN_DETAILED_SEATING_CONTRACT.md` cuando el alcance sea asignación persistente por lugar
- `FILE_ASSET_POLICY.md`
- `REALTIME_PAYLOADS.md`

## 05-implementacion

- `13_PLAN_IMPLEMENTACION.md`
- `14_CODEX_RULES.md`
- `14A_OPERATOR_LED_CODEX_RULES.md`
- `15_BACKLOG_CODEX.md`
- `16_BACKLOG_QA_AMENDMENTS.md`
- `17_QA_OPEN_DECISIONS.md`
- `18_MONOREPO_BOOTSTRAP.md`
- `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md` — roadmap técnico original hacia piloto; objetivo completado
- `20_COMMERCIAL_PILOT_ROADMAP.md` — segunda etapa: Pricing V2, landing/funnel, autorización comercial, Operator intake, Staff UI, unit economics y UAT comercial
- `21_CLIENT_UI_REFACTOR_ROADMAP.md` — roadmap del refactor visual Client/Scanner task-first, excluyendo Croquis
- `UI01_CLIENT_FOUNDATION_EVENTS.md` — shell, visual foundation y Eventos
- `UI02_WIZARD_GUESTS_CONFIRMATION.md` — Wizard, Invitados y Confirmación sin tocar Croquis
- `UI03_INVITATION_EXPERIENCE.md` — Flyer/Flipbook con pieza gráfica dominante y acciones contextuales
- `UI04_OPERATIONAL_SURFACES.md` — Evento activo, compartir Invitaciones, Finanzas y Scanner; Croquis/Seating internos fuera de alcance
- `OP04_OPERATOR_INTAKE_PLANNER_ASSIGNMENT.md` — contrato técnico para alta Provider, creator real, price lock atómico y ownership operativo por Planner asignada
- `LAND01_LANDING_COMMERCIAL_V2.md` — contrato técnico para landing comercial por SKU/canal y pricing público autoritativo sin price book duplicado
- `LAND02_B2B_COMMERCIAL_INTAKE.md` — contrato técnico para captura B2B pública, deduplicación/rate limit y consulta Admin read-only sin auto-provisioning
- `OP03A_PLANNER_PROVIDER_CAPABILITY_SEPARATION.md`
- `OP03B_OPERATOR_PLANNER_SURFACES.md`
- `FP01_PROVIDER_FLOORPLAN_SHELL.md`
- `FP02_STICKER_CATALOG.md`
- `FP03_FLOORPLAN_INTERACTION_ROBUSTNESS.md`
- `FP04_PLANNER_SEATING_WORKSPACE_ALIGNMENT.md`
- `FP05_SCALE_OPERATION_QA.md`
- `FP06_DETAILED_SEATING.md` — ticket de implementación para `Acomodo por lugar exacto`
- `PILOT01_END_TO_END_READINESS.md`
- `PILOT02_MINIMUM_OPERATIONAL_INSTRUMENTATION.md`
- `LOCAL_PILOT_OPERATION_RUNBOOK.md`
- `PILOT03_COMMERCIAL_UAT_RUNBOOK.md` — contrato de ejecución final para UAT comercial: baseline CI verde, Partner/Flyer, Venue/QR, operación real y unit economics

## Precedencia para el modelo comercial/operator-led vigente

Cuando una tarea afecte SKU, pricing, canal, volumen, unit economics, adquisición, landing, inicio de preparación, creator/assignment de Evento o responsabilidades Provider/Planner:

1. `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` para decisión comercial general.
2. `05A_PRICING_RESOLUTION_CLARIFICATION.md` para resolver standard/partner/venue sin inventar dimensiones de precio.
3. `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` para landing, copy, pricing público y funnel de conversión.
4. `04_OPERATOR_LED_MVP.md` para separación general Provider/Planner, salvo sustitución expresa.
5. `02_PRD.md`, `04_APP_FLOW.md`, `05_REGLAS_NEGOCIO.md` y `06_FINANZAS_CREDITOS_CONTABILIDAD.md` para reglas no sustituidas.
6. Contrato técnico especializado del dominio afectado.
7. `20_COMMERCIAL_PILOT_ROADMAP.md` para orden de ejecución de la segunda etapa.
8. `PILOT03_COMMERCIAL_UAT_RUNBOOK.md` para certificar el recorrido comercial final una vez cerradas sus dependencias.
9. Código sólo después de convertir cualquier gap restante en ticket/contrato explícito.

En particular:

- `ClientType` no debe interpretarse como canal comercial;
- las tablas históricas Planner/Organization no son pricing definitivo;
- la landing no debe publicar precios históricos ni prometer self-service técnico contrario al perfil operator-led;
- Venue/Organization no obtiene registro público por el simple hecho de aparecer como canal comercial.

## Precedencia para Client UI V2 / Planner task-first

Cuando una tarea afecte **composición visual, jerarquía, densidad, copy, cards, wrappers, navegación visual, progressive disclosure o responsive** de `apps/client` o `apps/scanner`:

1. contrato de dominio/seguridad especializado aplicable;
2. `CLIENT_UI_VISUAL_SYSTEM.md` para presentación;
3. `07_UI_UX_FLOW.md`;
4. contrato técnico base de la superficie (`CLIENT_APP_CONTRACT.md`, `EVENT_WIZARD_CONTRACT.md`, `ACTIVE_EVENT_WORKSPACE_CONTRACT.md`, Scanner, Finance, etc.);
5. ticket `UI01`..`UI04` para orden de implementación;
6. implementación actual cuando no contradiga una regla documental superior.

Reglas:

- `CLIENT_UI_VISUAL_SYSTEM.md` puede sustituir requisitos antiguos de **scorecards, cards, tabla/card dual, wrappers `Paper`, sidebar visualmente pesado o copy repetitivo**;
- esa precedencia es **sólo visual**: nunca autoriza cambios de API, permisos, estados, readiness, pricing, idempotencia, seguridad o dominio;
- UI-01..UI-04 no pueden tocar internals de Croquis/Seating ni `packages/floorplan`;
- Admin y Landing no forman parte de este roadmap salvo regresión compartida demostrada;
- no migrar MUI ni crear un design system paralelo.

Orden de ejecución:

`UI-01 → UI-02 → UI-03 → UI-04`.

## Precedencia para Croquis V2 / baseline operator-led

1. `REPOSITORY_SOURCE_OF_TRUTH.md`.
2. producto (`02_PRD.md`, `03_ROLES_PERMISOS_ACCESO.md`, `04_OPERATOR_LED_MVP.md` y decisiones comerciales vigentes cuando apliquen).
3. `FLOORPLAN_DETAILED_SEATING_CONTRACT.md` cuando la tarea afecte lugares/asientos persistentes, capacidad derivada por lugar, asignación exacta o scanner por lugar.
4. resto de ADR/contratos especializados, incluido `FLOORPLAN_STICKER_SEATING_CONTRACT.md`.
5. `FLOORPLAN_UX_TARGET.md` y `LEGACY_UI_VISUAL_PORT_GUIDE.md`.
6. `14_CODEX_RULES.md` + `14A_OPERATOR_LED_CODEX_RULES.md`.
7. `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md` como historial técnico completado.
8. `FP06_DETAILED_SEATING.md` como orden de implementación del modo detallado, sin autoridad para cambiar el contrato.
9. `20_COMMERCIAL_PILOT_ROADMAP.md` para cambios posteriores no cubiertos por FP06.

Una referencia visual nunca puede cambiar dominio, permisos, estados, contratos API o reglas financieras.

Para el modo detallado, la autorización de `FloorplanSeat` y `Assistant.floorplanSeatId` proviene de `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`; Codex no debe detenerse por prohibiciones anteriores de crear asignación persistente por asiento que ese contrato sustituye expresamente.

## Regla monorepo

`MONOREPO_ARCHITECTURE.md` sustituye cualquier instrucción anterior de crear repos separados. Los nombres históricos se mapean a rutas dentro de `apps/` y `packages/`. `packages/floorplan` sigue siendo el package compartido autorizado del engine frontend de Croquis, sin API/auth/persistencia propia.
