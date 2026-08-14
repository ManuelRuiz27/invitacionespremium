# Reglas para agentes y Codex

1. Leer `README.md` y la documentación obligatoria en `/docs` antes de editar.
2. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md` define límites entre apps y packages.
3. No inventar entidades, roles, estados, permisos, rutas ni reglas.
4. Las reglas de negocio viven en `apps/api`; los frontends no las duplican.
5. Una app no importa código fuente de otra app.
6. Código compartido solo vive en `packages/*`.
7. `packages/ui` no contiene reglas de negocio ni llamadas API.
8. `packages/api-client` se generará desde OpenAPI; no mantener DTOs duplicados manualmente.
9. Cada cambio debe ejecutar lint, typecheck, tests y build.
10. No agregar secretos ni credenciales al repositorio.
11. Cualquier cambio en Croquis, Mesas, distribución o asignación visual debe leer primero `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md` y `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`; para UI/UX consultar además `docs/03-diseno/FLOORPLAN_UX_TARGET.md` y su render. La asignación individual por asiento no queda autorizada para implementación backend mientras el contrato base vigente siga prohibiendo cambios de payload/endpoints; esa fase requiere ADR y actualización contractual explícita antes de código.
12. Cualquier cambio en envío, distribución o compartición de Invitaciones debe leer `docs/01-producto/02_PRD.md`, `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md` y `docs/04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`. El MVP comparte el link individual desde el workspace en `ACTIVE`/`EVENT_DAY`; no inventar WhatsApp API, webhooks, estados `sent/delivered/read` ni auditoría de entrega sin un contrato posterior explícito.
