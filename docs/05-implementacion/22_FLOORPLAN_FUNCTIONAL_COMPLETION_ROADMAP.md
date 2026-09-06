# 22 — Roadmap histórico: Croquis funcional listo para operación real

Estado: **SUPERSEDED / HISTÓRICO**  
Sustituido por: `docs/05-implementacion/23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md`  
Decisión vigente desde: **2026-09-06**

## 1. Motivo de sustitución

Este roadmap ordenó el cierre del Croquis sobre un supuesto principal: que la productividad del Provider debía resolverse ampliando el Builder manual con más operaciones de shapes —multi-select, align/distribute, grid, creación masiva y plantillas— antes del siguiente pulido visual.

La dirección de producto cambió después de validar que gran parte del costo operativo proviene de **reconstruir manualmente geometría que ya existe en el croquis original**.

La nueva estrategia prioriza:

```text
SVG real del salón
        ↓
sanitización
        ↓
selección manual de elementos
        ↓
mapeo a FloorplanShape
        ↓
TABLE / SEAT
        ↓
Planner / Scanner
```

La fuente de verdad del nuevo enfoque es:

- `docs/04-tecnico/FLOORPLAN_SVG_MAPPING_CONTRACT.md`;
- `docs/05-implementacion/23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md`.

## 2. Baseline válido que se conserva

Este documento sí deja como baseline histórico válido el trabajo ya construido antes del cambio de dirección:

- `Floorplan`;
- `FloorplanShape`;
- `FloorplanSeat`;
- `Assistant.floorplanShapeId`;
- `Assistant.floorplanSeatId`;
- Builder Provider/Admin;
- Sticker Model;
- `packages/floorplan`;
- renderer DOM/Konva;
- coordenadas normalizadas `0..1`;
- locks;
- Seating Workspace;
- seating API;
- realtime;
- Scanner/check-in;
- OpenAPI/api-client.

No se autoriza reconstruir ninguna de esas capas para implementar SVG.

## 3. Estado heredado de CF-00 / CF-01

### CF-00 — Baseline funcional verificable

Estado al ser sustituido: **PARTIAL / GATE DE CERTIFICACIÓN PENDIENTE**.

La evidencia existente incluía:

- integración API/DB real;
- regresión TABLE cubierta por suites existentes;
- fixture Serpentina;
- fixture Mesa U;
- persistencia/reload de `FloorplanSeat`;
- asignación Assistant -> Seat;
- readiness detallado;
- DOM/Konva.

La certificación formal pendiente se transfiere a `SVG-00` del roadmap 23.

### CF-01 — Acomodo por lugar exacto

Estado al ser sustituido: **FUNCTIONAL GATE PASS / CERTIFICACIÓN FORMAL PENDIENTE**.

Queda congelado como implementación funcional existente. No debe recibir features nuevas salvo una regresión P0 demostrada por certificación.

La certificación final se transfiere a `SVG-00` del roadmap 23.

## 4. Pendientes del roadmap 22 que sí se trasladan

Sólo continúan como necesidades reales:

- certificación TABLE/SEAT;
- adaptación de Planner si el audit revela gaps reales;
- adaptación de Scanner si el audit revela gaps reales;
- integridad/concurrencia/recovery;
- QA end-to-end;
- compatibilidad raster;
- freeze funcional antes del pulido visual general.

## 5. Pendientes que dejan de ser P0

Ya no son gates obligatorios para la primera operación SVG:

- multi-select avanzado de Shapes por productividad;
- align izquierda/centro/derecha;
- align arriba/medio/abajo;
- distribute horizontal/vertical;
- grid avanzado;
- creación manual masiva de 50–200 Mesas;
- sistema completo de plantillas Venue/Espacio;
- nueva jerarquía Venue -> Space -> Layout;
- catálogo extenso de mobiliario.

Estas capacidades pueden retomarse únicamente si datos de piloto muestran que siguen siendo necesarias después del mapeo SVG.

## 6. Elementos que permanecen fuera de alcance

- CAD;
- OCR;
- detección automática de sillas/Mesas;
- vectorización automática;
- edición de Bézier/path;
- auto-seating;
- Planner Builder self-service durante operator-led;
- arquitectura paralela.

## 7. Regla de ejecución

No usar este archivo como roadmap activo.

Para cualquier nueva tarea de Croquis, seguir:

1. `FLOORPLAN_DETAILED_SEATING_CONTRACT.md` cuando afecte lugares exactos;
2. `FLOORPLAN_SVG_MAPPING_CONTRACT.md` cuando afecte fuente SVG/mapping;
3. resto de contratos especializados;
4. `23_FLOORPLAN_SVG_ASSISTED_ROADMAP.md` como orden activo.

El historial detallado anterior permanece disponible en Git.
