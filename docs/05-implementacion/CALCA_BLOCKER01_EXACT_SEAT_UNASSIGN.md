# CALCA-BLOCKER-01 — Integridad de desasignación exacta

**Resultado: PASS del ticket P0.** El piloto no se declara READY.

Base: `main`, `c804002f7ee9e5a1eb53549d8fff07b35ef53d92`. Corrección P0 limitada a la invariante de asignación; no es una nueva certificación CALCA-06. El [informe histórico](./CALCA06_TRACE_MODE_CERTIFICATION.md) y su evidencia permanecen intactos.

## Causa y corrección

Planner «Quitar Mesa» ya enviaba la intención correcta por `updateSeating({ tableShapeId: null })`. `FloorplanService.runSeating` sólo leía/comparaba la Mesa y sólo escribía `floorplanShapeId`. Una referencia exacta sobrevivía a la desasignación. Si la Mesa ya era nula, el filtro la consideraba un no-op y tampoco liberaba el Lugar.

El servicio ahora lee ambos IDs y considera cambio una referencia exacta todavía presente. El mismo `updateMany`, dentro de la transacción serializable existente, escribe Mesa destino y `floorplanSeatId: null`. Para desasignar, ambos quedan `NULL`. Una limpieza explícita de referencia colgante puede producir `fromTableId: null / toTableId: null`: representa la liberación del Lugar y conserva la forma del snapshot/evento existente.

En `SEAT`, un destino de Mesa no nulo por cualquiera de los cuatro caminos genéricos —UPDATE, ASSIGN, FAMILY, GROUP— se rechaza con 409 `SEATING_TABLE_INVALID`. No se elige ni borra implícitamente un Lugar para convertir una asignación por Mesa en exacta. `assign-seats` sigue siendo el camino de asignación/movimiento exacto y escribe ambos IDs, sin modificación.

Se mantienen orden y alcance de autorización/locks, firma de idempotencia, snapshot persistido, auditoría, publicación post-commit, historial de check-in y política serializable/reintentos. Las validaciones de ownership y selección preceden al rechazo del destino genérico. En TABLE normal no cambia la asignación/desasignación ni el resultado de no-op.

Sin endpoint, DTO, SDK, migración ni cambio de schema. Sin cambios de UI en Planner/Admin/Calca/Scanner, modos, capacidad, permisos o readiness. No se corrigen P1/P2.

## Evidencia con PostgreSQL real

La [evidencia DB](./evidence/calca-blocker01/db-before-after.json) contiene UUID ficticios obtenidos de lecturas Prisma reales, antes/después de la misma operación HTTP que utiliza Planner:

| Paso                                               | Mesa                  | Lugar                     | Comprobación                                                              |
| -------------------------------------------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------- |
| Asignar exacto                                     | UUID de la Mesa padre | UUID del Seat             | Ambos poblados y coherentes                                               |
| Desasignar por UPDATE existente                    | NULL                  | NULL                      | Dos solicitudes concurrentes con la misma key devuelven el mismo snapshot |
| Leer Croquis                                       | —                     | Seat libre                | `occupied: false`                                                         |
| Asignar después a otro Seat y repetir key anterior | Nueva Mesa            | Nuevo Seat                | Replay devuelve snapshot previo, sin deshacer la asignación nueva         |
| Desbloquear por Admin y eliminar Seat liberado     | —                     | Borrado lógico confirmado | Sin falso `FLOORPLAN_SEAT_OCCUPIED`                                       |

Antes de liberar, bloquear/eliminar el Seat ocupado se rechaza. Después, el conteo es una operación de desasignación, una auditoría UPDATE y una invocación de publicación realtime para esa operación. No se declara exactly-once de entrega de red. El movimiento exacto posterior tiene su propia operación/publicación.

El fixture prepara un layout SEAT sobre un Evento activo aislado y después usa las operaciones reales; no prueba activación ni cambio de modo. La prueba de estado colgante reproduce la persistencia anterior sin desactivar triggers. El caso de check-in conserva íntegra la fila de ingreso y la auditoría mantiene `postCheckIn: true`.

No hay backfill global ni replay automático de POSTs. Los snapshots ya persistidos conservan su semántica de replay; una referencia histórica colgante se prueba mediante una **nueva desasignación explícita** con nueva key. No se inspeccionan ni reparan datos compartidos de producción/desarrollo.

## QA focalizado

Comandos ejecutados en ese orden, sin aumentar timeouts/retries ni cambiar assertions existentes:

```powershell
pnpm test:e2e:access-control -- --integration-only --integration-files=floorplan
pnpm --filter @invitaciones/client exec vitest run src/workspace/ActiveEventWorkspacePage.test.tsx
pnpm --filter @invitaciones/client exec vitest run src/workspace/useWorkspaceRealtime.test.ts
pnpm --filter @invitaciones/api test src/floorplan
pnpm exec turbo run lint typecheck build --filter=@invitaciones/api... --filter=@invitaciones/client... --concurrency=1
```

- Integración Floorplan: **39/39 PASS**, ocho casos nuevos y 31 existentes. Incluye reproducción P0 por HTTP, replay concurrente/post-movimiento, referencia colgante, cuatro rechazos genéricos, movimiento exacto, TABLE, ocupación, aislamiento y check-in. El harness crea/elimina su propia DB PostgreSQL loopback y ejecuta un worker. Confirmación separada de evidencia DB: 39/39, sin sumar casos únicos.
- Client workspace: **52/52 PASS**; realtime: **6/6 PASS**. Sin cambios de código Client.
- Unidades API Floorplan: **58/58 PASS** en cuatro archivos.
- Lint/typecheck/build: **15/15 tareas PASS**, API/Client y dependencias (API, Client, SDK, UI y Floorplan). Doce tareas reutilizan caché válida de contenido; las pruebas se ejecutaron realmente.

Primero se registró un error del fixture nuevo: usar `eventId` como unique Prisma en vez del ID de Floorplan. La siguiente ejecución previa al fix reprodujo el P0 y los caminos genéricos defectuosos (8 fallos/32 aprobados); una variante TABLE adicional tenía una expectativa inválida, pues el trigger de cambio SEAT→TABLE ya limpia las referencias. Se retiró esa variante imposible y se conserva la regresión TABLE normal. Ningún test anterior fue eliminado o debilitado. Los logs iniciales y finales se distinguen en [el registro](./evidence/calca-blocker01/runs.json).

El warning de `pg` sobre consultas simultáneas en un cliente es previo. El HTTP 500 de la prueba negativa de renumeración es esperado por ese test existente; no es un fallo nuevo.

## Publicación y límites

El gate de CI de guías verifica un digest de runtime que incluye API ([procedimiento](../guias-usuario/control-de-acceso/README.md)). Requiere regenerar la publicación oficial por ese cambio, aunque no cambie su UI. Sus PNG/HTML/PDF/inventarios se generan mediante el harness oficial, sin alterar contenido editorial, masks, asserts o código de captura. No se ejecuta ni modifica la certificación CALCA-06.

Publicación oficial **PASS**: un journey UX02, 39 PNG verificados con máscaras y sin QR utilizable, cinco tests de tooling de guías y PDF 14/21/2 páginas con assertions de imagen/impresión/ancho móvil. La verificación final pasa después de restaurar sólo el PDF de usabilidad, cuyo contenido era idéntico excepto CreationDate/ModDate; se conservan las otras dos regeneraciones con contenido nuevo. No se cambian umbrales ni verificadores.

Los cuatro P1 y siete P2/limitaciones de CALCA-06 permanecen abiertos. Este ticket puede aprobar la corrección del P0 sin declarar el piloto READY ni sustituir una recertificación posterior.
