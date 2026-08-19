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

- `REPOSITORY_SOURCE_OF_TRUTH.md` — repo canónico y límites de uso del legacy
- `ADR_OPERATOR_LED_ACCESS.md` — acceso administrativo explícito/auditado requerido para provider operation
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
- `FLOORPLAN_STICKER_SEATING_CONTRACT.md` — fuente de verdad de Croquis V2 / Sticker + Seating
- `FILE_ASSET_POLICY.md`
- `REALTIME_PAYLOADS.md`

## 05-implementacion

- `13_PLAN_IMPLEMENTACION.md`
- `14_CODEX_RULES.md`
- `14A_OPERATOR_LED_CODEX_RULES.md` — addendum obligatorio para operator-led, Croquis V2 y uso de legacy
- `15_BACKLOG_CODEX.md`
- `16_BACKLOG_QA_AMENDMENTS.md`
- `17_QA_OPEN_DECISIONS.md`
- `18_MONOREPO_BOOTSTRAP.md`
- `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md` — orden de ejecución hacia piloto
- `OP03A_PLANNER_PROVIDER_CAPABILITY_SEPARATION.md` — contrato de reducción backend de mutaciones Planner y preservación de lectura/Seating
- `OP03B_OPERATOR_PLANNER_SURFACES.md` — gating de launch surface Planner y preparación provider-led en Admin

## Precedencia para el cambio operator-led / Croquis V2

Cuando una tarea pertenezca a este cambio, usar este orden práctico:

1. `REPOSITORY_SOURCE_OF_TRUTH.md` para decidir qué repositorio/material es autoritativo.
2. `02_PRD.md`, `03_ROLES_PERMISOS_ACCESO.md` y `04_OPERATOR_LED_MVP.md` para producto.
3. ADR/contrato especializado del área (`ADR_OPERATOR_LED_ACCESS.md`, `FLOORPLAN_STICKER_SEATING_CONTRACT.md`, etc.).
4. `FLOORPLAN_UX_TARGET.md` y `LEGACY_UI_VISUAL_PORT_GUIDE.md` para UI/UX.
5. `14_CODEX_RULES.md` + `14A_OPERATOR_LED_CODEX_RULES.md` para implementación.
6. `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md` para secuencia de ejecución.
7. Render o referencia legacy únicamente al final y sólo para intención visual autorizada.

Una referencia visual nunca puede cambiar dominio, permisos, estados, contratos API o reglas financieras.

## Regla monorepo

`MONOREPO_ARCHITECTURE.md` sustituye cualquier instrucción anterior de crear repos separados. Los nombres históricos se mapean a rutas dentro de `apps/` y `packages/`.