# Reporte de UAT Exploratorio — M01 Managed

**Fecha:** 2026-09-19

**Base:** `main@fc5e8f74aa01d1c8e91acdc0c9f973fc45d6241e`

**Fixture:** Boda de Elena & Mateo (`15000000-0000-4000-8000-000000000005`)

**Generado con:** `pnpm --filter @invitaciones/api managed-demo:seed`

**Credenciales:** `apps/api/var/managed-demo/credentials.json`

---

## 1. Resumen Ejecutivo de Certificación

Se certificó la superficie real de **M01 Managed (Planner independiente)** con el harness reproducible `pnpm test:e2e:managed` sobre Chromium, base PostgreSQL efímera y runtime real de API, Client, Admin y Scanner.

* **Pasos de Journey evaluados:** 18
* **Pasos Aprobados (PASS):** 18 / 18
* **Pasos Bloqueados (FAIL):** 0 / 18
* **Casos Negativos de Seguridad y Superficie:** 6 / 6 PASS (100% sin bypass)
* **Repetibilidad:** 2 / 2 corridas limpias completas PASS

---

## 2. Resultado Paso a Paso del Journey

| Paso | Acción / Verificación | Estado | Detalle y Evidencia |
| :--- | :--- | :---: | :--- |
| **1** | Platform Admin inicia sesión | **PASS** | Credenciales `managed-demo-admin@example.invalid` autenticadas en `:5174/login`, redirige a panel administrativo. |
| **2** | Localiza Elena & Mateo | **PASS** | Evento localizado en listado `/eventos` de Admin con provenance de cliente y botón 'Ver detalle'. [Evidencia 01](./01-admin-event.png) |
| **3** | Verifica que Event Managed esté preparado / ACTIVE | **PASS** | Badge de estado 'Activo', cliente 'Planner Elena & Mateo' (Managed), vistas de datos, croquis y diseño accesibles. |
| **4** | Planner inicia sesión | **PASS** | Credenciales `managed-demo-planner@example.invalid` autenticadas en `:5173/login`, redirige a dashboard de eventos. |
| **5** | Planner NO ve creación técnica, Wizard ni Finanzas | **PASS** | **Superficie limpia confirmada**: Botón 'Nuevo evento' deshabilitado/oculto; enlace 'Finanzas' ausente de navegación lateral. |
| **6** | Planner abre Elena & Mateo | **PASS** | Workspace operativo cargado en `/eventos/15000000-0000-4000-8000-000000000005`. [Evidencia 02](./02-planner-workspace.png) |
| **7** | Opera invitados e Invitations | **PASS** | Sección `?seccion=invitados` muestra contactos nominales (Familia Luna, Diego Torres). Sección `?seccion=invitaciones` muestra distribución nominal y enlaces individuales. |
| **8** | Abre una Invitación pública real | **PASS** | Enlace nominal de Diego Torres abierto en viewport móvil (390x844). Flipbook e información cargados. [Evidencia 03](./03-invitacion-publica.png) |
| **9** | Ejecuta un RSVP real | **PASS** | Modal de confirmación abierto, asistencia confirmada y respuesta persistida vía API ('Tu confirmación quedó guardada'). [Evidencia 04](./04-rsvp-dialog.png) y [Evidencia 05](./05-rsvp-confirmed.png) |
| **10** | Regresa como Planner y verifica actualización | **PASS** | La fila de Diego Torres se actualiza en vivo a estado 'Confirmada'. [Evidencia 06](./06-planner-rsvp-updated.png) |
| **11** | Opera seating sobre el Croquis Provider | **PASS** | Sección `?seccion=mesas` renderiza el canvas Konva con mesas preparadas por Provider y el panel de métricas de distribución. [Evidencia 07](./07-seating-workspace.png) |
| **12** | Ejecuta operación real de seating y reload | **PASS** | Diego Torres se desasigna desde la UI; tras recarga aparece sin mesa y deja de figurar en Mesa Elena. La geometría Provider no se modifica. |
| **13** | Verifica/crea Staff mediante la UI disponible | **PASS** | Sección `?seccion=staff` lista token existente ('Acceso principal') y permite generar nuevo acceso Staff ('Recepción Puerta 2') con link a Scanner. [Evidencia 08](./08-staff-workspace.png) |
| **14** | Abre Scanner con token real | **PASS** | Aplicación Scanner móvil en `:5175/scanner/:staffToken` valida sesión de Staff y muestra 'Evento activo · operativo'. [Evidencia 09](./09-scanner-before-checkin.png) |
| **15** | Completa check-in real de Familia Luna | **PASS** | Scanner Search ejecuta el check-in por UI, recibe HTTP 200 y conserva `Ingreso registrado: Andrea Luna, Bruno Luna, Clara Luna`. No se automatizó cámara física. |
| **16** | Recarga Scanner/Planner y verifica persistencia | **PASS** | Tras recarga no quedan asistentes pendientes; Planner refleja los tres ingresos en Mesa Mateo. |
| **17** | Planner cierra el Event | **PASS** | El cierre se ejecuta mediante el diálogo real de Client y responde HTTP 200. |
| **18** | Recarga y verifica CLOSED | **PASS** | `CLOSED` persiste, Seating queda read-only y el token Staff deja de operar. |

---

## 3. Pruebas Negativas de Seguridad y Superficie

| Escenario Negativo | Comportamiento Observado | Resultado |
| :--- | :--- | :---: |
| **Managed no entra a Finance por URL directa** | Navegación a `http://localhost:5173/finanzas` es interceptada por `SelfServiceRoute` y redirigida inmediatamente a `/eventos`. | **PASS** |
| **Managed no entra al Wizard técnico** | Navegación a `http://localhost:5173/eventos/nuevo` es interceptada y redirigida a `/eventos`. | **PASS** |
| **Planner no puede editar preparación técnica** | Navegación a `http://localhost:5173/eventos/:id/configuracion/datos` es interceptada y redirigida a `/eventos`. | **PASS** |
| **Rutas/eventos ajenos no exponen datos** | Navegación a evento no asignado muestra mensaje de error 'Este evento no está disponible' / 'Acceso no permitido', sin filtrar metadatos de otros clientes. | **PASS** |
| **Mutación técnica Managed queda prohibida** | `POST /events/:eventId/design/flipbook` con autenticación Planner real responde `403 CLIENT_MANAGED_CAPABILITY_FORBIDDEN`. | **PASS** |
| **Sin cobro de créditos, Pricing ni Receipt** | El flujo completo operó de extremo a extremo sin requerir saldo de créditos, checkout ni pasarela comercial. | **PASS** |

---

## 4. Blocker P0

### BLOCKER-01: CLOSED

La corrección de BASE conserva la confirmación local ante el eco `checkin.created`. Las dos regresiones Scanner cubren tanto HTTP success seguido de self-echo como self-echo mientras el POST sigue in-flight; ambas pasan. La evidencia manual previa confirmó además el caso WS-before-HTTP en navegador real (~2.8 ms antes del HTTP 200), y el harness final confirma que el mensaje de éxito permanece, el estado persiste y el journey continúa hasta `CLOSED`.

Durante MG-05 se reprodujo y corrigió un defecto adicional de wiring DI en el runtime `tsx`: `RealtimePublisherService` ahora inyecta explícitamente `RealtimeServerService`, con regresión de resolución mediante el contenedor Nest. No se cambió el protocolo realtime.

---

## 5. Fricción UX no bloqueante detectada

1. **Restricción de origen CORS (127.0.0.1 vs localhost):**
   * El backend API está configurado para admitir `http://localhost:<puerto>`, pero rechaza `http://127.0.0.1:<puerto>`. Si un usuario o navegador resuelve a la IP loopback, la pantalla se queda en estado 'No pudimos verificar tu sesión administrativa' sin diagnóstico claro.
2. **Búsqueda en Scanner requiere coincidencia exacta (Exact Match):**
   * En `ScannerSearchPanel`, la búsqueda exige coincidencia exacta sensible al término (`equals` en backend). Buscar 'Luna' o 'Familia' no arroja resultados; requiere escribir 'Familia Luna' completo. Aunque el placeholder dice 'Nombre exacto', en un evento en vivo con filas en recepción esto causará fricción en el personal si no conocen el nombre completo del contacto o asistente.
3. **Diálogos modales con selector genérico en AppShell:**
   * El componente `ResponsiveAppShell` en móvil utiliza un elemento `<div role="dialog">` para el Drawer de navegación, lo cual genera ambigüedad semántica con los modales nativos (`MuiDialog` para 'Cerrar evento').

---

## 6. Lista de Evidencias Visuales

* [01-admin-event.png](./01-admin-event.png) — Vista Admin de Evento Elena & Mateo con estado Activo.
* [02-planner-workspace.png](./02-planner-workspace.png) — Workspace operativo del Planner independiente.
* [03-invitacion-publica.png](./03-invitacion-publica.png) — Invitación nominal en viewport móvil.
* [04-rsvp-dialog.png](./04-rsvp-dialog.png) — Diálogo de confirmación de asistencia RSVP.
* [05-rsvp-confirmed.png](./05-rsvp-confirmed.png) — Alerta de confirmación persistida en invitación pública.
* [06-planner-rsvp-updated.png](./06-planner-rsvp-updated.png) — Planner con actualización de confirmación en vivo.
* [07-seating-workspace.png](./07-seating-workspace.png) — Croquis Provider y métricas de distribución de mesas.
* [08-staff-workspace.png](./08-staff-workspace.png) — Administración y generación de accesos Staff.
* [09-scanner-before-checkin.png](./09-scanner-before-checkin.png) — Scanner móvil listo para recepción.
* [10-scanner-after-checkin.png](./10-scanner-after-checkin.png) — Estado de Scanner tras búsqueda y check-in.

---

## 7. Certificación automatizada final

`pnpm test:e2e:managed` ejecuta migraciones y el seed oficial antes de levantar Vite, usa una base aislada, recorre 1–18 y los seis negativos, verifica aislamiento financiero y elimina únicamente sus procesos y artefactos efímeros. El comando pasó dos veces consecutivas desde estado limpio.

La certificación de producto queda completa; el gate global de CI continúa rojo por deuda Prettier preexistente y debe estabilizarse en el ticket separado previsto.
