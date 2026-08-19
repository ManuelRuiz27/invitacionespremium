# FP-02 — Catálogo Sticker sobre FloorplanShape

Estado: **CONTRATO TÉCNICO DE EJECUCIÓN**  
Prerequisito: FP-01 / Issue #27 cerrado y aprobado.  
Superficie: Builder provider-led en `apps/admin`; engine compartido en `packages/floorplan`.

## 1. Objetivo

Convertir la paleta básica de FP-01 en un catálogo Sticker usable por operación real, manteniendo exactamente el dominio vigente:

- `FloorplanShapeKind`: `TABLE | DECORATIVE_ZONE`;
- geometrías actuales: `CIRCLE | SQUARE | RECTANGLE | POLYGON`;
- coordenadas normalizadas `0..1`;
- capacidad positiva sólo para `TABLE`;
- capacidad `0` para `DECORATIVE_ZONE`;
- persistencia y autorización actuales mediante OP-02B.

`Sticker` sigue siendo un concepto de interacción. **No se persiste `stickerId`, subtype, category, styleKey ni metadata adicional.**

## 2. Regla central de mapping

Cada elemento del catálogo crea un `FloorplanShapeRequestDto` estándar. El preset sólo define defaults de interacción antes de guardar.

Después de persistir y recargar, el sistema debe poder funcionar exclusivamente con los campos actuales de `FloorplanShape`.

Está prohibido codificar subtipos mediante:

- prefijos mágicos en `name`;
- IDs especiales;
- colores como autoridad;
- JSON oculto;
- localStorage como fuente de verdad;
- parsing del nombre para reconstruir semántica.

## 3. Catálogo autorizado

### Mesas

| Sticker visible | Mapping persistido | Defaults orientativos |
|---|---|---|
| Mesa redonda | `TABLE + CIRCLE` | nombre natural secuencial, capacidad 10, proporción compacta |
| Mesa rectangular | `TABLE + RECTANGLE` | capacidad 8, proporción horizontal |
| Mesa imperial | `TABLE + RECTANGLE` | capacidad 12, proporción más larga que Mesa rectangular |
| Mesa principal | `TABLE + RECTANGLE` | nombre inicial `Mesa principal`, capacidad 10, proporción horizontal destacada por tamaño, no por subtype |

`Mesa imperial` y `Mesa principal` son presets ergonómicos. No crean tipos de negocio. Su persistencia sigue siendo una Mesa normal; la geometría, dimensiones, capacidad y nombre son suficientes para conservar el resultado funcional.

### Zonas / infraestructura visual

Todos persisten como `DECORATIVE_ZONE`, `capacity: 0`.

| Sticker visible | Geometría inicial | Nombre inicial |
|---|---|---|
| Pista | `RECTANGLE` | `Pista` |
| Barra | `RECTANGLE` | `Barra` |
| Escenario / DJ | `RECTANGLE` | `Escenario / DJ` |
| Entrada | `RECTANGLE` | `Entrada` |
| Baños | `RECTANGLE` | `Baños` |
| Zona | `RECTANGLE` | `Zona` |
| Texto / etiqueta | `RECTANGLE` | `Etiqueta` |

`Texto / etiqueta` se representa deliberadamente como una zona decorativa pequeña y de poca altura con capacidad cero. **No es texto libre persistente ni un tercer `kind`.** El nombre existente funciona como etiqueta visible. No aplicar estilos persistentes especiales basados en el texto `Etiqueta`.

## 4. Presets frontend

Implementar el catálogo como configuración/presets puros dentro de `@invitaciones/floorplan` o en una capa pura directamente adyacente al engine.

Forma recomendada:

- `FloorplanStickerPresetId` — tipo frontend-only;
- descriptor visible: label, group, icon/preview;
- factory `createStickerDraft(presetId, context)` que produzca `FloorplanShapeInput` válido;
- helper de nombre único cuando sea necesario;
- dimensiones iniciales normalizadas y seguras.

El preset ID **no viaja a API**.

## 5. Interacción base

Modelo mental:

```text
Elegir sticker
→ colocarlo en el plano
→ ajustar posición/tamaño/rotación
→ editar propiedades esenciales
→ guardar
```

Requisitos:

- click/tap en catálogo selecciona el sticker;
- el siguiente click/tap válido sobre canvas posiciona el draft centrado alrededor de ese punto;
- abrir el panel contextual con los defaults del preset;
- permitir ajustar antes de persistir;
- cancelar no deja shape persistido;
- guardar utiliza `Admin createFloorplanShape` actual;
- seleccionar un shape existente no requiere conocer qué preset lo originó.

Drag desde el catálogo es opcional en FP-02 si puede implementarse sin introducir un segundo protocolo de interacción. Click/tap + colocación en canvas es obligatorio.

## 6. Catálogo visual

En el panel izquierdo del Builder:

- separar `Mesas` y `Zonas`;
- mostrar icono/mini-preview + nombre natural;
- targets táctiles >= 44px;
- selección actual claramente visible;
- no mostrar `TABLE`, `DECORATIVE_ZONE`, geometry enums ni capacidades técnicas en la paleta;
- mantener `Crear varias mesas` / inventario como acelerador secundario, no como reemplazo del catálogo.

No saturar la paleta con formularios. Las propiedades viven en panel contextual.

## 7. Panel contextual

### Mesa

Mostrar como mínimo:

- Nombre;
- Capacidad;
- Forma cuando sea relevante;
- Duplicar;
- Eliminar;
- Guardar/Cancelar durante draft.

### Zona

Mostrar:

- Nombre;
- Forma cuando sea relevante;
- Duplicar;
- Eliminar;
- Guardar/Cancelar.

No mostrar capacidad para zonas.

No mostrar IDs, coordenadas, `kind`, JSON ni preset ID.

## 8. Duplicar

Añadir duplicación usando **create shape existente**, no un endpoint nuevo.

Reglas:

- copiar `kind`, `geometry`, `capacity`, dimensiones, rotación y polygon points;
- generar nombre natural que no dependa de parsing de subtype;
- aplicar un pequeño offset normalizado visible y luego clamp/normalización;
- si el offset no cabe, usar una posición válida cercana o conservar posición y exigir movimiento posterior;
- llamar una sola vez `Admin createFloorplanShape`;
- adoptar respuesta autoritativa y reconciliar como en FP-01;
- no copiar `id`, `occupancy`, `availableCapacity` ni datos derivados.

Duplicar una Mesa no duplica invitados/asignaciones.

## 9. Renderer

No crear renderer alterno.

`FloorplanSurface`, DOM y Konva del package compartido siguen siendo autoridad visual.

Se permite mejorar la representación puramente visual de shapes existentes siempre que derive sólo de sus campos persistidos y no cree semántica oculta.

No usar heurísticas del nombre para decidir iconos/estilos persistentes.

## 10. Persistencia y seguridad

Toda mutación continúa por:

`/admin/clients/:clientId/events/:eventId/floorplan/...`

No endpoints Planner.

Preservar:

- mutation lock;
- confirmación por respuesta servidor;
- refetch/reconciliación sin replay automático;
- lock/unlock;
- normalización vigente;
- auditoría backend;
- tenant isolation backend.

## 11. Read-only

Si Floorplan está locked:

- catálogo deshabilitado;
- no crear/duplicar/eliminar/mover/resize/rotate;
- renderer puede seguir permitiendo inspección si el shell lo soporta de forma segura;
- `Editar distribución` sigue siendo la vía para unlock.

## 12. Scope de FP-02

Incluye:

- catálogo completo indicado en este documento;
- preset factory/mapping;
- colocar sticker por click/tap;
- propiedades esenciales;
- duplicar;
- conservar inventario masivo de mesas;
- visual polish necesario para que el catálogo se entienda.

No incluye:

- nuevo backend/OpenAPI;
- `Sticker` persistente;
- nuevos shape kinds/geometries;
- asset/icons persistentes por sticker;
- Seat/SeatAssignment;
- asignación de personas;
- cambios en SeatingWorkspace;
- planner Builder;
- CAD;
- plantillas reutilizables entre Eventos;
- guardar catálogo personalizado;
- FP-03 de robustez completa;
- FP-04/FP-05.

## 13. Tests mínimos

### Presets

Probar los 11 stickers del catálogo:

- mapping exacto a `TABLE` o `DECORATIVE_ZONE`;
- geometría inicial;
- capacidad válida;
- dimensiones dentro de `0..1`;
- no existe propiedad persistida `stickerId`/subtype/style;
- factory produce inputs aceptables para `normalizeFloorplanShape`.

### Catálogo

- grupos Mesas/Zonas;
- etiquetas naturales;
- selección por teclado y click;
- targets accesibles;
- locked => disabled.

### Colocación

- elegir preset + click canvas crea draft en posición esperada;
- no persiste antes de Guardar;
- Guardar llama Admin create shape una vez;
- cancelar no muta servidor;
- cambio de preset cancela/reemplaza draft de forma explícita, sin shape huérfano.

### Duplicación

- Mesa duplica shape sin id/occupancy;
- Zona duplica con capacity 0;
- nombre natural;
- posición normalizada;
- una sola mutación;
- refetch fallido posterior no repite create.

### Regresión

- FP-01 Admin Builder;
- package shared engine;
- Client historical FloorplanStep;
- Wizard gating Planner;
- SeatingWorkspace sin cambios funcionales.

## 14. QA visual

Validar al menos:

- catálogo completo desktop;
- catálogo tablet landscape;
- preset Mesa redonda seleccionado;
- Pista seleccionada/colocada;
- Texto/Etiqueta colocado como zona decorativa pequeña;
- panel contextual de Mesa;
- duplicación visible;
- 20+ shapes con catálogo operable;
- locked/read-only.

Las capturas locales pueden usarse para ejecución, pero el reporte debe incluir pasos/fixture reproducibles suficientes para revisión posterior.

## 15. Definition of Done

FP-02 termina cuando el Provider puede construir un Croquis usando un lenguaje de stickers reconocible para eventos, pero cada elemento continúa persistiendo exclusivamente como `FloorplanShape` vigente y el sistema no depende de recordar qué preset lo originó.
