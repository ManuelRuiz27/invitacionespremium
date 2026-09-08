# 23 — Roadmap activo: Croquis asistido por SVG

Estado: **FUENTE DE EJECUCIÓN — ACTIVO**  
Prioridad: **P0 de producto para Croquis antes del siguiente refactor visual general**  
Decisión base: `docs/04-tecnico/FLOORPLAN_SVG_MAPPING_CONTRACT.md`  
Sustituye como orden activo de ejecución a `22_FLOORPLAN_FUNCTIONAL_COMPLETION_ROADMAP.md`.

## 1. Objetivo

Reducir el trabajo manual de construcción del Croquis sin sustituir el dominio ya implementado.

La dirección aprobada es:

```text
SVG real del salón
        ↓
sanitizar / canonicalizar
        ↓
seleccionar elementos existentes
        ↓
mapearlos manualmente
        ↓
FloorplanShape
        ↓
TABLE / SEAT
        ↓
Planner
        ↓
Scanner
```

El objetivo no es construir un editor SVG ni un CAD.

El objetivo tampoco es completar todas las capacidades pendientes del roadmap 22. Sólo se conservan como bloqueantes aquellas que siguen siendo necesarias para operar el producto con el nuevo flujo.

## 2. Baseline que se congela

Se preserva sin reconstrucción:

- `Floorplan`;
- `FloorplanShape`;
- `FloorplanSeat`;
- `Assistant.floorplanShapeId`;
- `Assistant.floorplanSeatId`;
- modo `TABLE`;
- modo `SEAT`;
- Provider/Admin Builder;
- Sticker Model como fallback/complemento;
- `packages/floorplan`;
- DOM/Konva vigentes;
- normalización `0..1`;
- locks;
- Seating Workspace;
- seating API;
- realtime;
- Scanner/check-in;
- OpenAPI + api-client generado.

No crear:

- `FloorplanV2/V3`;
- segundo renderer funcional;
- segundo Seating Workspace;
- nueva persistencia de seating;
- entidad de negocio `SvgTable`/`SvgSeat`;
- stack gráfico paralelo.

## 3. Qué se conserva del roadmap 22

Sólo se arrastran estos pendientes:

1. certificación formal del baseline TABLE/SEAT ya construido;
2. terminar/adaptar Planner Seating únicamente si el audit demuestra gaps reales;
3. terminar/adaptar Scanner únicamente si el audit demuestra gaps reales;
4. integridad, recovery y concurrencia necesarias para el flujo nuevo;
5. QA end-to-end y seguridad;
6. compatibilidad raster.

No se arrastran automáticamente todas las herramientas de productividad manual del antiguo CF-02.

## 4. Qué deja de ser gate P0

La introducción del mapeo SVG cambia la estrategia de productividad.

Quedan **fuera del gate P0 de primera operación** salvo evidencia posterior de piloto:

- align left/center/right de Shapes;
- align top/middle/bottom;
- distribute horizontal/vertical;
- grid avanzado de Mesas;
- creación masiva de 50 Mesas dibujadas manualmente;
- multi-select avanzado de Shapes sólo por productividad;
- jerarquía nueva `Venue -> Space -> Layout`;
- sistema completo de plantillas reutilizables;
- catálogo extenso de mobiliario;
- refactor visual general de Croquis.

El Sticker Builder actual permanece disponible para raster, elementos faltantes y ajustes puntuales.

## 5. Orden de ejecución

```text
SVG-00  Certificar baseline actual
   ↓
SVG-01  Pipeline seguro de FileAsset SVG
   ↓
SVG-02  Canonicalización + elementos seleccionables
   ↓
SVG-03  Mapeo manual SVG -> FloorplanShape
   ↓
SVG-04  Estado visual + TABLE/SEAT sobre SVG
   ↓
SVG-05  Reemplazo / reconciliación / recovery
   ↓
SVG-06  Planner + Scanner: adaptar sólo gaps reales
   ↓
SVG-07  QA seguridad / escala / E2E
   ↓
SVG-08  Freeze funcional
   ↓
Pulido UI de Croquis
```

## 6. SVG-00 — Certificación del baseline actual

Estado: **DONE**
Prioridad: **P0**

Objetivo: no mezclar defectos previos con la nueva capability SVG.

No agregar features.

Certificar con suites reales:

### TABLE

- Floorplan raster actual;
- crear Mesa;
- capacidad manual;
- persist/reload;
- asignación Assistant -> Mesa;
- occupancy/disponibilidad;
- readiness;
- Scanner relacionado.

### SEAT

- lugar exacto persistente;
- Serpentina;
- Mesa U;
- Seat fuera de bbox de Mesa;
- block/unblock;
- capacidad derivada;
- group move;
- renumber atómico;
- Assistant -> Seat;
- reload;
- readiness;
- DOM/Konva.

Gate:

```text
TABLE PASS
SEAT PASS
Admin PASS
Client PASS
API/DB PASS
DOM PASS
Konva PASS
```

Si el gate pasa, el baseline queda congelado y cualquier regresión posterior se atribuye al trabajo SVG.

## 7. SVG-01 — Pipeline seguro de FileAsset SVG

Estado: **DONE**
Prioridad: **P0 SECURITY**

Objetivo: aceptar SVG sólo para Croquis sin introducir XSS/XML/CSS/external-resource risks.

Implementar:

- tipo de FileAsset SVG específico de Croquis;
- MIME `image/svg+xml`;
- parser XML seguro;
- sanitizer por allowlist/denylist explícita;
- canonicalización;
- límites de bytes;
- límites de nodos;
- límite de profundidad;
- rechazo de DTD/entities;
- rechazo de `<script>`;
- rechazo de `foreignObject`;
- rechazo de atributos `on*`;
- rechazo de referencias externas;
- no servir raw upload;
- checksum de canonical output;
- contenido privado como FileAsset actual.

No modificar soporte raster salvo lo necesario para compartir abstracción de source.

Gate:

- SVG seguro válido queda `READY`;
- SVG malicioso nunca llega al renderer;
- JPG/PNG continúan funcionando.

## 8. SVG-02 — Fuente canónica y elementos seleccionables

Estado: **DONE**
Prioridad: **P0**

Objetivo: convertir el SVG seguro en una fuente visual estructurada seleccionable sin convertirla en modelo de negocio.

Implementar:

- metadata de viewBox/aspect ratio;
- lista tipada de elementos seleccionables;
- soporte inicial de `g`, `path`, `rect`, `circle`, `ellipse`, `polygon`, `polyline`;
- IDs canónicos únicos;
- conservar IDs originales sólo si son válidos y únicos;
- IDs generados cuando falten o estén duplicados;
- bounding box normalizado por elemento;
- elemento visible no mapeable permitido;
- render de fuente dentro de `packages/floorplan` / superficie vigente.

No implementar edición de path.

Gate:

- un SVG real exportado de herramienta de diseño puede cargarse y presentar elementos seleccionables estables después de reload.

## 9. SVG-03 — Mapeo manual a `FloorplanShape`

Estado: **DONE**

Prioridad: **P0 CORE**

Objetivo: que el Provider convierta elementos del SVG a las entidades actuales sin redibujarlos.

Flujo:

```text
seleccionar elemento
        ↓
¿Qué representa?
        ↓
Mesa / Pista / DJ / Baños / Barra / Entrada / Zona
        ↓
propiedades necesarias
        ↓
FloorplanShape
```

Implementar:

- mapping elemento -> Shape;
- `TABLE` para Mesa;
- `DECORATIVE_ZONE` para presets no asignables;
- `sourceElementId` o binding técnico mínimo equivalente;
- unicidad: un elemento activo no mapea dos Shapes;
- geometría proxy derivada de bounding box;
- nombre/configuración humana;
- desvincular sin eliminar Shape;
- elementos no mapeados no afectan readiness;
- Shapes manuales y mapeadas coexisten.

No convertir `path` irregular a `polygonPoints` por obligación.

Gate:

- un Provider puede mapear una Mesa circular, una Mesa irregular y una Zona sin dibujar manualmente su geometría.

Evidencia de cierre (2026-09-07):

- `sourceElementId` nullable con índice único parcial para Shapes activas; Shapes manuales y raster conservan `null`.
- API Admin de mapping y desvinculación con bbox normalizado, transacciones serializables, guards de fuente/tenant/Evento/lock, auditoría y recompute de readiness. Desvincular preserva Shape, Seats y asignaciones.
- Admin clasifica Mesa/Zona con nombre y capacidad; recarga autoritativa y selección/desvinculación. DOM/Konva conservan la geometría SVG visible sin stickers proxy opacos ni estilos de ocupación.
- Parser de transforms completo para matrix/translate/scale/rotate/skewX/skewY, con rechazo cerrado de sintaxis inválida, funciones desconocidas y desbordamientos; 38 pruebas de geometría.
- QA: 30 pruebas de integración Floorplan/seating en PostgreSQL aislado, 57 pruebas Admin y 91 pruebas del renderer compartido; OpenAPI/api-client generado, Prisma validate, lint, typecheck y build verdes.
- Ajuste necesario de integridad: capacidad derivada 0 permitida en SEAT, manteniendo capacidad positiva en TABLE. Se corrigieron por separado errores previos de tipado en fixtures raster y coordenadas del QR del demo local Flipbook, sin cambiar su comportamiento.

SVG-04+ permanece fuera de esta implementación.

## 10. SVG-04 — Estado visual operacional + Detailed Seating

Estado: **READY**

Prioridad: **P0**

Objetivo: que el SVG deje de ser una imagen pasiva y refleje el estado del dominio existente.

Implementar proyección visual derivada:

- Mesa vacía;
- Mesa parcial;
- Mesa llena;
- seleccionada;
- read-only/disabled cuando aplique.

La proyección usa `FloorplanShape.capacity/occupancy` y nunca persiste estado en XML.

### SEAT

Debe funcionar sin modificar el contrato de lugares:

- Seats siguen en coordenadas globales `0..1`;
- pueden quedar fuera del bbox del elemento SVG;
- Mesa SVG sigue siendo parent lógico;
- agregar/mover/bloquear/renumerar lugares usa el motor actual;
- persona -> Seat continúa por `FloorplanSeat`;
- no se crean Seats automáticamente desde sillas dibujadas.

Gate:

- Mesa SVG irregular puede operar `SEAT` con lugares exactos y asignación real;
- cambiar ocupación cambia la presentación sin mutar el SVG almacenado.

## 11. SVG-05 — Reemplazo, reconciliación y recovery

Estado: **BLOCKED por SVG-03**  
Prioridad: **P0 DATA INTEGRITY**

Objetivo: que cambiar la fuente visual nunca destruya el dominio.

Implementar:

- confirmación explícita al reemplazar SVG con mappings;
- reemplazo transaccional de FileAsset;
- retirar bindings incompatibles;
- preservar FloorplanShape;
- preservar FloorplanSeat;
- preservar Assistant assignments;
- preservar seatingMode;
- reload autoritativo;
- recovery tras timeout/network error;
- auditoría del reemplazo/mapping;
- sin fuzzy matching automático.

También cubrir:

- raster -> SVG;
- SVG -> raster;
- SVG -> SVG.

Gate:

- reemplazar la fuente jamás elimina Mesa/Seat/Assistant de forma implícita.

## 12. SVG-06 — Planner + Scanner: sólo gaps reales

Estado: **DISCOVERY / ADAPT ONLY**  
Prioridad: **P0 OPERACIONAL**

Objetivo: adaptar las superficies consumidoras, no reescribirlas.

### Planner

Auditar primero.

Si ya funciona por `FloorplanShape` / `FloorplanSeat`, sólo adaptar render/selección visual.

Debe conservar:

- TABLE persona -> Mesa;
- SEAT persona -> lugar;
- mover;
- desasignar;
- búsqueda/filtros;
- 409/refetch;
- realtime;
- geometría read-only.

### Scanner

Auditar primero.

Debe conservar/agregar únicamente lo necesario para:

- mostrar Mesa;
- mostrar Lugar en SEAT;
- resaltar elemento SVG de Mesa cuando exista binding;
- resaltar Seat exacto;
- no ampliar PII;
- mantener precondiciones de check-in.

No crear nuevas superficies si las actuales se pueden adaptar.

Gate:

- Planner y Staff pueden operar un Evento SVG sin conocer XML, IDs ni mapping técnico.

## 13. SVG-07 — QA seguridad, escala y E2E

Estado: **BLOCKED por SVG-01..06**  
Prioridad: **P0 GATE**

Fixtures mínimos:

### Seguridad

- script;
- foreignObject;
- onclick/onload;
- javascript URL;
- external image/ref;
- DTD/entity;
- CSS/external ref malicioso;
- node bomb;
- depth bomb.

### SVG funcional

- rect;
- circle;
- ellipse;
- path irregular;
- group compuesto;
- IDs faltantes;
- IDs duplicados;
- 50 elementos seleccionables;
- 100 elementos seleccionables;
- 200 elementos seleccionables.

### Dominio

- TABLE mapeada;
- DECORATIVE_ZONE mapeada;
- TABLE raster sin regresión;
- SEAT sobre Mesa SVG;
- Serpentina SVG;
- U SVG;
- reemplazo con mappings;
- reload;
- lock;
- estado no editable;
- cross-event/cross-tenant;
- concurrencia de mapping;
- Scanner;
- Planner.

Performance:

- interacción usable con 100 elementos SVG mapeables;
- benchmark con 200 elementos sin degradación bloqueante;
- no exigir 200 Shapes manualmente dibujadas como condición del nuevo flujo.

Gate:

- todos los P0 verdes;
- ningún SVG inseguro llega al render;
- sin regresión raster/TABLE/SEAT/check-in.

## 14. SVG-08 — Freeze funcional

Estado: **BLOCKED por SVG-07**  
Prioridad: **GATE**

Se declara freeze cuando:

- baseline TABLE/SEAT certificado;
- SVG seguro;
- mapping manual usable;
- estado visual autoritativo;
- SEAT funciona sobre SVG;
- reemplazo es seguro;
- Planner funciona;
- Scanner funciona;
- QA P0 verde;
- API/OpenAPI congelados para el alcance;
- no existe blocker que requiera nueva arquitectura.

A partir de aquí puede comenzar el pulido visual general de Croquis.

## 15. Deuda explícitamente diferida

No implementar durante este roadmap salvo decisión nueva:

- OCR;
- detección automática de Mesas;
- vectorización de raster;
- edición de nodos/path;
- CAD/3D;
- auto-seating;
- matching inteligente entre SVG reemplazados;
- template system completo por Venue/Espacio;
- nuevo rol Venue;
- Planner Builder self-service;
- align/distribute/grid avanzado de Shapes;
- nuevo catálogo masivo de objetos;
- migración de design system.

## 16. Métricas de piloto

Medir:

- minutos desde upload SVG hasta Croquis operativo;
- elementos mapeados por minuto;
- número de Shapes que todavía requieren dibujo manual;
- número de correcciones de mapping;
- tiempo para preparar 50 Mesas desde SVG;
- errores de seating;
- incidencias de reemplazo;
- tiempo de Planner para acomodar;
- tiempo de Staff para localizar Mesa/Lugar;
- necesidad real de align/grid/templates después del piloto.

Estas métricas decidirán si las capacidades diferidas del roadmap 22 vuelven a prioridad.

## 17. Definición final de DONE

`CROQUIS SVG ASSISTED = DONE` cuando:

```text
Provider puede cargar un SVG real y seguro
        +
Provider puede mapear Mesas/Zonas sin redibujar
        +
FloorplanShape sigue siendo autoridad
        +
TABLE y SEAT operan sobre esa fuente
        +
Planner acomoda normalmente
        +
Scanner localiza Mesa/Lugar
        +
reemplazo/reload/concurrencia son seguros
        +
raster actual no presenta regresión
```

No se requiere completar las herramientas de dibujo/productividad diferidas del roadmap 22 para declarar este objetivo terminado.
