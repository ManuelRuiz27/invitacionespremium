# UI-03A — Flipbook público estilo Magazine

Estado: **IMPLEMENTED / FUNCTIONAL QA PASSED / GLOBAL TYPECHECK BLOCKED BY UNRELATED CHANGES**  
Prioridad: **P0**  
Tipo: frontend interaction / public invitation renderer  
Contrato especializado: `docs/04-tecnico/FLIPBOOK_MAGAZINE_CONTRACT.md`

## 1. Objetivo

Sustituir el antiguo `FlipbookRenderer` de una sola imagen + fade por una publicación/revista con hojas físicas, portada/contraportada, spreads en desktop y una hoja por vista en mobile.

No cambia backend ni dominio.

## 2. Lectura obligatoria

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/05-implementacion/14_CODEX_RULES.md`
4. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`
5. `docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md`
6. `docs/04-tecnico/PUBLIC_RSVP_CONTRACT.md`
7. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`
8. `docs/04-tecnico/FLIPBOOK_MAGAZINE_CONTRACT.md`
9. este ticket.

Heyzine Magazine es sólo benchmark de interacción; no copiar código, branding ni runtime.

## 3. Baseline implementado

Implementación vigente:

- `@gullabs/react-flipbook@3.1.0` como wrapper React;
- cada `FlipbookPage` real es un child directo del engine;
- `@gullabs/flipbook-core` controla orientation, `visiblePages`, spreads y giro;
- `hardCovers` representa primera y última hoja como cubiertas físicas;
- `HotspotLayer` sigue filtrado por `flipbookPageId`;
- desktop usa landscape cuando hay ancho suficiente;
- mobile usa portrait/single leaf;
- teclado, swipe, reduced motion y precarga adyacente permanecen;
- fixture DEV disponible en `/__dev/flipbook-magazine`.

La implementación anterior que preagrupaba `[2,3]` dentro de un único child del engine quedó descartada.

## 4. Semántica física normativa

No construir spreads manualmente.

El engine recibe:

```text
page 1
page 2
page 3
...
page N
```

En desktop con cubiertas:

```text
N=1  -> [1]
N=2  -> [1] [2]
N=3  -> [1] [2] [3]
N=4  -> [1] [2|3] [4]
N=5  -> [1] [2|3] [4] [5]
N=6  -> [1] [2|3] [4|5] [6]
N=10 -> [1] [2|3] [4|5] [6|7] [8|9] [10]
```

Primera y última hoja son cubiertas visuales. Una hoja interior puede quedar sola por paridad.

Esta regla sustituye cualquier versión anterior de UI-03A que exigiera `N=5 -> [1] [2|3] [4|5]`.

No agregar páginas dummy ni duplicar assets para alterar paridad.

## 5. Invariantes

No cambiar:

- `InvitationDesign`, `FlipbookPage`, `Hotspot`;
- `pageId`/`flipbookPageId`;
- coordenadas normalizadas;
- readiness/cardinalidades;
- DTO/API;
- FileAsset lifecycle;
- QR/RSVP;
- Prisma/OpenAPI/backend.

## 6. Hotspots

Cada hoja contiene su propia `HotspotLayer`.

Durante giro:

- todos los Hotspots de hojas no interactivas pierden pointer events;
- no son focusables;
- `LOCATION`, `GIFT_REGISTRY` y `EXTERNAL_LINK` deben impedir navegación real cuando están disabled;
- RSVP/QR también quedan bloqueados hasta volver a `idle`.

No crear overlay único para el spread.

## 7. Responsive y navegación

Conservar:

- anterior/siguiente;
- teclado izquierda/derecha;
- swipe;
- targets touch >=44×44;
- bloqueo de navegación concurrente;
- `Página X de N` o rango visible;
- preservación de página focal al cambiar orientation.

El engine es autoridad de `visiblePages`; no duplicar su modelo de spreads en helpers paralelos.

## 8. Assets y rendimiento

- `PublicAssetImage`/ApiClient continúan siendo la única vía de assets;
- mantener aspect ratio sin crop;
- precargar visibles + adyacentes;
- no eager de todas las páginas;
- no introducir URLs directas de storage.

El warning de Vite por chunk >500 kB no bloquea este ticket. Lazy-loading del engine queda como optimización posterior si medición real lo justifica.

## 9. Dependencias/licencias

Aprobadas:

- `@gullabs/react-flipbook@3.1.0` — MIT;
- `@gullabs/flipbook-core@3.1.0` — MPL-2.0.

`THIRD_PARTY_NOTICES.md` debe mantenerse con el source upstream y licencia del core.

## 10. Fixture DEV

Ruta:

`/__dev/flipbook-magazine`

Sólo debe existir con `import.meta.env.DEV`.

Debe permitir verificar:

- portada;
- al menos un spread real de dos hojas;
- contraportada;
- Hotspots distribuidos entre páginas;
- desktop/mobile;
- page turn real.

No crear ruta secreta de producción ni saltarse `ApiClient` en runtime productivo.

## 11. Tests obligatorios

Mantener cobertura para:

1. N=1,2,3,4,5,6,10 según el contrato físico;
2. portrait = una hoja visible;
3. landscape = spreads definidos por engine;
4. portada y contraportada individuales;
5. giro de una hoja física, nunca de un spread preagrupado;
6. forward/backward y límites;
7. spam de navegación;
8. teclado/swipe;
9. reduced motion;
10. Hotspot izquierdo/derecho conserva `flipbookPageId`;
11. Hotspots no visibles/no idle no interactivos;
12. anchors externos bloqueados durante giro;
13. orientation change preserva página focal;
14. QR disponible/no disponible;
15. LOCATION/GIFT_REGISTRY/EXTERNAL_LINK;
16. orden por `position`;
17. fallback sin páginas.

Los mocks deben modelar `visiblePages` de portrait y landscape; QA browser usa el engine real.

## 12. QA visual

Evidencia mínima:

- portada individual;
- spread `2–3` con giro físico;
- spread `4–5` usando un fixture con N>=6;
- contraportada individual;
- giro inverso;
- Hotspot en hoja izquierda/derecha;
- mobile single page;
- desktop -> mobile -> desktop conservando página;
- reduced motion;
- sin errores de consola.

## 13. Validaciones de cierre

Ejecutar:

- lint Client;
- tests Client relevantes;
- build Client;
- typecheck Client.

Estado actual reportado:

- lint: OK;
- tests afectados: OK;
- build: OK;
- QA visual con engine real: OK;
- typecheck global Client: bloqueado por cambios ajenos de Floorplan/API (`sourceType`, `getFloorplanSvgSource`, `uploadFloorplanSvgAsset`).

Ese bloqueo no invalida funcionalmente UI-03A, pero el ticket no pasa a `DONE` global hasta que el typecheck del branch integrado vuelva a verde.

## 14. No-go

No:

- cambiar engine sólo para recuperar la regla antigua de N=5;
- crear páginas dummy;
- preagrupar spreads manualmente;
- modificar backend/API/schema/readiness;
- agregar multimedia/analytics/download/bookshelf/themes de Heyzine;
- modificar Flyer salvo regresión compartida demostrada.

## 15. Definition of Done

UI-03A queda `DONE` cuando:

- cada página real es una hoja del engine;
- cubierta frontal/posterior y spreads cumplen `FLIPBOOK_MAGAZINE_CONTRACT.md`;
- page-turn físico funciona;
- Hotspots permanecen correctos por página y bloqueados durante giro;
- desktop/mobile/reduced-motion pasan;
- fixture DEV es reproducible;
- `THIRD_PARTY_NOTICES.md` existe;
- lint/tests/build pasan;
- typecheck del Client integrado pasa;
- no hubo cambios de API/schema/dominio.
