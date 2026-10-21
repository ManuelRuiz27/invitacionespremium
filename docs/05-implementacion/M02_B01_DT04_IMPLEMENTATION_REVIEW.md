# M02-B01-DT04 — Revisión de implementación

**Estado:** **DT04 IMPLEMENTADO — REVISIÓN DE CÓDIGO CONFORME; CI QUALITY VERDE; QA DE NAVEGADOR M01 PENDIENTE.**  
**Commit de implementación:** [`21efa71b823ccab0e4b68e7d0742c9b7a838a2fa`](https://github.com/ManuelRuiz27/invitacionespremium/commit/21efa71b823ccab0e4b68e7d0742c9b7a838a2fa).  
**Fecha:** 2026-10-20.  
**Método:** inspección independiente del diff y archivos de `main`, tests versionados, steps y logs de GitHub Actions. No se reejecutaron localmente las pruebas durante esta revisión.

## 1. Evidencia DT04

| Área | Evidencia | Conclusión |
| --- | --- | --- |
| Modelo PostgreSQL | Migración nueva `apps/api/prisma/migrations/20261020160000_add_nominal_scanner_check_ins/migration.sql` y schema Prisma agregan `CheckIn.assistantAccessCredentialId?` y FK `(assistant_access_credential_id,assistant_id,event_id)` a la credencial | Conforme |
| Inserción DB | `validate_check_in_insert()`: preserva rama legacy (credencial NULL + RSVP CONFIRMED), agrega NOMINAL sólo con `ACCESS_CONTROL`, credencial no revocada, agregado individual PENDING, Staff/evento operativo y mesa/asiento; exige credencial en nominal | Conforme |
| Protección DB | `protect_check_in_mutation()` vuelve inmutable la referencia a la credencial y mantiene reversión única y autorizada | Conforme |
| Servicio | `ScannerService.scanNominal()` reutiliza `requireStaff()` y `NominalAccessService.resolveTokenInTransaction()`, verifica aforo de identidad/mesa/asiento y ausencia de entrada activa, crea CheckIn individual con `Serializable`, auditoría y realtime | Conforme |
| Contrato | `POST /api/v1/scanner/:staffToken/nominal-access/scan` exige `Idempotency-Key`, recibe `qrToken` y devuelve snapshot mínimo; las rutas M01 `scan`, `search`, `check-in` y `revert` permanecen | Conforme |
| Concurrencia | Rechazos de segundo ingreso, replay de misma clave y conflictos de claves compartidas entre modalidades; integración scan/revoke/scan concurrentes | Cubierto por pruebas versionadas |
| Privacidad | Respuesta mínima incluye nombre, IDs, hora y mesa/asiento; no emite teléfono, token, nonce ni secretos; auditoría de creación sólo metadatos técnicos | Conforme |
| Activación B01 | `409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` hasta DT06; DT04 no cambia Finance, Pricing, UI ni servicio ANONYMOUS | Preservado |

### Matriz de pruebas versionadas

- `apps/api/test/scanner.integration-spec.ts`: ingreso de Assistant PENDING, snapshots estables/realtime, rechazo de tokens inválidos y ajenos, dos Staff concurrentes, clave global entre modalidades, SQL directo, identidad de credencial en reversión, mesa y asiento, rutas legacy y migraciones.
- `apps/api/test/nominal-access.integration-spec.ts`: carrera operativa real scan/revoke/reissue con bloqueos PostgreSQL en ambas direcciones.
- `apps/api/test/events.integration-spec.ts` y `scanner.dto.spec.ts`: readiness fail-closed y contrato.
- Prisma/SDK/OpenAPI actualizados.

## 2. Resultados de pruebas y CI

**Reportado por Codex:** 50 migraciones limpias y upgrade legacy, 355 unitarias API, 161 integraciones, 29 revalidaciones, Prisma, lint, typecheck y build correctos; dos tests UI Admin de suite local global rojos (uno reproducido en HEAD anterior), timeout Client aprobado al reintentar; limpieza de archivos temporales bloqueada por revisión automática (`blocked by policy`). Es un reporte, no una nueva validación independiente de esas dos pruebas.

**GitHub Actions para el SHA exacto:**
- [CI DT04](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39465576841): global **failure**.
- [Job `quality`](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39465576841/job/118775961604): **success**, incluidas migraciones Prisma, format check del CI, unitarias, integración y build.
- [Job `flipbook-browser-qa`](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39465576841/job/118775961467): **failure**, 1 de 74 pruebas; WebKit `e2e/flipbook-mobile.spec.ts:630` `REQ-02 corner preview preserves only the stationary leaf curl`, timeout al exigir `.flipbook-reader` con atributo esperado `true`.
- Confirmación de fallo anterior: [CI DT03](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39457705252) falla en **el mismo test y aserción** con el mismo timeout, previo a DT04. No es un hallazgo introducido por el diff DT04; sí requiere resolución independiente antes de release.
- Staging: skipped.

## 3. Límites y gates

1. **DT05 próximo:** mantener el servicio `PHYSICAL_QR` legacy; extender exclusivamente `ACCESS_CONTROL + ANONYMOUS` con pase individual anónimo, permisos Organization Managed y revocación previa al uso, con SQL y pruebas de concurrencia; no reutilizar token NOMINAL.
2. **DT06:** implementación y certificación de readiness, cupo, mesas y activación `ACCESS_CONTROL` en ambos modos. Hasta entonces se mantiene el bloqueo de activación y DT04 sólo es comprobable mediante fixtures operativos aislados.
3. **QA M01:** resolver la falla WebKit verificable; investigar por separado dos fallos locales de UI Admin. No modificar `var/` ni saltarse políticas para forzar limpieza.
4. **Sin release B01:** no hay E2E autorizado de NOMINAL/ANONYMOUS real, UX de recepción, billing/licencias ni despliegue productivo en DT04. No inferir que DT05–DT09 estén implementados.

**Conclusión:** alcance DT04 API/DB probado y revisado favorablemente; no afirmar CI total verde ni disponibilidad de ACCESS_CONTROL como producto hasta gates posteriores.
