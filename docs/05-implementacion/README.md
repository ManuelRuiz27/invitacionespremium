# Implementación — cómo leer esta carpeta

Estado: **GUÍA DE ROADMAPS Y TICKETS**

Antes de usar un roadmap o ticket de esta carpeta, leer:

1. `../00-inicio/00_START_HERE.md`
2. `../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`
3. `../../AGENTS.md`
4. `24_MANAGED_M01_LAUNCH_ROADMAP.md`
5. `MG00_MANAGED_PROFILE_IMPLEMENTATION_AUDIT.md` cuando la tarea pertenezca a M01 Managed.

## CURRENT WORK

Roadmap activo:

- `24_MANAGED_M01_LAUNCH_ROADMAP.md` — **orden técnico del lanzamiento M01**, reconciliado con la auditoría de arquitectura/endpoints de septiembre.

Audit de entrada:

- `MG00_MANAGED_PROFILE_IMPLEMENTATION_AUDIT.md` — **MG-00 completado por Technical Owner; pendiente de aprobación antes de autorizar código MG-01+**. Contiene la matriz `EXISTS / ADAPT / MISSING / HIDE_FOR_MANAGED / FINANCE_COUPLED / BROKEN_REPAIR / FUTURE_PRESERVE / OUT_OF_SCOPE`, archivos afectados y tickets pequeños propuestos.

Camino crítico de alto nivel:

```text
MG-00 Managed Profile Implementation Audit
  ↓
MG-01 Managed Profile Foundation
  ↓
MG-02 Managed Planner Surface
  ↓
MG-01A SDK/OpenAPI Transport Guard
  ↓
MG-02A Planner Operations Completeness
  ↓
MG-03 Managed Intake + Activation
  ↓
MG-04 Commercial Demo Fixture
  ↓
MG-05 Managed E2E / Release UAT
```

El audit refina estos bloques en tickets pequeños:

```text
MG-01.1 Operating Profile Foundation
→ MG-01.2 Managed Capability API Gates
→ MG-02.1 Managed Client Surface
→ MG-01A SDK/OpenAPI Transport Guard
→ MG-02A.1 Guests Workspace
→ MG-02A.2 Invitations / Assistants
→ MG-02A.3 RSVP Operations
→ MG-02A.4 Close Event
→ MG-03A Managed Event Intake
→ MG-03B Managed Activation
→ MG-04
→ MG-05
```

Este refinamiento es **recomendación técnica de MG-00**. No autoriza code hasta aprobación del audit.

P1 posterior:

- MG-06 Reports Lite.
- MG-07 Album Management.

Release gates:

- RG-01 Security / anti-abuse / production auth evidence.
- RG-02 Deployment / realtime topology.

**MG-00 ya fue producido; MG-01.1 es el primer ticket de código propuesto, pero permanece NO AUTORIZADO hasta aprobación explícita del audit.**

La auditoría Astra se usa como **evidencia técnica**, no como backlog automático. Sus R-01…R-11 no sustituyen este roadmap ni autorizan conectar endpoints sólo porque existen.

## COMPLETED / HISTORICAL

Los roadmaps y tickets siguientes explican capacidades ya construidas o decisiones pasadas; no marcan el orden actual:

- `19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`.
- `20_COMMERCIAL_PILOT_ROADMAP.md`.
- `21_CLIENT_UI_REFACTOR_ROADMAP.md`.
- `22_FLOORPLAN_FUNCTIONAL_COMPLETION_ROADMAP.md`.
- `23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md`.
- `UI01_CLIENT_FOUNDATION_EVENTS.md`.
- `UI02_WIZARD_GUESTS_CONFIRMATION.md`.
- `UI03_INVITATION_EXPERIENCE.md`.
- `UI03A_FLIPBOOK_MAGAZINE_RENDERER.md`.
- `UI04_OPERATIONAL_SURFACES.md`.
- `OP03A_PLANNER_PROVIDER_CAPABILITY_SEPARATION.md`.
- `OP03B_OPERATOR_PLANNER_SURFACES.md`.
- `OP04_OPERATOR_INTAKE_PLANNER_ASSIGNMENT.md`.
- `FP01_PROVIDER_FLOORPLAN_SHELL.md`.
- `FP02_STICKER_CATALOG.md`.
- `FP03_FLOORPLAN_INTERACTION_ROBUSTNESS.md`.
- `FP04_PLANNER_SEATING_WORKSPACE_ALIGNMENT.md`.
- `FP05_SCALE_OPERATION_QA.md`.
- `FP06_DETAILED_SEATING.md`.
- `PILOT01_END_TO_END_READINESS.md`.
- `PILOT02_MINIMUM_OPERATIONAL_INSTRUMENTATION.md`.
- `PILOT03_COMMERCIAL_UAT_RUNBOOK.md`.
- `LAND01_LANDING_COMMERCIAL_V2.md`.
- `LAND02_B2B_COMMERCIAL_INTAKE.md`.

Cuando un documento histórico contradiga la dirección Managed actual, **no reabrir comportamiento anterior**. Consultar el contrato técnico vigente, `24_MANAGED_M01_LAUNCH_ROADMAP.md` y el audit MG-00 antes de abrir trabajo nuevo.

## GOVERNANCE / RULES

- `14_CODEX_RULES.md` y `14A_OPERATOR_LED_CODEX_RULES.md` siguen siendo útiles cuando no contradigan `AGENTS.md`, `00_START_HERE.md` o el roadmap M01 activo.
- cualquier referencia histórica a ramas/PR queda subordinada al workflow vigente de `AGENTS.md`.
- un roadmap terminado no autoriza refactors oportunistas.
- una operación backend sin consumidor UI no es automáticamente un gap del lanzamiento.
- una ruta mencionada en documentación histórica no autoriza restaurarla.
- una recomendación del audit no es code autorizado hasta que el PM/Technical Owner aprueben el ticket correspondiente.

## Regla práctica para agentes

Antes de ejecutar un archivo de esta carpeta preguntar:

1. ¿Es CURRENT WORK o HISTORICAL?
2. ¿El capability ya existe en el runtime?
3. ¿El cambio solicitado pertenece a M01 Managed?
4. ¿El audit MG-00 lo clasifica y el roadmap M01 lo incluye?
5. ¿Existe ticket actual explícito y autorizado?

Si no hay ticket vigente, el documento se usa como contexto, no como autorización de code.
