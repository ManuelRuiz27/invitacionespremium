# UI-03 — Invitation Experience: pieza gráfica primero

Estado: **READY FOR CODE DESPUÉS DE UI-02**  
Prioridad: **P0 del refactor visual Client**  
Fuente visual superior: `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`.

## 1. Objetivo

Refactorizar la experiencia de configuración de Flyer/Flipbook para que la **pieza gráfica sea el contenido principal** y las acciones se editen de forma contextual sobre la imagen.

Este ticket es visual/UX sobre contratos ya resueltos. No cambia dominio, Hotspots, cardinalidades, pageId, readiness, endpoints ni persistencia.

## 2. Lectura obligatoria

Codex debe leer, en orden:

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`
4. `docs/03-ui-ux/07_UI_UX_FLOW.md`
5. `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`
6. `docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md`
7. `docs/04-tecnico/FILE_ASSET_POLICY.md`
8. `docs/04-tecnico/CLIENT_APP_CONTRACT.md`
9. `docs/05-implementacion/14_CODEX_RULES.md`
10. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`
11. este ticket.

La regla reciente de **acciones en cualquier página del Flipbook** es obligatoria. No volver a concentrar acciones en portada ni reintroducir una “página QR” funcional.

## 3. Software archaeology obligatorio

Inspeccionar como mínimo:

- `apps/client/src/wizard/design/DesignStep.tsx`
- `apps/client/src/wizard/design/HotspotEditor.tsx`
- `apps/client/src/wizard/design/AssetPreview.tsx`
- `apps/client/src/wizard/design/usePrivateAssetUrl.ts`
- `apps/client/src/wizard/design/DesignStep.test.tsx`
- `apps/client/src/wizard/design/HotspotEditor.test.tsx`
- integración del paso `invitacion` en `WizardPage.tsx`;
- renderer público de Invitación sólo para verificar que proyección/acciones siguen alineadas, sin rediseñarlo salvo regresión necesaria.

Reportar qué UI actual ya cumple interacción directa y qué sigue siendo demasiado formulario/inspector.

## 4. Invariantes duras

No cambiar:

- entidad `Hotspot`;
- `x`, `y`, `width`, `height`, `priority`;
- page ownership por `pageId` estable;
- cardinalidades;
- endpoints;
- mutation/reconciliation semantics;
- FileAsset lifecycle;
- readiness;
- freeze al activar;
- accessibility contract;
- projection entre editor y renderer público.

### Flipbook vigente

- cualquier página activa puede contener cualquier acción;
- portada no tiene permisos especiales;
- `RSVP`, `LOCATION`, `GIFT_REGISTRY`, `QR_AREA` máximo una instancia activa cada una a nivel diseño;
- `QR_AREA` nunca más de una página;
- `EXTERNAL_LINK` conserva cardinalidad contractual vigente;
- mover acción cambia `pageId` + geometría en una mutación;
- reorder conserva acciones/readiness;
- eliminar página con acciones aplica confirmación contractual;
- sustituir imagen conserva acciones y puede advertir cambio de proporción;
- readiness exige acciones requeridas según contrato vigente.

## 5. Modelo visual objetivo

### Flipbook

```text
Invitación

[Página 1]
[Página 2]              ┌──────────────────────────────┐
[Página 3]              │                              │
[Página 4]              │         INVITACIÓN           │
                        │                              │
+ Agregar página        └──────────────────────────────┘
```

La imagen/página seleccionada ocupa la mayor parte del área útil.

### Páginas

- thumbnails compactas;
- selección evidente sin depender sólo del color;
- número visible/portada como metadata secundaria;
- drag/reorder o controles existentes accesibles;
- agregar página claramente disponible;
- acciones de replace/delete contextuales.

No convertir cada página en una card grande.

## 6. Acciones sobre la invitación

La UI visible usa:

- Confirmar asistencia;
- Ver ubicación;
- Mesa de regalos;
- Mostrar QR;
- Enlace adicional.

No usar “Hotspot” como término primario.

### Crear

`Agregar acción` abre elección compacta de acciones disponibles según cardinalidades autoritativas.

Después de elegir:

1. colocar área directamente sobre imagen;
2. mover/redimensionar;
3. configurar sólo dato adicional necesario;
4. guardar.

### Seleccionar

Click/tap/teclado sobre una acción existente debe abrir contexto específico.

Ejemplo:

```text
Confirmar asistencia

Mover/ajustar directamente sobre la imagen
Mover a otra página
Eliminar
```

Para enlace adicional se agrega únicamente el campo `Enlace` y su ayuda natural contractual.

## 7. Inspector contextual

No mantener un panel de propiedades complejo visible cuando no existe selección.

El inspector aparece únicamente en:

- creación;
- edición;
- movimiento entre páginas;
- confirmación de delete/replace cuando corresponda.

No mostrar:

- coordenadas;
- width/height normalizados;
- priority;
- pageId;
- enums;
- payload API.

Las alternativas accesibles de teclado para mover/redimensionar siguen existiendo con nombres naturales.

## 8. Acciones configuradas

Puede existir un resumen compacto de acciones configuradas, pero debe ser secundario a la pieza gráfica.

Objetivos:

- indicar qué acción existe;
- indicar en qué página visible está cuando sea útil;
- ofrecer `Ir a la acción`;
- ofrecer `Mover aquí` cuando la acción única ya existe y el Planner está en otra página.

No duplicar la misma información en card + chip + overlay + lista permanente.

## 9. Readiness visible

El backend es autoridad.

La UI:

- muestra instrucciones naturales de lo que falta;
- no calcula porcentaje de progreso;
- no deriva readiness por portada/página QR;
- refresca autoritativamente después de mutaciones;
- reorder válido no degrada readiness;
- delete de acción requerida sí refleja incompleto.

## 10. Flyer

Mismo principio de pieza gráfica primero.

- imágenes dominantes;
- acciones directamente sobre preview;
- replace de assets claro;
- inspector sólo con selección;
- requisitos Flyer contractuales no cambian.

No forzar la composición Flipbook cuando Flyer requiere sus dos variantes.

## 11. Responsive

### Desktop

- thumbnails compactas laterales o en tira;
- preview dominante;
- inspector contextual estrecho cuando exista selección.

### Tablet

- preview prioritario;
- inspector como Drawer lateral/bottom según ancho;
- thumbnails scrollables.

### Mobile

- preview a ancho útil;
- páginas en tira horizontal;
- inspector en bottom sheet;
- acciones principales accesibles sin hover;
- manipulación touch sin bloquear scroll normal fuera del canvas.

## 12. Estados y errores

Cubrir:

- sin diseño;
- diseño cargando;
- asset cargando;
- error recuperable;
- 1 página;
- 10 páginas;
- acción requerida faltante;
- acción única ya existente;
- move cancelado;
- mutation success + refresh failure;
- cambio de proporción al replace;
- página con acciones al delete.

No perder el borrador local después de fallo de mutación.

## 13. Accesibilidad

- cada acción comunica nombre;
- selección no depende sólo del color;
- focus visible;
- teclado para seleccionar/mover/redimensionar;
- target >=44×44 para controles touch importantes;
- thumbnails con nombre accesible;
- dialogs/drawers con focus management;
- reduced motion respetado.

## 14. Tests obligatorios

Conservar/ampliar tests para demostrar:

1. Flyer/Flipbook correctos por Servicio;
2. páginas 1..10;
3. CRUD páginas;
4. cualquier página acepta acciones válidas;
5. portada no restringe;
6. QR único;
7. acciones únicas no se duplican;
8. `Ir a la acción`/`Mover aquí` cuando corresponda;
9. move usa la misma entidad y cambia owner autoritativamente;
10. cancel move conserva original;
11. reorder conserva pageId/acciones/readiness;
12. delete página con acciones requiere confirmación y elimina según contrato;
13. replace conserva acciones;
14. warning de aspecto cuando aplica;
15. external link conserva validación;
16. mutation failure conserva draft;
17. refresh failure posterior no repite mutación;
18. Object URLs se revocan;
19. teclado/touch siguen operables;
20. copy no expone Hotspot/coords/priority/pageId.

## 15. QA visual obligatorio

Evidencia reproducible para:

- Flipbook 4 páginas;
- acción en página 1;
- acción en página intermedia;
- QR en página distinta;
- mover acción entre páginas;
- acción ya existente al intentar agregar;
- reorder;
- delete con acciones;
- replace con aspecto distinto;
- Flyer;
- tablet;
- mobile.

## 16. No-go

No tocar:

- Croquis/Floorplan;
- SeatingWorkspace;
- API/Prisma/OpenAPI;
- reglas de Hotspot;
- renderer público salvo ajuste mínimo requerido para corregir regresión compartida demostrada;
- upgrade postactivación fuera de su contrato.

## 17. Definition of Done

UI-03 termina cuando:

- la pieza gráfica domina la experiencia;
- páginas son compactas y claras;
- acciones se crean/editan directamente sobre imagen;
- inspector sólo aparece con contexto;
- no se exponen términos técnicos;
- acciones libres por página y cardinalidades permanecen intactas;
- readiness sigue autoritativo;
- responsive/accesibilidad pasan;
- Croquis no fue modificado;
- tests y QA pasan.
