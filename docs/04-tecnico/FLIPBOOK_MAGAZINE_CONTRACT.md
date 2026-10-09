# Contrato técnico — Flipbook público estilo Magazine

Estado: **APPROVED / SOURCE OF TRUTH**  
Alcance: renderer público de Invitaciones `FLIPBOOK` en `apps/client`.  
Referencia visual: experiencia **Magazine** de Heyzine únicamente como benchmark de interacción; no es dependencia, contrato API ni autorización para copiar branding, assets o funcionalidades ajenas.

## 1. Objetivo

El Flipbook público debe comportarse como una publicación física: portada, hojas con giro realista, spreads en desktop cuando corresponde y una hoja por vista en mobile.

Un carrusel, slideshow, fade o simple sustitución de imágenes no satisface este contrato.

Este contrato modifica sólo presentación/interacción frontend. No cambia dominio, persistencia, API, readiness, pricing, FileAsset, QR, RSVP ni cardinalidades de Hotspots.

## 2. Fuentes relacionadas

Aplicar conjuntamente:

1. `docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md` — páginas, `pageId`, Hotspots, cardinalidades y readiness.
2. `docs/04-tecnico/PUBLIC_RSVP_CONTRACT.md` — proyección pública, assets, QR y seguridad.
3. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md` — principios visuales generales.
4. este contrato — comportamiento especializado del renderer público Flipbook.
5. `docs/05-implementacion/UI03A_FLIPBOOK_MAGAZINE_RENDERER.md` — implementación y QA.

Si una referencia visual contradice dominio o seguridad, prevalecen los contratos técnicos.

## 3. Invariantes de dominio

No modificar:

- `InvitationDesign`, `FlipbookPage` ni `Hotspot`;
- IDs, orden u ownership de páginas;
- coordenadas normalizadas `x`, `y`, `width`, `height`;
- cardinalidades/readiness;
- endpoints públicos o autenticados;
- `contentPath` de assets;
- QR/RSVP;
- Prisma, migraciones u OpenAPI.

Cada página real sigue siendo una entidad independiente. El spread es sólo una proyección visual. Cada Hotspot pertenece a un `flipbookPageId` estable.

## 4. Modelo físico de paginado

Las páginas activas se ordenan por `position ASC`.

### 4.1 Desktop / landscape

Para reproducir una publicación física con cubiertas:

- posición `1` = portada visual, mostrada individualmente;
- posición `N` = contraportada visual cuando `N > 1`, mostrada individualmente;
- las páginas interiores `2..N-1` se emparejan secuencialmente en spreads de dos hojas;
- si el número de páginas interiores es impar, la última interior queda individual antes de la contraportada;
- no se crean páginas ficticias, duplicadas ni persistidas para corregir paridad.

Ejemplos normativos:

```text
N=1  -> [1]
N=2  -> [1] [2]
N=3  -> [1] [2] [3]
N=4  -> [1] [2|3] [4]
N=5  -> [1] [2|3] [4] [5]
N=6  -> [1] [2|3] [4|5] [6]
N=10 -> [1] [2|3] [4|5] [6|7] [8|9] [10]
```

Esta semántica sustituye la regla anterior que exigía `N=5 -> [1] [2|3] [4|5]`. La regla anterior no representaba una publicación con cubierta posterior física y obligaba a pelear contra el modelo nativo del engine.

`position=1` y `position=N` son roles visuales únicamente; no obtienen permisos, acciones ni reglas de readiness especiales.

### 4.2 Mobile / portrait

Cada `FlipbookPage` se muestra individualmente en orden `1..N`.

Cambiar orientación no altera `pageId`, `position`, Hotspots ni backend. Debe conservarse la página focal real que el usuario estaba leyendo.

## 5. Page turn

El cambio de página debe comunicar una hoja física mediante como mínimo:

- perspectiva;
- giro sobre eje Y;
- `transform-origin` según dirección;
- clipping/máscara;
- sombra dinámica;
- stacking/z-index correcto.

Avanzar gira de derecha a izquierda; retroceder invierte el movimiento.

Implementación aprobada actualmente: `@gullabs/react-flipbook` como wrapper React y `@gullabs/flipbook-core` como engine HTML. Cada `FlipbookPage` real debe ser un child directo del engine; nunca un spread preagrupado.

`hardCovers` representa primera y última hoja como cubiertas físicas. No se debe reimplementar manualmente el pairing de spreads mientras el engine sea autoridad de `visiblePages`/orientation.

## 6. Navegación

Debe soportar:

- anterior/siguiente visible;
- `ArrowLeft` / `ArrowRight`;
- swipe horizontal;
- controles touch >= 44×44 px.

Mientras exista giro activo no puede iniciar otra navegación. Clicks, teclado o swipes repetidos no deben saltar páginas ni dejar estado intermedio.

Estados conceptuales mínimos:

```text
idle -> turning -> settling -> idle
```

Mostrar `Página X de N`; en spread puede mostrarse `2–3 de N`.

## 7. Responsive

Usar el sistema responsive existente.

### Desktop

- portada y contraportada individuales;
- interiores en dos hojas cuando la paridad lo permite;
- interior individual permitido por paridad;
- sin scroll horizontal accidental.

### Mobile

- una hoja visible;
- swipe prioritario + controles accesibles;
- sin spread forzado.

Resize/orientation debe conservar la página focal real.

## 8. Assets

- preservar aspect ratio;
- no deformar ni recortar contenido;
- `object-fit: contain` o equivalente;
- fondo neutro cuando el asset no llena la hoja;
- tolerar relaciones de aspecto distintas;
- usar exclusivamente el mecanismo seguro de assets públicos existente.

## 9. Hotspots por página

Cada página visible conserva su propio `HotspotLayer`.

```text
LeftPage -> HotspotLayer(pageId izquierdo)
RightPage -> HotspotLayer(pageId derecho)
```

Las coordenadas `[0,1]` se proyectan contra el rectángulo renderizado de esa página, nunca contra el spread completo.

Durante cualquier giro:

- la hoja animada no acepta pointer events;
- sus Hotspots no son focusables;
- anchors de `LOCATION`, `GIFT_REGISTRY` y `EXTERNAL_LINK` deben bloquear navegación real, no sólo declarar `aria-disabled`;
- al volver a `idle`, sólo las páginas visibles son interactivas.

Conservar sin reinterpretar:

- `RSVP`;
- `LOCATION`;
- `GIFT_REGISTRY`;
- `QR_AREA`;
- `EXTERNAL_LINK`.

## 10. Precarga y rendimiento

- carga prioritaria de páginas inicialmente visibles;
- precargar hojas inmediatamente adyacentes según `visiblePages`;
- no marcar las 10 páginas como eager;
- evitar flash blanco/asset roto entre hojas ya precargadas;
- objetivo visual: ~60 fps desktop moderno y experiencia estable ~30 fps móvil gama media;
- no realizar trabajo proporcional a todas las páginas en cada frame.

El warning genérico de Vite por chunk >500 kB no bloquea UI-03A por sí solo. La optimización/lazy-loading del engine puede tratarse separadamente si medición real demuestra impacto.

## 11. Reduced motion y accesibilidad

Con `prefers-reduced-motion: reduce`:

- giro 3D prolongado deshabilitado;
- navegación/Hotspots preservados;
- transición instantánea o mínima.

Además:

- navegación por teclado;
- focus visible;
- nombre accesible `Página X de N`;
- controles con labels claros;
- páginas ocultas no deben quedar focusables ni duplicadas al lector de pantalla.

## 12. Dependencias y licencias

Dependencias aprobadas:

- `@gullabs/react-flipbook@3.1.0` — MIT;
- `@gullabs/flipbook-core@3.1.0` — MPL-2.0.

La aplicación debe conservar `THIRD_PARTY_NOTICES.md` con nombre, licencia y fuente upstream del core. La MPL-2.0 no cambia la licencia de InvitacionesPremium.

No se permite iframe, runtime remoto ni branding de terceros para renderizar la invitación.

## 13. Escenarios obligatorios de QA

Cubrir como mínimo:

1. N=1;
2. N=2;
3. N=3: `[1] [2] [3]`;
4. N=4: `[1] [2|3] [4]`;
5. N=5: `[1] [2|3] [4] [5]`;
6. N=6: `[1] [2|3] [4|5] [6]`;
7. N=10: `[1] [2|3] [4|5] [6|7] [8|9] [10]`;
8. Hotspot en portada;
9. Hotspot en hoja izquierda;
10. Hotspot en hoja derecha;
11. QR interior;
12. links externos bloqueados durante giro;
13. avance/retroceso;
14. spam de navegación;
15. swipe móvil;
16. teclado;
17. desktop -> mobile -> desktop preservando página focal;
18. reduced motion;
19. assets con distinta relación de aspecto;
20. asset adyacente cargando.

## 14. No-go

Este trabajo no autoriza:

- backend, Prisma, migraciones u OpenAPI;
- cambios a DTO/API/readiness/cardinalidades;
- nuevas acciones o múltiples QR;
- PDF, multimedia, analytics, descarga offline, bookshelf o themes tipo Heyzine;
- páginas ficticias para modificar paridad;
- preagrupar dos páginas reales dentro de un único child del engine;
- modificar Flyer salvo regresión compartida demostrada.

## 15. Definition of Done

Cumplido cuando:

- el renderer no es carrusel/fade;
- cada página real es una hoja física independiente;
- portada/contraportada/spreads cumplen este modelo;
- page-turn es perceptiblemente físico;
- Hotspots permanecen correctos por `pageId`;
- navegación concurrente está bloqueada;
- desktop/mobile/reduced-motion funcionan;
- precarga adyacente funciona;
- `THIRD_PARTY_NOTICES.md` está presente;
- tests y QA visual cubren escenarios normativos;
- no cambió API, schema, dominio ni readiness.
