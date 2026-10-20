# M02-B01-DT03 — Revisión de implementación

**Dictamen:** **ACEPTADO COMO MÓDULO DE EMISIÓN DE CREDENCIALES NOMINALES, CON QA DE NAVEGADOR M01 PENDIENTE.**  
**Commit de implementación:** [`4bb6afa6c2a7fb3f4e3cade0f859851a82504b16`](https://github.com/ManuelRuiz27/invitacionespremium/commit/4bb6afa6c2a7fb3f4e3cade0f859851a82504b16).  
**Fecha:** 2026-10-20.  
**Método:** inspección independiente del código y migración versionados, pruebas escritas y estados de GitHub Actions; **no constituye una nueva ejecución manual del runtime**.

## 1. Evidencia del código

| Área | Evidencia en el commit | Resultado |
| --- | --- | --- |
| Esquema | `AssistantAccessCredential`, `NominalAccessCredentialOperation` y relaciones en `apps/api/prisma/schema.prisma` | Conforme |
| SQL | `20261020130000_add_nominal_access_credentials/migration.sql`: FK Assistant/Event, índice parcial de credencial no revocada por Assistant, guardas de actor/perfil/modo/historial, DELETE/TRUNCATE prohibidos, operación inmutable, `event_has_access_material()` extendido | Conforme |
| Criptografía | `nominal-access-token.service.ts`: `na1`, HMAC-SHA-256 por propósito `NOMINAL_ACCESS`, nonce 32 bytes, formato y firma estrictos, cotejo con versión/nonce y revocación persistidos | Conforme |
| Operación | `nominal-access.service.ts`: `issue()`, `list()`, `getSvg()`, `revoke()`, `resolveTokenInTransaction()`; serialización por Event, controles de tenant/assignment/Assistant y comprobación de CheckIn activo | Conforme para DT03 |
| SVG | `nominal-access-qr.service.ts` reutiliza renderer seguro, ETag SHA-256, SVG bajo demanda; controller sirve cabeceras privadas/defensivas | Conforme |
| API | Cuatro rutas autenticadas `/api/v1/events/:eventId/nominal-access-credentials`; `ORGANIZATION_ADMIN` o `ORGANIZATION_PLANNER` asignado; JSON sin token, nonce ni PII; OpenAPI/SDK actualizados | Conforme |
| Concurrencia/idempotencia | Registros técnicos inmutables para emisión/revocación, firma ligada a operación/actor, replay autorizado, índice único y transacciones Serializable | Cubierto |
| Invariantes | En `DT03` no se habilitan CheckIn, Scanner, RSVP, Finance, pricing ni activación B01 | Conservadas |

**Observación de alcance:** `resolveTokenInTransaction()` valida material y pertenencia, **no concede ingreso**. DT04 debe agregar su validación Staff/Evento operativo/mesa y registrar CheckIn nominal en una sola transacción, con guardas y FK SQL. `CheckIn` todavía no conserva referencia a `AssistantAccessCredential`, por diseño del corte.

## 2. Pruebas y CI

**Reportado por Codex:** 1,277 pruebas unitarias, 119 de integración, 9 verificaciones SDK; 49 migraciones y upgrade legacy; Prisma, lint, typecheck, build y generación/verificación OpenAPI/SDK aprobados. Formato de archivos modificados verde; `format:check` local global rojo por artefactos preexistentes de `var/`, incluido `baseline.css`.

**Verificado en GitHub Actions para el commit exacto:**
- [CI DT03](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39457705252): estado general **failure**.
- Job [`quality` success](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39457705252/job/118748793064): migración Prisma, formato global del entorno CI, unitarias, integración, build y verificaciones de contratos aprobadas. Esto respalda la parte central del reporte sin garantizar los conteos exactos locales.
- Job [`flipbook-browser-qa` failure](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39457705252/job/118748792404): falla en `pnpm exec playwright test -c playwright.flipbook.config.ts`. Ese **mismo paso** ya fallaba antes de DT02A (commit padre de `ae1e4b6`); no se han comparado logs de aserciones ni certificado identidad de causa raíz.
- Staging: skipped; sin verificación de despliegue.
- CI del commit DT02B `65bcb9d` terminó **cancelled**, no verde. No inferir aprobación de CI para DT02B.

La suite nueva `apps/api/test/nominal-access.integration-spec.ts` incluye emisión individual, replay, reemisión con material nuevo, concurrencia, tenencia/roles, SQL directo, credencial usada mediante fixture, token/SVG, eliminación/anonimización, rollback de auditoría y OpenAPI. Hay unitarias específicas de token, servicio, DTO y SVG.

## 3. Riesgos aún abiertos y siguiente ticket

1. **DT04 (siguiente):** Scanner nominal y CheckIn con referencia obligatoria a `AssistantAccessCredential`, FK compuesta y trigger SQL. El Scanner debe exigir Staff válido y evento `ACTIVE/EVENT_DAY`, sin exigir RSVP `CONFIRMED` a B01, evitar doble ingreso y preservar los flujos M01.
2. El lock y la lógica de uso activo en DT03 deben integrarse en DT04 con el orden de bloqueos transaccionales acordado. DT03 solo detecta CheckIn existente; no puede generarlo.
3. **DT06:** mantener bloqueado `409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` hasta que los dos modos y el readiness estén certificados. Probar recién entonces el circuito completo.
4. **M01 QA de navegador:** diagnosticar logs/artefactos de Playwright Flipbook y reejecutar E2E con puertos disponibles antes de release. No atribuir su causa a DT03 sin evidencia.
5. No implementar DT05–DT09, licenciamiento o pricing por inferencia; la dirección de lanzamiento M01 sigue vigente salvo autorización específica.

**Cierre:** aceptado el alcance DB/API/test de DT03. No se afirma CI total verde ni M02 end-to-end listo para operar. Se recomienda preparar el ticket ejecutable DT04 tras este handoff.
