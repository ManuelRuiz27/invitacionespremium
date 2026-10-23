# M02-B01-DT07 — Revisión de implementación

**Dictamen:** **DT07 IMPLEMENTADO — REVISIÓN ESTÁTICA FAVORABLE; CI REMOTO Y CERTIFICACIÓN DE PILOTO PENDIENTES.**
**Commit verificado:** [`0346250c163c5d00a5241c386c72f96567ee8f93`](https://github.com/ManuelRuiz27/invitacionespremium/commit/0346250c163c5d00a5241c386c72f96567ee8f93) — `feat(access-control): complete managed operational workflows`.
**Fecha de revisión:** 2026-10-23.
**Método:** inspección del commit y fuentes en `main`, pruebas versionadas, evidencia de ejecución local publicada por Codex y estado GitHub Actions. No reejecución independiente de suites en esta revisión.

## 1. Código y contratos comprobados

- **Admin:** `AdminEventIntakeDialog.tsx` admite `ORGANIZATION+MANAGED+ACCESS_CONTROL`, exige modalidad NOMINAL/ANONYMOUS y asignación Planner, sin quote ni Finance. `AdminEventPreparationPage.tsx` incorpora superficie contextual `AdminAccessSection.tsx`: readiness autoritativo, lotes físicos por Provider, retry de intención incierta y activación Managed ya existente.
- **Client:** `ActiveEventWorkspacePage.tsx` enruta ACCESS_CONTROL a `workspace/access-control/AccessControlWorkspace.tsx`. NOMINAL maneja contactos sin teléfono obligatorio, CSV, credenciales por Assistant UUID, SVG/PDF, revocación/reemisión y seating; ANONYMOUS ofrece listado por folio, descarga/imprimible y revocación, **sin generación Client ni datos nominales artificiales**. `StaffAccessPanel` continúa según DT06A.
- **Scanner:** `ScannerSessionPage.tsx` y `useScannerQueries.ts` incorporan scan atómico nominal/anónimo, bloqueo contra frames duplicados, reintento con mismo token y llave idempotente y resultado minimalista. Se preserva flujo de Invitational QR/check-in legacy.
- **SDK / API aditivo mínimo:** `packages/api-client/src/access-control.ts`, wrappers nominal/pass/readiness/scanner, validador de `events.ts` con ACCESS_CONTROL y OpenAPI regenerado; sesión Staff añade sólo `serviceCode/accessMode`; Contact NOMINAL expone `assistantId` de lectura; Evento usa `hasAccessMaterial` para impedir cambio de modalidad tras emisión histórica. No hay migración ni dominio nuevo de autorización. Ver [evidencia y comandos DT07](./M02_B01_DT07_IMPLEMENTATION.md).
- **Separación funcional:** Provider prepara/genera ANONYMOUS/activa; Organización administra material NOMINAL y consulta/revoca ANONYMOUS; Staff valida ingreso; no diseño/RSVP obligatorios ni transacciones Finance, Ledger o Receipt nuevas.

## 2. QA constatado y límites de evidencia

**Reporte final de Codex incorporado a `M02_B01_DT07_IMPLEMENTATION.md` (no reejecutado en esta revisión):** API unitarias 370; Admin 216; Client 403; Scanner 62; SDK 129; integraciones API 412; revalidación posterior 57; pruebas E2E reales de ACCESS_CONTROL 2/2; lint/typecheck/build/formato de archivos modificados correctos; Prisma y OpenAPI/SDK consistentes.

**Aclaración importante:** las **412 integraciones globales** se ejecutaron **antes** de la última proyección aditiva `Contact.assistantId`. Después hubo **57/57 integraciones específicas** y **403/403 Client** sobre la versión final. No afirmar que se reejecutó la integración global completa sobre el último árbol. Debe revalidarse íntegramente en DT09 o antes de un release.

**E2E versionado:** `e2e/access-control.spec.ts` recorre para cada modalidad alta Provider → material de Organización → activación real → Staff con cámara y QR, incluye ausencia de rutas Finance/Invitations legacy/generación Client y rechazo de Planner no asignado. `scripts/run-access-control-e2e.mjs` usa base/storage aislados. El resultado 2/2 corresponde a ejecución reportada localmente, no certificación sobre dispositivo físico.

**Formato global local:** `format:check` falla por archivos ignorados bajo `var/qa`; formato de archivos modificados pasó. No modificar artefactos ignorados para maquillar la señal.

**Flipbook local:** 73/74; falló Chromium `e2e/flipbook-mobile.spec.ts:266`, pasó 1/1 al aislarlo. El caso WebKit histórico de `:630` pasó en ejecución local de DT07. La variabilidad requiere seguimiento propio; no declararlo corregido ni determinar causa por un único retry.

**GitHub Actions:** [CI 39981681848](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39981681848), consultado el 2026-10-23: `quality` **in_progress** y `flipbook-browser-qa` **in_progress**; sin conclusión. Actualizar dictamen si los jobs finalizan y según su resultado. **No hay CI global verde verificado en esta revisión.**

## 3. Recomendación de próximo corte

**DT08:** agregar un panel operativo de ingresos y aforo derivado de fuentes de verdad existentes (`CheckIn` no revertidos y `PhysicalPass.usedAt`), por modalidad, con total de vigentes/emitidos/ingresados/pendientes y ocupación de Mesas cuando corresponda; lectura autorizada y privacidad mínima, sin doble conteo de revocados ni identidades ficticias. Diseñar contrato API autoritativo y pruebas de conciliación antes de pintar métricas. Sin dashboards BI ni PDFs nuevos.

**DT09:** certificación E2E integral y de pilotos, prueba real de móvil y varios lectores concurrentes, QA global/regresión M01, reconciliación sobre estado final, carga/seguridad, degradación y gate de release. Investigar separado el QA intermitente Flipbook.

**Conclusión:** DT07 aporta experiencia operativa completa de B01 en revisión estática; **DT08/DT09 y el gate de CI/release siguen pendientes**. M01 Managed conserva su prioridad de lanzamiento.
