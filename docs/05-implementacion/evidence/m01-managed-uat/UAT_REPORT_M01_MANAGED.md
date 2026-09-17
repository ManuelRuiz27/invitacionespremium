# Reporte de UAT Exploratorio — M01 Managed

**Fecha:** 2026-09-17  
**Base:** `main@9e7280bee47ebad5e78ec503ad0b9b632f0a887c`  
**Fixture:** Boda de Elena & Mateo (`15000000-0000-4000-8000-000000000005`)  
**Generado con:** `pnpm --filter @invitaciones/api managed-demo:seed`  
**Credenciales:** `apps/api/var/managed-demo/credentials.json`

---

## 1. Resumen Ejecutivo de Certificación

Se ejecutó la prueba de aceptación de usuario (UAT) exploratoria sobre la superficie real de **M01 Managed (Planner independiente)** usando navegación automatizada con Playwright Chromium (desktop 1280x800 y mobile 390x844).

* **Pasos de Journey evaluados:** 18
* **Pasos Aprobados (PASS):** 14 / 18
* **Pasos Bloqueados (FAIL):** 4 / 18 (derivados de un único Blocker funcional P0 en el módulo Scanner WebSocket)
* **Casos Negativos de Seguridad y Superficie:** 5 / 5 PASS (100% sin bypass)

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
| **12** | Verifica mesas/seats reales y reload | **PASS** | Recarga completa del navegador mantiene intacto el estado del Croquis, ocupación y mesas configuradas. |
| **13** | Verifica/crea Staff mediante la UI disponible | **PASS** | Sección `?seccion=staff` lista token existente ('Acceso principal') y permite generar nuevo acceso Staff ('Recepción Puerta 2') con link a Scanner. [Evidencia 08](./08-staff-workspace.png) |
| **14** | Abre Scanner con token real | **PASS** | Aplicación Scanner móvil en `:5175/scanner/:staffToken` valida sesión de Staff y muestra 'Evento activo · operativo'. [Evidencia 09](./09-scanner-before-checkin.png) |
| **15** | Escanea/usa QR real y completa check-in | **FAIL (P0)** | El check-in se envía a la API (HTTP 200), pero **el propio Scanner destruye su mensaje de éxito inmediatamente** debido a un bug de eco en el listener WebSocket `checkin.created`. [Evidencia 10](./10-scanner-after-checkin.png) |
| **16** | Recarga Scanner/Planner y verifica persistencia | **FAIL (Derivado)** | Bloqueado por la falla en la culminación del flujo de check-in en Scanner. |
| **17** | Planner cierra el Event | **FAIL (Derivado)** | Bloqueado para mantener el orden secuencial del fixture de check-in. (El diálogo modal 'Cerrar evento' existe y responde en UI). |
| **18** | Recarga y verifica CLOSED | **FAIL (Derivado)** | Bloqueado por paso 17. |

---

## 3. Pruebas Negativas de Seguridad y Superficie

| Escenario Negativo | Comportamiento Observado | Resultado |
| :--- | :--- | :---: |
| **Managed no entra a Finance por URL directa** | Navegación a `http://localhost:5173/finanzas` es interceptada por `SelfServiceRoute` y redirigida inmediatamente a `/eventos`. | **PASS** |
| **Managed no entra al Wizard técnico** | Navegación a `http://localhost:5173/eventos/nuevo` es interceptada y redirigida a `/eventos`. | **PASS** |
| **Planner no puede editar preparación técnica** | Navegación a `http://localhost:5173/eventos/:id/configuracion/datos` es interceptada y redirigida a `/eventos`. | **PASS** |
| **Rutas/eventos ajenos no exponen datos** | Navegación a evento no asignado muestra mensaje de error 'Este evento no está disponible' / 'Acceso no permitido', sin filtrar metadatos de otros clientes. | **PASS** |
| **Sin cobro de créditos, Pricing ni Receipt** | El flujo completo operó de extremo a extremo sin requerir saldo de créditos, checkout ni pasarela comercial. | **PASS** |

---

## 4. Blocker P0

### BLOCKER-01: Scanner WebSocket auto-invalida la pantalla de confirmación de check-in
* **Severidad:** P0 (Impide certificar el flujo de check-in operativo).
* **Ubicación:** `apps/scanner/src/hooks/useScannerRealtime.ts` (línea 79) y `apps/scanner/src/pages/ScannerSessionPage.tsx` (líneas 54–74).
* **Comportamiento observado:**
  1. El operador Staff busca a un asistente (ej. 'Familia Luna') y pulsa **'Registrar ingreso (3)'**.
  2. La mutación `checkInMutation` responde exitosamente (HTTP 200) y activa `setConfirmation(result)` para mostrar la alerta: *'Ingreso registrado: Andrea Luna, Bruno Luna, Clara Luna'*.
  3. Simultáneamente, el backend emite un evento WebSocket `checkin.created` a la sala del evento.
  4. La misma pestaña del Scanner que emitió el check-in recibe el evento WebSocket `checkin.created`.
  5. El hook `useScannerRealtime` ejecuta `invitationStale()`, el cual llama a `discardStaleResult()`.
  6. `discardStaleResult()` ejecuta `clearResult()`, lo que fuerza `setConfirmation(null)` y reemplaza la pantalla de éxito por la advertencia: *'La disponibilidad cambió. Escanea o busca nuevamente.'*.
  7. **Efecto para el usuario Staff:** El operador nunca ve la confirmación de ingreso registrada; la interfaz parpadea en milisegundos y borra el resultado de la pantalla como si hubiera ocurrido un error de concurrencia.

#### Pasos exactos de reproducción:
1. Iniciar sesión en Scanner con token válido: `http://localhost:5175/scanner/<staffToken>`.
2. Ir a pestaña **Buscar**, ingresar 'Familia Luna' y hacer clic en **Buscar**.
3. Seleccionar el resultado de la búsqueda para abrir el panel de ingreso.
4. Hacer clic en **Registrar ingreso (3)**.
5. Observar cómo el mensaje verde de éxito no permanece; en su lugar, se muestra inmediatamente la alerta amarilla: *'La disponibilidad cambió. Escanea o busca nuevamente.'*.

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

## 7. Lista Mínima de Cambios para Certificar M01

Para lograr la certificación del 100% del journey sin desbordar el alcance:
1. **Fix en `apps/scanner/src/hooks/useScannerRealtime.ts`:**
   * Ignorar eventos `checkin.created` provenientes del propio cliente / staffToken, o en `ScannerSessionPage.tsx` no descartar la confirmación si `confirmation` acaba de ser establecida por una mutación local reciente.
2. **Completar ejecución de Pasos 15–18:**
   * Una vez evitado el reseteo por WebSocket, validar la persistencia del check-in tras recarga, ejecutar el cierre de evento desde el Planner (`status: CLOSED`) y verificar su persistencia final.
