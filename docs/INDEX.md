# Índice de documentación

Estado: **ÍNDICE OPERATIVO PARA DEV / AGENTES**

> No leer `/docs` como una lista plana. Empezar siempre por `docs/00-inicio/00_START_HERE.md`.

## 0. Dirección actual — leer primero

1. `docs/00-inicio/00_START_HERE.md` — puerta de entrada, precedencia y clasificación documental.
2. `docs/00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md` — **dirección activa de lanzamiento: M01 Managed solamente**.
3. `AGENTS.md` — workflow y reglas obligatorias para agentes/Codex.
4. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md` — repositorio canónico.

### Objetivo activo

```text
Provider / PLATFORM_ADMIN prepara
              ↓
            Evento
              ↓
INDEPENDENT_PLANNER opera
              ↓
       Staff temporal
```

El siguiente lanzamiento certifica exclusivamente **M01 Managed**. M02–M05, Self-Service, Enterprise y expansión Commercial/Finance son referencia futura salvo ticket explícito.

---

# A. ACTIVE — producto del lanzamiento Managed

## Producto y permisos

- `01-producto/02_PRD.md` — PRD general; aplicar sólo reglas no sustituidas por la dirección Managed actual.
- `01-producto/03_ROLES_PERMISOS_ACCESO.md` — roles y permisos persistidos.
- `01-producto/04_OPERATOR_LED_MVP.md` — separación Provider/Planner.
- `01-producto/06A_MODELO_01_PLANNER_INDEPENDIENTE.md` — **modelo operativo M01 vigente**.
- `01-producto/ACCESS_MATRIX.md` — matriz de acceso estándar.
- `01-producto/ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md` — capability administrativa Provider sin nuevo rol.

## Flujos y reglas

- `02-flujos-reglas/04_APP_FLOW.md`
- `02-flujos-reglas/05_REGLAS_NEGOCIO.md`
- `02-flujos-reglas/EVENT_STATE_MACHINE.md`

## UX

- `03-diseno/CLIENT_UI_VISUAL_SYSTEM.md` — visual system Client/Scanner.
- `03-ui-ux/07_UI_UX_FLOW.md` — flujo UX general.
- `03-diseno/FLOORPLAN_UX_TARGET.md` — UX especializada de Croquis.

## Gobierno técnico

- `04-tecnico/ADR_OPERATOR_LED_ACCESS.md`
- `04-tecnico/MONOREPO_ARCHITECTURE.md`
- `04-tecnico/08_TRD.md`
- `04-tecnico/09_MODELO_DATOS_CONCEPTUAL.md`
- `04-tecnico/10_SCHEMA_PRISMA_GUIDE.md`
- `04-tecnico/11_API_CONTRACTS.md`
- `04-tecnico/12_REPOS_Y_APPS.md`

---

# B. CONTRACT — contratos técnicos vigentes del runtime

Estos documentos describen comportamiento real y siguen siendo autoridad técnica aunque una capacidad quede oculta o desacoplada para Managed.

## Core

- `04-tecnico/CLIENTS_CONTRACT.md`
- `04-tecnico/EVENTS_CONTRACT.md`
- `04-tecnico/EVENT_ACTIVATION_CONTRACT.md`
- `04-tecnico/EVENT_LIFECYCLE_CONTRACT.md`
- `04-tecnico/CONTACTS_CONTRACT.md`
- `04-tecnico/INVITATIONS_CONTRACT.md`
- `04-tecnico/PUBLIC_RSVP_CONTRACT.md`
- `04-tecnico/QR_CONTRACT.md`

## Invitación / assets

- `04-tecnico/FILE_ASSETS_CONTRACT.md`
- `04-tecnico/FILE_ASSET_POLICY.md`
- `04-tecnico/INVITATION_DESIGN_CONTRACT.md`

## Staff / Scanner / operación

- `04-tecnico/STAFF_ACCESS_CONTRACT.md`
- `04-tecnico/SCANNER_CHECKIN_CONTRACT.md`
- `04-tecnico/REALTIME_PAYLOADS.md`
- `04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`

## Croquis / Seating / SVG

Orden de precedencia dentro de Croquis:

1. `04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md` — asientos/lugares persistentes y asignación exacta.
2. `04-tecnico/FLOORPLAN_SVG_MAPPING_CONTRACT.md` — SVG seguro, canonicalización y mapping.
3. `04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md` — modelo base/fallback.
4. `03-diseno/FLOORPLAN_UX_TARGET.md` — presentación/UX.

En M01 el **builder pertenece al Provider**; Planner consume Croquis y opera Seating.

## Apps

- `04-tecnico/CLIENT_APP_CONTRACT.md`
- `04-tecnico/ADMIN_APP_CONTRACT.md`
- `04-tecnico/EVENT_WIZARD_CONTRACT.md`

El Client Wizard actual contiene capacidades compatibles con Self-Service. Eso no significa que deban exponerse al Planner Managed.

## Reportes / Álbum

- `04-tecnico/REPORTS_CONTRACT.md`
- `04-tecnico/ALBUMS_CONTRACT.md`

## Finance / Commercial existentes

- `04-tecnico/FINANCE_CONTRACT.md`
- `04-tecnico/SERVICES_PRICING_CONTRACT.md`
- `02-flujos-reglas/06_FINANZAS_CREDITOS_CONTABILIDAD.md`
- `02-flujos-reglas/LEDGER_TYPES.md`

**Importante:** estos contratos siguen describiendo infraestructura real, pero Finance/Pricing no gobierna las capacidades funcionales de Managed Profile V1. No eliminar ni reescribir destructivamente; estudiar especialmente su acoplamiento con Activation durante MG-00/MG-03.

---

# C. CURRENT WORK — Managed Profile

La secuencia autorizada por dirección es:

```text
MG-00 Audit
  ↓
MG-01 Managed Profile Foundation
  ↓
MG-02 Managed Client Experience
  ↓
MG-03 Managed Activation
  ↓
MG-04 Commercial Demo Fixture
  ↓
MG-05 Managed E2E / UAT
```

P1 posterior:

- `MG-06` Reports Lite.
- `MG-07` Album Management.

Hasta que exista documentación específica MG en `05-implementacion/`, la definición de estos tickets vive en `00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`.

**Primera tarea:** `MG00_MANAGED_PROFILE_IMPLEMENTATION_AUDIT`. No cambiar dominio, roles, Finance ni Activation Managed antes de aprobación del audit.

---

# D. REFERENCE FUTURE — modelos documentados que NO autorizan code ahora

## Registro de modelos

- `01-producto/06_MODELOS_OPERATIVOS_DE_VENTA.md` — catálogo M01–M05; usarlo para entender diferencias, no como roadmap activo.
- `01-producto/06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md` — auditoría transversal útil para archaeology; sus gaps no son backlog automático.

## Modelos congelados para esta fase

- `01-producto/06B_MODELO_02_SALON_JARDIN_ORGANIZACION.md` — M02.
- `01-producto/06C_MODELO_03_LICENCIA_AUTOSERVICIO.md` — M03 / Self-Service.
- `01-producto/06D_MODELO_04_CLIENTE_GRAN_ESCALA_DEDICADO.md` — M04 / gran escala.
- `01-producto/06E_MODELO_05_PARTNER_RESELLER.md` — M05 / Partner-Reseller.

Reglas:

- no crear roles por estos modelos;
- no implementar superficies nuevas salvo ticket futuro explícito;
- no usar Partner/Venue/CommercialChannel para decidir capabilities;
- preservar código reutilizable que ya exista para Self-Service futuro.

---

# E. REFERENCE FUTURE — Commercial / Finance

Estos documentos explican el runtime comercial construido y pueden ser necesarios para mantener compatibilidad, pero **no dirigen el lanzamiento Managed V1**:

- `01-producto/05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`
- `01-producto/05A_PRICING_RESOLUTION_CLARIFICATION.md`
- `01-producto/05B_LANDING_COMMERCIAL_SALES_CONTRACT.md`
- `05-implementacion/20_COMMERCIAL_PILOT_ROADMAP.md`
- `05-implementacion/PILOT03_COMMERCIAL_UAT_RUNBOOK.md`
- `05-implementacion/LAND01_LANDING_COMMERCIAL_V2.md`
- `05-implementacion/LAND02_B2B_COMMERCIAL_INTAKE.md`
- `05-implementacion/OP04_OPERATOR_INTAKE_PLANNER_ASSIGNMENT.md`

Conservar Pricing V2, price locks, Ledger, Finance, Leads y Unit Economics existentes. No expandirlos durante Managed Profile V1 salvo defecto reproducible o ticket explícito.

---

# F. HISTORICAL / COMPLETED — contexto, no orden de ejecución

Los siguientes documentos pueden explicar decisiones o implementación existente, pero **no deben interpretarse como roadmap activo**:

- `05-implementacion/13_PLAN_IMPLEMENTACION.md`
- `05-implementacion/15_BACKLOG_CODEX.md`
- `05-implementacion/16_BACKLOG_QA_AMENDMENTS.md`
- `05-implementacion/17_QA_OPEN_DECISIONS.md`
- `05-implementacion/18_MONOREPO_BOOTSTRAP.md`
- `05-implementacion/19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`
- `05-implementacion/21_CLIENT_UI_REFACTOR_ROADMAP.md`
- `05-implementacion/22_FLOORPLAN_FUNCTIONAL_COMPLETION_ROADMAP.md` — superseded.
- `05-implementacion/23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md` — ejecución SVG completada; consultar contratos actuales para trabajo nuevo.
- `05-implementacion/UI01_CLIENT_FOUNDATION_EVENTS.md`
- `05-implementacion/UI02_WIZARD_GUESTS_CONFIRMATION.md`
- `05-implementacion/UI03_INVITATION_EXPERIENCE.md`
- `05-implementacion/UI03A_FLIPBOOK_MAGAZINE_RENDERER.md`
- `05-implementacion/UI04_OPERATIONAL_SURFACES.md`
- `05-implementacion/OP03A_PLANNER_PROVIDER_CAPABILITY_SEPARATION.md`
- `05-implementacion/OP03B_OPERATOR_PLANNER_SURFACES.md`
- `05-implementacion/FP01_PROVIDER_FLOORPLAN_SHELL.md`
- `05-implementacion/FP02_STICKER_CATALOG.md`
- `05-implementacion/FP03_FLOORPLAN_INTERACTION_ROBUSTNESS.md`
- `05-implementacion/FP04_PLANNER_SEATING_WORKSPACE_ALIGNMENT.md`
- `05-implementacion/FP05_SCALE_OPERATION_QA.md`
- `05-implementacion/FP06_DETAILED_SEATING.md`
- `05-implementacion/PILOT01_END_TO_END_READINESS.md`
- `05-implementacion/PILOT02_MINIMUM_OPERATIONAL_INSTRUMENTATION.md`
- `05-implementacion/LOCAL_PILOT_OPERATION_RUNBOOK.md`

`14_CODEX_RULES.md` y `14A_OPERATOR_LED_CODEX_RULES.md` pueden seguir aportando reglas de ejecución no contradictorias, pero `AGENTS.md` y `00_START_HERE.md` prevalecen.

---

# G. Cómo decidir qué leer por tipo de cambio

| Cambio | Leer primero |
|---|---|
| perfil Managed / quién prepara | `00_START_HERE` → dirección M01 → `04_OPERATOR_LED_MVP` → `06A` |
| roles / ownership / autorización | dirección M01 → `03_ROLES_PERMISOS_ACCESO` → Access Matrix → contrato técnico |
| Client | dirección M01 → `CLIENT_APP_CONTRACT` → `ACTIVE_EVENT_WORKSPACE_CONTRACT` |
| Admin Provider | dirección M01 → `ADMIN_APP_CONTRACT` → ADR operator-led |
| Activation | dirección M01 → `EVENT_ACTIVATION_CONTRACT` → `FINANCE_CONTRACT` → implementación real |
| Invitación | dirección M01 → Invitation Design / Invitations / File Assets contracts |
| Croquis | dirección M01 → Detailed Seating → SVG Mapping → Sticker Seating |
| Staff / Scanner | dirección M01 → Staff Access → Scanner Check-in |
| Finance/Pricing | contratos Finance/Pricing; recordar que están fuera del lanzamiento salvo ticket |
| modelo M02–M05 | `06_MODELOS...` + documento específico, sólo para análisis futuro |

---

# H. Reglas de precedencia

1. `AGENTS.md` manda sobre workflow.
2. `00_START_HERE.md` manda sobre navegación documental.
3. `01_DIRECCION_ACTUAL_M01_MANAGED.md` manda sobre alcance del lanzamiento.
4. M01/operator-led manda sobre reparto Provider/Planner para esta fase.
5. Contratos especializados mandan sobre detalles técnicos del runtime.
6. Código real resuelve archaeology cuando la documentación esté desactualizada; cualquier contradicción debe documentarse antes de cambiar negocio.
7. Roadmaps y tickets completados no reabren scope.
8. Documentos M02–M05 y Commercial/Finance no autorizan implementación por sí solos.
9. Referencias visuales nunca cambian dominio, permisos, estados, API ni Finance.
10. `MONOREPO_ARCHITECTURE.md` prevalece sobre cualquier instrucción histórica de repos separados.

## Repositorio canónico

`ManuelRuiz27/invitacionespremium`.

`ManuelRuiz27/Soft-Monkey_InvitacionesPremium` es únicamente **LEGACY / VISUAL REFERENCE ONLY**.
