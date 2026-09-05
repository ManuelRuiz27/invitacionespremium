# FP-06 — Croquis detallado: lugares exactos y asignación individual

Estado: **READY FOR CODE**  
Prioridad: **P1 — diferenciador de Croquis boutique**  
Prerequisito funcional: conservar baseline estable de Croquis V2/Seating vigente.  
Fuente superior obligatoria: `docs/04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`.

## 1. Objetivo

Implementar un segundo modo de acomodo para Croquis:

```text
Acomodo por mesa       → Persona → Mesa
Acomodo por lugar      → Persona → Lugar exacto → Mesa
```

Debe resolver montajes reales donde las Mesas son curvas, en U, compuestas, asimétricas o están dibujadas directamente en el plano base y la posición de cada silla/lugar es más importante que reproducir una geometría perfecta de Mesa.

FP-06 **sí modifica dominio, DB, OpenAPI, backend, Builder, Seating Workspace y Scanner**. No tratarlo como un cambio puramente visual.

## 2. Lectura obligatoria antes de tocar código

Codex debe leer en este orden:

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md` — `QA-OPEN-002` está `RESOLVED`
4. `docs/01-producto/02_PRD.md`
5. `docs/01-producto/04_OPERATOR_LED_MVP.md`
6. `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md`
7. `docs/04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`
8. `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`
9. `docs/03-diseno/FLOORPLAN_UX_TARGET.md`
10. `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`
11. `docs/04-tecnico/09_MODELO_DATOS_CONCEPTUAL.md`
12. `docs/04-tecnico/10_SCHEMA_PRISMA_GUIDE.md`
13. `docs/04-tecnico/11_API_CONTRACTS.md`
14. `docs/04-tecnico/REALTIME_PAYLOADS.md`
15. `docs/04-tecnico/SCANNER_CHECKIN_CONTRACT.md`
16. `docs/05-implementacion/14_CODEX_RULES.md`
17. `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`
18. `docs/05-implementacion/FP04_PLANNER_SEATING_WORKSPACE_ALIGNMENT.md`
19. `docs/05-implementacion/FP05_SCALE_OPERATION_QA.md`

Si un documento anterior dice que Seat/SeatAssignment está fuera de alcance, aplicar la sustitución expresa del contrato detallado y `QA-OPEN-002`. No abrir una nueva decisión por esa contradicción ya resuelta.

## 3. Baseline que debe preservarse

No reconstruir Croquis desde cero.

Reutilizar:

- `Floorplan`;
- `FloorplanShape`;
- `Assistant.floorplanShapeId`;
- servicios actuales de seating;
- locks de Croquis;
- auditoría;
- idempotencia;
- realtime existente;
- `packages/floorplan`;
- Konva/React Konva;
- Builder provider actual;
- `apps/client/src/workspace/SeatingWorkspace.tsx`;
- Scanner actual;
- OpenAPI → `@invitaciones/api-client` generado.

No crear:

- `FloorplanV2`;
- segundo renderer;
- segundo Seating Workspace;
- persistencia JSON de lugares;
- API paralela fuera de `FloorplanModule`/seating existente.

## 4. Fase A — Software archaeology obligatoria

Antes de implementar, Codex debe verificar y reportar:

- modelos Prisma reales de `Floorplan`, `FloorplanShape`, `Assistant`, `SeatingOperation`, `CheckIn`;
- migración vigente de Croquis y triggers PostgreSQL;
- DTOs/read models actuales de Floorplan;
- endpoints reales de geometry/seating;
- componentes reales del Builder en Admin/Client;
- renderer compartido en `packages/floorplan`;
- forma actual de `seating.updated`;
- read model Scanner y validación check-in;
- tests de concurrencia y capacidad existentes.

No asumir nombres/rutas solo desde este ticket si el repositorio ya consolidó un nombre equivalente. Mantener dominio contractual y adaptar sobre código canónico.

Entregable previo a código: breve mapa `archivo → cambio requerido` en el comentario/plan de implementación.

## 5. Fase B — Persistencia

### 5.1 `Floorplan.seatingMode`

Agregar enum/campo equivalente:

- `TABLE`
- `SEAT`

Default y migración de datos existentes: `TABLE`.

No inferir el modo por presencia de lugares.

### 5.2 `FloorplanSeat`

Crear entidad relacional persistente con mínimo:

- UUID;
- `eventId`;
- `floorplanId`;
- `floorplanShapeId` de Mesa padre;
- `label`;
- `x`;
- `y`;
- `isBlocked`;
- timestamps;
- soft delete.

Constraints obligatorios:

- `x/y` finitos `0..1`;
- parent shape `TABLE`;
- mismo Event/Floorplan;
- label normalizado único entre lugares activos de una Mesa;
- Zona rechazada;
- lugar eliminado/bloqueado no asignable.

### 5.3 `Assistant.floorplanSeatId`

Agregar FK nullable.

En `SEAT`, una asignación exacta debe mantener:

```text
Assistant.floorplanSeatId = Seat.id
Assistant.floorplanShapeId = Seat.floorplanShapeId
```

El backend deriva la Mesa; el frontend no puede construir una combinación arbitraria.

Unicidad parcial o mecanismo equivalente: un lugar no puede estar ocupado por dos Asistentes activos.

### 5.4 Capacidad derivada

En `SEAT`:

```text
FloorplanShape.capacity = count(active seats where isBlocked=false)
```

Mantener sincronización transaccional.

Rechazar:

- bloquear asiento ocupado;
- borrar asiento ocupado;
- eliminar Mesa con lugares ocupados;
- divergencia capacidad/lugares después de commit.

## 6. Fase C — Dominio y transacciones

Implementar invariantes en backend/DB, no solo UI.

### Crear/mover/editar lugar

- solo Provider capability autorizada;
- solo estados/layout editables;
- solo Croquis no bloqueado;
- Mesa padre activa del mismo Evento;
- coordenadas normalizadas;
- auditoría cuando corresponda al patrón vigente.

### Asignar persona a lugar

Transacción mínima:

1. lock consistente según orden vigente;
2. validar Evento/Croquis/modo;
3. validar Asistente activo/confirmado;
4. validar Seat activo, no bloqueado y libre;
5. validar Mesa padre;
6. escribir `floorplanSeatId` y `floorplanShapeId`;
7. registrar operación/idempotencia;
8. auditoría;
9. commit;
10. realtime después del commit.

Dos solicitudes concurrentes por el mismo lugar deben producir un solo ganador; la otra recibe conflicto de dominio accionable.

### Liberaciones implícitas

Extender las liberaciones vigentes por:

- rechazo RSVP;
- cancelación de Invitación;
- eliminación nominal de Asistente.

Deben limpiar Mesa + lugar en la misma transacción.

## 7. Fase D — OpenAPI/API

Implementar el contrato especializado, adaptando nombres solo si el código canónico exige una convención consistente.

### Modo

- `PATCH /events/:eventId/floorplan/seating-mode`

### Lugares

- `POST /events/:eventId/floorplan/shapes/:shapeId/seats`
- `PATCH /events/:eventId/floorplan/seats/:seatId`
- `PATCH /events/:eventId/floorplan/seats/batch`
- `DELETE /events/:eventId/floorplan/seats/:seatId`

### Seating

- `POST /events/:eventId/seating/assign-seats` con `Idempotency-Key`;
- ampliar `PATCH /events/:eventId/seating/:assistantId` para `seatId|null` en modo detallado.

`assign-seats` usa mapeo explícito:

```json
{
  "assignments": [
    { "assistantId": "uuid", "seatId": "uuid" }
  ]
}
```

El lote es all-or-none.

### Read model

Floorplan debe exponer:

- `seatingMode`;
- colección tipada de lugares o read endpoint equivalente;
- Mesa padre;
- `label`, `x`, `y`, `isBlocked`;
- ocupación solo en contexto autorizado y sin PII innecesaria.

Regenerar OpenAPI/SDK. No escribir DTOs TypeScript manuales que diverjan.

## 8. Fase E — Builder provider

Ámbito base a inspeccionar:

- Builder administrativo/provider vigente;
- `packages/floorplan`;
- `FloorplanSurface`/renderer/historial actuales.

### Selector de modo

Mostrar:

- **Por mesa**
- **Por lugar exacto**

Copy secundario breve; no mostrar enums.

Cambiar de modo aplica reglas contractuales y confirmación cuando pierde precisión.

### En modo detallado

Al seleccionar Mesa:

- `Agregar lugar`;
- click/tap sobre canvas crea posición;
- drag reposiciona;
- duplicar;
- multi-select;
- mover selección;
- bloquear/desbloquear;
- renumerar;
- eliminar disponible;
- undo/redo;
- zoom/pan/fit.

No mostrar campo editable de capacidad; mostrar capacidad derivada.

### Hit targets

El círculo visible puede ser pequeño para no tapar el Croquis. El área interactiva debe cumplir accesibilidad/touch sin alterar la escala visual.

### Mesas irregulares

No implementar validación “Seat debe caer dentro de Mesa”.

Debe ser posible colocar lugares alrededor de:

- U;
- curva;
- serpentina;
- Mesa compuesta;
- mobiliario dibujado en imagen base.

## 9. Fase F — Seating Workspace Planner

Preservar geometry read-only.

El workspace selecciona comportamiento por `seatingMode`.

### `TABLE`

Cero regresión del flujo actual.

### `SEAT`

Debe permitir dos entradas equivalentes:

1. seleccionar persona → elegir lugar;
2. seleccionar lugar libre → elegir persona.

Debe permitir:

- mover;
- desasignar;
- búsqueda/filtros vigentes;
- mostrar `Mesa X · Lugar Y`;
- estados lugar libre/ocupado/bloqueado/seleccionado;
- conflicto 409 y refetch;
- resultado incierto conservando idempotencia;
- pendiente `Mesa asignada, falta lugar` durante conversión preactivación.

No permitir operación familiar/grupo que mande varias personas a un solo Seat. Si se conserva una acción masiva, debe construir mapeo uno-a-uno explícito y enviarlo al endpoint all-or-none.

## 10. Fase G — Readiness / cierre RSVP

### Activación

En `SEAT` validar estructura:

- Floorplan válido;
- imagen válida;
- >=1 Mesa;
- cada Mesa asignable tiene >=1 lugar activo/no bloqueado;
- capacidad sincronizada.

No exigir que todos los confirmados futuros tengan Seat al activar.

### Cerrar Confirmación

En `SEAT`, cada confirmado debe tener Seat válido.

Mesa sin Seat no cuenta como acomodo completo.

Reutilizar `EVENT_FLOORPLAN_PENDING_SEATING` salvo que el contrato backend existente obligue una extensión documentada. La UI usa:

**Faltan N personas por acomodar.**

No mostrar códigos técnicos.

## 11. Fase H — Scanner/check-in

En `SEAT`, el resultado autorizado muestra:

- Mesa;
- Lugar;
- Croquis con Seat resaltado cuando exista imagen.

Check-in debe rechazar a un Asistente que en modo detallado solo tenga Mesa y no Seat válido.

No ampliar PII.

Cambio de Seat post check-in:

- permitido solo a usuario autorizado conforme a reglas actuales de cambio de Mesa;
- auditar before/after;
- mantener `Seat -> Table` coherente.

`PHYSICAL_QR` queda fuera: no agregar `seatId` a PhysicalPass en FP-06.

## 12. Fase I — Realtime

Inspeccionar `REALTIME_PAYLOADS.md` y código.

Si `seating.updated` necesita `seatId`, actualizar primero el contrato documental en el mismo PR antes del código de emisión.

Reglas:

- persistir antes de emitir;
- no PII;
- deduplicación/operationId vigente;
- REST sigue siendo recovery source.

No crear evento Socket.IO alterno si el existente puede evolucionar de forma compatible.

## 13. Fase J — Migración y compatibilidad

Testear explícitamente migración desde datos actuales:

```text
Floorplan existente -> seatingMode=TABLE
Assistant existente -> floorplanSeatId=NULL
FloorplanShape/assignments actuales -> sin cambios semánticos
```

Todo fixture/test previo de `TABLE` debe continuar pasando salvo actualización mecánica del nuevo campo default.

No migrar automáticamente una Mesa existente a Seat mode.

## 14. Tests backend/DB obligatorios

Como mínimo:

1. default `TABLE` en Croquis legado;
2. crear Seat válido;
3. `x/y` fuera de rango rechazado;
4. Zona como parent rechazada;
5. cruce de Event/Floorplan rechazado;
6. label duplicado activo en misma Mesa rechazado;
7. mismo label en otra Mesa permitido;
8. mover Seat persiste coordenadas normalizadas;
9. bloquear libre reduce capacidad;
10. desbloquear aumenta capacidad;
11. bloquear ocupado rechazado;
12. eliminar ocupado rechazado;
13. asignación Seat escribe Seat + Mesa;
14. segundo Assistant al mismo Seat pierde por conflicto;
15. asignación de Seat de otro Evento rechazada;
16. Seat bloqueado rechazado;
17. batch mapping all-or-none;
18. retry idempotente no repite auditoría;
19. rechazo RSVP libera Seat + Mesa;
20. cancelación libera Seat + Mesa;
21. delete nominal libera Seat + Mesa;
22. cierre RSVP falla con confirmado sin Seat;
23. check-in en `SEAT` falla sin Seat;
24. check-in con Seat válido funciona;
25. `TABLE` mantiene comportamiento actual;
26. PhysicalPass no recibe semántica Seat.

## 15. Tests frontend obligatorios

### Builder

1. selector de modo natural;
2. modo TABLE sin regresión;
3. agregar lugar por pointer;
4. drag;
5. duplicar;
6. multi-select/move;
7. bloquear/desbloquear;
8. renumerar;
9. delete;
10. undo/redo;
11. capacidad derivada;
12. no contiene-validación respecto a Mesa;
13. plano horizontal/vertical;
14. touch targets;
15. lock impide mutación.

### Seating Workspace

16. TABLE flujo previo intacto;
17. SEAT persona→lugar;
18. SEAT lugar→persona;
19. mover;
20. desasignar;
21. bloqueado no seleccionable;
22. ocupado comunica estado;
23. Mesa + Lugar visibles;
24. 409 refetch;
25. uncertain retry conserva idempotency key;
26. filtro/búsqueda conservados;
27. no geometry mutation desde Planner.

### Scanner

28. muestra Mesa + Lugar;
29. resalta Seat;
30. no agrega teléfono/PII;
31. error accionable cuando falta Seat.

## 16. QA visual obligatorio

Codex debe dejar evidencia reproducible para al menos:

### Caso A — boda boutique

- ~50 personas;
- 5–8 Mesas;
- lugares exactos visibles;
- asignación individual.

### Caso B — Mesa irregular

Crear un fixture con:

- Mesa en U, curva o composición equivalente;
- Seat markers colocados libremente alrededor del mobiliario;
- varios lugares deliberadamente fuera del bounding box visual de la Mesa;
- al menos un lugar bloqueado.

La prueba debe demostrar que el motor **no intenta corregir los puntos hacia una forma simétrica**.

### Caso C — compatibilidad

Evento con Croquis por Mesa existente:

- sin Seats;
- seating actual funcional;
- Scanner actual funcional.

## 17. Performance

Objetivo mínimo del modo detallado:

- 50 Seats: interacción fluida;
- 150 Seats: selección/drag/asignación usable;
- no degradar los escenarios existentes de 50/100/200 Mesas en `TABLE`.

Antes de agregar virtualización, spatial index o nueva librería, demostrar el cuello real con perfil reproducible.

## 18. Archivos/documentos que Codex debe actualizar si el código los modifica

Obligatorio mantener alineados:

- OpenAPI generado/source;
- API client generado;
- Prisma schema;
- migraciones SQL;
- tests integración;
- `REALTIME_PAYLOADS.md` si cambia payload;
- `SCANNER_CHECKIN_CONTRACT.md` si el contrato actual necesita detalle explícito de `seat`;
- `EVENT_WIZARD_CONTRACT.md` para reflejar el comportamiento implementado del Builder/readiness;
- `09_MODELO_DATOS_CONCEPTUAL.md`;
- `10_SCHEMA_PRISMA_GUIDE.md`;
- `11_API_CONTRACTS.md`.

Estos últimos tres documentos se actualizan al cerrar implementación para eliminar la subordinación temporal y dejar el modelo general consistente.

## 19. Prohibiciones

FP-06 NO autoriza:

- Planner Builder self-service;
- nuevo AuthRole;
- impersonación;
- OCR;
- detección automática de sillas;
- CAD;
- 3D;
- auto-seating por afinidad;
- `PHYSICAL_QR` por Seat;
- cambios de pricing;
- cambio de servicio;
- nueva infraestructura realtime;
- librería canvas nueva sin blocker probado;
- romper `TABLE` para simplificar `SEAT`.

## 20. Definition of Done

FP-06 termina únicamente cuando:

1. existe migración compatible con Croquis actuales;
2. `FloorplanSeat` tiene integridad DB/backend;
3. Builder provider puede colocar libremente lugares alrededor de una Mesa irregular;
4. Planner puede asignar personas a lugares exactos sin editar geometría;
5. capacidad deriva correctamente de Seats disponibles;
6. conflictos concurrentes no producen doble ocupación;
7. cierre RSVP detecta personas sin Seat en modo detallado;
8. Scanner/check-in usa Mesa + Seat cuando corresponde;
9. `TABLE` conserva todas sus garantías previas;
10. Physical QR no se contaminó con semántica Seat;
11. OpenAPI/SDK/documentación general quedan sincronizados;
12. tests unitarios, integración y QA visual pasan;
13. el árbol queda sin duplicación de motor Floorplan/Seating.