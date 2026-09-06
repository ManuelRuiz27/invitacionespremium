# Contrato especializado — Croquis con fuente SVG y mapeo semántico manual

Estado: **FUENTE DE VERDAD — APROBADO**  
Ámbito: Provider/Admin Floorplan Builder, FileAssets de Croquis, `Floorplan`, `FloorplanShape`, `FloorplanSeat`, renderer compartido, Seating Workspace, Scanner y OpenAPI relacionados.  
Decisión de producto: permitir que un Croquis use un SVG sanitizado como fuente visual estructurada y que el Provider convierta manualmente elementos de ese SVG en las entidades de dominio ya existentes.

## 1. Decisión

El sistema admite dos tipos de fuente visual para Croquis:

```text
RASTER
JPG / PNG
   ↓
Sticker / shapes manuales
   ↓
FloorplanShape

SVG
   ↓
sanitización + canonicalización
   ↓
selección manual de elemento
   ↓
mapeo semántico
   ↓
FloorplanShape
```

El SVG **no es fuente de verdad de negocio**. Es una fuente visual estructurada.

La fuente de verdad continúa siendo:

- `Floorplan` para el Croquis;
- `FloorplanShape` para Mesas/Zonas;
- `FloorplanSeat` para lugares exactos;
- `Assistant.floorplanShapeId` / `Assistant.floorplanSeatId` para acomodo;
- API/PostgreSQL para capacidad, ocupación, readiness, permisos, estado, concurrencia y auditoría.

No crear una entidad de negocio `SvgTable`, `SvgSeat`, `SvgZone` ni un segundo modelo de Croquis.

## 2. Autoridad y sustituciones

Para tareas que afecten **subida, representación, selección, mapeo o consumo de SVG en Croquis**, este contrato sustituye cualquier texto previo que asuma que la fuente de Croquis sólo puede ser JPG/PNG o que el único flujo de construcción es Sticker Model.

En particular sustituye, únicamente para esta capability, las restricciones incompatibles de:

- `docs/01-producto/02_PRD.md`;
- `docs/01-producto/04_OPERATOR_LED_MVP.md`;
- `docs/03-diseno/FLOORPLAN_UX_TARGET.md`;
- `docs/04-tecnico/08_TRD.md`;
- `docs/04-tecnico/09_MODELO_DATOS_CONCEPTUAL.md`;
- `docs/04-tecnico/10_SCHEMA_PRISMA_GUIDE.md`;
- `docs/04-tecnico/11_API_CONTRACTS.md`;
- `docs/04-tecnico/FILE_ASSETS_CONTRACT.md` cuando rechace SVG de Croquis de forma global;
- `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md` cuando describa `<img>` JPG/PNG como única superficie posible;
- `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md` cuando presente Sticker Model como única vía de creación de geometría.

No sustituye roles, ownership, estados de Evento, QR, RSVP, pricing, finanzas, seating ni reglas de check-in salvo la adaptación visual necesaria para consumir una fuente SVG.

El acomodo por lugar exacto continúa regido por `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`.

## 3. Alcance de la primera versión

La primera versión es deliberadamente manual y operator-led.

El Provider puede:

1. cargar un SVG;
2. visualizar el SVG sanitizado;
3. seleccionar un elemento o grupo seleccionable;
4. indicar qué representa;
5. crear/vincular la entidad `FloorplanShape` correspondiente;
6. configurar únicamente las propiedades de dominio necesarias;
7. continuar usando lugares exactos sobre ese mismo plano cuando `seatingMode=SEAT`.

Ejemplos visibles de clasificación:

- **Mesa** → `FloorplanShape.kind=TABLE`;
- **Pista** → `DECORATIVE_ZONE`;
- **Cabina DJ / escenario** → `DECORATIVE_ZONE`;
- **Baños** → `DECORATIVE_ZONE`;
- **Barra** → `DECORATIVE_ZONE`;
- **Entrada** → `DECORATIVE_ZONE`;
- **Zona** → `DECORATIVE_ZONE`.

Esas etiquetas son presets/presentación. No crean nuevos `kind` de dominio.

## 4. Lo que NO hace el SVG

El sistema no debe interpretar que un círculo es automáticamente una Mesa.

El sistema tampoco debe inferir automáticamente:

- capacidad;
- tipo de Mesa;
- número de lugares;
- nombre;
- seating;
- ocupación;
- acceso;
- readiness.

La clasificación inicial es manual.

Una futura automatización puede **proponer** mappings sobre el mismo contrato, pero nunca debe introducir una persistencia paralela.

## 5. Seguridad obligatoria

Un SVG cargado por usuario se trata como contenido activo potencialmente hostil.

Los bytes originales **nunca se renderizan directamente**.

Antes de quedar `READY`, el backend debe parsear y producir una representación SVG canónica y sanitizada.

Como mínimo debe rechazar o eliminar de forma segura:

- `<script>`;
- `<foreignObject>`;
- atributos `on*` (`onclick`, `onload`, etc.);
- `javascript:` y protocolos ejecutables;
- referencias remotas HTTP/HTTPS;
- `@import` y recursos CSS externos;
- imágenes externas;
- fuentes externas;
- navegación externa;
- referencias que salgan del propio documento;
- estructuras XML peligrosas/DTD/entidades externas;
- contenido que exceda límites de tamaño, profundidad o cantidad de nodos.

La implementación debe usar parser XML seguro; no regex como sanitizer principal.

El frontend no debe ejecutar `dangerouslySetInnerHTML` con los bytes originales del upload.

Se permite renderizar únicamente la salida canónica validada o una representación de nodos controlada derivada de ella.

## 6. Subida y FileAsset

SVG se habilita **exclusivamente para Croquis** en esta etapa.

No se abre soporte SVG genérico para Flyer, Flipbook, Álbum u otros uploads.

El modelo de FileAsset debe distinguir de forma inequívoca la fuente SVG de Croquis. La implementación puede utilizar un `fileType` especializado como `FLOORPLAN_SVG` o una evolución equivalente tipada en OpenAPI/Prisma.

Reglas:

- owner compatible: `FLOORPLAN`;
- MIME final: `image/svg+xml`;
- checksum sobre bytes sanitizados/canónicos;
- los bytes originales inseguros no se sirven al usuario;
- límite de tamaño independiente del límite de píxeles raster;
- límite de nodos/profundidad obligatorio;
- la ruta privada y reglas de ownership existentes se conservan.

JPG/PNG existentes continúan soportados sin migración destructiva.

## 7. Canonicalización e identidad de elementos

El SVG sanitizado debe exponer un conjunto controlado de **elementos seleccionables**.

Como primera versión pueden ser seleccionables, cuando sean válidos:

- `g`;
- `path`;
- `rect`;
- `circle`;
- `ellipse`;
- `polygon`;
- `polyline`.

Elementos auxiliares y de presentación pueden permanecer visibles sin ser mapeables.

Cada elemento seleccionable necesita un identificador estable **dentro de la versión canónica del asset**.

Reglas:

- conservar un `id` original sólo si es seguro y único;
- IDs ausentes o duplicados reciben IDs canónicos generados;
- el usuario nunca necesita escribir ni conocer el ID técnico;
- el ID canónico no es un UUID de dominio;
- no confiar en el orden de render como identidad persistente.

No se promete estabilidad del `sourceElementId` entre dos archivos SVG distintos. El reemplazo de la fuente se rige por la sección de reconciliación.

## 8. Mapeo a `FloorplanShape`

El vínculo mínimo aprobado es:

```text
SVG source element
        ↓ sourceElementId
FloorplanShape
```

La primera implementación debe soportar como máximo un `FloorplanShape` activo por elemento SVG mapeado.

La forma técnica mínima preferida es un `sourceElementId` nullable en `FloorplanShape` o una relación técnica equivalente que preserve las mismas garantías.

No crear una tabla adicional salvo que discovery demuestre una necesidad real de múltiples bindings por shape/elemento que no pueda resolverse con el modelo mínimo.

El backend valida:

- mismo Evento;
- mismo Floorplan;
- elemento existente en la fuente canónica vigente;
- elemento no vinculado a otra shape activa;
- actor autorizado;
- estado editable;
- floorplan no bloqueado para mutaciones estructurales.

## 9. Geometría proxy

Un `path` irregular de SVG **no debe convertirse obligatoriamente** a `polygonPoints` ni aproximarse a 64 puntos sólo para satisfacer el schema vigente.

Al crear una `FloorplanShape` desde SVG, el sistema puede derivar una geometría proxy normalizada a partir del bounding box del elemento.

Ejemplo:

```text
SVG path irregular
        ↓
bounding box normalizado 0..1
        ↓
FloorplanShape proxy
```

La geometría proxy sirve para:

- compatibilidad con el dominio existente;
- foco/selección;
- fallback visual;
- cálculos básicos que ya dependan de `FloorplanShape`.

La apariencia exacta continúa viniendo del elemento SVG.

La relación de un `FloorplanSeat` con su Mesa sigue siendo semántica; el Seat no necesita caer dentro del bounding box del elemento ni de la geometría proxy.

## 10. Estado visual derivado

El SVG almacenado no cambia de color para persistir ocupación.

La capa de presentación puede proyectar el estado autoritativo sobre el elemento vinculado.

Estados visuales derivados mínimos para una Mesa:

- sin ocupación;
- parcialmente ocupada;
- llena;
- seleccionada;
- no disponible/read-only cuando corresponda.

En `TABLE`, la proyección deriva de `capacity` y `occupancy`.

En `SEAT`, la capacidad sigue derivándose de lugares activos no bloqueados conforme al contrato detallado.

El color nunca es la única señal. Debe existir además label, borde, iconografía, texto o estado accesible equivalente.

Cambiar `fill`, `stroke` o clases de presentación **no modifica la DB**.

## 11. Sticker Model se conserva

Sticker Model no se elimina.

Quedan dos caminos válidos:

```text
Croquis raster o vacío
        ↓
Sticker Builder
        ↓
FloorplanShape

Croquis SVG estructurado
        ↓
Mapeo de elementos
        ↓
FloorplanShape
```

También se permite complementar un SVG con Shapes/Seats creados manualmente.

No es requisito que todos los elementos visibles del SVG tengan mapping.

Los elementos SVG no mapeados son sólo presentación y no afectan readiness.

## 12. Reemplazo de la fuente

Reemplazar un SVG puede invalidar los IDs de elementos.

La primera versión **no realiza matching heurístico automático** entre documentos diferentes.

Si se reemplaza una fuente SVG que ya tiene mappings:

1. la UI solicita confirmación explícita;
2. la operación reemplaza el asset de forma autoritativa;
3. se eliminan/desvinculan los `sourceElementId` anteriores de forma atómica;
4. las `FloorplanShape`, `FloorplanSeat`, asignaciones y auditoría de negocio se conservan;
5. el Provider puede remapear las Shapes necesarias sobre la nueva fuente.

No eliminar personas, Mesas ni lugares como efecto colateral de reemplazar únicamente la fuente visual.

Raster → SVG y SVG → raster siguen la misma regla: preservar dominio y retirar bindings incompatibles.

## 13. Readiness

El SVG por sí mismo no crea readiness.

Readiness continúa evaluando el modelo de dominio.

Por tanto:

- un elemento SVG no mapeado no bloquea;
- una Mesa mapeada debe cumplir las reglas normales de `FloorplanShape`;
- en `SEAT`, las reglas de `FloorplanSeat` permanecen intactas;
- si un binding declarado apunta a un elemento inexistente, la API debe rechazar el estado/mutación antes de confirmarlo;
- después de reemplazar la fuente, los bindings incompatibles no deben permanecer ocultamente activos.

## 14. Provider/Admin UX

Flujo objetivo:

```text
Cargar Croquis
   ↓
SVG detectado
   ↓
Mostrar fuente sanitizada
   ↓
Seleccionar elemento
   ↓
¿Qué representa?
   ├─ Mesa
   ├─ Pista
   ├─ Cabina DJ / escenario
   ├─ Baños
   ├─ Barra
   ├─ Entrada
   └─ Zona
   ↓
Configurar propiedades necesarias
   ↓
FloorplanShape persistida
```

Para Mesa:

- nombre obligatorio según reglas actuales;
- `TABLE`: capacidad manual;
- `SEAT`: capacidad derivada de lugares.

La UI debe permitir distinguir:

- elemento sin mapear;
- elemento mapeado;
- elemento seleccionado;
- Mesa con estado operacional.

No exponer XML, path data, viewBox numérico, UUID, `sourceElementId` ni enums al Provider en el flujo normal.

## 15. Planner Seating Workspace

Planner continúa sin editar la geometría.

Con fuente SVG:

- ve el mismo Croquis en read-only;
- selecciona Mesas a través de la entidad `FloorplanShape` vinculada;
- en `TABLE` asigna a Mesa;
- en `SEAT` asigna a lugar exacto;
- estado visual del elemento SVG refleja la ocupación autoritativa;
- conflictos continúan resolviéndose por REST/realtime existente.

No crear un segundo Seating Workspace para SVG.

## 16. Scanner / Staff

Scanner consume la misma fuente visual.

- `TABLE`: puede resaltar el elemento SVG vinculado a la Mesa;
- `SEAT`: puede resaltar la Mesa y el `FloorplanSeat` exacto;
- geometría siempre read-only;
- no se amplía PII;
- el mapping visual no modifica las precondiciones de check-in.

Si no existe binding SVG, Scanner conserva el comportamiento actual de shapes/Seats.

## 17. API conceptual

Los nombres exactos se fijan en OpenAPI durante implementación, pero la capability debe cubrir:

- upload/replace de fuente SVG de Croquis;
- lectura segura de la fuente canónica;
- lectura de metadata de elementos seleccionables;
- crear/vincular mapping elemento → `FloorplanShape`;
- desvincular mapping sin eliminar la Shape;
- lectura de `sourceElementId` sólo para clientes autorizados que lo necesiten técnicamente;
- estado autoritativo de Shape/Seat separado del SVG.

No enviar el SVG completo modificado en cada cambio de ocupación.

No persistir estado operacional dentro del XML.

## 18. Compatibilidad

- Croquis JPG/PNG existentes continúan funcionando;
- no se migra automáticamente ningún Croquis existente a SVG;
- `FloorplanShape` sigue siendo la entidad contractual;
- `FloorplanSeat` permanece intacto;
- `Assistant.floorplanShapeId` y `Assistant.floorplanSeatId` permanecen intactos;
- `packages/floorplan` continúa siendo el engine compartido;
- DOM/Konva actuales se reutilizan/adaptan, no se crea un dominio gráfico paralelo;
- realtime actual se reutiliza;
- no cambia pricing ni servicio contratado.

## 19. Fuera de alcance

Para esta etapa quedan fuera:

- detección automática de Mesas;
- OCR;
- visión computacional;
- vectorización automática de JPG/PNG/PDF;
- edición de paths/nodos Bézier dentro de InvitacionesPremium;
- Illustrator/Figma embebido;
- CAD;
- auto-seating por afinidad;
- conversión automática de cada silla dibujada a `FloorplanSeat`;
- matching automático entre versiones distintas de SVG;
- Planner Builder self-service durante operator-led;
- nuevos roles;
- nueva jerarquía Venue/Espacio sólo para soportar SVG.

## 20. QA mínimo

Seguridad:

- `<script>` rechazado/eliminado de forma segura;
- `foreignObject` rechazado;
- event handlers rechazados;
- external refs rechazadas;
- entity expansion/DTD rechazado;
- SVG excesivo por bytes/nodos/profundidad rechazado;
- nunca se sirve el raw inseguro.

Mapping:

- rect/circle/ellipse/path/group seleccionables;
- IDs duplicados se canonicalizan;
- crear Mesa desde elemento;
- crear Zona desde elemento;
- un elemento no puede mapear dos Shapes activas;
- reload conserva mapping;
- elemento no mapeado no afecta readiness.

Operación:

- Mesa mapeada refleja 0/parcial/llena sin mutar SVG almacenado;
- `SEAT` mantiene lugares globales sobre un path irregular;
- mover el elemento visual o reemplazar fuente no altera una asignación existente fuera de una operación autorizada;
- Planner usa `FloorplanShape`/`FloorplanSeat`, no XML;
- Scanner resalta Mesa/Lugar sin ampliar PII.

Compatibilidad:

- evento raster existente sin regresión;
- TABLE sin regresión;
- SEAT sin regresión;
- lock/estado/tenant aplican igual;
- OpenAPI/api-client permanecen como contrato de frontend.

## 21. Criterio de terminado

`SVG FLOORPLAN MAPPING = DONE` cuando un Provider puede tomar un SVG real del salón, mapear manualmente Mesas y zonas sin redibujar su geometría, operar acomodo TABLE o SEAT sobre las entidades actuales, ver el estado reflejado sobre el SVG y utilizar el mismo Croquis en Planner/Scanner, con sanitización y persistencia certificadas.
