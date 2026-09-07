# UI-03A — Flipbook público estilo Magazine

Estado: **READY FOR CODE**  
Prioridad: **P0**  
Tipo: frontend interaction / public invitation renderer  
Contrato especializado: `docs/04-tecnico/FLIPBOOK_MAGAZINE_CONTRACT.md`

## 1. Objetivo

Sustituir el comportamiento actual de `FlipbookRenderer` —una sola imagen visible con navegación secuencial y fade— por un renderer tipo publicación/revista con portada individual, spreads interiores en desktop, single page en mobile y page-turn realista.

No cambiar backend ni dominio.

## 2. Lectura obligatoria

Leer en este orden antes de editar:

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/05-implementacion/14_CODEX_RULES.md`
4. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`
5. `docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md`
6. `docs/04-tecnico/PUBLIC_RSVP_CONTRACT.md`
7. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`
8. `docs/04-tecnico/FLIPBOOK_MAGAZINE_CONTRACT.md`
9. este ticket.

La referencia visual “Magazine” de Heyzine sirve sólo para comprender la categoría de interacción. No copiar código, branding, assets ni agregar Heyzine como runtime.

## 3. Baseline confirmado

Archivo principal actual:

`apps/client/src/public/invitation/FlipbookRenderer.tsx`

Baseline observado:

- ordena `view.design.pages` por `position`;
- mantiene un `index` de página;
- muestra una única `PublicAssetImage`;
- filtra Hotspots por `flipbookPageId` de esa página;
- soporta teclado izquierda/derecha;
- soporta swipe con threshold de 40 px;
- precarga página anterior/siguiente ocultas;
- usa `opacity .22s ease` cuando reduced motion no está activo;
- usa `HotspotLayer` existente.

Ese baseline debe preservarse en semántica de navegación/acciones, pero el fade/single-image no satisface el nuevo contrato visual.

## 4. Software archaeology obligatorio

Inspeccionar antes de elegir arquitectura:

- `apps/client/src/public/invitation/FlipbookRenderer.tsx`
- `apps/client/src/public/invitation/HotspotLayer.tsx`
- `apps/client/src/public/invitation/FlyerRenderer.tsx` (`PublicAssetImage`)
- `apps/client/src/public/invitation/InvitationRenderer.tsx`
- `apps/client/src/public/invitation/PublicInvitationPage.tsx`
- `apps/client/src/public/useReducedMotion.ts`
- `apps/client/src/public/public-client.test.tsx`
- `apps/client/src/public/public-hardening.test.tsx`
- `apps/client/package.json`
- lockfile del monorepo.

Reportar antes de implementar:

1. qué puede reutilizarse sin cambios;
2. qué necesita refactor local;
3. si se requiere dependencia nueva;
4. superficie exacta de tests afectada.

No detener la tarea para pedir confirmación sobre detalles ya cerrados en `FLIPBOOK_MAGAZINE_CONTRACT.md`.

## 5. Implementación requerida

### 5.1 Modelo de vistas lógicas

Construir una proyección derivada desde páginas ordenadas; no persistirla.

Desktop `>= md`:

```text
[1]
[2|3]
[4|5]
...
[N] si sobra una final
```

Mobile `< md`:

```text
[1] [2] [3] ... [N]
```

La función de agrupación debe ser pura y tener tests unitarios.

### 5.2 Estado

Separar como mínimo:

- página lógica/focal actual;
- dirección `forward | backward`;
- transición `idle | turning | settling` o abstracción equivalente;
- modo `single | spread` derivado del breakpoint.

No usar posición de array como identidad de Hotspot.

### 5.3 Page-turn

Implementar el efecto definido por `FB-MAG-02` y `FB-MAG-03`.

No aceptar como solución final:

- fade entre imágenes;
- translate horizontal de carrusel;
- slider CSS sin hoja;
- GIF/video pre-renderizado;
- iframe externo.

El giro debe operar con páginas DOM reales para que cada página pueda contener su `HotspotLayer`.

### 5.4 Hotspots

Reutilizar `HotspotLayer`; no duplicar lógica de acciones.

Crear una capa por página visible y proyectarla sobre el rectángulo real de esa página.

Durante giro:

- desactivar pointer events de hoja animada;
- evitar focus en Hotspots ocultos/traseros;
- reactivar únicamente al volver a `idle`.

### 5.5 Navegación

Conservar/mejorar:

- botones;
- teclado;
- swipe.

Bloquear navegación adicional durante giro.

La navegación debe operar por página lógica, no simplemente `index + 1` cuando desktop está mostrando un spread.

### 5.6 Responsive

Usar MUI/theme existente. No crear breakpoints hardcoded paralelos.

Al cambiar `single <-> spread`, conservar la página real/focal actual.

### 5.7 Assets

Reutilizar el mecanismo seguro existente de `PublicAssetImage`/API para leer assets. No introducir URLs públicas directas de storage.

Precargar la vista lógica anterior y siguiente. No hacer eager de todo el Flipbook.

### 5.8 Reduced motion

Reutilizar `useReducedMotion()`.

Con reduced motion activo:

- eliminar giro 3D prolongado;
- cambiar de vista de manera inmediata o mínima;
- conservar todas las funciones y Hotspots.

## 6. Dependencia de page-flip

Si la implementación local resulta desproporcionada, se permite agregar **una** dependencia especializada después de evaluar como máximo dos.

Antes de incorporarla documentar en el cierre:

- nombre/versión;
- licencia;
- compatibilidad React 19 + Vite;
- tamaño/impacto aproximado;
- touch;
- DOM/control suficiente para Hotspots;
- ausencia de iframe/runtime remoto/branding obligatorio.

No integrar una librería que obligue a renderizar cada página como bitmap/canvas si eso impide Hotspots DOM accesibles.

## 7. Archivos esperados

Se autoriza modificar, según necesidad demostrada:

- `apps/client/src/public/invitation/FlipbookRenderer.tsx`;
- nuevos componentes/hooks locales en `apps/client/src/public/invitation/`;
- tests públicos existentes o nuevos tests locales;
- `apps/client/package.json` + lockfile sólo si se justifica una dependencia.

No tocar backend, Prisma, OpenAPI, Admin, Scanner, Croquis ni Finance.

## 8. Tests obligatorios

Automatizar como mínimo:

1. agrupación desktop para N=1,2,3,4,5,10;
2. mobile siempre individual `1..N`;
3. portada individual;
4. cierre individual cuando sobra página;
5. forward/backward correctos por vista lógica;
6. límites de navegación;
7. spam de navegación durante transición no salta vistas;
8. teclado;
9. swipe;
10. reduced motion;
11. Hotspot de página izquierda sólo pertenece a izquierda;
12. Hotspot de página derecha sólo pertenece a derecha;
13. Hotspot no visible no es interactivo/focusable;
14. Hotspots de hoja en giro están desactivados;
15. resize single -> spread conserva página lógica;
16. resize spread -> single conserva página focal;
17. QR disponible/no disponible conserva comportamiento existente;
18. LOCATION/GIFT_REGISTRY/EXTERNAL_LINK conservan comportamiento;
19. assets mantienen orden por `position`;
20. error/sin páginas conserva fallback actual seguro.

No probar la animación sólo con snapshots de CSS. Los tests deben verificar estado, agrupación, navegación y disponibilidad de interacción.

## 9. QA visual obligatorio

Levantar `apps/client` y capturar evidencia reproducible de:

- portada cerrada/individual;
- giro hacia spread `2–3`;
- spread estable;
- giro inverso;
- cierre individual con N=4 o N=10;
- Hotspot izquierda;
- Hotspot derecha;
- mobile single page + swipe;
- reduced motion;
- viewport desktop y mobile.

El reporte debe indicar la ruta/token/fixture usado sin publicar secretos.

## 10. Fixture/demo local

Si el runtime local actual no ofrece una Invitación `FLIPBOOK` reproducible sin backend funcional, crear **únicamente infraestructura de fixture/dev/test ya compatible con los patrones existentes** para poder ejecutar QA local.

No:

- introducir mock oculto en producción;
- cambiar la API pública;
- saltarse `ApiClient` en runtime productivo;
- crear una ruta productiva secreta.

El escenario de desarrollo debe incluir al menos 5 páginas y Hotspots en páginas distintas para probar spreads.

## 11. Validaciones de cierre

Ejecutar como mínimo desde el monorepo según scripts existentes:

- lint de Client;
- typecheck de Client;
- tests de Client relevantes;
- build de Client.

Si existe suite raíz obligatoria en CI para cambios frontend, ejecutarla también.

No declarar terminado con tests omitidos sin justificar el bloqueo exacto.

## 12. No-go

No cambiar:

- DTO/API;
- backend;
- schema/migraciones;
- `InvitationDesign`/`FlipbookPage`/`Hotspot`;
- readiness;
- cardinalidades;
- reglas QR/RSVP;
- acceso a storage;
- Flyer salvo una adaptación compartida mínima y demostrada;
- editor del Wizard salvo que un test compartido requiera ajuste no funcional;
- UI general del sitio público fuera del viewport del Flipbook.

No agregar features de Heyzine como multimedia, analytics, descarga, bookshelf o custom themes.

## 13. Definition of Done

UI-03A termina cuando:

- `FlipbookRenderer` ya no es single-image + fade;
- portada/spreads/cierre cumplen el contrato;
- page-turn visual es perceptiblemente una hoja física;
- Hotspots funcionan por página en spread;
- navegación concurrente no rompe estado;
- desktop/mobile/reduced-motion están cubiertos;
- existe escenario local reproducible de QA;
- lint/typecheck/tests/build pasan;
- no hubo cambios de API/schema/dominio;
- se entrega resumen de archivos modificados, decisiones técnicas y evidencia visual.
