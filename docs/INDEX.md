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
- `06_MODELOS_OPERATIVOS_DE_VENTA.md` — registro maestro de modelos M01–M05 y regla de separación entre operación, condición comercial y adquisición
- `06A_MODELO_01_PLANNER_INDEPENDIENTE.md` — modelo base gestionado: InvitacionesPremium prepara, Planner administra invitados/mesas/Staff y Staff opera el acceso
- `06B_MODELO_02_SALON_JARDIN_ORGANIZACION.md` — salón/jardín gestionado: Admin Organización supervisa múltiples Eventos y Planner opera Eventos asignados
- `06C_MODELO_03_LICENCIA_AUTOSERVICIO.md` — Organización en autoservicio: cliente prepara/Opera Eventos sobre el mismo core multi-tenant
- `06D_MODELO_04_CLIENTE_GRAN_ESCALA_DEDICADO.md` — cliente de gran escala: mismo core, certificación de escala y deployment dedicado sólo cuando se justifique
- `06E_MODELO_05_PARTNER_RESELLER.md` — Partner/Reseller resuelto como capa comercial sobre M01–M04, no como rol funcional
- `06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md` — auditoría runtime transversal; clasifica EXISTS/ADAPT/MISSING/FINANCE-ONLY/OUT-OF-SCOPE y consolida G01–G05
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
- `FLOORPLAN_UX_TARGET.md` — objetivo visual/interacción Croquis V2; el modo de lugar exacto y la fuente SVG se subordinan a sus contratos especializados vigentes
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
- `FLOORPLAN_DETAILED_SEATING_CONTRACT.md` — fuente de verdad para acomodo opcional por lugar exacto; sustituye cualquier `Not now` previo de asientos individuales
- `FLOORPLAN_SVG_MAPPING_CONTRACT.md` — **fuente de verdad para SVG de Croquis**: sanitización, canonicalización, selección manual de elementos y mapping a `FloorplanShape` sin convertir SVG en fuente de verdad
- `FLOORPLAN_STICKER_SEATING_CONTRACT.md` — contrato base de Croquis V2; Sticker Model queda como fallback/complemento y se subordina a Detailed Seating y SVG Mapping en sus respectivos alcances
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
- `22_FLOORPLAN_FUNCTIONAL_COMPLETION_ROADMAP.md` — **histórico/superseded**; conserva baseline y decisiones anteriores de Croquis pero ya no define el orden activo
- `23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md` — **roadmap activo de Croquis**: certificar baseline, habilitar SVG seguro, mapping manual, estado visual, TABLE/SEAT, Planner/Scanner y QA; difiere align/grid/templates avanzados hasta evidencia de piloto
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

## Precedencia para modelos operativos M01–M05

Cuando una tarea afecte quién prepara/opera un Evento, un nuevo tipo de cliente, salón/agencia, autoservicio, Partner/Reseller o cliente de gran escala:

1. `06_MODELOS_OPERATIVOS_DE_VENTA.md` para identificar el modelo correcto.
2. `06A`–`06E` para responsabilidades del escenario específico.
3. `06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md` para saber si la capacidad ya existe, sólo requiere adaptación, falta, pertenece a Finance o está fuera de alcance.
4. `03_ROLES_PERMISOS_ACCESO.md` + `ACCESS_MATRIX.md` para roles/ownership persistidos.
5. contrato técnico especializado del dominio afectado.
6. ticket técnico explícito antes de código.

Reglas:

- Partner/Reseller no crea un rol funcional;
- ventas en frío no crean un modelo operativo;
- salón/jardín no crea un rol `Venue Owner` mientras los roles Organization existentes cubran el actor;
- M01/M02 son perfiles gestionados; M03/M04 son perfiles de autoservicio, con M04 añadiendo escala/aislamiento sólo cuando se justifique;
- no confundir el límite comercial/intake actual de 150 con la capacidad del campo base `Event.capacity`;
- no implementar todos los gaps de `06F` en bloque: cada gap requiere ticket y contratos identificados.

## Precedencia para el modelo comercial/operator-led vigente

Cuando una tarea afecte SKU, pricing, canal, volumen, unit economics, adquisición, landing, inicio de preparación, creator/assignment de Evento o responsabilidades Provider/Planner:

1. `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` para decisión comercial general.
2. `05A_PRICING_RESOLUTION_CLARIFICATION.md` para resolver standard/partner/venue sin inventar dimensiones de precio.
3. `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` para landing, copy, pricing público y funnel de conversión.
4. `04_OPERATOR_LED_MVP.md` para separación general Provider/Planner, salvo sustitución expresa.
5. `06_MODELOS_OPERATIVOS_DE_VENTA.md`, el modelo `06A`–`06E` aplicable y `06F` para reparto operativo/gaps antes de crear roles o superficies nuevas.
6. `02_PRD.md`, `04_APP_FLOW.md`, `05_REGLAS_NEGOCIO.md` y `06_FINANZAS_CREDITOS_CONTABILIDAD.md` para reglas no sustituidas.
7. Contrato técnico especializado del dominio afectado.
8. `20_COMMERCIAL_PILOT_ROADMAP.md` para orden de ejecución de la segunda etapa.
9. `PILOT03_COMMERCIAL_UAT_RUNBOOK.md` para certificar el recorrido comercial final una vez cerradas sus dependencias.
10. Código sólo después de convertir cualquier gap restante en ticket/contrato explícito.

En particular:

- `ClientType` no debe interpretarse como canal comercial;
- las tablas históricas Planner/Organization no son pricing definitivo;
- la landing no debe publicar precios históricos ni prometer self-service técnico contrario al perfil operator-led vigente para M01/M02;
- Venue/Organization no obtiene registro público por el simple hecho de aparecer como canal comercial;
- un modelo operativo de salón/jardín no autoriza por sí mismo un nuevo rol persistido si `ORGANIZATION_ADMIN`, `ORGANIZATION_PLANNER`, assignment y Staff ya cubren el escenario.

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
2. producto (`02_PRD.md`, `03_ROLES_PERMISOS_ACCESO.md`, `04_OPERATOR_LED_MVP.md`, `06_MODELOS_OPERATIVOS_DE_VENTA.md`, modelo `06A`–`06E` aplicable y `06F`, además de decisiones comerciales vigentes cuando correspondan).
3. `FLOORPLAN_DETAILED_SEATING_CONTRACT.md` cuando la tarea afecte lugares/asientos persistentes, capacidad derivada por lugar, asignación exacta o scanner por lugar.
4. `FLOORPLAN_SVG_MAPPING_CONTRACT.md` cuando la tarea afecte upload SVG, sanitización, canonicalización, elementos seleccionables, mapping, reemplazo de fuente o proyección de estado sobre SVG.
5. resto de ADR/contratos especializados, incluido `FLOORPLAN_STICKER_SEATING_CONTRACT.md`.
6. `FLOORPLAN_UX_TARGET.md` y `LEGACY_UI_VISUAL_PORT_GUIDE.md`.
7. `14_CODEX_RULES.md` + `14A_OPERATOR_LED_CODEX_RULES.md`.
8. `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md` como historial técnico completado.
9. `FP06_DETAILED_SEATING.md` como ticket especializado del modo detallado, sin autoridad para cambiar el contrato.
10. `22_FLOORPLAN_FUNCTIONAL_COMPLETION_ROADMAP.md` como **roadmap histórico superseded**; no usarlo como orden activo.
11. `23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md` como **orden activo de ejecución** para Croquis.
12. `20_COMMERCIAL_PILOT_ROADMAP.md` para cambios posteriores no cubiertos por el roadmap funcional de Croquis.

Una referencia visual nunca puede cambiar dominio, permisos, estados, contratos API o reglas financieras.

Para el modo detallado, la autorización de `FloorplanSeat` y `Assistant.floorplanSeatId` proviene de `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`; Codex no debe detenerse por prohibiciones anteriores de crear asignación persistente por asiento que ese contrato sustituye expresamente.

Para SVG de Croquis, `FLOORPLAN_SVG_MAPPING_CONTRACT.md` sustituye las menciones anteriores que limiten la fuente a JPG/PNG o presenten Sticker Model como única vía de construcción. Esa sustitución es específica de Croquis y **no abre SVG genérico para otros uploads**.

Mientras `23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md` esté activo, no iniciar un refactor visual general de Croquis. Sólo se permiten cambios de presentación necesarios para implementar, probar o certificar la capability SVG y los gaps operacionales P0 que el roadmap conserve.

## Regla monorepo

`MONOREPO_ARCHITECTURE.md` sustituye cualquier instrucción anterior de crear repos separados. Los nombres históricos se mapean a rutas dentro de `apps/` y `packages/`. `packages/floorplan` sigue siendo el package compartido autorizado del engine frontend de Croquis, sin API/auth/persistencia propia.
