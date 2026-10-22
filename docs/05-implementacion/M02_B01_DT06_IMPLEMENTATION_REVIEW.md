# M02-B01-DT06 — Revisión de implementación

**Dictamen:** **DT06 IMPLEMENTADO — REVISIÓN ESTÁTICA FAVORABLE, CERTIFICACIÓN CI TOTAL NO APROBADA.**
**Commit de implementación:** [`5d4915d5178922821bb9d6c33a709658b714955d`](https://github.com/ManuelRuiz27/invitacionespremium/commit/5d4915d5178922821bb9d6c33a709658b714955d).
**Fecha:** 2026-10-20.
**Método:** inspección independiente del commit, archivos reales de `main`, suite de pruebas versionada y logs de GitHub Actions; no ejecución local nueva.

## 1. Implementación comprobada

- **Readiness común:** `apps/api/src/events/access-control-readiness.service.ts` utiliza `resolve_access_control_readiness()` en PostgreSQL, combina blockers con `resolveFloorplanReadiness()` y recalcula `DRAFT/CONFIGURED/READY_TO_ACTIVATE`. El predicado SQL es compartido con el trigger de primera activación.
- **NOMINAL:** se comprueban Contact→Invitation individual→Assistant PENDING→credencial individual vigente, límites de capacidad, historial revocado, identidad activa, asistencia previa, aislamiento frente a pases físicos y asignación TABLE/SEAT.
- **ANONYMOUS:** `PhysicalPass` vigente/no revocado, aforo, ausencia de identidades nominales, folios continuos **incluyendo historia revocada**, no consumo previo, seating TABLE; la revocación legítima libera cupo sin reutilizar folio.
- **SQL:** migración `20261020210000_add_access_control_readiness/migration.sql` (260 líneas), campo `event.accessActivationResultSnapshot`, trigger `protect_access_control_activation()` (primera activación Serializable, materiales válidos, snapshot congruente/inmutable, no cambio simultáneo de configuración), guardas de capacidad nominal y degradación de preparación READY ante invalidación de Cliente/servicio/Planner. Mantiene las guardas históricas M01.
- **Activación:** `EventsService.requireActivationPreflight()` sustituye sólo el bloqueo provisional de ACCESS_CONTROL por readiness transaccional, recomputación y revalidación; `activateManagedAdmin()` preserva Actor Provider/tenant/idempotencia y guarda el snapshot original para replay. No consume Ledger, Receipt, crédito ni Price Book en la rama Managed.
- **API/SDK:** endpoints REST de lectura de readiness para Provider y Organization Admin/Planner asignado, DTO mínimo, contratos y SDK actualizado. No hay interfaz UI, reportes ni licencias en este ticket.
- **Integraciones:** recomputación llamada desde `events.service.ts`, `contacts.service.ts`, `invitations.service.ts`, `nominal-access.service.ts`, `physical-passes.service.ts` y mutaciones de `floorplan.service.ts`.
- **Regresiones:** `apps/api/test/access-control-readiness.integration-spec.ts` (986 líneas) cubre activación real NOMINAL/ANONYMOUS, sin RSVP/diseño, revocación, folios, Mesa/SEAT, pureza financiera, bloqueo SQL, auditoría/rollback y concurrencia PostgreSQL con verificación de waiters.

El código conserva las superficies `PHYSICAL_QR` legacy, M01 Managed y Finance sin alteración de su intención contractual.

## 2. QA y GitHub Actions

**Resultados comunicados por Codex, no reejecutados aquí:** 52 migraciones limpias/actualización legacy; 370/370 unitarias API; 239/239 regresiones; 40/40 DT06; 61/61 revalidaciones; suite global 11/11 tareas; Prisma validate/generate, lint, formato de archivos modificados, typecheck, build y OpenAPI/SDK aprobados. El `format:check` global local reportado falla por artefactos ignorados bajo `var/` (no modificados).

**[GitHub Actions DT06 — run 39529739416](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39529739416)**, consultado en revisión:
- `quality`: **in_progress**; pasos migraciones, OpenAPI, SDK, format-check CI, lint, typecheck y unitarias **success**; integración/build todavía pendientes al último corte. No declarar `quality` verde mientras siga en ejecución.
- `flipbook-browser-qa`: **failure**, caso WebKit `e2e/flipbook-mobile.spec.ts:630` `REQ-02 corner preview preserves only the stationary leaf curl`, expectativa `data-corner-preview=true` no alcanzada en 8000 ms; 1 de 74 casos. **Mismo test/aserción y timeout que DT03–DT04**, preexistente al diff DT06. El workflow total no está verde y staging no debe inferirse desplegado.
- CI DT05 del commit anterior finalizó con jobs **cancelados** (no verdes). No confundir el CI actual con los resultados locales de Codex.

## 3. Pendientes operativos / release

**Bloqueo de delegación Staff:** el trigger histórico de creación de StaffToken exige a Organization Planner identidad creadora del Evento; para ACCESS_CONTROL el creador es Platform Admin, mientras la autorización API se apoya en `assignedPlannerUserId`. Por ello el Organization Planner asignado **no puede crear StaffTokens**, aunque el Organization Admin sí. DT06 verificó escaneo con Admin y conserva esta divergencia explícitamente (ver `ACCESS_CONTROL_READINESS_CONTRACT.md`). Corregir mediante un corte pequeño antes de considerar completa la operación delegada de DT07/DT09: armonizar SQL y API con ownership de Planner asignado sin dar permisos al creador por defecto; pruebas reales de Staff/Scanner y regresión M01.

**QA Flipbook:** investigar la falla WebKit histórica por separado, sin mezclarla con la implementación de ACCESS_CONTROL ni suponer causa sin inspeccionar trace.

**DT07–DT09:** UX Provider/Client/Scanner, métricas de operación y certificación integral, incluidos Staff delegado, límites físicos/dispositivos, carga y release; no implementados.

**Conclusión:** DT06 entrega la activación técnica real para NOMINAL y ANONYMOUS sin Finance y supera la revisión estática de sus invariantes principales, pero **NO implica disponibilidad productiva ni aprobación de CI completo**. El pendiente Staff y el QA navegador deben quedar visibles en el handoff.


## Actualización posterior — DT06A (2026-10-22)

El bloqueo de delegación Staff documentado arriba es **histórico, no vigente**: fue corregido por [DT06A](./M02_B01_DT06A_IMPLEMENTATION_REVIEW.md), commit [`88d5c818`](https://github.com/ManuelRuiz27/invitacionespremium/commit/88d5c818cadca2a7770437f4dc7e6e0d7251ad85). El Planner asignado ahora puede crear StaffTokens ACCESS_CONTROL con autorización SQL y HTTP coherente, manteniendo legacy; el CI `quality` de DT06A terminó **success**. QA Flipbook WebKit aún falla en el mismo caso preexistente, y DT07–DT09 siguen sin implementarse. El CI `quality` del commit original DT06 terminó **cancelado** al ser sucedido por cambios posteriores, no aprobado.
