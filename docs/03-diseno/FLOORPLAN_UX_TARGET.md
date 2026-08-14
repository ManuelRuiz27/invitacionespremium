# Meta visual y de interacción — Croquis V2 / Sticker Model

Estado: **Referencia UX oficial para Croquis V2**, subordinada a `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md` y `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`.

## 1. Objetivo

Croquis V2 debe sentirse como una herramienta visual de preparación de salón, no como CAD ni como un formulario técnico.

El lanzamiento separa dos experiencias:

- **Builder del proveedor:** InvitacionesPremium construye el espacio.
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

## 4. Catálogo inicial de stickers

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

## 5. Interacción del Builder

Una operación base debe poder realizarse sin abrir controles avanzados.

Acciones esperadas según el tipo de sticker y los permisos/estado del Evento:

- colocar con click/tap o drag;
- seleccionar;
- arrastrar;
- rotar;
- duplicar;
- redimensionar cuando aplique;
- renombrar/etiquetar;
- editar capacidad cuando aplique;
- eliminar con confirmación contextual cuando corresponda;
- undo/redo;
- zoom/pan/ajustar vista.

No mostrar como UI primaria:

- `x/y`;
- grados numéricos salvo necesidad avanzada demostrada;
- IDs;
- `TABLE`, `DECORATIVE_ZONE`;
- nombres de geometría interna;
- JSON/layout schema.

## 6. Progressive Disclosure

### Estado base

Al seleccionar un objeto mostrar únicamente:

- nombre/etiqueta;
- capacidad si es Mesa;
- ocupación si el contexto la requiere;
- acciones frecuentes;
- acceso a `Más opciones` sólo cuando existan propiedades secundarias.

### Controles avanzados

Color, propiedades visuales poco frecuentes, datos técnicos permitidos o ajustes finos se revelan bajo una acción secundaria.

La interfaz no debe transformar un sticker sencillo en un formulario largo permanente.

## 7. Mesa seleccionada

Ejemplo conceptual:

```text
Mesa 12
8 / 10 lugares asignados
2 disponibles

[Nombre]
[Capacidad]

[Duplicar] [Más opciones]
```

En Builder no es obligatorio exponer asignación de invitados. La asignación cotidiana pertenece al Seating Workspace de Planner.

## 8. Seating Workspace de Planner

La Planner recibe el Croquis ya construido.

Reglas visuales:

- geometría read-only;
- una Mesa se puede seleccionar;
- búsqueda de invitados;
- filtros por estado/grupo cuando estén soportados;
- asignar selección a Mesa;
- mover entre Mesas;
- desasignar;
- acciones de familia/grupo conforme al contrato actual;
- mostrar ocupación/capacidad;
- reaccionar a cambios realtime y conflictos de concurrencia.

El workspace vigente en `apps/client/src/workspace/SeatingWorkspace.tsx` es la base funcional y no debe sustituirse por código legacy.

### Modelo mental

```text
Persona → Mesa
```

La Planner controla **quién se sienta dónde**, no la infraestructura del salón.

## 9. Resumen y pendientes

El producto debe poder proyectar de forma clara:

- capacidad total;
- asistentes confirmados;
- asistentes con Mesa;
- asistentes sin Mesa;
- disponibilidad por Mesa;
- blockers contractuales antes de activación/cierre operativo.

No usar color como único indicador.

Una futura experiencia `Resolver pendientes` puede agrupar problemas accionables, pero no es requisito para el primer piloto si el workspace actual permite resolverlos con seguridad.

## 10. Día del Evento

El croquis operativo es read-only para geometría.

Puede mostrar estado de check-in/ocupación a partir de la infraestructura realtime/REST existente. No crear una segunda vía de sincronización.

Scanner y Staff conservan sus reglas de mínima exposición de datos.

## 11. Responsive

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

## 12. Estados visuales mínimos

Cada Mesa debe poder comunicar mediante texto/forma/estado visual:

- normal;
- seleccionada;
- con disponibilidad;
- completa;
- read-only;
- conflicto/actualización cuando corresponda.

No introducir `sobrecupo` como comportamiento permitido si el backend lo prohíbe; la UI representa el contrato, no lo redefine.

## 13. Performance

Validar al menos escenarios de:

- 50 Mesas;
- 100 Mesas;
- 200 Mesas;
- listas grandes de asistentes en Seating Workspace.

El objetivo no es un benchmark gráfico aislado sino mantener selección, pan/zoom, movimiento y asignación utilizables durante un Evento real.

## 14. Fuera de alcance del lanzamiento

- herramienta CAD;
- geometría libre avanzada sin necesidad demostrada;
- constructor self-service para Planner;
- migración de stack visual por paridad con legacy;
- nueva entidad `Sticker` de negocio;
- asignación persistente por silla/asiento como requisito del Croquis V2 inicial;
- nuevas reglas de negocio escondidas dentro del refactor visual.

La representación visual de sillas puede seguir existiendo si ya es compatible con el modelo actual, pero una nueva capability persistente de `SeatAssignment` queda en **Not now** hasta evidencia posterior.

## 15. Referencia renderizada

Archivo existente: `docs/03-diseno/assets/floorplan-sticker-flow-target.svg`.

Se considera referencia histórica/visual. Si contradice esta especificación, el contrato técnico o el perfil operator-led, prevalecen los documentos normativos vigentes.
