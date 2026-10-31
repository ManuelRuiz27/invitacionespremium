# 24 — Modo Calca: fundamento y roadmap incremental

Estado: **CALCA-00 — auditoría y documentación; implementación no iniciada**.

Fecha: 2026-10-29. HEAD auditado de `main`: `c4d3997969ed2793c63c41cc60c8d491407a1fd1`.

Alcance autorizado ahora: crear este roadmap y [FLOORPLAN_TRACE_MODE_UX](../03-diseno/FLOORPLAN_TRACE_MODE_UX.md). Sin cambios de aplicación.

## 1. Objetivo y precedencia

Definir Calca como recorrido principal de preparación de Croquis por el Provider: **plano del cliente → Mesas lógicas → lugares trazados cuando corresponda → corrección → revisión → operación Planner/Scanner**. Manual y Mapeo SVG siguen disponibles como herramientas secundarias sobre el mismo modelo.

Calca es una composición de capacidades actuales y una adaptación de interacción. No es un nuevo modo de acomodo, dominio gráfico ni fuente de verdad. Se conservan `TABLE` y `SEAT` con sus contratos.

Lectura obligatoria para cada ticket futuro: [START HERE](../00-inicio/00_START_HERE.md), [dirección Managed](../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md), [modelo M01](../01-producto/06A_MODELO_01_PLANNER_INDEPENDIENTE.md), [ADR operator-led](../04-tecnico/ADR_OPERATOR_LED_ACCESS.md), [contrato detallado](../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md), [contrato SVG](../04-tecnico/FLOORPLAN_SVG_MAPPING_CONTRACT.md), [contrato Sticker](../04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md), [UX vigente](../03-diseno/FLOORPLAN_UX_TARGET.md), UX Calca y [arquitectura monorepo](../04-tecnico/MONOREPO_ARCHITECTURE.md).

El [roadmap 23](./23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md) documenta SVG-00–08 DONE y el freeze funcional/API. CALCA-00 propone el siguiente orden UX, sin reabrir esos tickets ni arrastrar herramientas manuales diferidas del roadmap 22. Los contratos técnicos mantienen autoridad; estados históricos READY FOR CODE de otros documentos no autorizan reimplementar capacidades existentes.

## 2. Resultado de la auditoría CALCA-00

**PASS documental:** la arquitectura actual permite definir el flujo sin introducir API, DB o dominio nuevos. Esto no acredita que Calca esté implementada ni que se haya ejecutado QA funcional nuevo. CALCA-01–06 son propuestas pendientes de ticket y de sus gates; no hay autorización implícita para programarlas.

| Hallazgo en el baseline | Clasificación | Consecuencia |
| --- | --- | --- |
| Admin ya carga JPG/PNG/SVG, crea Shapes y opera Seats por SDK administrativo. | REUSE | Entrada y construcción reutilizan el mismo Floorplan. No se necesita un backend Calca. |
| `placeSeat` crea un lugar y vuelve a `idle`. | ADAPT | Trazado continuo de UI requiere trabajo futuro; no está terminado. |
| Selección simple/múltiple, batch move, renombrado, duplicado, bloqueo y renumber existen. | REUSE | Corrección no necesita otra persistencia ni otro renderer. |
| `FloorplanSurface` mantiene viewport y un historial del borrador de Shape. | REUSE / ADAPT | Conservar undo/redo soportado y contexto de vista; no presentar historial global de Seats. |
| El Builder concentra herramientas, fuente, selección, guardado y recuperación en un archivo. | ADAPT | Extraer piezas pequeñas dentro de Admin antes de cambiar el recorrido. |
| Mapping y fuente SVG canónica ya coexisten con Shapes/Seats manuales. | REUSE | SVG pasa a herramienta secundaria, sin desmontar seguridad ni bindings. |
| Planner y Scanner consumen el modelo compartido. | REUSE | Entrega operacional sin segundo workspace ni ampliación de permisos/PII. |
| No se identifica un requisito de nueva entidad para Calca. | OUT-OF-SCOPE | No `TraceSession`, `TraceSeat`, nuevos roles, endpoints o estados persistidos. |

La auditoría fue de archivos/contratos sobre el HEAD indicado, no una prueba interactiva de la UI. El grafo local está construido sobre `857ff151927291ee9f3f271099e53c76d4641422` y no contiene el subsistema Floorplan; no se utilizó para inferir cobertura actual. Las fuentes directas y símbolos están enlazados abajo.

## 3. Mapa de reutilización y límites de extracción

| Fuente actual | Símbolos/responsabilidad | Destino previsto |
| --- | --- | --- |
| [AdminFloorplanBuilderWorkspace](../../apps/admin/src/events/preparation/floorplan/AdminFloorplanBuilderWorkspace.tsx) | `upload`, `requestUpload`, `useAdminFloorplanImageUrl`, reemplazo confirmado. | Entrada y panel de fuente de Calca, dentro de Admin. |
| Mismo workspace | `Palette`, `ShapeInspector`, `selectPreset`, `save`, `selectShape`; inventario pendiente. | Creación de Mesas y herramienta Manual; paneles extraídos, sin cambiar DTOs. |
| Mismo workspace | `addSeat`, `placeSeat`, `moveSeat`, `updateSeat`, `duplicateSeat`, `removeSeat`, `renumberSeats`. | Trazado repetido y corrección; conservar Mesa padre y UUID. |
| Mismo workspace | `selectSource`, `mapSource`, `unlinkSource` y diálogos SVG. | Mapeo SVG secundario con el mismo contrato de fuente. |
| Mismo workspace | `mutationLock`, `runMutation`, `recoverAfterFailedMutation`, `refreshAfterConfirmedMutation`, `refreshAuthoritative`, `dirty`/`useBlocker`. | Coordinador/hook Admin a extraer con pruebas de fallos y salida. No trasladarlo a presentación compartida. |
| [Surface](../../packages/floorplan/src/FloorplanSurface.tsx), [Toolbar](../../packages/floorplan/src/FloorplanToolbar.tsx), [history](../../packages/floorplan/src/floorplan-history.ts) | Viewport, zoom/pan/fit, historial local de Shape y teclado. | Reutilización directa; ninguna promesa de undo persistido de Seats. |
| [Konva](../../packages/floorplan/src/FloorplanKonvaRenderer.tsx), [DOM](../../packages/floorplan/src/FloorplanDomRenderer.tsx), [scene](../../packages/floorplan/src/floorplan-scene.ts), [geometry](../../packages/floorplan/src/floorplan-geometry.ts) | Render, selección, `captureCanvasClicks`, normalización y movimiento. | Mantener el engine compartido; adaptar gestos sólo si hace falta. |
| [SDK Admin](../../packages/api-client/src/admin/event-preparation.ts), [schema](../../packages/api-client/src/generated/schema.ts), [FloorplanService](../../apps/api/src/floorplan/floorplan.service.ts) | Contratos existentes y autoridad de negocio. | Consumir sin modificaciones de API/OpenAPI/Prisma/SQL. |
| [SeatingWorkspace](../../apps/client/src/workspace/SeatingWorkspace.tsx), [ScannerFloorplan](../../apps/scanner/src/components/ScannerFloorplan.tsx) | Asignación y lectura operacional. | Conservar; regresión mediante QA, sin reconstruirlos. |

Extracciones de UI posibles: barra de guardado/revisión, panel de fuente, inspector de Mesa, inspector de lugar, inspector SVG y controlador de interacción. Son responsabilidades propuestas, no exports actuales. Comienzan dentro de `apps/admin`; únicamente presentación verdaderamente compartida pertenece a `packages/floorplan`. No imports entre apps, ningún package nuevo y ninguna llamada API/regla de negocio en `packages/ui`.

## 4. Límites obligatorios para todas las fases

- Sin cambios de API, OpenAPI, SDK contractual, DB, Prisma, migraciones, dominio, roles, permisos, lifecycle, Finance o activación. Si una solución los necesita, bloquear esa parte y solicitar ticket separado; no ampliar la fase.
- Sin OCR, IA, CAD, visión, vectorización, edición de paths, inferencia automática de Mesas/lugares o auto-seating. Upload sigue en JPG/PNG/SVG admitidos; PDF se convierte fuera del producto.
- Sin eliminación de código. Se preservan Manual, inventario/bandeja, SVG, DOM/Konva, historial soportado y consumidores actuales.
- Provider construye mediante superficie Admin explícita y actor auditado; Planner asigna personas sin geometría editable; Staff conserva mínimo acceso y datos. No impersonación.
- Modo de acomodo explícito y elegibilidad vigente. `PHYSICAL_QR` y `ACCESS_CONTROL + ANONYMOUS` sólo `TABLE`; no ampliar servicios por la presencia de un selector UI. Conservar la operación NOMINAL existente sin abrir nuevo scope comercial.
- La capacidad, ocupación, restricciones de lugares ocupados, readiness, locks y concurrencia permanecen en API/DB. Las coordenadas son globales `0..1`, nunca píxeles del viewport ni posiciones relativas a la Mesa.
- SVG sólo desde salida canónica sanitizada. Reemplazo confirmado retira bindings incompatibles conservando Shapes, Seats y asignaciones. No render raw, matching heurístico ni estado operacional persistido en XML.
- No repetir una mutación confirmada por fallar el refresh. Timeout/red/409 detienen trazado y exigen recuperación autoritativa; no añadir garantías de idempotencia que el endpoint no tenga.

## 5. Secuencia y gates pequeños

```text
CALCA-00  Auditoría + definición documental (este cambio)
   ↓ ticket explícito
CALCA-01  Extraer piezas Admin conservando comportamiento
   ↓
CALCA-02  Entrada Calca + creación/selección de Mesas
   ↓
CALCA-03  Trazado repetido de lugares sobre Mesa confirmada
   ↓
CALCA-04  Corrección contextual + límites de historial
   ↓
CALCA-05  Revisión final + entrega operacional
   ↓
CALCA-06  Certificación del recorrido y evidencia de reemplazo
```

Una fase no absorbe automáticamente la siguiente. Si su gate falla, se detiene el avance y se distingue defecto previo de regresión. Ninguna fase permite borrar UI histórica; CALCA-06 sólo identifica qué duplicaciones podrían retirarse mediante un ticket posterior explícito.

### CALCA-01 — Extracción controlada del workspace

**Scope:** separar barra/estado de guardado y paneles contextuales de Shape, lugar y SVG, conservando wiring, props, copy funcional y condiciones actuales. Extraer coordinación de mutaciones sólo con una frontera y pruebas claras. No cambiar todavía la jerarquía de herramientas ni crear un estado persistido de Calca.

**Gate:** mismas operaciones Admin y mismas llamadas SDK; selección no escribe; un doble click no duplica envío; borrador/navegación, conflicto, lock externo y éxito seguido de GET fallido conservan conducta. Sin diffs de contratos ni imports entre apps. Si la extracción se vuelve grande, dividirla en commits pequeños del mismo ticket antes de cambiar UX.

**Evidencia:** diff de movimiento/extracción, pruebas Admin de éxito/fallo y QA de código vigente. Comparar con los casos de [admin-event-preparation.test.tsx](../../apps/admin/src/events/admin-event-preparation.test.tsx), sin afirmar que mocks certifiquen concurrencia PostgreSQL.

### CALCA-02 — Entrada y Mesas sobre el plano

**Scope:** mostrar Calca como recorrido principal; ubicar Manual y Mapeo SVG como herramientas secundarias descubribles. Reutilizar upload/fuente privada, selector de acomodo y creación/selección de Shape. En Calca, la Mesa aproxima el agrupador lógico sin reproducir mobiliario. No introducir geometría invisible ni otra propiedad persistida.

**Gate:** JPG/PNG y SVG existentes se abren y recargan; crear Mesa produce una Shape; reabrir/seleccionar no la duplica; cancelar borrador no crea huérfanos. `TABLE` mantiene capacidad manual y no crea Seats. `SEAT` utiliza exclusivamente el manejo vigente de capacidad derivada; errores contractuales se reportan, no se parchea backend. Sin plano se conserva el requisito actual de imagen, sin prometer lienzo vacío nuevo.

**Evidencia:** capturas desktop/tablet de entrada/creación; tests Admin de selección/creación y renderer DOM/Konva; Manual y mapping siguen accesibles por teclado/touch.

### CALCA-03 — Calca rápida de lugares

**Scope:** sobre una Mesa persistida y modo exacto autorizado, mantener **Trazar lugares** activo tras cada éxito y ofrecer **Terminar mesa**. Reutilizar `createFloorplanSeat`, colocación normalizada y locks actuales. Eliminar el reingreso manual a la herramienta después de cada punto, sin paralelizar escrituras ni crear una cola nueva.

**Gate:** trazar sucesivamente diez lugares produce diez Seats confirmados con etiquetas válidas y el mismo padre; repetir tras renombrar/eliminar no colisiona por usar el conteo como identidad. Pan/zoom/drag no crean puntos. Mientras hay escritura o recuperación, no se acepta otra creación. Red/timeout/429/5xx/409 detienen la sesión; GET autoritativo no provoca POST de replay ni da por aplicada una intención ambigua. En `TABLE`, locked o sin Mesa no se ofrece trazado.

**Evidencia:** pruebas de herramienta persistente, límite de llamadas/doble gesto y fallos; recorrido real con reload que conserva UUID/etiquetas/padre. No declarar mejora temporal hasta medirla. Si el contrato actual no permite resolver una creación incierta inequívocamente, la UX permanece detenida para revisión y se registra la limitación, sin ampliar API.

### CALCA-04 — Corrección e historial honesto

**Scope:** panel contextual de lugares con movimiento simple/múltiple, renombrado, duplicado, bloqueo/desbloqueo, eliminación y renumeración actuales. Preservar selección válida tras refetch. Reutilizar undo/redo sólo para el borrador de Shape soportado.

**Gate:** un grupo de lugares se mueve con el batch existente y conserva coordenadas globales y distancias relativas dentro de límites. Renumerar conserva UUID y asignaciones; ocupado no se bloquea/elimina; Seat fuera del bbox de su Mesa sigue válido. Las acciones individuales no se presentan como masivas. Deshacer/rehacer no promete revertir Seats persistidos, mapping, borrados o locks; no implementa delete/create compensatorio.

**Evidencia:** Serpentina y Mesa U, selección aditiva, rollback/conflicto autoritativo, DOM/Konva, teclado/touch y suite de historial existente. Undo persistido general queda fuera del roadmap; si se vuelve requisito, necesita decisión contractual separada.

### CALCA-05 — Revisión y entrega

**Scope:** quinto estado UX con resumen autoritativo, retorno a corrección y finalización/unlock actuales. Distinguir guardando, guardado, guardado con refresh pendiente y resultado incierto. Handoff al workspace existente, sin controles de personas en Admin ni nueva ruta de activación.

**Gate:** la revisión no crea readiness frontend; una Mesa exacta sin capacidad asignable se trata conforme a API. Finalizar usa el lock vigente; tras éxito y GET fallido no repite lock. Reload conserva distribución. Planner asigna/mueve/desasigna en `TABLE`/`SEAT` según contratos; Scanner muestra Mesa/Lugar sin edición/PII extra. Modo/servicio, cross-tenant, estado no editable y sustitución SVG preservan garantías.

**Evidencia:** journey real Provider → Planner → Scanner para raster y SVG, por mesa y exacto donde sean elegibles; regresión de pases físicos/ANONYMOUS sólo por Mesa y NOMINAL actual. Cualquier gap de consumidor se reporta para ticket específico; no se reconstruye el workspace dentro de esta fase.

### CALCA-06 — Certificación y prueba de reemplazo

**Resultado ejecutado:** [certificación CALCA-06](./CALCA06_TRACE_MODE_CERTIFICATION.md) — **BLOCKED** para piloto controlado. El informe conserva la matriz, los fallos iniciales, los tiempos y los P0/P1/P2. Este resultado no autoriza limpieza de UI ni altera los contratos o límites siguientes.

**Scope:** certificar las cinco pantallas/estados, medir ergonomía y preparación contra el recorrido previo, y registrar candidatos de reducción de UI. No añadir features ni eliminar código para conseguir el gate.

**Gate:** recorrido con plano del cliente autorizado o fixture ficticio, sin OCR/IA, de upload a layout operacional. Escenarios: raster horizontal/vertical/cuadrado, SVG irregular, 50 y 150 lugares exactos; 50/100/200 Mesas y 100/200 elementos SVG como regresión gráfica, sin ampliar capacidad comercial del Evento. Desktop/tablet landscape, targets de 44 px y alternativas accesibles. Todos los P0 de seguridad, integridad, recovery y consumidores verdes. No afirmar flakiness cero ni mejora de tiempo sin datos comparables.

**Evidencia:** HEAD probado, comandos y resultados, capturas, tiempos observados, límites y matriz de regresión. La experiencia Calca sólo se considera probada cuando conserva la operación completa y las alternativas. La decisión de retirar duplicaciones de UI requiere revisión de esa evidencia y ticket posterior; este gate no ejecuta borrados.

## 6. QA requerido en futuros cambios de código

Cada ticket ejecutará lint, typecheck, tests relevantes y build según `AGENTS.md`, con resultados y fallos previos separados. Usar [QA02](./QA02_CI_QA_EXECUTION.md) para seleccionar el alcance; `qa:quick` no sustituye la certificación final y los filtros se registran explícitamente.

| Capa | Qué se debe conservar/probar |
| --- | --- |
| Admin | Creación/selección, Seats, salida con borrador, doble envío, error incierto, refresh fallido tras éxito, conflicto, lock/unlock, reemplazo SVG. Base: `admin-event-preparation.test.tsx`. |
| Engine compartido | Suites de Surface, DOM, Konva, geometry, scene, history, inventario y performance en `packages/floorplan/src`. Captura de clicks frente a pan/drag y normalización tras zoom. |
| API/DB existente | [floorplan.integration-spec.ts](../../apps/api/test/floorplan.integration-spec.ts): tenant/Evento, capacidad, ocupación, cambio de modo, concurrencia, mappings y preservación al reemplazar. PostgreSQL real en base efímera propia; sin cambios de backend para facilitar QA. |
| Seguridad SVG | [floorplan-svg-validator.spec.ts](../../apps/api/src/file-assets/floorplan-svg-validator.spec.ts), [floorplan-svg-source.spec.ts](../../apps/api/src/floorplan/floorplan-svg-source.spec.ts) y pruebas de integración vigentes: scripts, XML/DTD, refs externas y límites siguen cerrados. |
| Consumidores | Seating, realtime/refetch, Scanner Mesa/Lugar y permisos read-only; recorridos M01 y modalidades existentes sin ampliar PII. |
| Cierre | `pnpm qa:full` en CALCA-06, incluyendo suites y journeys vigentes; ejecución aislada/serial de cargas DT09 según harness. No debilitar assertions, timeouts o retries. |

CALCA-00 sólo requiere revisión documental, enlaces locales válidos, formato y diff limitado a estos dos Markdown. No ejecuta suites de aplicación ni declara una certificación runtime nueva.

## 7. Retiro futuro condicionado de UI

Se pueden proponer, **después** de CALCA-06 y con autorización separada:

| Candidato | Prueba necesaria antes de proponer retiro |
| --- | --- |
| Prominencia redundante de catálogo/inventario en la entrada | Calca descubrible y Manual completo disponible como secundario. No eliminar catálogo, inventario ni bandeja. |
| Ciclo de reactivar Agregar lugar tras cada punto | Trazado persistente probado con salida, error incierto, Mesa padre, reload y tablet. |
| Controles de lugar dispersos e inspector monolítico | Paneles extraídos con paridad completa y protecciones de ocupación. |
| Chrome/resúmenes duplicados | Barra/revisión unificadas con guardado, recovery, lock y navegación equivalentes. |

Se conservan sin candidatura de eliminación los modelos, engine DOM/Konva, fallback accesible, API/SDK, Manual/SVG, sanitización, confirmaciones, recuperación, locks, undo/redo soportado, Planner y Scanner. Despriorizar una herramienta en la entrada no elimina su capacidad.

## 8. Riesgos y condiciones de bloqueo

| Riesgo | Tratamiento dentro del scope | Cuándo bloquear la fase afectada |
| --- | --- | --- |
| Latencia de creación + refetch limita la sensación de rapidez. | Medir; mantener la herramienta y serializar intenciones. | Si la meta exige paralelismo, API de bulk-create o garantías nuevas. |
| Incertidumbre de POST de Seat sin idempotencia contractual. | Detener, leer autoridad y revisar si no se puede atribuir resultado. | Si se exige reintento automático/exactly-once sin soporte actual. |
| Etiquetas tras bajas/renombres; mesa equivocada en trazado. | Etiqueta disponible según lectura vigente, padre visible y cambio de Mesa explícito. API valida. | Si falla integridad contractual; no ocultarla en frontend. |
| Confundir Calca con `SEAT` obligatorio o con capacidad nueva para servicio. | Separar herramienta/fuente/acomodo; respetar restricciones existentes. | Si el diseño requiere alterar elegibilidad o modo durante operación. |
| Prometer undo global que no existe. | Mantener historial local de Shape y correcciones explícitas de Seats. | Si se exige restaurar identidad tras borrado sin contrato aprobado. |
| Extraer recovery perdiendo bloqueo de escrituras o contexto de Evento. | Tests de doble envío, error/refetch y navegación; mover antes de adaptar. | Ante regresión de actor, tenant, lock o recuperación. |
| Nueva jerarquía esconde Manual/SVG o degrada Planner/Scanner. | Probar accesos secundarios y consumers reales antes de reducir UI. | Si falta paridad o cambia privacidad/check-in. |
| Source SVG insegura o reemplazo destructivo. | Reutilizar pipeline/fuente canónica y confirmación vigente. | Cualquier raw render, binding inválido o pérdida de dominio. |

No hay un bloqueo documental identificado para CALCA-00. La revisión estática no demuestra ausencia de defectos funcionales previos. Ante un fallo descubierto al implementar, registrar evidencia y origen antes de decidir si pertenece al ticket; nunca ampliar API/DB/dominio o borrar código como arreglo implícito.
