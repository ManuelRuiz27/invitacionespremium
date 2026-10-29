# Modo Calca — experiencia objetivo de construcción de Croquis

Estado: **CALCA-00 — definición UX y auditoría documental; sin implementación**.

Fecha: 2026-10-29. Baseline auditado de `main`: `c4d3997969ed2793c63c41cc60c8d491407a1fd1`.

Actor constructor: Provider mediante `PLATFORM_ADMIN` y la superficie administrativa vigente.

## 1. Decisión y autoridad

**Modo Calca será el flujo principal del Builder:** tomar el plano que entrega el cliente, identificar sus Mesas y colocar los lugares sobre las posiciones dibujadas, sin reconstruir fielmente el mobiliario. Manual y Mapeo SVG permanecen como herramientas secundarias disponibles sobre el mismo Croquis.

Esta es una dirección de interacción para trabajo posterior. CALCA-00 no habilita features ni certifica cambios de runtime. El [roadmap CALCA](../05-implementacion/24_FLOORPLAN_TRACE_MODE_ROADMAP.md) divide su implementación futura en gates pequeños; cada fase requiere un ticket explícito.

Prevalecen la [dirección M01 Managed](../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md), el [modelo M01](../01-producto/06A_MODELO_01_PLANNER_INDEPENDIENTE.md), los [roles](../01-producto/03_ROLES_PERMISOS_ACCESO.md) y el [ADR operator-led](../04-tecnico/ADR_OPERATOR_LED_ACCESS.md). Calca no cambia ownership ni capacidades.

Los contratos de [lugares exactos](../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md), [SVG](../04-tecnico/FLOORPLAN_SVG_MAPPING_CONTRACT.md) y [Sticker/Seating](../04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md) gobiernan persistencia y operación. Se conserva [FLOORPLAN_UX_TARGET](./FLOORPLAN_UX_TARGET.md) para lenguaje, accesibilidad y responsive. La prioridad Calca de este documento evoluciona el orden de herramientas de esa referencia; no revoca sus invariantes ni el freeze API del [roadmap SVG](../05-implementacion/23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md).

## 2. Qué significa Calca

El Provider **interpreta manualmente** el plano. Una Mesa continúa siendo `FloorplanShape` de tipo `TABLE`; cada lugar exacto continúa siendo `FloorplanSeat` con Mesa padre y coordenadas globales normalizadas `0..1`. La Mesa puede ser una referencia visual aproximada: los lugares no tienen que quedar dentro de su bounding box.

Calca, Manual y Mapeo SVG son herramientas de construcción de UI, no valores nuevos de `seatingMode`, estados persistidos, entidades ni perfiles comerciales. Son independientes del tipo de fuente y del modo de acomodo:

| Eje | Opciones existentes y uso objetivo |
| --- | --- |
| Fuente | JPG/PNG raster o SVG canónico sanitizado. Calca puede trabajar sobre ambos sin requerir mapping. |
| Construcción | Calca primero; Manual para crear/ajustar stickers y zonas; Mapeo SVG para vincular elementos de una fuente SVG. |
| Acomodo | **Por mesa** (`TABLE`) o **Por lugar exacto** (`SEAT`), según selección explícita y elegibilidad vigente. |

Elegir Calca nunca activa `SEAT` automáticamente. En `TABLE`, el flujo coloca Mesas, configura capacidad manual y pasa a corrección/revisión; no crea lugares persistentes. En `SEAT`, la capacidad es derivada por API de lugares activos no bloqueados. No se introduce un campo de capacidad paralelo.

## 3. Recorrido desde el plano del cliente hasta la operación

1. El cliente entrega su plano al Provider por el procedimiento operativo existente. Esta propuesta no crea un portal de uploads para Planner.
2. Provider abre la preparación de Croquis existente y sube JPG/PNG o SVG mediante FileAssets administrativos. Un PDF requiere conversión externa previa a un formato admitido; no se promete importación PDF nueva.
3. Provider comprueba orientación y legibilidad con zoom, pan y ajustar vista. Reutiliza Croquis existentes sin reiniciarlos. Si no hay plano, Manual es la alternativa; el Admin actual exige una imagen para crear Croquis y Calca no inventa un backend de lienzo vacío.
4. Provider elige acomodo por mesa o por lugar exacto sólo cuando los contratos y el Evento lo permitan. Define una Mesa sobre el dibujo mediante una Shape existente con nombre humano y geometría aproximada. No necesita redibujar una U o serpentina.
5. En lugar exacto, selecciona la Mesa padre, entra en **Trazar lugares** y marca sucesivamente las posiciones físicas. Termina esa Mesa y continúa con otra. En por mesa omite este paso.
6. Corrige posiciones y etiquetas con las herramientas existentes; revisa lugares bloqueados y capacidad autoritativa. Manual y SVG pueden complementar el mismo Croquis sin duplicar las entidades ya creadas.
7. Revisa el resultado y usa la finalización/lock existente cuando proceda. Finalizar distribución no activa el Evento ni sustituye readiness. Salir y volver permite recuperar el resultado confirmado por API.
8. Planner consume ese mismo Croquis y opera asignaciones por Mesa o lugar según corresponda. Staff consulta Mesa/Lugar desde Scanner conforme al servicio y al token autorizado. Ninguno obtiene construcción geométrica.

## 4. Cinco estados de UI

Son estados de presentación propuestos; no se añaden al lifecycle del Evento ni a la DB. Loading, error, guardado, incertidumbre y read-only son condiciones transversales, no un sexto paso de negocio.

| Estado | Canvas y contexto | Acción principal | Salida y retorno |
| --- | --- | --- | --- |
| **1. Entrada** | Plano cargado o CTA de upload; contexto del Evento, guardado y opción de acomodo. Calca destacada; Manual y SVG bajo herramientas secundarias. | **Subir plano** o **Continuar calca** si ya existe. | Tras lectura válida, crear/seleccionar Mesa. Error de carga ofrece recuperar lectura sin dar por creado el Croquis. |
| **2. Creación de mesas** | Plano dominante; Mesa seleccionada con nombre y representación simple. Capacidad editable sólo en por mesa. | **Agregar mesa**; después **Trazar lugares** si el modo es exacto. | Sólo una Mesa confirmada por API puede recibir lugares. Puede volver a seleccionar una Mesa existente o pasar a corregir/revisar. |
| **3. Calca rápida de lugares** | Mesa padre siempre visible, puntos/etiquetas confirmados y contador actualizado desde autoridad. | **Trazar lugares** mantiene la herramienta activa entre colocaciones confirmadas; **Terminar mesa** sale explícitamente. | Cambiar de Mesa requiere salir de trazado. Pausa ante mutación en vuelo, conflicto o resultado incierto; nunca continúa sobre estado dudoso. No aplica a `TABLE`. |
| **4. Corrección** | Selección simple/múltiple de lugares; inspector contextual; acciones de Shape cuando proceden. | Mover, renombrar, duplicar, bloquear/desbloquear, eliminar o renumerar mediante operaciones soportadas. | Al confirmar y reconciliar puede volver a trazar o revisar. Cancelar un borrador no elimina objetos persistidos. |
| **5. Revisión final** | Plano completo y resumen de Mesas/capacidad/lugares; pendientes y errores autoritativos identificables. | **Finalizar distribución** usa lock actual; **Volver a corregir** cuando sea editable. | Lock confirmado deja geometría read-only. Una reapertura usa unlock vigente y sus permisos; no constituye nueva activación. |

### Entrada y creación de Mesas

La barra superior concentra Evento/Croquis, estado real de guardado, salir y las acciones de historial disponibles. El panel contextual muestra sólo el nombre y capacidad relevante. No se exponen UUID, coordenadas, XML, enums ni geometría técnica en el recorrido primario.

Para un plano con mobiliario dibujado, la Shape funciona como referencia lógica con la presentación existente. No se requiere un nuevo tipo de Mesa invisible, un polígono exacto ni una propiedad persistida de opacidad. La reducción de ruido de overlays será una adaptación presentacional que debe probar legibilidad y selección.

Si se usa Mapeo SVG, se selecciona el elemento canónico y se vincula/crea la Shape existente. No se crea una Mesa manual adicional sobre una ya mapeada. Las zonas siguen siendo `DECORATIVE_ZONE`, sin capacidad asignable.

### Calca rápida

La mejora buscada es no volver a pulsar Agregar lugar después de cada punto. No es detección automática de sillas ni creación concurrente de una nube de puntos.

- Cada gesto confirmado produce como máximo una intención de creación sobre la Mesa seleccionada. El siguiente gesto se admite tras resolver la escritura y recuperar la autoridad necesaria.
- Click/tap de trazado se distingue de selección, drag y pan. Desplazar o hacer zoom nunca crea lugares; terminar/cancelar sale de la herramienta sin borrar lo guardado.
- La etiqueta propuesta debe evitar colisiones con las etiquetas vigentes. El conteo de lugares no es identidad ni garantía de unicidad después de bajas/renombres. API sigue siendo autoridad.
- No hay cola de escrituras pendientes, guardado offline, replay automático ni persistencia nueva en Web Storage.
- Una respuesta perdida requiere recuperación por lectura. Si no puede atribuirse de forma inequívoca la creación, se detiene la calca y se pide revisar el plano; un aumento de conteo no prueba qué intención se aplicó.

### Corrección e historial: límite auditado

Se reutilizan selección múltiple, movimiento en batch, renombrado, duplicado, bloqueo y renumeración actuales. Los lugares conservan su UUID aunque cambie la etiqueta. No se puede bloquear/eliminar un lugar ocupado; borrar Mesa no implica borrar lugares o asignaciones por conveniencia.

**El undo/redo actual cubre el borrador de una Shape seleccionada en `FloorplanSurface`. No es historial global de operaciones persistidas ni de Seats.** Calca debe conservar ese alcance y comunicar cuándo está disponible. No puede simular deshacer un Seat borrándolo/recreándolo, porque cambiaría identidad y podría afectar ocupación. Deshacer creaciones, eliminaciones o renumeraciones persistidas queda diferido: necesitaría un contrato posterior si no puede expresarse con seguridad mediante la arquitectura actual. Las correcciones de lugares sí se realizan mediante sus acciones explícitas vigentes.

### Revisión final y entrega

El resumen distingue capacidad asignable, lugares definidos y bloqueados cuando aplique; no trata todas las sillas dibujadas como capacidad. Puede señalar Mesas sin lugares asignables en exacto y pendientes autoritativos, sin crear un resolver de readiness frontend.

La revisión prepara infraestructura. No asigna personas desde Admin, no exige invitados acomodados antes de tiempo para servicios digitales y no altera las reglas especializadas de activación. El [workspace operativo](../04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md) y el [contrato Scanner](../04-tecnico/SCANNER_CHECKIN_CONTRACT.md) conservan sus recorridos y límites de datos.

## 5. Reutilización auditada en `main`

Las rutas son evidencia del baseline, no nombres de componentes nuevos prometidos. Las referencias históricas a archivos de renderer dentro de Client se resuelven contra el paquete compartido actual.

| Pieza actual | Reutilización en Calca | Adaptación/límite observado |
| --- | --- | --- |
| [AdminFloorplanBuilderWorkspace](../../apps/admin/src/events/preparation/floorplan/AdminFloorplanBuilderWorkspace.tsx): `upload`, `requestUpload`, `useAdminFloorplanImageUrl` | Entrada, fuente privada, reemplazo y recuperación. | No ampliar formatos; conservar confirmación de desvinculación SVG y revocación de Object URL. |
| Mismo archivo: `selectPreset`, `save`, `selectShape`, `ShapeInspector` | Mesa lógica, nombre, capacidad y edición de Shape. | Reordenar la experiencia; no agregar geometrías ni rehacer dominio. |
| Mismo archivo: `addSeat`, `placeSeat` | Crear `FloorplanSeat` sobre la Mesa seleccionada. | `placeSeat` hoy vuelve a `idle` tras una creación; permanencia en trazado es **ADAPT**, no capacidad terminada. |
| Mismo archivo: `moveSeat`, `updateSeat`, `duplicateSeat`, `removeSeat`, `renumberSeats` | Corrección de lugares y movimiento múltiple con `clampSeatGroupDelta`. | Acciones individuales salvo batch de movimiento y renumber existentes; no prometer bulk-delete ni undo global. |
| Mismo archivo: `mapSource`, `unlinkSource`, `selectSource` | Herramienta secundaria de Mapeo SVG. | Mantener unicidad, fuente canónica y dominio al desvincular. |
| Mismo archivo: `runMutation`, `recoverAfterFailedMutation`, `refreshAfterConfirmedMutation`, `refreshAuthoritative`, `dirty`/`useBlocker` | Escrituras serializadas en UI, errores, reconciliación y salida con borrador. | Reutilizar el coordinador; ampliar cobertura para trazado persistente sin atribuir garantías ausentes. |
| [FloorplanSurface](../../packages/floorplan/src/FloorplanSurface.tsx), [FloorplanToolbar](../../packages/floorplan/src/FloorplanToolbar.tsx), [historial](../../packages/floorplan/src/floorplan-history.ts) | Zoom/pan/fit, teclado y undo/redo local de Shape. | Preservar viewport en transiciones; historial no contiene Seats persistidos. |
| [Konva](../../packages/floorplan/src/FloorplanKonvaRenderer.tsx), [DOM](../../packages/floorplan/src/FloorplanDomRenderer.tsx), [scene](../../packages/floorplan/src/floorplan-scene.ts), [geometry](../../packages/floorplan/src/floorplan-geometry.ts) | Render actual, hit targets, selección y coordenadas normalizadas. | Probar captura de clicks frente a pan/drag en ambos renderers y proporciones de plano. |
| [Catálogo](../../packages/floorplan/src/FloorplanStickerCatalog.tsx), [inventario](../../packages/floorplan/src/FloorplanInventory.tsx), [bandeja](../../packages/floorplan/src/FloorplanTray.tsx) | Manual como alternativa/complemento; Mesas pendientes existentes. | No hacer inventario masivo un paso obligatorio de Calca. |
| [SDK administrativo](../../packages/api-client/src/admin/event-preparation.ts) y [schema generado](../../packages/api-client/src/generated/schema.ts) | Contratos actuales para Shape, Seat, modo, source, mapping y lock. | Consumir tipos existentes; sin endpoints, DTOs manuales ni regeneración contractual en CALCA-00. |
| [FloorplanService](../../apps/api/src/floorplan/floorplan.service.ts) | Autoridad existente de capacidad, integridad, estado, actor, locks y auditoría. | Referencia read-only; ninguna modificación backend/DB en esta iniciativa. |
| [SeatingWorkspace](../../apps/client/src/workspace/SeatingWorkspace.tsx), [ScannerFloorplan](../../apps/scanner/src/components/ScannerFloorplan.tsx) | Consumen las mismas Shapes/Seats y fuente. | No segundo workspace; no introducir handlers de construcción en consumidores read-only. |

## 6. Extracciones posibles del workspace Admin

Son propuestas de modularización futura, no componentes existentes. Primero extraer conservando comportamiento; después cambiar UX. Cada extracción debe mantener las pruebas y las fronteras de [monorepo](../04-tecnico/MONOREPO_ARCHITECTURE.md).

| Responsabilidad embebida actual | Extracción propuesta | Ubicación y frontera |
| --- | --- | --- |
| Header, estado de guardado, selector de acomodo y acciones lock/unlock | Barra de preparación y resumen de revisión controlados por props. | Dentro de `apps/admin`; no calcular permisos/readiness en presentación. |
| Upload, confirmación de reemplazo, carga privada y error de metadata SVG | Panel de fuente y hook de recurso privado. | Dentro de `apps/admin`; conservar abort, cleanup y coordinador de mutaciones. |
| `Palette`, `ShapeInspector`, diálogos y acciones inline de Seats/mapping | Paneles contextuales separados para Mesa, lugar y mapping. | Dentro de `apps/admin`; reutilizar exports de `packages/floorplan`. |
| Estados de selección, herramienta y transición entre creación/corrección | Controlador de interacción del Builder. | Dentro de `apps/admin`; sin persistir nuevos estados ni cambiar reglas API. |
| `runMutation` y recovery/refetch | Hook administrativo con responsabilidad única y pruebas de fallos. | Dentro de `apps/admin`; no copiar a Client/Scanner ni mezclarlo con renderer. |

Sólo una necesidad real de presentación compartida justificaría mover piezas puras a `packages/floorplan`. `packages/ui` no recibe reglas de negocio ni llamadas API. Ninguna app importa fuentes de otra app; no se crea un package nuevo.

## 7. UI candidata a retiro futuro

**No se elimina código en CALCA-00 ni se autoriza su eliminación por este roadmap.** Tras probar reemplazo, un ticket posterior puede retirar duplicaciones concretas de UI; las capacidades Manual/SVG y sus rutas autorizadas se preservan.

| UI actual candidata | Reemplazo que debe probarse primero | Evidencia requerida antes de proponer retiro |
| --- | --- | --- |
| Prominencia simultánea de catálogo, inventario y creación manual en la entrada | Entrada Calca dominante con acceso secundario a Manual. | Construcción raster/SVG y alternativa Manual accesibles, incluyendo tablet. Se retira prominencia, no el motor. |
| Ciclo de pulsar Agregar lugar para cada punto | Sesión de trazado repetido con Terminar mesa. | Colocación sin duplicados ni cambio accidental de padre; cancelación, conflicto, reload y touch probados. |
| Controles dispersos de lugar e inspector monolítico | Panel contextual extraído con todas las acciones equivalentes. | Renombrar, duplicar, mover, bloquear, eliminar y renumerar preservan identidad y protecciones. |
| Resumen/chrome duplicado entre construcción y finalización | Barra y revisión unificadas. | Guardado, fallo de refresh, lock/unlock y navegación siguen distinguiéndose. |

No son candidatos a eliminar: Shapes/Seats, selección DOM accesible, fallback DOM, Konva, Manual, inventario/bandeja funcional, Mapeo SVG, sanitización, confirmaciones destructivas, recovery, locks, historial soportado, Seating ni Scanner.

## 8. Invariantes y riesgos que condicionan la UX

- **Seguridad:** SVG sólo canónico sanitizado; nunca renderizar upload raw ni abrir SVG a otros módulos. Reemplazar fuente retira bindings incompatibles de forma autoritativa y conserva Shapes, Seats y asignaciones. No matching heurístico.
- **Concurrencia y recuperación:** conservar locks, actor real, ownership y respuestas autoritativas. Un refresh fallido tras éxito no repite la mutación. Red/timeout/409 interrumpen trazado hasta reconciliar; no inventar Idempotency-Key donde el contrato de creación de Seats no la ofrece.
- **Identidad y modo:** etiquetas no son UUID; renumerar no reasigna personas. `SEAT` opcional, sin conversión automática. Confirmación de regreso a `TABLE` y restricciones por lifecycle permanecen.
- **Compatibilidad operacional:** `PHYSICAL_QR` y `ACCESS_CONTROL + ANONYMOUS` conservan sólo `TABLE`. La presencia de controles históricos en Admin no autoriza ampliar servicios. NOMINAL y demás consumidores existentes se conservan sin extender M02 como objetivo de Calca.
- **Ergonomía:** puntos densos, overlays sobre mobiliario y gestos de pan pueden causar errores. Canvas dominante, contraste más texto/forma, acción alternativa por teclado/lista y targets táctiles de al menos 44×44. Desktop y tablet landscape son prioritarios; no se promete un Builder móvil completo nuevo.
- **Velocidad:** hoy cada creación y reconciliación tiene latencia. La calca rápida elimina pasos de UI; no promete throughput ni metas de tiempo sin medición real. No sacrificar recovery para aparentar rapidez.

Quedan excluidos OCR, IA, visión, CAD, vectorización, auto-seating, nuevas entidades/roles/rutas/API/DB, edición SVG de paths, borrado de código y cambios de Finance, activación o check-in. Cualquier necesidad que cruce estos límites se reporta como **BLOCKED para esa fase**, sin resolverla dentro de un refactor UX.
