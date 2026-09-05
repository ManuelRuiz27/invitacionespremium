# Meta visual y de interacción — Croquis V2 / Sticker Model

Estado: **Referencia UX oficial para Croquis V2**, subordinada a `docs/04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`, `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md` y `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`.

Cuando el alcance sea asignación persistente por lugar/asiento, prevalece `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`.

## 1. Objetivo

Croquis V2 debe sentirse como una herramienta visual de preparación de salón, no como CAD ni como un formulario técnico.

El lanzamiento separa dos experiencias:

- **Builder del proveedor:** InvitacionesPremium construye el espacio y, cuando corresponda, los lugares exactos.
- **Seating Workspace de Planner:** la Planner controla personas y acomodo sobre una geometría ya preparada.

La experiencia visual rescata la claridad, composición y ergonomía del workspace del repositorio legacy, pero se implementa exclusivamente con la arquitectura, design system y contratos del repositorio canónico.

Referencia legacy permitida: `Soft-Monkey_InvitacionesPremium/docs/floorplan-ux-redesign-roadmap.md`. No es fuente de verdad de dominio ni stack.

## 2. Principios

1. El Builder usa el modelo mental **Sticker → colocar → ajustar → configurar**.
2. La Planner no necesita conocer coordenadas, enums, geometrías internas ni modelo de persistencia.
3. El control de infraestructura y el control de personas son superficies distintas.
4. Progressive Disclosure: mostrar primero lo necesario para completar el trabajo actual.
5. La interacción debe ser rápida en eventos masivos y precisa en eventos boutique.
6. Desktop/tablet priorizan canvas; mobile usa paneles de contexto o pantallas dedicadas.
7. La estética debe sentirse sutil, limpia y premium, sin sacrificar legibilidad operacional.
8. No migrar de MUI/design tokens actuales a otro stack únicamente para replicar el aspecto legacy.
9. El sistema no exige simetría: una Mesa puede ser una referencia lógica mientras sus lugares se colocan libremente sobre un montaje irregular.
10. El detalle por lugar es opcional; la UI no penaliza a un Evento que solo necesita acomodo por Mesa.

## 3. Builder del proveedor

### Estructura objetivo

```text
Topbar
├── Evento
├── Croquis
├── Guardado
├── Deshacer / Rehacer
└── Salir

Workspace
├── Catálogo de stickers
├── Canvas central
└── Panel contextual

Footer/estado
└── Resumen operativo discreto
```

El canvas debe ser el área dominante. Los paneles existen para ayudar a construir; no deben competir visualmente con el plano.

### Fondo

El plano real puede utilizarse como capa base cuando exista un JPG/PNG/PDF convertido conforme a los contratos vigentes.

La ausencia de plano no debe convertir la herramienta en CAD. El usuario sigue trabajando con stickers y una superficie neutra.

Un plano base puede contener mobiliario ya dibujado. En modo detallado, los lugares pueden colocarse encima o alrededor de ese mobiliario sin exigir que una shape reproduzca exactamente su silueta.

## 4. Modos de acomodo

La configuración visible ofrece dos opciones con lenguaje natural:

### Acomodo por mesa

Para eventos donde basta saber la Mesa de cada persona.

Modelo mental:

```text
Persona → Mesa
```

### Acomodo por lugar exacto

Para bodas boutique, mesas irregulares o montajes donde importa la silla/lugar individual.

Modelo mental:

```text
Persona → Lugar → Mesa
```

La elección no se presenta como una configuración técnica. Puede utilizar copy como:

- **Por mesa** — “Asigna personas a una mesa, sin definir silla.”
- **Por lugar exacto** — “Define cada lugar en el croquis y asigna una persona a cada uno.”

No activar automáticamente el modo detallado por cantidad de invitados.

## 5. Catálogo inicial de stickers

### Mesas

- Mesa redonda.
- Mesa rectangular.
- Mesa imperial.
- Mesa principal.

Las variaciones visuales no crean automáticamente nuevos `kind` de dominio. Deben mapearse a los contratos existentes siempre que sea posible.

### Zonas / infraestructura visual

- Pista.
- Barra.
- Escenario / DJ.
- Entrada.
- Baños.
- Zona genérica.
- Texto/etiqueta.

Un sticker decorativo no adquiere capacidad ni semántica asignable sólo por su representación visual.

### Lugar individual — solo modo detallado

Visualmente se representa como un círculo/punto de asiento discreto, con identidad persistente y relación a una Mesa.

No es una `FloorplanShape` adicional ni un nuevo tipo de sticker de negocio. Su dominio es `FloorplanSeat` conforme al contrato especializado.

## 6. Interacción del Builder

Una operación base debe poder realizarse sin abrir controles avanzados.

Acciones esperadas según el tipo de sticker y los permisos/estado del Evento:

- colocar con click/tap o drag;
- seleccionar;
- arrastrar;
- rotar;
- duplicar;
- redimensionar cuando aplique;
- renombrar/etiquetar;
- editar capacidad cuando aplique en acomodo por Mesa;
- eliminar con confirmación contextual cuando corresponda;
- undo/redo;
- zoom/pan/ajustar vista.

En **Acomodo por lugar exacto**, al seleccionar una Mesa el Builder agrega además:

- `Agregar lugar`;
- click/tap sobre el plano para colocarlo;
- arrastrar cada lugar libremente;
- duplicar;
- selección múltiple y movimiento conjunto;
- bloquear/desbloquear un lugar disponible;
- renumerar/reetiquetar;
- eliminar lugares no ocupados;
- generación automática opcional como punto de partida para Mesas simples.

No mostrar como UI primaria:

- `x/y`;
- grados numéricos salvo necesidad avanzada demostrada;
- IDs;
- `TABLE`, `SEAT`, `DECORATIVE_ZONE`;
- nombres de geometría interna;
- JSON/layout schema.

## 7. Progressive Disclosure

### Estado base

Al seleccionar un objeto mostrar únicamente:

- nombre/etiqueta;
- capacidad si es Mesa;
- ocupación si el contexto la requiere;
- acciones frecuentes;
- acceso a `Más opciones` sólo cuando existan propiedades secundarias.

En modo detallado, la Mesa muestra capacidad derivada y resumen de lugares, no un campo editable de capacidad.

Ejemplo:

```text
Mesa 8
10 lugares
8 asignados · 2 disponibles

[Agregar lugar] [Más opciones]
```

Al seleccionar un lugar:

```text
Lugar 4 · Mesa 8
Disponible

[Renombrar] [Duplicar] [Bloquear] [Eliminar]
```

### Controles avanzados

Color, propiedades visuales poco frecuentes, datos técnicos permitidos o ajustes finos se revelan bajo una acción secundaria.

La interfaz no debe transformar un sticker sencillo en un formulario largo permanente.

## 8. Mesa seleccionada

### Acomodo por Mesa

```text
Mesa 12
8 / 10 lugares asignados
2 disponibles

[Nombre]
[Capacidad]

[Duplicar] [Más opciones]
```

### Acomodo por lugar exacto

```text
Mesa 12
10 lugares definidos
8 ocupados · 1 libre · 1 bloqueado

[Agregar lugar]
[Seleccionar lugares]
[Renumerar]
[Más opciones]
```

En Builder no es obligatorio exponer asignación cotidiana de invitados. Esa tarea pertenece al Seating Workspace de Planner.

## 9. Montajes irregulares

El modo detallado debe soportar visualmente sin trucos especiales:

- Mesa en U;
- Mesa curva/serpentina;
- Mesa imperial compuesta;
- grupos de Mesas no simétricas;
- mobiliario dibujado en la imagen base;
- lugares separados de la caja visual aproximada de su Mesa.

La UI no fuerza que un lugar quede “dentro” de la Mesa. La asociación Mesa/Lugar es semántica.

Ejemplo conceptual:

```text
○ ○ ○ ○ ○ ○ ○
○ ┌───────────┐ ○
○ │           │ ○
○ │   MESA A  │ ○
○ │           │ ○
○ └───┐   ┌───┘ ○
○     │   │     ○
      │   │
      └───┘
```

Los círculos son lugares persistentes y cada uno puede moverse individualmente.

## 10. Seating Workspace de Planner

La Planner recibe el Croquis ya construido.

### Acomodo por Mesa

Conserva:

- geometría read-only;
- selección de Mesa;
- búsqueda de invitados;
- filtros por estado/grupo cuando estén soportados;
- asignar selección a Mesa;
- mover entre Mesas;
- desasignar;
- acciones de familia/grupo conforme al contrato actual;
- mostrar ocupación/capacidad;
- reaccionar a cambios realtime y conflictos de concurrencia.

Modelo mental:

```text
Persona → Mesa
```

### Acomodo por lugar exacto

La geometría sigue read-only, pero los lugares son destinos interactivos de asignación.

Debe soportar:

- seleccionar persona → seleccionar lugar;
- seleccionar lugar libre → elegir persona;
- mover persona entre lugares;
- desasignar;
- mostrar Mesa + etiqueta del lugar;
- distinguir libre, ocupado, bloqueado y seleccionado sin depender solo del color;
- mostrar pendientes “Mesa asignada, falta lugar” durante una conversión previa a activación;
- conflictos concurrentes con refetch autoritativo;
- operación masiva solo cuando exista un mapeo explícito persona→lugar all-or-none.

Modelo mental:

```text
Persona → Lugar exacto → Mesa
```

La Planner controla **quién se sienta dónde**, pero no mueve Mesas ni lugares durante el perfil operator-led.

El workspace vigente en `apps/client/src/workspace/SeatingWorkspace.tsx` es la base funcional y no debe sustituirse por código legacy.

## 11. Resumen y pendientes

El producto debe poder proyectar de forma clara:

- capacidad total;
- asistentes confirmados;
- asistentes con Mesa;
- asistentes sin Mesa;
- en modo detallado: asistentes con lugar exacto;
- en modo detallado: asistentes con Mesa pero sin lugar;
- lugares libres;
- lugares bloqueados;
- disponibilidad por Mesa;
- blockers contractuales antes de activación/cierre operativo.

No usar color como único indicador.

Una futura experiencia `Resolver pendientes` puede agrupar problemas accionables, pero no es requisito si el workspace permite resolverlos con seguridad.

## 12. Día del Evento

El croquis operativo es read-only para geometría.

Puede mostrar estado de check-in/ocupación a partir de la infraestructura realtime/REST existente. No crear una segunda vía de sincronización.

En modo detallado, Scanner/Staff puede mostrar:

```text
Mesa 8
Lugar 4
```

y resaltar ese punto exacto sobre el plano.

Scanner y Staff conservan sus reglas de mínima exposición de datos.

## 13. Responsive

### Desktop

- canvas dominante;
- catálogo/panel lateral compacto;
- contexto visible sin modal cuando haya espacio;
- shortcuts como aceleradores, nunca como única vía.

### Tablet

- prioridad equivalente a Desktop para operación del Builder;
- panel contextual colapsable/drawer;
- targets touch >= 44×44;
- pinch zoom y pan cuando el renderer lo soporte de forma segura.

### Mobile

- no comprimir el layout Desktop;
- canvas a pantalla completa cuando corresponda;
- bottom sheets/pantallas dedicadas;
- Builder móvil completo no es requisito de lanzamiento si tablet/desktop cubren la operación del proveedor.

En Seating Workspace, un lugar visual puede ser menor que 44×44 px; su **hit target interactivo** debe ampliarse sin alterar la escala visual del plano.

## 14. Estados visuales mínimos

Cada Mesa debe poder comunicar mediante texto/forma/estado visual:

- normal;
- seleccionada;
- con disponibilidad;
- completa;
- read-only;
- conflicto/actualización cuando corresponda.

Cada lugar detallado debe comunicar:

- libre;
- ocupado;
- bloqueado;
- seleccionado;
- conflicto/actualización.

No introducir `sobrecupo` como comportamiento permitido si el backend lo prohíbe; la UI representa el contrato, no lo redefine.

## 15. Performance

Validar al menos escenarios de:

- 50 Mesas;
- 100 Mesas;
- 200 Mesas en modo por Mesa;
- 50 lugares en Evento boutique;
- 150 lugares en modo detallado;
- listas grandes de asistentes en Seating Workspace.

El objetivo no es un benchmark gráfico aislado sino mantener selección, pan/zoom, movimiento y asignación utilizables durante un Evento real.

El renderer no debe re-renderizar todos los lugares en cada cambio de selección si puede evitarse con la arquitectura actual.

## 16. Fuera de alcance del lanzamiento

- herramienta CAD;
- geometría libre avanzada sin necesidad demostrada;
- constructor self-service para Planner;
- migración de stack visual por paridad con legacy;
- nueva entidad `Sticker` de negocio;
- OCR/detección automática de sillas;
- reconstrucción vectorial de un plano;
- auto-seating por afinidad;
- asignación por lugar exacto para `PHYSICAL_QR` en esta iteración;
- nuevas reglas de negocio escondidas dentro del refactor visual.

La asignación persistente por lugar exacto **sí está autorizada** para `FLYER`, `FLIPBOOK` y `DEMO` conforme a `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`.

## 17. Referencia renderizada

Archivo existente: `docs/03-diseno/assets/floorplan-sticker-flow-target.svg`.

Se considera referencia histórica/visual. Si contradice esta especificación, el contrato técnico o el perfil operator-led, prevalecen los documentos normativos vigentes.

Para montajes irregulares, la meta visual no es reproducir una Mesa geométricamente perfecta: es permitir que los lugares individuales coincidan con las sillas/posiciones que el plano real comunica.