# CODEX-124B — Implementation Plan: Workspace operativo, Mesas y asignación por Mesa

Estado: **PROPUESTO — requiere aprobación humana antes de código**  
Definición contractual: **CERRADA para revisión; implementación no iniciada**

Fecha: 2026-08-09  
Dependencias: CODEX-124A-R1, CODEX-090, CODEX-082 y Croquis Sticker F0–F4

## 1. Resultado esperado

Agregar **Mesas y distribución** al workspace operativo existente sin convertirlo en editor. El Planner selecciona
una Mesa en el Croquis read-only y asigna, desasigna o mueve Asistentes desde un Split View. El backend vigente sigue
siendo autoridad de Mesa, capacidad, ownership, estado, concurrencia, auditoría e idempotencia.

Este plan no autoriza implementación. CODEX-124B y Seat PR 5.1 permanecen detenidos hasta aprobación explícita.

## 2. Alcance y fronteras

Dentro de `/eventos/:eventId` la navegación funcional queda:

```text
Resumen | Mesas y distribución
```

La segunda entrada no es incondicional. Con `floorplanEnabled=false` se omite por completo, no presenta placeholder
y no resuelve Floorplan. Con `floorplanEnabled=true` se aplica esta matriz:

| Servicio | Experiencia autorizada para el plan |
| --- | --- |
| `FLYER` / `FLIPBOOK` | Croquis read-only + Split View nominal; usa el read model `/seating` |
| `PHYSICAL_QR` | Croquis read-only + ocupación por Mesa; sin panel/lista de Asistentes y sin request `/seating` |
| `DEMO` | Sin workspace operativo real; conserva los guards existentes |

La rama `PHYSICAL_QR` no crea Assistant, Invitation, Contact ni seating artificial, no cambia
`PHYSICAL_PASSES_CONTRACT.md` y no incorpora reasignación de `PhysicalPass`.

Staff no aparece hasta CODEX-124C. No se edita imagen, geometría, nombre, capacidad, color, inventario, lock ni
coordenadas. No se crea FloorplanV2, Seat, SeatAssignment, `Assistant.seatId`, una nueva regla de seating ni otro
canal realtime. No se modifica Scanner.

Para `FLYER`/`FLIPBOOK` con Croquis, `ACTIVE` y `EVENT_DAY` permiten lectura y las mutaciones que el backend
autorice. `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y `CANCELLED` son de solo lectura. Una transición autoritativa a
estado no mutable cancela cualquier intención pendiente y retira CTAs de escritura. Client no replica la máquina
de estados: siempre adopta la autoridad backend.

## 3. Auditoría API y read model

### Contratos disponibles

- `GET /events/:eventId/floorplan` ya entrega imagen, lock, shapes, ocupación y capacidad.
- `GET /events/:eventId/invitations` entrega Invitaciones con Asistentes anidados, pero el DTO de Asistente no
  proyecta Mesa actual.
- `GET /events/:eventId/contacts` entrega `groupId`; `GET /events/:eventId/groups` entrega nombres de Grupo.
- Las cuatro mutaciones de seating ya existen en API/OpenAPI, pero no tienen wrapper público en
  `packages/api-client/src/wizard.ts`.
- `seating.updated` v1 ya comunica cambios y Mesas afectadas como invalidación post-commit.

Armar el panel con Invitaciones + Contactos + Grupos requiere correlación cliente y aún no permite conocer Mesa
actual. Agregar una consulta por Asistente o Mesa produciría N+1. Descargar todos los agregados para cada búsqueda
tampoco ofrece paginación estable para ~1,800 filas.

### Cambio mínimo propuesto

Agregar una sola proyección de lectura al `FloorplanModule`:

```http
GET /api/v1/events/:eventId/seating
  ?scope=UNASSIGNED|TABLE
  &tableShapeId=<uuid>
  &groupId=<uuid>
  &search=<texto>
  &cursor=<opaco>
  &limit=<1..100>
```

Respuesta propuesta:

```ts
type SeatingWorkspacePage = {
  items: Array<{
    assistantId: string;
    name: string | null;
    invitationId: string;
    group: { id: string; name: string } | null;
    table: { id: string; name: string } | null;
    checkedIn: boolean;
  }>;
  summary: {
    unassignedCount: number;
    selectedTable: { id: string; name: string; occupancy: number; capacity: number } | null;
  };
  nextCursor: string | null;
};
```

La consulta aplica ownership y estado en backend y joins acotados. `scope` sólo admite `UNASSIGNED|TABLE`; no se
agrega `ALL` sin necesidad demostrada. `scope=TABLE` exige `tableShapeId`; `UNASSIGNED` no lo admite. `limit` es
`1..100`, con valor inicial recomendado 50, y el cursor es opaco.

La búsqueda normaliza mayúsculas/minúsculas, diacríticos y espacios. El orden total es nombre normalizado
ascendente, luego filas `name=null`, y finalmente UUID `assistantId` ascendente como desempate. `checkedIn` se
deriva autoritativamente del check-in vigente. La respuesta y logs de esta consulta no exponen teléfonos, tokens ni
QR. El query count permanece acotado mediante joins/agregados, sin una consulta por fila, y una prueba de integración
con aproximadamente 1,800 Assistant cubre paginación, filtros, orden, privacidad y ausencia de N+1.

OpenAPI es la única fuente del SDK. La misma entrega agrega wrappers tipados para el GET y las cuatro mutaciones
existentes; no se mantienen DTOs manuales duplicados.

## 4. Diferencia de escalas

**Contact/Invitation limit:** máximo contractual de 150 Contactos/Invitaciones por Evento. No cambia.

**Assistant operational scale:** objetivo de fluidez de la superficie con ~1,800 Asistentes nominales. Es una meta
de arquitectura/listado y no autoriza crear más Contactos o Invitaciones que el límite vigente. El volumen puede
derivarse de múltiples Asistentes nominales por Invitación dentro de reglas existentes.

## 5. Wireflow

### Desktop

```text
/eventos/:eventId
  → Mesas y distribución
  → GET Evento + Floorplan + primera página Sin mesa
  → [Croquis read-only 55–60%] [Panel 40–45%]
  → click/teclado en Mesa
  → panel: Mesa Y · X/Y · disponibles
  → tab Sin mesa | En esta mesa
  → buscar/filtrar Grupo
  → seleccionar múltiples
  → Asignar X a Mesa Y
  → resultado autoritativo local
  → invalidación realtime / refresh GET seating
```

Desde `En esta mesa`, **Cambiar mesa** abre el selector TABLE con nombre, ocupación/capacidad y lugares disponibles;
las Mesas completas están deshabilitadas. La confirmación **Mover X personas a Mesa Y** usa un único
`POST /seating/assign`. Un `409` refresca origen y destino y conserva los IDs que sigan elegibles.

### Tablet

```text
Croquis principal
  → tap Mesa
  → drawer lateral o inferior sin perder selección
  → lista virtual + selección táctil
  → asignar/desasignar
  → Cambiar mesa abre el selector TABLE dentro del drawer
  → Mover X personas a Mesa Y
  → cerrar drawer conserva viewport y Mesa contextual
```

### Mobile

```text
Croquis a ancho completo
  → pinch zoom / pan con dos dedos
  → tap Mesa
  → bottom sheet: resumen compacto
  → expandir a lista
  → tabs + búsqueda + Grupo + selección
  → Cambiar mesa abre selector TABLE en el bottom sheet
  → Mesas completas deshabilitadas → Mover X personas a Mesa Y
  → CTA sticky de 44px mínimo
  → confirmar resultado y volver al Croquis
```

Un dedo fuera de manipulación conserva scroll natural. Ninguna acción depende de hover, right-click o doble click.

## 6. Arquitectura Client propuesta

- Extender el workspace y navegación local existentes; no crear otro shell.
- Extraer/reutilizar el renderer de producción mediante props read-only: selección y viewport activos, edición y
  persistencia geométrica ausentes.
- Mantener queries separadas para Evento, Floorplan y páginas de seating. La key de seating incluye `eventId`,
  `scope`, `tableShapeId`, `groupId` y búsqueda estabilizada.
- Aislar viewport/selección del Croquis respecto del estado de búsqueda/lista. Cambiar texto o filtro no reconstruye
  Stage ni nodos de shapes.
- Virtualizar filas con altura estable y overscan pequeño. Paginación cursor se solicita al acercarse al final.
- Mantener selección por `assistantId`, no por índice. Cada refresh intersecta selección con items todavía elegibles.
- AbortSignal y generación de request evitan que respuestas tardías de Evento/Mesa anterior reemplacen la actual.
- Los targets interactivos tienen al menos 44×44 px y existe lista DOM/teclado equivalente para seleccionar Mesa.

## 7. Mutaciones e incertidumbre

| Intención | Endpoint vigente | Regla Client |
| --- | --- | --- |
| Selección manual de uno o varios | `POST seating/assign` | asignar o mover bulk a la Mesa elegida, en una mutación atómica |
| Familia completa | `POST seating/assign-family` | sólo **Asignar familia completa**; muestra cantidad antes de confirmar |
| Grupo completo | `POST seating/assign-group` | sólo **Asignar grupo completo**; muestra Grupo y cantidad antes de confirmar |
| Cambiar uno | `PATCH seating/:assistantId` | nueva `tableShapeId` |
| Desasignar uno | `PATCH seating/:assistantId` | `tableShapeId:null` |

Filtrar Grupo o seleccionar un miembro nunca ejecuta family/group. V1 no agrega bulk-unassign y no emite N `PATCH`
silenciosos. Si producto requiere esa operación se diseña una intención y API explícitas en otro gate.

Cada click intencional crea llave. Mientras está pendiente, bloquea un segundo submit síncrono. En éxito, aplica
`changes` y `affectedTables` sin esperar refresh. Si el refresh posterior falla, informa que el cambio sí se guardó
y solo ofrece actualizar lectura.

Red, timeout, `429` o `5xx` reservan la misma llave y payload. Antes de reintentar se consulta el read model: si la
intención ya está reflejada, se adopta; si demuestra que no ocurrió, se habilita retry con la misma llave; si no
puede concluirse, no se repite. Un `409` de capacidad/estado refresca las Mesas origen y destino, adopta autoridad y
conserva únicamente las selecciones que siguen siendo elegibles. La disponibilidad visible siempre es informativa.

## 8. Matriz de concurrencia

| Carrera | Resultado UI |
| --- | --- |
| La Mesa se llena con el panel abierto | backend decide; refrescar X/Y, marcar completa y conservar candidatos para otra Mesa |
| Otro Planner mueve el mismo Asistente | snapshot REST prevalece; retirar selección obsoleta y mostrar destino actual |
| `seating.updated` durante selección | invalidar lista/resumen, mantener viewport/Mesa si siguen válidos y reconciliar IDs seleccionados |
| Respuesta perdida después de commit | consultar autoridad; adoptar sin repetir si el destino coincide |
| Cambio después de check-in | permitir si backend confirma; indicar cambio auditable |
| Evento cierra/cancela | abortar pendientes, desmontar acciones y mostrar solo lectura conforme al estado |
| Cambio rápido de Mesa | abortar lectura anterior; generación latest-wins evita mezclar filas |
| Dos submits locales | lock síncrono permite una sola intención y una sola llave |

## 9. Secuencia de implementación propuesta

1. **Contrato API y tests de consulta:** DTO/query/read model, ownership, filtros, cursor, joins sin N+1, privacidad y
   consulta con dataset grande. Sin UI todavía.
2. **OpenAPI y SDK:** regenerar schema, agregar wrappers de lectura y las cuatro mutaciones, runtime guards y drift.
3. **Workspace read-only:** navegación Mesas y distribución, loading/error/terminales, Floorplan contextual y
   selección Mesa por Canvas/DOM; cero edición geométrica.
4. **Split View:** resumen, tabs, búsqueda, Grupo, virtualización, selección múltiple y responsive drawer/sheet.
5. **Mutaciones:** assign/family/group/update, idempotencia, reconciliación incierta, post-check-in y capacidad.
6. **Realtime y hardening:** invalidación `seating.updated` v1, cambios de Evento/Mesa, aborts y matriz concurrente.
7. **QA y evidencia:** tests unitarios/integrados, profiling de lista/Croquis y checklist manual sin afirmar QA física.

Cada corte debe ser revisable y mantener los gates verdes. Ningún corte agrega Seat.

## 10. Pruebas y gates

- API unit/integration: filtros combinados, cursor estable, ownership, estados, PII ausente y query count constante.
- SDK: paths, query encoding, Idempotency-Key, guards y `generate:check`.
- Client: selección Canvas/DOM, Mesa completa, tabs, búsqueda, Grupo, virtualización, bulk, desasignación, move,
  incertidumbre, realtime, navegación rápida y estados terminales.
- Gestos: tap, pinch, centro de dos dedos, punto anclado, scroll de un dedo y cero requests por frame.
- Accesibilidad: teclado completo, foco del sheet, nombre accesible, aria-live, targets 44×44 y estado no solo color.
- Performance: ~1,800 filas en fuente, ventana DOM acotada, búsqueda/filtros sin rerender completo del Croquis y
  mediciones reales sin prometer FPS no demostrado.
- QA física pendiente incluso con gates automatizados verdes: mouse, trackpad, Android físico e iPhone físico. Las
  pruebas automatizadas son gate técnico y no sustituyen esa ejecución manual.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @invitaciones/api test:integration
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate:check
docker compose up --build -d
docker compose ps
```

## 11. Gate humano

La implementación solo puede comenzar después de aprobación explícita de este plan y del read model propuesto.
La aprobación de CODEX-124B no autoriza Seat PR 5.1. Al terminar 124B se requiere un gate separado antes de tocar
Prisma, Seat, Scanner Seat o reportes Seat.

Hasta ese gate no se implementa este plan en API, OpenAPI, SDK ni Client operativo. El ADR Seat conserva estado
propuesto; PR 5.1 continúa bloqueado y no forma parte de CODEX-124B.
