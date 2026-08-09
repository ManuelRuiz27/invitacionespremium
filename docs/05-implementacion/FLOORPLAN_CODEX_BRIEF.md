# Brief obligatorio para Codex — Refactor Croquis Sticker

## Lectura obligatoria antes de editar

1. `AGENTS.md`
2. `README.md`
3. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md`
4. `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`
5. `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`
6. `docs/03-diseno/FLOORPLAN_UX_TARGET.md`
7. `docs/03-diseno/assets/floorplan-sticker-flow-target.svg`
8. `docs/05-implementacion/FLOORPLAN_STICKER_IMPLEMENTATION_PLAN.md`
9. `docs/05-implementacion/FLOORPLAN_STICKER_QA.md`

## Primera entrega requerida

Antes de programar, inspeccionar el código real y devolver un Implementation Plan que incluya:

- archivos exactos que se modificarán;
- componentes existentes que se reutilizarán;
- cómo se preservarán `FloorplanShape`, coordenadas normalizadas, aspect-aware projection, polígonos, touch y lock/unlock;
- estrategia de inventario masivo sin crear entidad `Sticker`;
- estrategia incremental de Konva sin `FloorplanV2`;
- estrategia de rollback si la paridad del renderer falla;
- tests actuales que actuarán como regression gates;
- pruebas nuevas por fase;
- impacto de performance con 50/600/1,800 asistentes y hasta ~200 Mesas.

No escribir código hasta que ese plan sea aprobado.

## Alcance autorizado inicialmente

Se pueden planear/implementar por PRs separados:

1. inventario + Sticker UX;
2. bandeja y colocación;
3. migración incremental a Konva con paridad completa;
4. zoom/pan/snap/productividad;
5. sillas visuales derivadas de capacidad;
6. split view de asignación por Mesa y virtualización.

## Alcance NO autorizado todavía

La asignación individual persistente por asiento **no se implementa todavía** porque el contrato base actual mantiene payloads/endpoints del Croquis congelados.

Para iniciar esa fase, Codex debe primero proponer un ADR y una actualización contractual que defina:

- Seat persistente;
- SeatAssignment opcional;
- migración Prisma;
- autoridad de capacidad;
- invariantes y constraints;
- concurrencia;
- auditoría;
- OpenAPI/SDK;
- compatibilidad con invitados/acompañantes;
- Scanner/realtime;
- política de activar/desactivar la capability.

Hasta aprobación expresa, Seat solo puede existir como representación visual calculada desde capacidad.

## Restricciones duras

- No modificar RSVP.
- No modificar créditos, precios, promociones ni servicios.
- No modificar roles ni estados del Evento.
- No sustituir `tableId` por `seatId`.
- No crear `FloorplanV2`, `NewFloorplan` ni un editor paralelo.
- No duplicar WebSocket/Socket.IO.
- No mantener DTOs frontend manuales fuera del SDK generado.
- No degradar accesibilidad touch/keyboard existente.
- No retirar tests actuales para hacer pasar el refactor.
- No afirmar 60fps sin profiling reproducible.

## Definition of Done

Cada PR debe demostrar:

- paridad/regresión según `FLOORPLAN_STICKER_QA.md`;
- tests específicos del cambio;
- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`.

Si toca API/Prisma/OpenAPI, añadir los gates de integración/generación correspondientes.
