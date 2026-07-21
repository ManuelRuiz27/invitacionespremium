# InvitacionesPremium bt Soft-Monky — Documentación fuente de verdad

Esta carpeta contiene la documentación base para implementar el sistema desde cero.

## Regla principal

Esta documentación es la fuente de verdad para Codex y para cualquier implementación técnica.

No se deben inventar entidades, roles, módulos, estados, reglas, permisos ni flujos que no estén definidos aquí.

## Orden de lectura recomendado

1. `docs/01-producto/01_GLOSARIO_Y_MODELO_CONCEPTUAL.md`
2. `docs/01-producto/02_PRD.md`
3. `docs/01-producto/03_ROLES_PERMISOS_ACCESO.md`
4. `docs/01-producto/ACCESS_MATRIX.md`
5. `docs/02-flujos-reglas/04_APP_FLOW.md`
6. `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md`
7. `docs/02-flujos-reglas/EVENT_STATE_MACHINE.md`
8. `docs/02-flujos-reglas/SERVICE_UPGRADE_FLOW.md`
9. `docs/02-flujos-reglas/06_FINANZAS_CREDITOS_CONTABILIDAD.md`
10. `docs/02-flujos-reglas/LEDGER_TYPES.md`
11. `docs/03-ui-ux/07_UI_UX_FLOW.md`
12. `docs/04-tecnico/08_TRD.md`
13. `docs/04-tecnico/09_MODELO_DATOS_CONCEPTUAL.md`
14. `docs/04-tecnico/10_SCHEMA_PRISMA_GUIDE.md`
15. `docs/04-tecnico/11_API_CONTRACTS.md`
16. `docs/04-tecnico/12_REPOS_Y_APPS.md`
17. `docs/04-tecnico/FILE_ASSET_POLICY.md`
18. `docs/04-tecnico/REALTIME_PAYLOADS.md`
19. `docs/05-implementacion/13_PLAN_IMPLEMENTACION.md`
20. `docs/05-implementacion/14_CODEX_RULES.md`
21. `docs/05-implementacion/15_BACKLOG_CODEX.md`
22. `docs/05-implementacion/16_BACKLOG_QA_AMENDMENTS.md`
23. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`

## Jerarquía

En caso de diferencia:

1. corrección explícita más reciente aprobada por el usuario;
2. contrato especializado del área;
3. documento base de producto/técnico;
4. `13_PLAN_IMPLEMENTACION.md`;
5. `16_BACKLOG_QA_AMENDMENTS.md`, únicamente para las tareas que corrige expresamente;
6. `15_BACKLOG_CODEX.md`.

`17_QA_OPEN_DECISIONS.md` registra decisiones QA. Solo una decisión con estado `OPEN` bloquea implementación; una decisión `RESOLVED` remite al contrato especializado obligatorio.

`SERVICE_UPGRADE_FLOW.md` es el contrato especializado para el único cambio post-activación permitido en MVP: Flyer → Flipbook antes de `event_day`.

Si dos contratos especializados se contradicen, no se implementa hasta corregir documentación.

## Alcance

Primero se consolida la documentación fuente de verdad. Después se crean los repos de código y se implementa el producto por módulos con Codex.

`13_PLAN_IMPLEMENTACION.md` describe el orden de construcción interno del producto. `15_BACKLOG_CODEX.md` convierte ese plan en tareas ejecutables y verificables. `16_BACKLOG_QA_AMENDMENTS.md` corrige tareas específicas detectadas durante QA sin renumerar el backlog. `17_QA_OPEN_DECISIONS.md` conserva el registro de decisiones que requirieron aprobación explícita.

## Repos previstos

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

## Regla de cambio

Cualquier cambio que afecte roles, estados, servicio contratado, finanzas, archivos, privacidad o tiempo real debe actualizar primero el documento especializado correspondiente antes de modificar código.

Antes de iniciar una tarea Codex debe comprobar si existe una decisión `OPEN` aplicable y leer cualquier contrato especializado señalado por una decisión `RESOLVED`.