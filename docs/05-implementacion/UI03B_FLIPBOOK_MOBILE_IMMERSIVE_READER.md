# UI-03B — Flipbook Mobile Immersive Reader

Implementación y QA: 2026-09-23. Ámbito: Client público, fixture DEV y verificación del navegador. Sin cambios de dominio, API, persistencia ni dependencias del engine.

## Archaeology

- El shell público consumía ancho y altura con encabezado, márgenes y controles. En 390×844 la portada terminaba aproximadamente en y=855, antes de los controles.
- `@gullabs/flipbook-core` 3.1.0 calcula bounds desde ancho **y alto** del host, ratio 480/680 y límites. Su ResizeObserver y listener de visualViewport ya actualizan la geometría.
- `minWidth=280` interviene en la selección portrait (ancho disponible menor que dos páginas mínimas). `minHeight=396` imponía un suelo incompatible con landscape corto. Se conserva el umbral horizontal; se libera el mínimo vertical y CSS aporta un host acotado.
- `overflow:hidden` del stage recortaba la animación dentro del espacio reducido. Portrait mantenía escala, traslación, rotateX/rotateZ y volumen de desktop.
- `allowTouchScroll` utiliza PointerEvents y `touch-action: pan-y pinch-zoom`. El reconocimiento nativo de swipe tiene un límite fijo de 250 ms; gestos horizontales más lentos podían regresar a la misma página.
- Las pruebas anteriores usaban un mock del engine: no demostraban geometría física, curl, arbitraje táctil ni viewport dinámico.

## Implementación

- Un único HTMLFlipBook y estado compartido. Shell mobile a <768 CSS px y landscape táctil de altura ≤500 px; el engine sigue decidiendo orientación desde su host.
- Superficie `100dvh`, safe areas, controles de 56 px y 48 px de margen vertical para animación. Ancho físico `min(ancho disponible, 480, alto disponible × 480/680)`. Sin medición React por frame.
- La hoja móvil pierde inclinación y pila decorativa. Stage permite curl y sombra; el límite exterior del reader contiene overflow. Desktop conserva su presentación.
- Reader primero visualmente en móvil; confirmación, CalendarAction, alerts, álbum y resto del documento siguen accesibles mediante scroll.
- Controles 48×48, contador accesible y apertura `closed → lifting → opening → open`. Giro móvil 450 ms, desktop 720 ms, reduced motion sin animación.
- Gestos horizontales intencionales de hasta 1 s finalizan por la API de navegación compartida. Se cancela primero el drag capturado mediante PointerEvent estándar para que pointerleave no abandone el nuevo giro. Se conservan el seguimiento físico del dedo, pan vertical, precedencia de elementos interactivos y bloqueo de entradas concurrentes.
- Se conserva la hoja real focal al alternar portrait/spread/portrait. No se remonta el libro al cambiar reduced motion.
- Hit targets de hotspots ampliados sólo en presentación, limitados al asset y sin invadir otro target. Coordenadas, pageId/flipbookPageId y acciones no cambian. `object-fit:contain` permanece.
- Fixture `/__dev/flipbook-magazine` estrictamente DEV, sin API/storage. Parámetros `?pages=1|2|3|4|5|6|10`, `&mixed=1`, `&slow=1`. Usa el documento público real y abre RSVP/QR; no guarda respuestas ficticias.

## Verificación reproducible

```sh
pnpm --filter @invitaciones/client lint
pnpm --filter @invitaciones/client typecheck
pnpm --filter @invitaciones/client test -- src/public
pnpm --filter @invitaciones/client build
pnpm exec playwright install chromium webkit
pnpm exec playwright test -c playwright.flipbook.config.ts
```

La suite contiene 46 casos (23 por motor): 320×568, 360×800, 375×667, 390×844, 393×852, 412×915, 430×932; tablet 768×1024 y 1024×768; desktop 1440×1000. Verifica bounds, ratio, hoja única estable, overflow, controles, 1–10 páginas, portada/contraportada, curl real, swipe en ambos sentidos rápido/lento, spam, scroll vertical, orientación, reduced motion, preload adyacente, assets lentos y proporciones mixtas, safe areas y acceso al documento posterior. RSVP, QR, ubicación, regalos y enlace externo conservan página y bloqueo durante animación.

Evidencia en el mecanismo Playwright del proyecto: `test-results/ui03b/` y `playwright-report/ui03b/`. CI publica ambos como artefacto **ui03b-flipbook-evidence** durante 14 días. Capturas obligatorias, por motor:

- `mobile-390-cover.png`
- `mobile-390-interior.png`
- `mobile-390-turning.png`
- `mobile-390-hotspot.png`
- `mobile-320.png`
- `mobile-430.png`
- `desktop-cover.png`
- `desktop-spread.png`

El frame de curl usa reloj controlado para capturar una animación física reproducible. El resto de navegación y gestos se ejecuta con tiempo real.

## Límites de la evidencia

Chromium usa touch nativo vía CDP. WebKit ejecuta el engine real y PointerEvents simulados: Playwright no ofrece drag táctil nativo en WebKit. Cambios de altura y safe areas se verifican por emulación; no equivalen a operar las barras reales de Safari iOS/Chrome Android. No hubo teléfono físico disponible ni medición de FPS en hardware de gama media. Quedan pendientes esas comprobaciones manuales; no se afirma certificación física ≥30 fps ni cierre de esa parte de la DoD.

El build conserva el aviso previo de chunks >500 kB. CI previo de main fallaba por formato, incluido formato ajeno en Landing/Scanner/scripts; se aplica exclusivamente Prettier a esos cinco archivos para desbloquear el gate, sin cambios funcionales.

Durante la implementación concurrente, el primer conjunto de cambios del shell quedó incluido en `2e5ae7a4672f1599fec65aba651db800e61b53f7`. El commit UI-03B posterior completa gestos, fixture, formato y QA; no se reescribe el historial de main.
