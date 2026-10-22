# M02-B01-DT06A — Revisión de implementación

**Dictamen:** **IMPLEMENTADO / QA API VERDE** — corrección de autorización SQL para StaffToken de Planner de Organización asignado. **No certifica release completo** por QA Flipbook rojo.
**Commit verificado:** [`88d5c818cadca2a7770437f4dc7e6e0d7251ad85`](https://github.com/ManuelRuiz27/invitacionespremium/commit/88d5c818cadca2a7770437f4dc7e6e0d7251ad85) — `fix(staff): authorize assigned access-control planners`.
**Fecha de revisión:** 2026-10-22.
**Método:** diff GitHub, migración, contratos, suites versionadas y GitHub Actions. No se reejecutó QA local independientemente.

## Evidencia de implementación

- **Migración aditiva** `apps/api/prisma/migrations/20261020220000_fix_access_control_staff_planner_authorization/migration.sql` redefine `validate_staff_token_insert()` sin editar migraciones previas. Conserva `Event FOR UPDATE`, estado `ACTIVE/EVENT_DAY`, validación de actor, organización/tenant, máximo tres tokens activos y todas las protecciones históricas.
- **Rama exclusiva B01:** para `service.code=ACCESS_CONTROL` con `accessMode=NOMINAL|ANONYMOUS`, `ORGANIZATION_PLANNER` requiere `created_by_user_id` del StaffToken igual a `Event.assigned_planner_user_id` y Cliente `ORGANIZATION+MANAGED` activo. `Event.created_by_user_id` sigue siendo Provider; no se impersona.
- **Otros servicios:** `FLYER`, `FLIPBOOK`, `PHYSICAL_QR` y `DEMO` mantienen la regla SQL histórica de comparar con `Event.created_by_user_id`. `ORGANIZATION_ADMIN` e `INDEPENDENT_PLANNER` conservan permisos anteriores. `PLATFORM_ADMIN` no usa las rutas Client de Staff.
- **API:** se preservan rutas, DTO y servicio `StaffTokenManagementService`, ya autorizado por `eventOwnedWhere()` según `assignedPlannerUserId`. No hay cambio criptográfico, de Scanner, Finance, activación ni licencias.
- **Contratos** `STAFF_ACCESS_CONTRACT.md` y `ACCESS_CONTROL_READINESS_CONTRACT.md` reflejan el comportamiento efectivo; se retira el pendiente de DT06.

## Regresiones inspeccionadas

- `apps/api/test/access-control-readiness.integration-spec.ts`: casos parametrizados NOMINAL/ANONYMOUS para creación HTTP 201 y SQL directo permitido; rechazo cross-tenant, Planner no asignado, Provider y usuario eliminado; listado sin digest/token; reasignación revoca nuevas emisiones del anterior sin invalidar StaffTokens históricos; cuatro solicitudes concurrentes terminan en 3×201 + 1×409 `STAFF_TOKEN_LIMIT_REACHED`; pruebas de sesiones Scanner.
- `apps/api/test/staff-access.integration-spec.ts`: matriz legacy parametrizada para `FLYER`, `FLIPBOOK`, `PHYSICAL_QR`, `DEMO` confirma que el SQL permite el creador histórico y rechaza al nuevo asignado después de reasignación. Pruebas heredadas validan expiración/rollback, inmutabilidad y límite de tres tokens.
- **Reporte de Codex, no reejecutado aquí:** 187 integraciones y 370 unitarias API, migraciones limpias/upgrade legacy, Prisma, lint, typecheck, build y OpenAPI/SDK aprobados.

## GitHub Actions y caveats

[CI del commit — run `39664604026`](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39664604026):

- `quality`: **SUCCESS**. Pasaron migraciones, Prisma, generación/deriva de OpenAPI y SDK, formato del CI, lint, typecheck, unitarias, integraciones y build.
- `flipbook-browser-qa`: **FAILURE**, 73/74 tests. Exactamente `[webkit] e2e/flipbook-mobile.spec.ts:630` — `REQ-02 corner preview preserves only the stationary leaf curl`; aserción `data-corner-preview=true` no alcanzada en 8 s. Es la misma falla observada antes de DT06A; no tiene vínculo evidente con este diff de SQL/pruebas/documentación. Investigar de forma separada, con trace/evidencia, antes de certificación global.
- El workflow CI completo finalizó **failure** porque incluye ese job de navegador. No interpretar `quality` verde como release/staging verde.

## Siguiente entrega

**DT07 — interfaces Provider/Organización/Scanner:** utilizar autorización Staff corregida y los endpoints B01 ya implementados. Scope front-end y E2E funcional de preparación/distribución/escaneo sin diseño de invitación, respetando roles MANAGED. No crear nuevas reglas Finance, licencias ni endpoints paralelos.

**DT08:** métricas operativas. **DT09:** certificación integral y resolución independiente de QA Flipbook, seguridad, dispositivos y carga.

**Cierre:** el bloqueo de Staff/Planner de DT06 está **resuelto**. La activación técnica B01 NOMINAL/ANONYMOUS continúa disponible bajo sus validaciones DT06. Producto M02 **no certificado para producción** hasta DT07–DT09 y QA global.
