# LAND-UX-20261102-02 — Evidencia de implementación

Fecha: 2026-11-02. Base: `4e0d01816786491547ad6d547bcd9298f3e2ce39` en `main`, actualizado por fast-forward y con árbol limpio antes de editar. El SHA de entrega es el commit que contiene este directorio; el run de CI del mismo SHA se entrega en el reporte final de Codex.

Durante la ejecución se integró por fast-forward `3bdcddbf5f9084ea8d8dfe2d36629fe1b3dd9f9f`, que añadió el criterio editorial 2.1 al ticket. Se aplicó el lenguaje de comprador a Hero, navegación, servicios, precios, profesionales, salones, formulario, preguntas frecuentes, CTA, SEO y textos accesibles; se conservaron identificadores técnicos y reglas. La versión final contiene 74 tests de landing.

Durante la interrupción por límite de uso, los cambios fueron publicados en `fa7847d` y `98543ab` por una acción externa. Se conservó esa historia y el cierre parte de `98543ab5baf01e2bcee16a8efbbf3d98d1d9cba5`, sin force-push. La edición local ajena de `AGENTS.md` se dejó fuera del commit de cierre.

Antes del cierre se integraron también `0ac769a` y `d88521e`, actualizaciones documentales remotas de precios. La base padre final es `d88521e5ef9ef69afe4d1560e50106ded0b0ad68`. Los contratos modificados por esas actualizaciones no forman parte del diff del autor.

## Resultado P1/P2

- Hero con el H1 aprobado y explicación del servicio gestionado. Header desktop/mobile solicita intención explícita.
- Intenciones Individual, Planner/agencia y Venue locales a UI. SKU/capacidad permanecen al cambiar perfil; no cambian PVP, rol, canal persistido ni tarifa.
- Selectores accesibles de servicio y capacidad, comparación desktop y resumen móvil sin scroll lateral; PVP de la API pública en MXN antes de IVA, sin valores ficticios durante loading/error/unavailable. Un solo CTA contextual.
- Individual navega a información sin modal ni lead. Planner y Venue abren únicamente su modal existente, con límites partner/Venue explícitos.
- SKU y bracket visibles/editables en el modal. `notes` contiene un JSON único con `contextoPrecioPublico` y `mensaje` separados; preserva la solicitud de interfaz exclusiva y rechaza más de 1000 caracteres serializados sin recortar. No cambia DTO, API ni SDK.
- Demostraciones rotuladas; copy/alt/aria corregidos; cinco escenas conservadas. Venue recurrente separado del adicional de interfaz exclusiva. Video con controles y fallback estático para reduced-motion/error. Foco, Escape, teclado, contraste y objetivos táctiles comprobados.
- Las secciones estáticas se memoizan y sus callbacks son estables: cambiar perfil o precio actualiza sus controles sin reconstruir toda la página. El estado propio de demos, menú y preferencias de movimiento continúa activo.

Archivos de producto: `App.tsx`, `commercial-selection.ts`, `config/landing-config.ts`, `LandingIntents`, `PriceSelectionFields`, `LandingHeader`, `LandingHero`, `LandingPricing`, `CommercialLeadModal`, `DemoVideo`, `ProductProofPicture`, `LandingProductProof`, `LandingServices`, `LandingPlanners` y `LandingVenue`. Se ampliaron `LandingCommercialFlow.test.tsx`, `LandingComponents.test.tsx` y `scripts/verify-landing.mjs` sin quitar aserciones vigentes ni aumentar timeouts.

## QA y reproducción

Revisor independiente: `/root/qa_independiente`. Dictamen y límites en [qa-independent-review.md](qa-independent-review.md), con resultados y scripts propios en este directorio. El PASS de UI no autoriza release, piloto ni despliegue.

Comandos ejecutados desde la raíz:

```text
pnpm --filter @invitaciones/landing test --maxWorkers=1
pnpm --filter @invitaciones/landing lint
pnpm --filter @invitaciones/landing typecheck
pnpm --filter @invitaciones/landing build
pnpm landing:verify
pnpm qa:focused
pnpm format:check
```

El cambio obligatorio en el verificador raíz hace que `qa:focused` seleccione todos los workspaces y sus journeys. Los logs se conservan en este directorio. El build informa un warning no bloqueante de chunk de más de 500 kB; no se cambió el límite ni se amplió el alcance a un refactor del bundle.

El harness de capturas usa la API local existente en `http://localhost:3000`, sólo con consultas públicas. Para reproducirlo con dependencias y Chromium instalados:

```text
node docs/05-implementacion/evidence/LAND-UX-20261102-02/qa-server.mjs
# En otra terminal, desde la raíz:
pnpm landing:verify
node docs/05-implementacion/evidence/LAND-UX-20261102-02/qa-land-ux-independent.mjs
node docs/05-implementacion/evidence/LAND-UX-20261102-02/qa-land-ux-accessibility.mjs
node docs/05-implementacion/evidence/LAND-UX-20261102-02/qa-land-ux-pricing-states.mjs
```

URL de navegador: `http://127.0.0.1:6176`. El proxy existe únicamente en el harness para resolver el origen de QA sin modificar CORS/API ni infraestructura. No ejecuta staging ni despliega. El verificador obtiene el oráculo PVP desde la API pública real. Las respuestas de envío B2B 409/429/201 se interceptan en las pruebas independientes: no crean leads en la base compartida ni certifican persistencia/rate limiting del backend.

La ejecución final aislada aprobó **74/74 tests en 9 archivos**, con componentes reales y los límites de tiempo originales: [log de unidades](landing-test.txt). El QA global completó unidades de los ocho workspaces, 506 integraciones PostgreSQL, builds, journeys M01/M02/PR01/PR02, 74 casos Flipbook y verificaciones de guías: [log global](qa-focused.txt), exit 0 en 3845.01 s. Ese recorrido se ejecutó durante la implementación; los cambios finales de landing se revalidaron con su suite, checks focalizados y navegador. CI del SHA de cierre se comprueba y comunica por separado.

Se reprodujeron timeouts locales de jsdom, inicialmente bajo carga concurrente y después en aislamiento. Las consultas se acotaron a los controles y al diálogo correspondiente; además, se evitó reconstruir todas las secciones estáticas de App al cambiar una selección. La suite final conserva todas las aserciones, usa todos los componentes reales y pasa sin aumentar timeouts ni retries. [Intento previo](landing-timeout-before-memo.txt), [último fallo previo de un caso](landing-timeout-before-header.txt). El revisor independiente revisó estos ajustes y sus límites.

Checks finales y evidencia: [lint](landing-lint.txt), [typecheck](landing-typecheck.txt), [build](landing-build.txt), [formato](format-check.txt), [verificador responsive](landing-verify.txt). El resultado de CI sobre el SHA que contiene este directorio se entrega mediante su URL en el mensaje final, sin confundirlo con un run anterior.

El CI del SHA previo `98543ab` falló por la expectativa de metadata «confirmaciones», tras cambiar el copy a singular. Se corrigió el SEO a «confirmaciones de asistencia» sin eliminar ni cambiar esa aserción; es una regresión editorial introducida y corregida, distinta de los timeouts locales. Los otros seis jobs de validación pasaron y `quality` reflejó el fallo de unidades. [Run previo](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/41541546062).

## Capturas y responsive

[responsive-report.json](responsive-report.json) y [qa-independent-results.json](qa-independent-results.json) cubren 320, 360, 390, 768, 1024 y 1440: sin overflow ni errores de consola. El reviewer independiente comprobó además contraste, video/fallback, navegación del modal, honeypot fuera de foco y estados de pricing.

| Vista | Desktop 1440 | Mobile 360 |
| --- | --- | --- |
| Hero | [Captura](desktop-1440-hero.webp) | [Captura](mobile-360-hero.webp) |
| Perfiles | [Captura](desktop-1440-perfiles.webp) | [Captura](mobile-360-perfiles.webp) |
| Pricing Planner | [Captura](desktop-1440-pricing-planner.webp) | [Captura](mobile-360-pricing-planner.webp) |
| Pricing Venue | [Captura](desktop-1440-pricing-venue.webp) | [Captura](mobile-360-pricing-venue.webp) |
| Modal Planner | [Captura](desktop-1440-modal-planner.webp) | [Captura](mobile-360-modal-planner.webp) |
| Modal Venue | [Captura](desktop-1440-modal-venue.webp) | [Captura](mobile-360-modal-venue.webp) |
| Demo de mesas | [Captura](desktop-1440-demo-mesas.webp) | [Captura](mobile-360-demo-mesas.webp) |
| Demo de distribución | [Captura](desktop-1440-demo-distribucion.webp) | [Captura](mobile-360-demo-distribucion.webp) |
| Demo para salón | [Captura](desktop-1440-demo-salon.webp) | [Captura](mobile-360-demo-salon.webp) |
| Página completa | [Captura](desktop-1440-full.webp) | [Captura](mobile-360-full.webp) |

Capturas Playwright reales, optimizadas a WebP. Las de sección ocultan el header fijo sólo durante la captura para evitar su composición artificial en medio de un elemento alto; las de viewport/página completa y todas las comprobaciones mantienen el header. Las páginas completas son miniaturas limitadas a 16000 px de alto por el formato WebP; las capturas específicas conservan la anchura original de 1440/360. Sólo contienen datos ficticios de demostración, sin datos personales reales ni secretos.

Los screenshots preexistentes de mesas y distribución contienen «BOda» en sus píxeles. Se encuadró su área operativa mediante CSS (28% superior y 16% izquierdo excluidos), conservando la imagen original sin retoques ni interfaces inventadas. Los metadatos se corrigieron a sus dimensiones reales 2160×1350. [QA independiente del encuadre](qa-independent-crop.json) y las seis cápsulas nuevas documentan este tratamiento.

## Bloqueo comercial posterior al alcance ejecutado

La decisión documental remota `DEC-PRC-20261102-001` reduce el PVP y pide total con IVA incluido. `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md` §5.2 declara los nueve nuevos valores pendientes de configuración versionada en Admin y prohíbe anunciarlos como activos antes de verificar la API. El ticket LAND ejecutado pide expresamente PVP de API antes de IVA y prohíbe modificar precios, API y contratos.

La UI conserva esa lectura autoritativa, sin publicar los nuevos números mediante hardcode ni aplicar descuentos o IVA inventados en el frontend. **El PASS técnico de LAND no acredita la publicación comercial de los nuevos precios/IVA.** PM debe resolver el alcance posterior y verificar la configuración Admin y la proyección pública de subtotal/IVA/total antes de anunciar la nueva política. No se activó Frontend ni se ejecutó despliegue para resolver esa dependencia.

No se consultó Drive, no se activó Frontend y no se modificaron contratos, API, SDK, DTO, DB, roles, tarifas ni infraestructura. El reporte queda listo para registro por UI/UX; la aceptación comercial y el cierre corresponden al PM.
