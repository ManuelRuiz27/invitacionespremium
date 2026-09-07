# Contrato técnico — Flipbook público estilo Magazine

Estado: **APPROVED / SOURCE OF TRUTH**  
Alcance: renderer público de Invitaciones `FLIPBOOK` en `apps/client`.  
Referencia visual: experiencia **Magazine** de Heyzine únicamente como benchmark de interacción; no es dependencia, contrato API ni autorización para copiar branding, assets o funcionalidades ajenas a InvitacionesPremium.

## 1. Objetivo

El Flipbook público debe comportarse visualmente como una publicación física/revista: portada individual, páginas interiores enfrentadas cuando el viewport lo permite y transición de hoja con profundidad, giro y sombra.

El comportamiento actual de reemplazar una imagen por otra no satisface este contrato aunque incluya fade, botones o swipe.

Este contrato modifica **sólo presentación e interacción frontend**. No cambia dominio, persistencia, API, readiness, pricing, FileAsset, QR, RSVP ni cardinalidades de Hotspots.

## 2. Fuentes de verdad relacionadas

Aplicar conjuntamente:

1. `docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md` — páginas, `pageId`, Hotspots, cardinalidades y readiness.
2. `docs/04-tecnico/PUBLIC_RSVP_CONTRACT.md` — proyección pública, assets, QR y seguridad.
3. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md` — principios visuales generales.
4. este contrato — comportamiento especializado del renderer público Flipbook.
5. `docs/05-implementacion/UI03A_FLIPBOOK_MAGAZINE_RENDERER.md` — orden de implementación y QA.

Si una referencia visual contradice dominio o seguridad, prevalecen los contratos técnicos.

## 3. Invariantes de dominio

No modificar:

- `InvitationDesign`;
- `FlipbookPage`;
- `Hotspot`;
- IDs, orden o ownership de páginas;
- coordenadas normalizadas `x`, `y`, `width`, `height`;
- cardinalidades de acciones;
- readiness;
- endpoints públicos o autenticados;
- `contentPath` de assets;
- generación/visibilidad del QR;
- lógica RSVP;
- freeze del diseño después de activación;
- Prisma, migraciones u OpenAPI.

El spread es únicamente una **proyección visual**. Una página continúa siendo la unidad persistida y un Hotspot continúa perteneciendo a un `flipbookPageId` estable.

## 4. Modelo visual de paginado

Las páginas activas se ordenan por `position ASC`.

### 4.1 Portada

La página en posición `1` se muestra individualmente y centrada al abrir la invitación.

`position=1` es portada sólo como concepto visual; no obtiene permisos, acciones ni reglas de readiness especiales.

### 4.2 Spreads interiores

En modo de doble página:

- `2–3` forman el primer spread;
- `4–5` forman el segundo;
- `6–7`, etc.

Si después del emparejamiento queda una única página final, se muestra individualmente como cierre/contraportada visual.

Ejemplos:

```text
N=1 -> [1]
N=2 -> [1] [2]
N=3 -> [1] [2|3]
N=4 -> [1] [2|3] [4]
N=5 -> [1] [2|3] [4|5]
N=10 -> [1] [2|3] [4|5] [6|7] [8|9] [10]
```

No duplicar páginas ficticias para completar spreads y no alterar `position`.

### 4.3 Modo de una página

En viewport reducido cada `FlipbookPage` se muestra individualmente en el orden `1..N`.

Cambiar entre modo single/spread por responsive no cambia el índice persistido, `pageId`, Hotspots ni datos del backend.

## 5. Requerimientos funcionales

### FB-MAG-01 — Renderer tipo publicación

`FlipbookRenderer` debe renderizar una publicación con profundidad visual. No se acepta como cumplimiento un carrusel, slideshow o sustitución de `<img>` con fade.

### FB-MAG-02 — Page turn real

Al avanzar o retroceder debe existir una transición de hoja que comunique físicamente el cambio mediante, como mínimo:

- perspectiva;
- rotación sobre eje Y;
- `transform-origin` coherente con el sentido del giro;
- clipping/máscara de la hoja durante la transición;
- sombra dinámica entre hoja activa y contenido revelado;
- stacking/z-index coherente.

Puede implementarse con un engine/librería especializada o con implementación local mantenible. No se permite iframe ni servicio remoto de terceros para renderizar la invitación.

### FB-MAG-03 — Dirección

Avanzar gira la hoja de derecha a izquierda. Retroceder reproduce el movimiento inverso.

### FB-MAG-04 — Navegación

Debe soportar:

- control anterior/siguiente visible;
- `ArrowLeft` / `ArrowRight` en teclado;
- swipe horizontal táctil;
- click/tap de controles con target táctil mínimo de 44×44 px.

El arrastre continuo de esquina siguiendo el dedo/cursor es opcional para esta iteración; no debe retrasar el cumplimiento del page turn disparado por navegación/swipe.

### FB-MAG-05 — Exclusión de transiciones concurrentes

Mientras `transitionState !== idle` no puede iniciarse otra navegación. Clicks, teclado o swipes repetidos no deben saltar páginas ni dejar un estado visual intermedio.

Estados mínimos conceptuales:

```text
idle -> turning -> settling -> idle
```

No es obligatorio persistir estos estados ni exponerlos por API.

### FB-MAG-06 — Indicador

Mostrar posición comprensible `Página X de N` o equivalente visual accesible. En spread, el indicador puede presentar `2–3 de N`, pero los nombres accesibles deben seguir identificando cada página real.

### FB-MAG-07 — Límite

No navegar antes de la página 1 ni después de la última página. Los controles de límite deben quedar deshabilitados o ausentes de forma accesible.

## 6. Responsive

Usar breakpoints existentes del theme; no crear un sistema responsive paralelo.

### >= `md`

- portada individual;
- interior en spread de dos páginas;
- página final individual si queda impar después de la portada;
- navegación lateral disponible;
- ancho máximo limitado por viewport y altura disponible, sin scroll horizontal de la página.

### < `md`

- una página visible a la vez;
- swipe como interacción primaria complementada por controles accesibles;
- sin spread forzado;
- sin desbordamiento horizontal accidental.

Un resize u orientation change debe recomponer la vista sin perder la página lógica que el usuario estaba leyendo. Si estaba visible cualquiera de las páginas de un spread, al pasar a single debe conservarse una de esas páginas, preferentemente la página actualmente activa/focal.

## 7. Render de assets

- preservar aspect ratio;
- nunca deformar ni estirar una página;
- no aplicar crop que elimine contenido de la invitación;
- usar `object-fit: contain` o equivalente;
- fondo neutro detrás de páginas cuando la relación de aspecto no llene el viewport;
- mostrar gutter/centro visual en spread sin modificar la imagen original;
- portada, spreads y cierre deben conservar una escala visual coherente.

Las páginas pueden tener relaciones de aspecto distintas. El renderer debe tolerarlo sin romper navegación ni Hotspots.

## 8. Hotspots por página

### FB-MAG-08 — Ownership

Cada `Hotspot` se renderiza exclusivamente sobre su `flipbookPageId`.

En un spread existen dos capas independientes:

```text
LeftPage
  └─ HotspotLayer(pageId izquierdo)
RightPage
  └─ HotspotLayer(pageId derecho)
```

No crear una capa única de coordenadas para el spread.

### FB-MAG-09 — Coordenadas

Las coordenadas normalizadas existentes `[0,1]` se proyectan contra el rectángulo real renderizado de **esa página**, no contra viewport, libro completo o spread.

### FB-MAG-10 — Durante animación

Los Hotspots de una hoja que está girando no son interactivos mientras `transitionState !== idle`.

Al finalizar:

- sólo Hotspots de páginas visibles pueden recibir interacción;
- acciones no visibles no permanecen focusables;
- la navegación no debe disparar accidentalmente RSVP, ubicación, regalos, QR o enlace externo.

### FB-MAG-11 — Acciones vigentes

Conservar sin reinterpretar:

- Confirmar asistencia (`RSVP`);
- Ubicación (`LOCATION`);
- Mesa de regalos (`GIFT_REGISTRY`);
- Mostrar QR (`QR_AREA`);
- Enlace adicional (`EXTERNAL_LINK`).

Cualquier página activa puede contener cualquiera de estas acciones conforme a `INVITATION_DESIGN_CONTRACT.md`.

## 9. Precarga y rendimiento

### FB-MAG-12 — Carga prioritaria

Cargar de forma prioritaria sólo las páginas visibles del estado inicial.

### FB-MAG-13 — Precarga adyacente

Después de estabilizar la vista, precargar assets necesarios para la vista lógica anterior y siguiente. No marcar las 10 páginas como `eager` simultáneamente.

### FB-MAG-14 — Sin flash

La transición no debe mostrar un frame blanco/roto entre páginas ya disponibles. Si el siguiente asset aún no está listo, mantener el estado actual hasta contar con una representación válida o mostrar un placeholder integrado que no cambie el orden lógico.

### FB-MAG-15 — Objetivo de fluidez

Objetivo de QA visual:

- desktop moderno: transición visual cercana a 60 fps;
- móvil gama media: al menos experiencia estable cercana a 30 fps;
- no bloquear el main thread con trabajo proporcional a todas las páginas en cada frame.

Los números son objetivos de experiencia, no métricas de backend.

## 10. Reduced motion y accesibilidad

Si `prefers-reduced-motion: reduce`:

- no ejecutar giro 3D prolongado;
- conservar navegación y lectura;
- usar transición mínima/no animada sin ocultar contenido;
- no degradar Hotspots, focus ni indicador.

Además:

- `FlipbookRenderer` es navegable por teclado;
- focus visible;
- cada página tiene nombre accesible `Página X de N`;
- los controles tienen `aria-label` claro;
- contenido visual no depende exclusivamente de animación para comprender el estado;
- páginas ocultas/traseras no deben quedar disponibles al lector de pantalla como duplicados simultáneos.

## 11. Arquitectura frontend objetivo

Arquitectura conceptual, no nuevas entidades de dominio:

```text
FlipbookRenderer
├─ FlipbookViewport
│  ├─ VisiblePage / LeftPage
│  │  └─ HotspotLayer
│  ├─ RightPage (spread cuando aplica)
│  │  └─ HotspotLayer
│  └─ TurningPage
├─ FlipbookNavigation
└─ FlipbookProgress
```

Puede factorizarse en componentes/hooks locales dentro de `apps/client/src/public/invitation/` si mejora pruebas y legibilidad.

No crear package compartido nuevo salvo necesidad demostrada. No mover lógica de dominio al renderer.

## 12. Dependencias

Antes de agregar una librería de page-flip, verificar:

- compatibilidad con React 19/Vite actuales;
- licencia permisiva apta para producto comercial;
- ausencia de runtime remoto, iframe o branding obligatorio;
- bundle razonable;
- soporte touch;
- control sobre DOM suficiente para mantener `HotspotLayer` por página;
- soporte o fallback para reduced motion;
- actividad/mantenimiento suficiente.

Evaluar como máximo dos alternativas. Si ninguna conserva Hotspots y accesibilidad correctamente, implementar la transición localmente con CSS/React en vez de degradar el contrato.

Toda dependencia nueva debe quedar justificada en el reporte final del ticket.

## 13. Escenarios obligatorios

QA debe cubrir como mínimo:

1. 1 página;
2. 2 páginas;
3. 3 páginas: portada + spread `2–3`;
4. 4 páginas: portada + `2–3` + cierre `4`;
5. 5 páginas: portada + `2–3` + `4–5`;
6. 10 páginas;
7. Hotspot en portada;
8. Hotspot en página izquierda de spread;
9. Hotspot en página derecha de spread;
10. QR en página interior;
11. avance y retroceso;
12. spam de navegación durante transición;
13. swipe móvil;
14. teclado desktop;
15. cambio desktop -> mobile -> desktop conservando página lógica;
16. reduced motion;
17. assets con distinta relación de aspecto;
18. asset adyacente aún cargando;
19. QR no disponible conforme al contrato público;
20. URL externa/ubicación/regalos conservando comportamiento existente.

## 14. No-go

Este trabajo no autoriza:

- cambios backend;
- migraciones;
- cambios Prisma;
- endpoints nuevos;
- cambios a payload público;
- cambios de readiness;
- nuevas acciones/Hotspots;
- múltiples QR;
- convertir PDF;
- audio/video/iframes/widgets multimedia;
- descarga offline;
- analytics de lectura;
- bookshelf;
- temas configurables tipo Heyzine;
- copiar UI, logos o assets de Heyzine;
- modificar Flyer salvo regresión compartida demostrada.

## 15. Definition of Done

El contrato se considera implementado cuando:

- el renderer ya no se comporta como slideshow/carrusel;
- portada individual y spreads cumplen el modelo definido;
- existe page turn con profundidad real salvo reduced motion;
- Hotspots permanecen vinculados y correctamente proyectados por `pageId`;
- navegación concurrente está bloqueada;
- desktop/mobile/reduced-motion funcionan;
- precarga adyacente evita flash sin cargar todo eager;
- no cambió API, schema, dominio ni readiness;
- tests automatizados y QA visual cubren los escenarios obligatorios.
