# Implementación — cómo leer esta carpeta

Estado: **GUÍA DE ROADMAPS Y TICKETS**

Antes de usar un roadmap o ticket de esta carpeta, leer:

1. `../00-inicio/00_START_HERE.md`
2. `../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`
3. `../../AGENTS.md`

## CURRENT WORK

El orden actual es:

```text
MG-00 Managed Profile Implementation Audit
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

- MG-06 Reports Lite.
- MG-07 Album Management.

Hasta que existan archivos MG específicos en esta carpeta, su definición está en `../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`.

**MG-00 es la única primera tarea autorizada.** No implementar MG-01+ ni modificar dominio, roles, Finance o Activation Managed antes de que el audit sea revisado y aprobado.

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

Cuando un documento histórico contradiga la dirección Managed actual, **no reabrir comportamiento anterior**. Consultar el contrato técnico vigente para comprender el runtime y abrir un ticket nuevo únicamente si la dirección actual lo requiere.

## GOVERNANCE / RULES

- `14_CODEX_RULES.md` y `14A_OPERATOR_LED_CODEX_RULES.md` siguen siendo útiles cuando no contradigan `AGENTS.md` o `00_START_HERE.md`.
- cualquier referencia histórica a ramas/PR queda subordinada al workflow vigente de `AGENTS.md`.
- un roadmap terminado no autoriza refactors oportunistas.

## Regla práctica para agentes

Antes de ejecutar un archivo de esta carpeta preguntar:

1. ¿Es CURRENT WORK o HISTORICAL?
2. ¿El capability ya existe en el runtime?
3. ¿El cambio solicitado pertenece a M01 Managed?
4. ¿Existe ticket actual explícito?

Si no hay ticket vigente, el documento se usa como contexto, no como autorización de code.
