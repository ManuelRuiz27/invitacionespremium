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

- `07_UI_UX_FLOW.md`

## 03-diseno

- `LEGACY_UI_VISUAL_PORT_GUIDE.md` — dirección visual selectiva desde legacy sin migrar stack
- `FLOORPLAN_UX_TARGET.md` — objetivo visual/interacción Croquis V2
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
- `FLOORPLAN_STICKER_SEATING_CONTRACT.md`
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
- `OP03A_PLANNER_PROVIDER_CAPABILITY_SEPARATION.md`
- `OP03B_OPERATOR_PLANNER_SURFACES.md`
- `FP01_PROVIDER_FLOORPLAN_SHELL.md`
- `FP02_STICKER_CATALOG.md`
- `FP03_FLOORPLAN_INTERACTION_ROBUSTNESS.md`
- `FP04_PLANNER_SEATING_WORKSPACE_ALIGNMENT.md`
- `FP05_SCALE_OPERATION_QA.md`
- `PILOT01_END_TO_END_READINESS.md`
- `PILOT02_MINIMUM_OPERATIONAL_INSTRUMENTATION.md`
- `LOCAL_PILOT_OPERATION_RUNBOOK.md`

## Precedencia para el modelo comercial/operator-led vigente

Cuando una tarea afecte SKU, pricing, canal, volumen, unit economics, adquisición, landing, inicio de preparación, creator/assignment de Evento o responsabilidades Provider/Planner:

1. `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` para decisión comercial general.
2. `05A_PRICING_RESOLUTION_CLARIFICATION.md` para resolver standard/partner/venue sin inventar dimensiones de precio.
3. `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` para landing, copy, pricing público y funnel de conversión.
4. `04_OPERATOR_LED_MVP.md` para separación general Provider/Planner, salvo sustitución expresa.
5. `02_PRD.md`, `04_APP_FLOW.md`, `05_REGLAS_NEGOCIO.md` y `06_FINANZAS_CREDITOS_CONTABILIDAD.md` para reglas no sustituidas.
6. Contrato técnico especializado del dominio afectado.
7. `20_COMMERCIAL_PILOT_ROADMAP.md` para orden de ejecución de la segunda etapa.
8. Código sólo después de convertir cualquier gap restante en ticket/contrato explícito.

En particular:

- `ClientType` no debe interpretarse como canal comercial;
- las tablas históricas Planner/Organization no son pricing definitivo;
- la landing no debe publicar precios históricos ni prometer self-service técnico contrario al perfil operator-led;
- Venue/Organization no obtiene registro público por el simple hecho de aparecer como canal comercial.

## Precedencia para Croquis V2 / baseline operator-led

1. `REPOSITORY_SOURCE_OF_TRUTH.md`.
2. producto (`02_PRD.md`, `03_ROLES_PERMISOS_ACCESO.md`, `04_OPERATOR_LED_MVP.md` y decisiones comerciales vigentes cuando apliquen).
3. ADR/contrato especializado.
4. `FLOORPLAN_UX_TARGET.md` y `LEGACY_UI_VISUAL_PORT_GUIDE.md`.
5. `14_CODEX_RULES.md` + `14A_OPERATOR_LED_CODEX_RULES.md`.
6. `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md` como historial técnico completado.
7. `20_COMMERCIAL_PILOT_ROADMAP.md` para cambios posteriores.

Una referencia visual nunca puede cambiar dominio, permisos, estados, contratos API o reglas financieras.

## Regla monorepo

`MONOREPO_ARCHITECTURE.md` sustituye cualquier instrucción anterior de crear repos separados. Los nombres históricos se mapean a rutas dentro de `apps/` y `packages/`. `packages/floorplan` sigue siendo el package compartido autorizado del engine frontend de Croquis, sin API/auth/persistencia propia.
