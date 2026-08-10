# CODEX-124B — QA y evidencia

Fecha: 2026-08-09  
Estado: **IMPLEMENTADO — PENDIENTE DE ACEPTACIÓN**

## Read model y ausencia de N+1

`GET /api/v1/events/:eventId/seating` usa una transacción de lectura con conteo fijo:

- `UNASSIGNED`: ownership, Floorplan, página CTE y totales; 4 consultas, independientemente de filas;
- `TABLE`: las mismas más validación de Mesa; 5 consultas, independientemente de filas;
- el CTE `eligible` aplica confirmación, actividad de Invitación, borrado y privacidad antes de proyectar;
- `invitation_counts`, `group_counts` y `active_check_ins` agregan en la misma consulta de página;
- no se consulta Invitación, Grupo, Mesa o CheckIn por fila.

La prueba `floorplan.workspace.spec.ts` fija dos queries SQL agregadas y una sola lectura de cada recurso contextual.
La integración PostgreSQL cubre ownership, scope, cursor, limit, búsqueda sin distinción de diacríticos/case/espacios,
Grupo, TABLE, UNASSIGNED, check-in activo, cancelación, pending/rejected, borrado, anonimización y conteos completos
de Invitación/Grupo.

## Performance reproducible

Entorno: Windows 11 Home `10.0.26200`, Intel Core i3-1215U, Node.js `22.18.0`, PostgreSQL 16 en Docker, Vitest
`4.1.10`. Dataset máximo: 150 Contactos/Invitaciones y 1,800 Asistentes nominales; el límite contractual no cambió.

Comando:

```powershell
pnpm --filter @invitaciones/api exec vitest run --config vitest.integration.config.ts test/floorplan.integration-spec.ts -t "1,800 eligible"
```

| Fuente/operación | Filas fuente | Límite respuesta | Medición |
| --- | ---: | ---: | ---: |
| Primera página UNASSIGNED | 1,800 | 100 | 79.29 ms |
| Página intermedia por cursor | 1,800 | 100 | 95.68 ms |
| Búsqueda `volumen 1200` | 1,800 | 100 | 76.28 ms |
| Filtro Grupo | 1,800 | 100 | 177.06 ms |
| Scope TABLE | 1,800 | 100 | 80.37 ms |
| Primera página | 600 | 50 | 34.23 ms |
| Primera página | 50 | 50 | 14.55 ms |

El Client solicita 50 filas y reemplaza la página al avanzar: monta como máximo 50 filas nominales, nunca las
~1,800 de la fuente. Búsqueda, Grupo, scope y cursor viven fuera de las props del Croquis; React conserva la misma
instancia de Stage y el viewport/Mesa seleccionada durante reconciliación.

El renderer de producción no cambió de arquitectura. La evidencia vigente de 180 Mesas, zoom/pan/drag y sus límites
está en `FLOORPLAN_STICKER_PERFORMANCE.md` y `evidence/floorplan-performance-2026-08-09.json`. En el equipo medido,
zoom con 180 Mesas fue 54.0 FPS; no se afirma 60 FPS universal.

## Client, concurrencia y realtime

- Croquis read-only real, con zoom, pan, fit, selección Canvas y alternativa DOM/teclado.
- Desktop Split View, drawer tablet y bottom sheet mobile; controles táctiles de al menos 44 px.
- Página `Sin mesa`/`En esta mesa`, búsqueda debounced, filtro Grupo y selección por `assistantId`.
- Assign bulk usa una mutación; cambio individual/desasignación usan PATCH; no hay bulk-unassign silencioso.
- Family/Group muestran conteos completos y asignados antes de confirmar; capacidad insuficiente bloquea el CTA.
- Una llave por intención, bloqueo síncrono, misma llave tras incertidumbre, adopción de `affectedTables`, refresh
  REST y reconciliación 409.
- `seating.updated` v1 sólo invalida y reconcilia; valida versión/evento, deduplica `operationId` y conserva viewport.
- CLOSED/CANCELLED abortan lecturas/mutaciones pendientes y desmontan CTAs.
- `PHYSICAL_QR` muestra ocupación sin `/seating`; `floorplanEnabled=false` no monta ni solicita Floorplan.

## Evidencia visual

- [Desktop sin selección](evidence/codex-124b/desktop-overview.png)
- [Desktop Split View](evidence/codex-124b/desktop-selected.png)
- [Tablet drawer](evidence/codex-124b/tablet-drawer.png)
- [Mobile bottom sheet](evidence/codex-124b/mobile-bottom-sheet.png)

Las capturas se produjeron con Chrome 151 headless contra la instancia Docker reconstruida, sesión real y API real.
La app mostró contenido, sin overlay de Vite; API health y Client respondieron HTTP 200.

## Gates ejecutados

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`: verdes.
- OpenAPI y SDK: generación y `generate:check` verdes.
- Client: 388 pruebas verdes, incluidas 33 del workspace activo.
- API integración PostgreSQL: 23 archivos y 212 pruebas verdes.
- El perfil de 1,800 elegibles y las regresiones de geometría compartida, Floorplan y Scanner quedaron verdes.

## Deuda explícita

QA física permanece pendiente: mouse, trackpad, Android real e iPhone real. Las pruebas automatizadas de tap, pinch,
pan, scroll natural, teclado y responsive no sustituyen esa ejecución. Seat PR 5.1 continúa bloqueado y no fue
iniciado.
