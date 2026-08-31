# Product Proof asset manifest

Capturas deterministas de las interfaces reales de `apps/client` y `apps/scanner`. Los nombres, teléfonos, identificadores y datos del Evento pertenecen exclusivamente al fixture ficticio `scripts/landing-product-proof-fixture.mjs`; no contienen PII de producción.

Reproducción: `pnpm product-proof:capture`. El pipeline inicia ambos frontends con una proyección local de la API, recorre los estados mediante Playwright y exporta AVIF/WebP con Sharp. Los PNG sin optimizar quedan fuera de Git en `var/landing-product-proof/raw/`.

| Asset | UI y ruta fuente | Estado | Viewport de captura | Tratamiento | Uso |
| --- | --- | --- | --- | --- | --- |
| `flipbook-public-mobile` | Client `/invitacion/:token` | Flipbook público, página 1 | 390×844 @2x | Encuadre superior | Hero, Producto, Flipbook |
| `rsvp-public-mobile` | Client `/invitacion/:token` | Formulario RSVP abierto | 390×844 @2x | Encuadre superior | Producto, Flyer |
| `invitation-distribution-desktop` | Client `/eventos/:id?seccion=invitaciones` | Invitaciones individuales | 1440×1000 @1.5x | Vista completa | Producto, Planners |
| `seating-desktop` | Client `/eventos/:id?seccion=mesas` | Croquis, Mesas y detalle | 1440×1000 @1.5x | Vista completa | Hero, Producto, Venue |
| `scanner-result-mobile` | Scanner `/scanner/:token` | Resultado de búsqueda pendiente | 390×844 @2x | Encuadre superior | Hero, Producto, QR/EventOps |
| `checkin-success-mobile` | Scanner `/scanner/:token` | Ingreso exitoso | 390×844 @2x | Recorte de confirmación y siguiente acción | Venue |

Primera captura: 2026-08-31. Base funcional capturada: `e975eceeb91a845386719c75c0a7ac6311c3e1f3`. Los SVG generados por el fixture representan el diseño de Invitación y el Croquis del Evento demo; ninguna pantalla de producto fue recreada como mock visual.
