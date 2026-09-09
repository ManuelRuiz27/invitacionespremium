# Reglas para agentes y Codex

1. Antes de editar, leer `README.md`, `docs/00-inicio/00_START_HERE.md` y la documentación obligatoria que ese archivo indique para la tarea. No recorrer `/docs` como una lista plana ni asumir que todo documento describe alcance vigente.
2. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md` define límites entre apps y packages.
3. No inventar entidades, roles, estados, permisos, rutas ni reglas.
4. Las reglas de negocio viven en `apps/api`; los frontends no las duplican.
5. Una app no importa código fuente de otra app.
6. Código compartido solo vive en `packages/*`.
7. `packages/ui` no contiene reglas de negocio ni llamadas API.
8. `packages/api-client` se genera desde OpenAPI; no mantener DTOs duplicados manualmente.
9. Cada cambio de código debe ejecutar lint, typecheck, tests relevantes y build; cualquier fallo preexistente se reporta por separado de una regresión introducida.
10. No agregar secretos ni credenciales al repositorio.
11. Cualquier cambio en Croquis, Mesas, distribución o asignación visual debe leer primero la dirección activa Managed y los contratos especializados vigentes: `docs/04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`, `docs/04-tecnico/FLOORPLAN_SVG_MAPPING_CONTRACT.md` cuando aplique y `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`; para UI/UX consultar además `docs/03-diseno/FLOORPLAN_UX_TARGET.md`. Documentación histórica que prohibía asientos detallados o SVG queda subordinada a estos contratos actuales.
12. Cualquier cambio en envío, distribución o compartición de Invitaciones debe leer `docs/01-producto/02_PRD.md`, `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md` y `docs/04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`. El MVP comparte el link individual desde el workspace en `ACTIVE`/`EVENT_DAY`; no inventar WhatsApp API, webhooks, estados `sent/delivered/read` ni auditoría de entrega sin un contrato posterior explícito.
13. Workflow vigente del proyecto: trabajar directamente sobre `main`. Antes de editar: `git checkout main`, `git pull --ff-only origin main` y confirmar árbol limpio. Después: implementar el scope autorizado, ejecutar QA, crear un commit pequeño y hacer `git push origin main`. No crear ramas ni PRs salvo instrucción expresa del usuario.
14. Codex se delega cuando la tarea requiere modificar código. Trabajo exclusivamente documental no se delega a Codex; lo realiza el Technical Owner. Codex sólo modifica documentación cuando forma parte inseparable de un cambio de código autorizado, por ejemplo OpenAPI generado, contratos técnicos directamente afectados o referencias obligatorias del cambio.
15. No ejecutar fases `PLAN-ONLY` con Codex cuando el ticket técnico ya está cerrado. En ese caso Codex debe implementar el código solicitado, probarlo, hacer commit y push a `main`, y devolver evidencia verificable.
16. Ante cualquier referencia antigua a flujo por rama/PR en documentación previa, prevalecen las reglas 13–15 de este archivo salvo instrucción expresa del usuario.
17. Antes de crear, modificar o inferir roles, ownership, superficies o permisos para un escenario comercial (Planner, salón/jardín, agencia, reseller, licencia, instancia dedicada u otro), leer `docs/00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`, `docs/01-producto/06_MODELOS_OPERATIVOS_DE_VENTA.md` y el modelo especializado aplicable. Un escenario comercial no autoriza por sí mismo un nuevo rol ni una nueva capacidad.
18. Dirección activa de lanzamiento: **M01 Managed para Planner independiente**. M02–M05, Partner/Venue pricing, Self-Service, Enterprise y Commercial/Finance V3 son referencia futura salvo ticket explícito posterior. No usar `CommercialChannel`, tipo de tarifa, créditos o pricing como capability profile. La primera fase autorizada es `MG00_MANAGED_PROFILE_IMPLEMENTATION_AUDIT`; no modificar dominio, roles, Finance ni activación Managed antes de que ese audit sea revisado y aprobado.
