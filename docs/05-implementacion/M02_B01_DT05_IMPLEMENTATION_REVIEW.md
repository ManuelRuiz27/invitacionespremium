# M02-B01-DT05 — Revisión de implementación

**Dictamen:** **IMPLEMENTACIÓN DT05 CONFORME EN REVISIÓN ESTÁTICA; CI EXTERNO PENDIENTE DE FINALIZAR.**  
**Commit verificado:** [`670c3200be8e1e13824ac9b51533c568bb15cf5e`](https://github.com/ManuelRuiz27/invitacionespremium/commit/670c3200be8e1e13824ac9b51533c568bb15cf5e) — `feat(physical-passes): implement M02-B01-DT05 anonymous access`.  
**Fecha:** 2026-10-20.  
**Alcance de revisión:** inspección del diff/archivos versionados, cobertura de pruebas versionadas y jobs GitHub Actions. No se reejecutaron localmente 51 migraciones ni las suites reportadas.

## 1. Evidencia técnica del commit

| Área | Código/contrato revisado | Resultado |
| --- | --- | --- |
| Modelo y SQL | `apps/api/prisma/migrations/20261020190000_add_anonymous_access_passes/migration.sql`: revocación persistente en `physical_pass`, FK a revocador, completitud del recibo, llave única, protección de historia/DELETE/TRUNCATE e identidad, modo y actor autorizados | Conforme |
| Compatibilidad de modalidades | `validate_physical_pass()` admite `PHYSICAL_QR + accessMode NULL` o `ACCESS_CONTROL + ANONYMOUS`; rechaza NOMINAL e INSERT anónimo que no provenga de Provider | Conforme |
| Separación Provider | `PhysicalPassesService.generateAdministrative()` comprueba `PLATFORM_ADMIN`; `generateBatch()` comprueba cliente, servicio, modalidad, Evento y operación; `generate()` Client conserva `assertTechnicalMutationAllowed()` | Conforme |
| Rutas | `POST /api/v1/admin/clients/:clientId/events/:eventId/physical-passes/generate`, consulta/SVG Client, `POST /events/:eventId/physical-passes/:passId/revoke`, Scanner físico reutilizado | Conforme |
| Revocación | `PhysicalPassesService.revoke()` exige Organization Admin/Planner asignado, solo ANONYMOUS sin uso, firma vinculada a actor/Evento/pase/motivo, snapshot idempotente e historia, auditoría en transacción | Conforme |
| Capacidad y folios | Los contadores de Evento/Croquis, las guardas SQL y `FloorplanService` excluyen revocados; los folios siguientes se basan en máximo histórico sin reuso | Conforme |
| Uso anónimo | `PhysicalPassesService.scan()` reutiliza Staff y QR `PHYSICAL_PASS`; verifica Evento/tenant/modo/Staff operativos, pase no revocado, Mesa TABLE, primer uso atómico y replay sin nueva auditoría | Conforme |
| Política legacy | Listado antiguo sigue `UNUSED/USED`, firma QR `PHYSICAL_PASS` intacta y no se habilita revocación de PHYSICAL_QR | Preservado en código y pruebas |
| Readiness | `resolvePhysicalPassReadiness()` conserva `EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` para B01. La proyección `READY_TO_ACTIVATE` solo se recalcula para `PHYSICAL_QR` | Gate preservado |
| Documentación/SDK | `PHYSICAL_PASSES_CONTRACT.md`, OpenAPI y `packages/api-client/src/generated/schema.ts` actualizados | Conforme |

La migración reemplaza cuidadosamente `validate_physical_pass()`, `protect_physical_pass()`, `assert_floorplan_shape_capacity()`, `assert_assistant_seating()` y `protect_event_physical_pass_configuration()`, e incorpora regla de Croquis `TABLE` en ANONYMOUS. Las relaciones y datos legacy se conservan.

## 2. QA y evidencias

**Reporte de Codex (no reejecutado en esta revisión):** 51 migraciones limpias y upgrade legacy; 357/357 unitarias API; suite global 11/11 tareas; 140/140 integraciones y 49/49 revalidaciones finales; Prisma, lint, typecheck, build y OpenAPI/SDK correctos. `format:check` global local falla por artefactos ignorados de `var/` sin modificar.

**Cobertura versionada inspeccionada:** `apps/api/test/physical-passes.integration-spec.ts` contiene nuevos casos de Provider ANONYMOUS, permisos de consulta/SVG, revocación, aislamiento de tenant, integridad SQL, concurrencia de lotes/cupo, scan/revoke en ambos órdenes, cambio/reducción de Mesa, TRUNCATE, recibos idempotentes, rollback de auditoría y regresiones PHYSICAL_QR. También cambian `events.integration-spec.ts` y los DTO specs.

**GitHub Actions para el commit:** [CI `39523816854`](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39523816854), consultado durante la revisión: `quality` y `flipbook-browser-qa` **in_progress**, sin conclusiones finales. El paso `Apply Prisma migrations` y el `Format check` del entorno CI estaban **success** al consultarlos, con unitarias/integraciones aún pendientes. **No declarar pipeline verde hasta finalizar**.

**Historial relevante:** los CI de DT03/DT04 fallaron en QA WebKit Flipbook `REQ-02 corner preview preserves only the stationary leaf curl`; esos fallos históricos no prueban el resultado de DT05. El problema local de `var/` tampoco equivale a fallo de formato en CI.

## 3. Gates pendientes para el siguiente ticket

- **DT06:** readiness y activación de `ACCESS_CONTROL` para NOMINAL y ANONYMOUS, con reglas de cupo/mesas, datos básicos, material vigente, historial de revocados, no uso previo a activación y autorización Provider. Debe respetar gates administrativos, financieros y técnicos de M01 sin abrir bypass de activación.
- **DT07–DT09:** superficies UI, reportes y certificación E2E según handoff; no se consideran implementadas.
- Hasta DT06: `409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` permanece obligatorio. Para probar Scanner B01 se usan fixtures aislados que establecen ACTIVE únicamente en pruebas.
- Resolver por separado cualquier rojo de CI/Playwright y verificar las pruebas globales antes de release; no eliminar archivos `var/` ni eludir políticas de workspace.

**Resultado:** DT05 implementado y aceptable para avanzar a la preparación técnica de DT06, condicionado al resultado de CI; **NO equivale a B01 activable ni listo para producción**.
