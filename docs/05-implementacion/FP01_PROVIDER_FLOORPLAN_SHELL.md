# FP-01 — Shell visual Croquis V2 provider-led

Estado: **READY FOR CODE**  
Issue: **#27**  
Base aprobada: `ebb751e2963d7ad995adcb0fe648251d332fe595`  
Workflow: `main` directo.

## 1. Objetivo

Montar el Builder real de Croquis en la superficie provider-led creada por OP-03B:

`/eventos/:eventId/preparar/croquis`

El cambio es un refactor de arquitectura frontend + composición visual sobre el motor existente. No crea un dominio paralelo, no cambia payloads y no adelanta FP-02.

La experiencia objetivo es:

```text
Topbar compacta
├── Evento / volver
├── estado de guardado
├── deshacer / rehacer
└── finalizar / habilitar edición según lock actual

Workspace
├── paleta lateral compacta
├── canvas dominante
└── panel contextual al seleccionar

Estado inferior discreto
└── mesas / capacidad / elementos / lock
```

## 2. Fuentes de verdad

Leer en este orden:

1. `AGENTS.md`;
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`;
3. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md`;
4. `docs/01-producto/04_OPERATOR_LED_MVP.md`;
5. `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`;
6. `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
7. `docs/03-diseno/FLOORPLAN_UX_TARGET.md`;
8. `docs/03-diseno/LEGACY_UI_VISUAL_PORT_GUIDE.md`;
9. `docs/05-implementacion/OP02B_PROVIDER_ADMIN_FLOORPLAN.md`;
10. `docs/05-implementacion/OP03B_OPERATOR_PLANNER_SURFACES.md`;
11. `docs/05-implementacion/19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`;
12. Issue #27.

La referencia legacy es únicamente visual/ergonómica. No puede cambiar dominio, API, auth, persistencia ni stack.

## 3. Decisión arquitectónica — package compartido del engine

Hoy el motor reutilizable vive físicamente en `apps/client/src/wizard/floorplan`, pero `MONOREPO_ARCHITECTURE.md` prohíbe importar source de una app desde otra.

Para cumplir simultáneamente:

- `REUSE > ADAPT > BUILD > REWRITE`;
- cero import directo `apps/admin -> apps/client`;
- cero segunda implementación del renderer;

FP-01 **autoriza explícitamente** crear:

`packages/floorplan`

nombre de workspace recomendado:

`@invitaciones/floorplan`

Esta autorización satisface la regla del monorepo que exige responsabilidad explícita/documentada antes de crear un package nuevo.

### Responsabilidad del package

Contener únicamente primitivas reutilizables del Builder/rendering de Croquis:

- proyección y normalización de geometría;
- renderer DOM;
- renderer Konva/React Konva;
- viewport/pan/zoom;
- selección/transform transitorio;
- undo/redo local;
- estilo visual de stickers existente;
- representación visual de sillas existente;
- helpers actuales de inventario/bandeja cuando se reutilicen;
- componentes visuales de superficie/toolbar que no dependan de una app.

### El package NO puede

- llamar API;
- usar React Query para persistencia;
- conocer `clientId`/auth/roles;
- decidir ownership;
- navegar con React Router;
- importar `apps/*`;
- activar Eventos;
- gestionar Seating;
- contener Finance/RSVP/Scanner;
- inventar reglas de capacidad/readiness;
- crear un modelo `Sticker` persistente.

La API/backend continúa siendo la autoridad.

## 4. Extracción obligatoria, no duplicación

Mover/adaptar al package compartido, cuando sean necesarios para el shell, los módulos existentes siguientes:

- `FloorplanDomRenderer.tsx`;
- `FloorplanKonvaRenderer.tsx`;
- `FloorplanSurface.tsx`;
- `FloorplanToolbar.tsx`;
- `FloorplanInventory.tsx`;
- `FloorplanTray.tsx`;
- `floorplan-geometry.ts`;
- `floorplan-history.ts`;
- `floorplan-inventory.ts`;
- `floorplan-scene.ts`;
- `floorplan-sticker-style.ts`;
- `floorplan-visual-seats.ts`.

No copiar esos archivos manteniendo dos versiones equivalentes.

Los tests unitarios de piezas puras/renderers deben moverse con el código o adaptarse de forma que sigan cubriendo la implementación única.

`apps/client/src/wizard/floorplan/FloorplanStep.tsx` permanece como wrapper/orquestador histórico Client y debe consumir el package compartido donde corresponda. El launch Planner continúa sin montar ese Builder por OP-03B.

No mover `FloorplanStep` completo al package: contiene orquestación específica de API/Evento Client.

## 5. Dependencias del package

Seguir convenciones existentes de workspaces.

El package puede depender/peer-depender únicamente de lo necesario para su responsabilidad, por ejemplo:

- `@invitaciones/api-client` para tipos contractuales (`Floorplan`, `FloorplanShape`, `FloorplanShapeInput`);
- `@invitaciones/ui` para primitivas visuales existentes;
- React;
- MUI;
- Konva / React Konva.

No introducir otro framework de estado/rendering.

No Tailwind, shadcn, Radix ni nuevo canvas engine.

## 6. API client Admin — completar OP-02B

`packages/api-client/src/admin/event-preparation.ts` actualmente sólo expone `getFloorplan()` para Croquis.

FP-01 debe completar exclusivamente las capabilities Admin OP-02B que el Builder necesita, derivando tipos desde `generated/schema.ts`.

Agregar wrappers para:

### Floorplan

- GET `/admin/clients/:clientId/events/:eventId/floorplan`;
- POST `/admin/clients/:clientId/events/:eventId/floorplan`;
- PATCH `/admin/clients/:clientId/events/:eventId/floorplan`;
- POST `/admin/clients/:clientId/events/:eventId/floorplan/lock`;
- POST `/admin/clients/:clientId/events/:eventId/floorplan/unlock`.

### Shapes

- POST `/admin/clients/:clientId/events/:eventId/floorplan/shapes`;
- PATCH `/admin/clients/:clientId/events/:eventId/floorplan/shapes/:shapeId`;
- DELETE `/admin/clients/:clientId/events/:eventId/floorplan/shapes/:shapeId`.

### Floorplan FileAssets

- POST `/admin/clients/:clientId/events/:eventId/floorplan/file-assets`;
- GET colección;
- GET `/:fileAssetId/content`;
- DELETE `/:fileAssetId`.

El multipart Admin Floorplan contiene **solamente `file`**. El servidor fuerza `FLOORPLAN_IMAGE` y `FLOORPLAN`.

No enviar `fileType` ni `ownerType` en esta superficie.

No usar endpoints Planner como fallback.

## 7. Superficie Admin

Extraer el Croquis de `AdminEventPreparationPage.tsx` a un componente/feature dedicado para evitar convertir la página de preparación en un archivo monolítico mayor.

Nombre sugerido:

`apps/admin/src/events/preparation/floorplan/AdminFloorplanBuilderWorkspace.tsx`

El nombre puede variar siguiendo convenciones reales.

La ruta existente debe permanecer:

`/eventos/:eventId/preparar/croquis`

La pantalla carga el Event por Admin API, deriva `clientId` del Event y todas las operaciones Croquis usan `clientId + eventId` explícitos.

## 8. Estado sin Croquis

Si `floorplanEnabled` es falso:

- no crear infraestructura implícitamente;
- mostrar estado claro y dirigir a Datos para habilitar Croquis;
- no mutar Event PATCH desde el Builder sin necesidad.

Si `floorplanEnabled` es verdadero pero no existe Floorplan:

- mostrar el shell vacío/onboarding;
- CTA primaria `Subir plano`;
- aceptar JPG/PNG conforme al contrato actual;
- usar Admin Floorplan FileAsset upload;
- después crear Floorplan con el asset mediante POST Admin.

No crear un Floorplan sin imagen porque el contrato actual no lo soporta. La referencia UX de superficie neutra sin plano no autoriza inventar un nuevo payload/backend en FP-01.

## 9. Plano existente

Cuando exista Floorplan:

- cargar la imagen privada mediante Admin Floorplan FileAsset content;
- crear object URL de forma segura y revocarlo al cambiar/desmontar;
- renderizar con el mismo `FloorplanSurface`/Konva extraído;
- permitir reemplazar el plano mediante upload Admin + PATCH Admin;
- no usar el `contentPath` Planner como shortcut si apunta a una ruta no autorizada para Platform Admin.

## 10. Shell visual FP-01

### Topbar

Debe priorizar:

- volver a Preparar Evento;
- nombre del Evento / Croquis;
- estado `Guardado / Guardando / Error`;
- undo/redo del draft local existente;
- acción de finalizar/bloquear o habilitar edición/desbloquear según estado vigente.

No exponer IDs ni enums.

### Paleta lateral

FP-01 crea la **estructura** de paleta y conserva capacidades existentes, pero NO formaliza todavía el catálogo Sticker de FP-02.

Puede ofrecer las acciones existentes de:

- agregar Mesa;
- agregar Zona;
- preparar varias Mesas mediante inventario actual.

No añadir todavía Mesa imperial/principal, pista/barra/DJ/entrada/baños como semánticas nuevas. Eso pertenece a FP-02 y exige mapping explícito.

### Canvas

Debe ser la región dominante del layout.

Reusar:

- Konva/DOM fallback actuales;
- zoom/pan/fit;
- snap actual;
- visual seats actual;
- drag/resize/rotate;
- coordenadas normalizadas;
- keyboard interaction vigente.

No persistir viewport.

### Panel contextual

Sin selección:

- no mostrar formulario técnico permanente;
- mostrar ayuda breve/estado si aporta valor.

Con Mesa seleccionada:

- nombre;
- capacidad;
- geometría con copy natural (`Redonda`, `Cuadrada`, `Rectangular`);
- acciones frecuentes;
- eliminar;
- controles secundarios bajo progressive disclosure.

Con Zona seleccionada:

- nombre;
- forma cuando aplique;
- acciones frecuentes;
- eliminar;
- capacidad no editable y permanece 0.

No mostrar como UI primaria:

- x/y;
- IDs;
- `TABLE` / `DECORATIVE_ZONE`;
- JSON;
- coordenadas normalizadas;
- términos CAD.

## 11. Persistencia y reconciliación

Reusar el patrón actual de `FloorplanStep`:

- mutation lock local;
- create/update/delete mediante API;
- actualización optimista/local sólo después de respuesta confirmada;
- refetch después de mutación confirmada;
- si el refetch falla, mostrar estado recuperable sin repetir automáticamente la mutación;
- lock/unlock mediante API;
- reload debe reconstruir el layout desde el Floorplan autoritativo.

No introducir autosave continuo nuevo en FP-01 si el mecanismo actual guarda en acciones/commit de interacción.

FP-03 realizará la validación profunda de robustez; FP-01 no debe degradar lo existente.

## 12. Lock

La semántica backend no cambia.

Cuando `floorplan.locked === true`:

- geometría queda read-only;
- se permite inspección/selección si resulta útil;
- mutaciones del Builder se deshabilitan;
- la topbar ofrece la acción autorizada para volver a habilitar edición mediante Admin unlock.

No interpretar lock como estado nuevo de Evento.

## 13. Responsive

### Desktop

Objetivo aproximado:

- paleta: 220–280 px;
- canvas: `minmax(0, 1fr)` dominante;
- panel contextual: 280–340 px cuando hay selección.

No son medidas contractuales rígidas; preservar jerarquía y operabilidad.

### Tablet landscape

- canvas sigue dominante;
- paleta puede compactarse;
- panel contextual puede convertirse en Drawer;
- targets touch >= 44×44;
- pan/pinch deben conservarse si el renderer actual los soporta.

Mobile Builder completo no es requisito de FP-01.

## 14. Estados y accesibilidad

Cubrir:

- loading;
- error con retry;
- Croquis deshabilitado;
- Floorplan no creado;
- Floorplan con imagen;
- locked/read-only;
- mutation pending;
- fallo de guardado recuperable;
- fallo de refetch posterior a mutación confirmada.

Accesibilidad mínima:

- focus visible;
- labels accesibles;
- acciones no dependientes sólo de icono;
- targets táctiles >= 44×44;
- no usar color como único estado;
- shortcuts nunca como única vía.

## 15. QA funcional mínimo

### Package/engine

- geometry tests siguen verdes;
- history undo/redo;
- scene projections;
- renderer DOM;
- renderer Konva;
- Surface toolbar/keyboard/pan/zoom;
- inventory/tray si se mueven.

### Client regression

- `FloorplanStep` histórico compila/importa el package;
- tests existentes relevantes continúan verdes;
- launch Planner sigue sin montar Croquis Builder;
- `SeatingWorkspace` no cambia.

### Admin Builder

Probar al menos:

1. ruta Croquis protegida;
2. Event -> `clientId` correcto;
3. `floorplanEnabled=false` no crea Floorplan;
4. empty state permite upload Admin;
5. upload usa sólo `/admin/.../floorplan/file-assets` y multipart `file`;
6. create Floorplan usa Admin POST;
7. imagen privada usa Admin content;
8. replace image usa Admin upload + PATCH;
9. seleccionar Mesa abre panel contextual;
10. seleccionar Zona abre panel contextual apropiado;
11. create shape usa Admin POST;
12. transform/update usa Admin PATCH;
13. delete usa Admin DELETE;
14. lock usa Admin POST lock;
15. unlock usa Admin POST unlock;
16. ningún request usa `/api/v1/events/:eventId/floorplan` Planner;
17. error de mutación conserva estado utilizable;
18. refetch fallido tras mutación confirmada no repite mutación.

## 16. QA visual obligatorio

Entregar evidencia reproducible de:

- Builder vacío/sin Floorplan;
- Builder con plano de fondo;
- Mesa seleccionada;
- panel contextual abierto;
- 20+ elementos en canvas;
- tablet landscape;
- error de guardado recuperable.

Puede ser mediante screenshots de test/dev reproducibles. No introducir tooling visual pesado únicamente para producir evidencia.

## 17. Performance en este ticket

FP-01 debe demostrar que el shell no colapsa con 20+ elementos.

Los escenarios formales de 50/100/200 Mesas pertenecen principalmente a FP-05, aunque no se debe introducir una regresión obvia que los haga inviables.

## 18. Fuera de alcance

- FP-02 catálogo Sticker completo;
- nuevos `kind`/geometrías;
- nueva entidad `Sticker`;
- `Seat`/`SeatAssignment`;
- backend nuevo;
- OpenAPI nuevo;
- Prisma/migrations;
- Planner Builder en launch;
- SeatingWorkspace redesign;
- cambios RSVP/Scanner/Staff/Finance;
- nuevas reglas de Event activation;
- CAD avanzado;
- migración de framework UI;
- dependencia runtime del repo legacy.

## 19. Definition of Done

FP-01 está terminado cuando:

1. `/eventos/:eventId/preparar/croquis` es un Builder provider-led real;
2. Admin usa exclusivamente OP-02B;
3. el renderer/geometry/history actuales tienen una sola implementación compartida y no una copia Admin;
4. Client histórico sigue compilando sobre el mismo engine;
5. canvas domina la composición;
6. paleta y panel contextual aplican progressive disclosure;
7. lock/persistencia actuales siguen respetados;
8. desktop/tablet landscape son operables;
9. no se adelantó FP-02;
10. QA funcional/visual del ticket tiene evidencia suficiente para revisión PM.
