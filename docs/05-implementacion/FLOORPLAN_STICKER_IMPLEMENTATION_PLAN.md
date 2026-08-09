# Plan de implementación — Refactor Croquis Sticker

Estado: preparación para implementación. No sustituye backlog ni contratos normativos.

## Estrategia

Implementar en fases para no mezclar refactor visual con cambios de dominio.

## Fase 0 — Paridad y caracterización

Antes de cambiar renderer:

- localizar `FloorplanStep` y dependencias actuales;
- conservar tests existentes de geometría, touch, lock/unlock, mutaciones, responsive y errores;
- documentar endpoints y DTOs actuales de Floorplan;
- medir comportamiento actual con 50, 100 y 200 Mesas para obtener baseline;
- no cambiar backend en esta fase.

Exit gate: toda la suite actual verde y baseline registrado.

## Fase 1 — Modelo Sticker sin cambiar dominio

- agregar creación masiva de Mesas reutilizando contratos existentes o mediante una orquestación frontend segura si el backend no dispone de bulk;
- añadir bandeja de Mesas no colocadas;
- click/tap-to-place y drag-to-place;
- autonombre secuencial visible sin usarlo como ID;
- colocación automática inicial;
- búsqueda y contador de pendientes.

No introducir `Sticker` en Prisma/OpenAPI.

## Fase 2 — Renderer Canvas/Konva

Migración incremental:

1. crear adaptador de `FloorplanShape` normalizado a coordenadas de stage;
2. renderizar primero en modo read-only y comparar paridad;
3. migrar selección;
4. migrar drag;
5. migrar resize/rotate;
6. migrar polígonos;
7. habilitar zoom/pan;
8. retirar el overlay DOM manipulable solo cuando los tests de paridad estén verdes.

No borrar la implementación estable antes de demostrar equivalencia.

## Fase 3 — Productividad visual

- snap opcional;
- guías;
- multi-select si la arquitectura lo soporta sin ampliar dominio;
- align/distribute;
- undo/redo local para cambios visuales aún no persistidos o con estrategia explícita;
- color rápido, recientes y personalizado;
- auto-contraste;
- autosave/estado de persistencia compatible con el contrato actual.

## Fase 4 — Sillas visuales

- toggle `Mostrar sillas`;
- generación geométrica desde capacidad;
- sin IDs persistidos inicialmente;
- sin cambios backend;
- QA de 200 Mesas con sillas ocultas y escenario boutique con sillas visibles.

## Fase 5 — Capability de asiento individual

Esta fase sí requiere diseño técnico y revisión antes de código.

Codex debe entregar primero un ADR/Implementation Plan que defina:

- modelo `Seat` y asignación opcional;
- cómo mantiene `tableId` como relación primaria;
- autoridad de capacidad;
- migraciones;
- constraints de unicidad/ocupación;
- auditoría;
- concurrencia;
- OpenAPI/SDK;
- activación/desactivación;
- compatibilidad con eventos existentes;
- comportamiento de invitados/acompañantes nominales;
- impacto exacto en Scanner y reportes.

No implementar esta fase junto con la migración a Konva.

## Fase 6 — Split View

Modo Mesa primero:

- búsqueda;
- grupos;
- sin asignar/asignados;
- selección múltiple;
- bulk assignment;
- virtualización para ~1,800 asistentes.

Después, si la capability Seat ya está aprobada e implementada:

- vista ampliada de sillas;
- bulk auto-seat;
- drag de asistente a asiento;
- reasignación/desasignación.

## Fase 7 — Operación Live

- reutilizar renderer en modo read-only;
- reutilizar realtime existente y recuperación REST;
- mostrar ocupación/check-in por Mesa;
- mostrar asiento solo cuando exista;
- no habilitar edición de geometría durante operación.

## Archivos/regiones a preservar

Codex debe identificar las rutas exactas en el repo antes de editar. Como mínimo debe preservar:

- `FloorplanStep` actual y sus tests hasta completar paridad;
- helpers compartidos de proyección relativa/aspect-aware;
- tipos generados de `@invitaciones/api-client`;
- contratos Scanner realtime;
- FileAsset privado del Croquis;
- `EVENT_WIZARD_CONTRACT.md`.

## Regla de PRs

No hacer un PR monolítico con Canvas + Seat + Scanner + backend.

Separar como mínimo:

1. Sticker UX / inventario;
2. Konva parity;
3. productividad visual;
4. sillas visuales;
5. Seat backend/domain;
6. Seat frontend/split view;
7. Live/Scanner projection.

Cada PR debe mantener `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y gates específicos del paquete modificados en verde.
