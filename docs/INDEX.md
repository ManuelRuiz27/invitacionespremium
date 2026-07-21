# Índice de documentación

## 01-producto

- `01_GLOSARIO_Y_MODELO_CONCEPTUAL.md`
- `02_PRD.md`
- `03_ROLES_PERMISOS_ACCESO.md`
- `ACCESS_MATRIX.md`

## 02-flujos-reglas

- `04_APP_FLOW.md`
- `05_REGLAS_NEGOCIO.md`
- `EVENT_STATE_MACHINE.md`
- `SERVICE_UPGRADE_FLOW.md`
- `06_FINANZAS_CREDITOS_CONTABILIDAD.md`
- `LEDGER_TYPES.md`

## 03-ui-ux

- `07_UI_UX_FLOW.md`

## 04-tecnico

- `08_TRD.md`
- `09_MODELO_DATOS_CONCEPTUAL.md`
- `10_SCHEMA_PRISMA_GUIDE.md`
- `11_API_CONTRACTS.md`
- `12_REPOS_Y_APPS.md`
- `FILE_ASSET_POLICY.md`
- `REALTIME_PAYLOADS.md`

## 05-implementacion

- `13_PLAN_IMPLEMENTACION.md`
- `14_CODEX_RULES.md`
- `15_BACKLOG_CODEX.md`
- `16_BACKLOG_QA_AMENDMENTS.md`
- `17_QA_OPEN_DECISIONS.md`

## Documentos especializados de QA

Los siguientes documentos convierten decisiones generales en contratos implementables:

- `ACCESS_MATRIX.md`: permisos y ownership.
- `EVENT_STATE_MACHINE.md`: transiciones válidas del Evento.
- `SERVICE_UPGRADE_FLOW.md`: upgrade Flyer → Flipbook post-activación, preparación privada, diferencia y publicación atómica.
- `LEDGER_TYPES.md`: movimientos y efectos financieros.
- `FILE_ASSET_POLICY.md`: ownership y ciclo de vida de archivos.
- `REALTIME_PAYLOADS.md`: contratos Socket.IO.
- `15_BACKLOG_CODEX.md`: tareas ejecutables para Codex.
- `16_BACKLOG_QA_AMENDMENTS.md`: correcciones autoritativas a tareas específicas del backlog hasta su consolidación.
- `17_QA_OPEN_DECISIONS.md`: registro de decisiones abiertas o resueltas que requirieron aprobación explícita.

## Regla de lectura del backlog

Para ejecutar una tarea Codex:

1. leer `14_CODEX_RULES.md`;
2. leer la tarea correspondiente en `15_BACKLOG_CODEX.md`;
3. verificar si está corregida por `16_BACKLOG_QA_AMENDMENTS.md`;
4. verificar si existe una decisión aplicable en `17_QA_OPEN_DECISIONS.md`;
5. aplicar los contratos especializados del módulo, incluido `SERVICE_UPGRADE_FLOW.md` cuando corresponda;
6. detener implementación ante cualquier contradicción no resuelta.