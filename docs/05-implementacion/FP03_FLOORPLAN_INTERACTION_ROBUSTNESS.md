# FP-03 — Persistencia e interacción robusta de Croquis V2

Estado: **CONTRATO TÉCNICO DE EJECUCIÓN**  
Prerequisito: FP-02 / Issue #28 cerrado y aprobado.  
Superficie principal: Builder provider-led en `apps/admin`; engine compartido en `packages/floorplan`.

## 1. Objetivo

Endurecer la interacción y persistencia del Croquis V2 ya construido en FP-01/FP-02 sin añadir nuevas capacidades de negocio.

FP-03 debe demostrar que mover, redimensionar, rotar, editar, duplicar, eliminar, deshacer/rehacer, cambiar viewport, guardar, recargar y recuperarse de errores conserva exactamente el modelo contractual vigente.

La prioridad es **confiabilidad operacional**, no añadir más UI.

## 2. Fuente de verdad y arquitectura

Se preserva:

- `@invitaciones/floorplan` como único engine frontend compartido;
- `FloorplanSurface` como shell del canvas;
- `FloorplanKonvaRenderer` como renderer interactivo principal;
- `FloorplanDomRenderer` como fallback accesible;
- `normalizeFloorplanShape()` como normalizador frontend;
- `FloorplanShape` / `FloorplanShapeInput` como modelo vigente;
- OP-02B como única superficie administrativa de persistencia del Builder;
- backend/API como autoridad final de ownership, estado, lock, validación y concurrencia.

No crear un segundo motor, store persistente paralelo ni protocolo de guardado adicional.

## 3. Hallazgo de baseline sobre concurrencia

El contrato actual de `UpdateFloorplanShapeRequestDto` no incluye `version`, `expectedUpdatedAt`, ETag ni otro token de optimistic concurrency por shape.

El backend sí ejecuta mutaciones críticas bajo transacciones serializables y puede devolver `FLOORPLAN_CONCURRENCY_CONFLICT` cuando una operación no puede serializarse.

Por tanto FP-03:

- **sí** debe manejar de forma segura los conflictos/error codes existentes;
- **sí** debe refetch/reconciliar sin replay automático;
- **no** debe inventar versionado client-side;
- **no** debe añadir columna/version token/migración/API nueva ocultamente.

Si una prueba posterior demuestra que se necesita prevenir overwrite secuencial de dos copias stale mediante un token optimista, registrar `TECHNICAL DECISION REQUIRED` y tratarlo como cambio contractual separado.

## 4. Semántica de guardado

El Builder Admin de lanzamiento conserva guardado explícito para un draft individual:

```text
seleccionar/crear
→ modificar localmente
→ Guardar
→ una mutación API
→ adoptar respuesta autoritativa
→ refetch de reconciliación
```

FP-03 **no introduce autosave por cada drag/resize/keypress**.

Durante drag, resize, rotate, edición de inspector y undo/redo sólo cambia el draft local.

La excepción vigente es el inventario de mesas pendientes: colocar una mesa pendiente continúa usando su operación de creación actual.

## 5. Invariantes de coordenadas

Toda shape persistida debe cumplir:

- `x`, `y`, `width`, `height` normalizados en `0..1`;
- nunca persistir pixels de Stage/DOM/viewport;
- `rotation` normalizada a `[0, 360)`;
- `CIRCLE` y `SQUARE` conservan lados físicos iguales;
- `POLYGON` conserva puntos válidos normalizados;
- ninguna interacción deja una shape fuera de canvas después de normalización.

`zoom`, `pan`, `fit`, pinch y tamaño del viewport no deben alterar el payload contractual de la shape.

## 6. Drag / transform / rotate

Validar y, donde sea necesario, corregir el ciclo:

```text
shape normalizada
→ adaptador a Stage
→ interacción transitoria
→ drag/transform end
→ adaptador inverso
→ normalizeFloorplanShape
→ draft local
```

Requisitos:

- drag sólo hace commit local al finalizar interacción estable;
- transform sólo hace commit local al finalizar;
- rotate sólo hace commit local al finalizar;
- snap produce coordenadas normalizadas válidas;
- transformer no puede mutar cuando `disabled/readOnly/pending`;
- polygon handles no pueden mutar cuando `disabled/readOnly/pending`;
- touch/pinch no debe producir un commit individual accidental de la shape;
- pan del Stage no puede confundirse con drag de una shape.

No persistir durante eventos intermedios de pointer/touch.

## 7. Paridad DOM / Konva

El fallback DOM y Konva deben respetar las mismas reglas de dominio.

No se exige pixel-perfect parity, pero sí:

- selección consistente;
- draft consistente;
- disabled/read-only consistente;
- operaciones accesibles equivalentes donde el fallback las soporte;
- mismas reglas de normalización;
- ningún payload distinto por renderer.

Cambiar de fallback DOM a Konva después de cargar la imagen no debe perder el draft actual.

## 8. Undo / redo

El historial sigue siendo **local al draft actual**.

Debe cubrir cambios originados por:

- drag;
- resize;
- rotate;
- teclado;
- cambios de inspector que afecten geometría/posición cuando pasen por el engine;
- edición de polygon handles.

Reglas:

- máximo actual del helper puede conservarse;
- seleccionar otra shape reinicia historial;
- iniciar otro draft reinicia historial;
- Guardar reinicia historial;
- Cancelar reinicia historial;
- undo/redo nunca llama API;
- undo/redo nunca cambia viewport;
- no incorporar cambios autoritativos de otra shape al historial actual;
- `Ctrl/Cmd+Z` y `Ctrl/Cmd+Shift+Z` deben ser deterministas.

Si la sincronización actual de `props.draft` con `HistoryState` genera entradas dobles o stale, corregirla en el engine compartido, no con hacks en Admin.

## 9. Viewport

`ViewportState` continúa siendo transitorio.

Validar:

- zoom wheel;
- zoom +/-;
- fit/reset;
- pan explícito;
- Space + pan;
- pinch zoom;
- viewport reset al recargar workspace según comportamiento actual aceptable.

Está prohibido incluir `scale`, viewport `x/y`, dimensiones de Stage o pixels en Floorplan API.

## 10. Estado disabled/read-only/pending

Cuando el Builder está locked o existe una mutación en vuelo:

No permitir:

- drag;
- resize;
- rotate;
- polygon edit;
- keyboard nudge;
- create;
- duplicate;
- delete;
- guardar otra mutación concurrente;
- placement de Sticker;
- placement de inventario.

Inspección visual puede permanecer disponible cuando no entra en conflicto con el estado vigente.

Asegurar que `Transformer` y sus anchors respeten realmente `disabled`; no basta con deshabilitar únicamente `Group.draggable`.

## 11. Prevención de pérdida local accidental

Admin debe advertir cuando exista trabajo local no persistido relevante antes de abandonar/recargar la página.

Como mínimo considerar dirty state cuando exista:

- draft colocado/modificado sin guardar;
- edición de shape existente con cambios no guardados;
- mesas pendientes en inventario.

Usar el mecanismo más pequeño compatible con el router actual.

Requisitos:

- `beforeunload` para refresh/cierre del navegador;
- si el router ya ofrece blocker estable y reutilizable, cubrir navegación interna también;
- no bloquear cuando no hay cambios pendientes;
- después de Save/Cancel confirmado, limpiar dirty state;
- no construir un sistema global de drafts.

## 12. Reconciliación después de mutación confirmada

Para create/update/duplicate/delete/replace image/lock/unlock:

1. ejecutar una sola mutación;
2. si responde éxito, adoptar respuesta autoritativa local cuando exista;
3. ejecutar refetch de reconciliación;
4. si refetch falla, mostrar estado recuperable;
5. `Actualizar plano` sólo ejecuta GET/refetch;
6. jamás repetir automáticamente la mutación confirmada.

Esta regla es obligatoria incluso si el usuario presiona retry después.

## 13. Error antes de confirmación

Si la mutación falla antes de una respuesta confirmada:

- conservar el contexto necesario para que el usuario pueda decidir reintentar;
- no afirmar `Guardado`;
- no borrar draft útil sin razón;
- traducir errores conocidos a copy operativa;
- permitir refetch manual cuando el estado servidor sea incierto.

No asumir que `network error` significa que el servidor no aplicó la operación.

Para create proveniente de inventario se conserva el mecanismo vigente de reconciliación por comparación autoritativa; no inventar IDs client-side persistentes.

## 14. Conflictos y cambios externos

Manejar explícitamente, como mínimo:

### `FLOORPLAN_CONCURRENCY_CONFLICT`

- no auto-replay;
- informar que el plano cambió o la operación chocó con otro cambio;
- ofrecer/ejecutar refetch seguro;
- adoptar estado autoritativo después de refetch.

### Floorplan bloqueado externamente

Si una mutación devuelve error compatible con Floorplan locked:

- refetch;
- abandonar edición local cuando el servidor confirme `locked=true`;
- entrar a modo lectura;
- no seguir enviando mutaciones.

### Shape eliminada/cambiada externamente

Si update/delete devuelve not-found o conflicto equivalente:

- no recrear silenciosamente la shape;
- refetch;
- cerrar inspector si la shape ya no existe;
- mostrar mensaje natural recuperable.

No implementar merge automático de dos drafts concurrentes.

## 15. Fidelidad de reload

Después de una mutación confirmada y GET posterior, el layout debe conservar:

- kind;
- geometry;
- name;
- capacity;
- x/y;
- width/height;
- rotation;
- polygonPoints;
- background vigente.

No debe depender de:

- preset Sticker original;
- viewport anterior;
- estado React anterior;
- localStorage;
- orden accidental de render.

Los layouts creados antes de FP-01/FP-02 deben continuar renderizando.

## 16. Background / imagen privada

Preservar el flujo Admin actual:

- FileAsset administrativo OP-02B;
- content privado → Blob/Object URL;
- revocar Object URL cuando cambia asset/unmount;
- reemplazo: upload → PATCH Floorplan → adoptar respuesta → reconciliar.

Robustez requerida:

- un asset nuevo no debe mostrarse como autoritativo antes de PATCH exitoso;
- fallo de refetch posterior a PATCH no repite upload/PATCH;
- cambiar background no altera shapes;
- renderer debe recalcular Stage manteniendo coordenadas normalizadas.

No introducir URL pública.

## 17. Delete / duplicate

### Delete

- una sola mutación;
- respuesta exitosa elimina localmente y luego reconcilia;
- fallo de refetch no repite delete;
- error por Mesa ocupada debe conservar shape y mostrar mensaje natural;
- no borrar localmente antes de confirmación.

### Duplicate

Conservar FP-02:

- create shape existente;
- sin occupancy/asignaciones;
- un solo create;
- offset normalizado;
- refetch fallido no repite create.

FP-03 sólo endurece comportamiento de error/reconciliación.

## 18. Alcance de código esperado

Primero reutilizar/adaptar:

- `packages/floorplan/src/FloorplanSurface.tsx`;
- `packages/floorplan/src/FloorplanKonvaRenderer.tsx`;
- `packages/floorplan/src/FloorplanDomRenderer.tsx` si hay paridad que corregir;
- `packages/floorplan/src/floorplan-history.ts`;
- `packages/floorplan/src/floorplan-geometry.ts`;
- tests asociados;
- `apps/admin/src/events/preparation/floorplan/AdminFloorplanBuilderWorkspace.tsx`;
- tests Admin del Builder.

No mover nuevamente el engine.

## 19. Fuera de alcance

FP-03 no incluye:

- nuevo catálogo Sticker;
- nuevos presets;
- nueva entidad/metadata Sticker;
- nuevo backend de Floorplan;
- nuevo version token/ETag/expectedUpdatedAt;
- Prisma/migrations;
- reescritura de OP-02B;
- Planner Builder;
- cambios funcionales de SeatingWorkspace;
- Seat/SeatAssignment;
- realtime nuevo;
- offline;
- autosave por interacción;
- colaboración tipo Figma;
- FP-04;
- FP-05.

Si un criterio sólo puede cumplirse cambiando estos límites, STOP y reportar `TECHNICAL DECISION REQUIRED`.

## 20. Tests mínimos — geometry

Cubrir:

- drag cerca de cada borde;
- resize cerca de cada borde;
- CIRCLE/SQUARE mantienen lados iguales;
- rotation >360 y negativa se normaliza;
- polygon válido conserva points;
- polygon inválido no produce payload persistible;
- snap produce valores normalizados;
- conversiones Stage↔shape no dependen del zoom/pan.

## 21. Tests mínimos — renderer

Konva:

- drag end actualiza draft una sola vez de forma estable;
- transform end actualiza draft normalizado;
- rotate end actualiza rotation contractual;
- disabled bloquea drag/transform/polygon handles;
- pinch no dispara commit accidental;
- pan no mueve shape;
- viewport no contamina shape.

Surface:

- undo/redo sobre draft;
- historial se reinicia al cambiar identidad;
- keyboard nudges respetan disabled;
- fit/zoom no alteran draft;
- DOM→Konva mantiene draft.

## 22. Tests mínimos — Admin persistence

Probar:

- update existente: exactamente una PATCH;
- create draft: exactamente un POST;
- delete: exactamente un DELETE;
- duplicate: exactamente un POST;
- éxito + refetch fail → no replay;
- `Actualizar plano` después de reconciliación fallida → GET solamente;
- 409 `FLOORPLAN_CONCURRENCY_CONFLICT` → no replay + refetch/estado recuperable;
- locked externo → refetch + read-only;
- shape ausente tras refetch → inspector cerrado;
- dirty state/beforeunload sólo cuando corresponde;
- reemplazo background confirmado + refetch fail → no segundo upload/PATCH.

## 23. Regresión obligatoria

No romper:

- FP-01 shell Admin;
- FP-02 catálogo/placement/duplicate;
- package shared Floorplan;
- Client histórico `FloorplanStep`;
- Wizard gating Planner;
- Active Event Workspace;
- SeatingWorkspace;
- API contract actual.

`SeatingWorkspace` debe conservar diff semántico cero salvo test/import estrictamente necesario y justificado.

## 24. QA visual/interacción

Validar con pasos reproducibles:

- drag de Mesa a bordes;
- resize/rotate Mesa;
- undo/redo visible;
- zoom + pan + fit sin mover geometría;
- tablet touch/pinch;
- locked durante inspección;
- error de guardado recuperable;
- conflicto 409 recuperable;
- refetch fallido después de save confirmado;
- background reemplazado sin desplazar shapes.

No se exige agregar framework de screenshots.

Si se generan capturas locales, reportar route, viewport, fixture y secuencia exacta.

## 25. Gates

Ejecutar targeted tests primero y después, según aplique:

- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`;
- `git diff --check`.

Si no se modifica backend, integración PostgreSQL completa no es requisito de FP-03.

No ocultar fallos preexistentes conocidos.

## 26. Definition of Done

FP-03 termina cuando:

1. el engine conserva shapes normalizadas tras todas las interacciones autorizadas;
2. viewport nunca se mezcla con persistencia;
3. undo/redo es estable y local al draft;
4. disabled/read-only bloquea realmente todas las transformaciones;
5. cada acción persistente se ejecuta una sola vez;
6. éxito + fallo de refetch nunca provoca replay;
7. conflictos/locks/cambios externos existentes se recuperan mediante estado autoritativo;
8. reload reproduce el layout sin depender de estado Sticker/React;
9. background privado conserva fidelidad;
10. FP-01/FP-02/Client/Seating no sufren regresión.
