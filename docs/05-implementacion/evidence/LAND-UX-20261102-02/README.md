# LAND-UX-20261102-02 — Evidencia de implementación

Fecha: 2026-11-02. Base: `4e0d01816786491547ad6d547bcd9298f3e2ce39` en `main`, actualizado por fast-forward y con árbol limpio antes de editar. El SHA de entrega es el commit que contiene este directorio; el run de CI del mismo SHA se entrega en el reporte final de Codex.

Durante la ejecución se integró por fast-forward `3bdcddbf5f9084ea8d8dfe2d36629fe1b3dd9f9f`, que añadió el criterio editorial 2.1 al ticket, sin cambios de código externos. Ésta es la base padre de la entrega. Se aplicó el lenguaje de comprador a Hero, navegación, servicios, precios, profesionales, salones, formulario, preguntas frecuentes, CTA, SEO y textos accesibles; se conservaron identificadores técnicos y reglas. Prueba editorial añadida: 74 tests de landing en la versión final.

## Resultado P1/P2

- Hero con el H1 aprobado y explicación del servicio gestionado. Header desktop/mobile solicita intención explícita.
- Intenciones Individual, Planner/agencia y Venue locales a UI. SKU/capacidad permanecen al cambiar perfil; no cambian PVP, rol, canal persistido ni tarifa.
- Selectores accesibles de servicio y capacidad, comparación desktop y resumen móvil sin scroll lateral; PVP de la API pública en MXN antes de IVA, sin valores ficticios durante loading/error/unavailable. Un solo CTA contextual.
- Individual navega a información sin modal ni lead. Planner y Venue abren únicamente su modal existente, con límites partner/Venue explícitos.
- SKU y bracket visibles/editables en el modal. `notes` contiene un JSON único con `contextoPrecioPublico` y `mensaje` separados; preserva la solicitud de interfaz exclusiva y rechaza más de 1000 caracteres serializados sin recortar. No cambia DTO, API ni SDK.
- Demostraciones rotuladas; copy/alt/aria corregidos; cinco escenas conservadas. Venue recurrente separado del adicional de interfaz exclusiva. Video con controles y fallback estático para reduced-motion/error. Foco, Escape, teclado, contraste y objetivos táctiles comprobados.

Archivos de producto: `App.tsx`, `commercial-selection.ts`, `config/landing-config.ts`, `LandingIntents`, `PriceSelectionFields`, `LandingHeader`, `LandingHero`, `LandingPricing`, `CommercialLeadModal`, `DemoVideo`, `LandingProductProof`, `LandingServices`, `LandingPlanners` y `LandingVenue`. Se ampliaron `LandingCommercialFlow.test.tsx`, `LandingComponents.test.tsx` y `scripts/verify-landing.mjs` sin quitar aserciones vigentes ni aumentar timeouts.

## QA y reproducción

Revisor independiente: `/root/qa_independiente`. Dictamen y límites en [qa-independent-review.md](qa-independent-review.md), con resultados y scripts propios en este directorio. El PASS de UI no autoriza release, piloto ni despliegue.

Comandos ejecutados desde la raíz:

```text
pnpm --filter @invitaciones/landing test
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

Una repetición adicional de landing se ejecutó al mismo tiempo que Admin y las capturas, y produjo seis timeouts de 5000 ms, sin aserciones fallidas; la ejecución anterior aprobó 73/73. Se conserva el intento concurrente por separado y se exige una repetición serial, sin elevar timeouts, antes del cierre. El dictamen independiente registra esta observación.

Se acotaron las consultas de radios al selector de perfiles y las de envío al diálogo. El revisor independiente confirmó que conserva aserciones y cobertura, con los mismos timeouts y sin mocks nuevos de componentes.

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
| Página completa | [Captura](desktop-1440-full.webp) | [Captura](mobile-360-full.webp) |

Capturas Playwright reales, optimizadas a WebP. Las de sección ocultan el header fijo sólo durante la captura para evitar su composición artificial en medio de un elemento alto; las de viewport/página completa y todas las comprobaciones mantienen el header. Las páginas completas son miniaturas limitadas a 16000 px de alto por el formato WebP; las capturas específicas conservan la anchura original de 1440/360. No contienen datos de contacto ni secretos.

No se consultó Drive, no se activó Frontend y no se modificaron contratos, API, SDK, DTO, DB, roles, tarifas ni infraestructura. El reporte queda listo para registro por UI/UX; la aceptación comercial y el cierre corresponden al PM.
