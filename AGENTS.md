# Reglas para agentes y Codex

1. Leer `README.md` y la documentación obligatoria en `/docs` antes de editar.
2. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md` define límites entre apps y packages.
3. No inventar entidades, roles, estados, permisos, rutas ni reglas.
4. Las reglas de negocio viven en `apps/api`; los frontends no las duplican.
5. Una app no importa código fuente de otra app.
6. Código compartido solo vive en `packages/*`.
7. `packages/ui` no contiene reglas de negocio ni llamadas API.
8. `packages/api-client` se genera desde OpenAPI; no mantener DTOs duplicados manualmente.
9. Cada cambio de código debe ejecutar lint, typecheck, tests relevantes y build; cualquier fallo preexistente se reporta por separado de una regresión introducida.
10. No agregar secretos ni credenciales al repositorio.
11. Cualquier cambio en Croquis, Mesas, distribución o asignación visual debe leer primero `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md` y `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`; para UI/UX consultar además `docs/03-diseno/FLOORPLAN_UX_TARGET.md` y su render. La asignación individual por asiento no queda autorizada para implementación backend mientras el contrato base vigente siga prohibiendo cambios de payload/endpoints; esa fase requiere ADR y actualización contractual explícita antes de código.
12. Cualquier cambio en envío, distribución o compartición de Invitaciones debe leer `docs/01-producto/02_PRD.md`, `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md` y `docs/04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`. El MVP comparte el link individual desde el workspace en `ACTIVE`/`EVENT_DAY`; no inventar WhatsApp API, webhooks, estados `sent/delivered/read` ni auditoría de entrega sin un contrato posterior explícito.
13. Workflow vigente del proyecto: trabajar directamente sobre `main`. Antes de editar: `git checkout main`, `git pull --ff-only origin main` y confirmar árbol limpio. Después: implementar el scope autorizado, ejecutar QA, crear un commit pequeño y hacer `git push origin main`. No crear ramas ni PRs salvo instrucción expresa del usuario.
14. Codex se delega cuando la tarea requiere modificar código. Trabajo exclusivamente documental no se delega a Codex; lo realiza el Technical Owner. Codex sólo modifica documentación cuando forma parte inseparable de un cambio de código autorizado, por ejemplo OpenAPI generado, contratos técnicos directamente afectados o referencias obligatorias del cambio.
15. No ejecutar fases `PLAN-ONLY` con Codex cuando el ticket técnico ya está cerrado. En ese caso Codex debe implementar el código solicitado, probarlo, hacer commit y push a `main`, y devolver evidencia verificable.
16. Ante cualquier referencia antigua a flujo por rama/PR en documentación previa, prevalecen las reglas 13–15 de este archivo salvo instrucción expresa del usuario.
