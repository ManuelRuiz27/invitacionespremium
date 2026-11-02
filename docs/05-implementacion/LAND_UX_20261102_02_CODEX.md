# LAND-UX-20261102-02 — Ejecución UX/Codex de landing comercial

**Estado:** Aprobado para implementación UI y QA, **NO** para release/despliegue/piloto.  
**Owner:** UI/UX con Codex. **Frontend:** no activar salvo dependencia funcional reproducible fuera de UI y nueva decisión del PM.  
**Autorización:** DEC-LAND-UX-20261102-003 (reasigna a UI/UX el alcance P1/P2 de DEC-LAND-UX-20261102-002). LAND-FE-20261102-01 quedó CANCELLED sin ejecución.  
**Base revisada:** main \`805a940262e57201130689ce81b653ab2ecbe641\` (02/11/2026). Verificar HEAD real antes de empezar.

Este archivo es el **contrato de ejecución autocontenido para Codex sin acceso a Google Drive**. Resume el ticket y las decisiones PM verificadas el 02/11/2026. No solicitar conectores de Drive ni reconstruir el historial de gobernanza. Ante contradicción, respetar los contratos del repo: \`AGENTS.md\`, \`docs/INDEX.md\`, \`docs/01-producto/05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md\`, \`05A_PRICING_RESOLUTION_CLARIFICATION.md\`, \`05B_LANDING_COMMERCIAL_SALES_CONTRACT.md\`; si una contradicción afecta alcance, bloquear sólo esa parte y consultar al PM.

## 1. Alcance P1: implementar

1. **Hero:** H1 «Menos listas dispersas. Más control de tu evento.»; explicar servicio gestionado (Provider prepara; organizador opera); CTA «Ver servicios y precios» y secundario «Cómo funciona». Mantener sistema visual existente. No prometer resultados medidos ni disponibilidad de piloto.
2. **Tres intenciones explícitas:** «Organizo mi evento» (**INDIVIDUAL**), «Soy Planner/agencia» (**PLANNER_AGENCY**), «Tengo salón o jardín» (**VENUE**). Son estado de UI/navegación y **no** crean usuario, rol, clasificación comercial, tarifa ni datos personales. Ningún botón genérico del header/mobile ni del pricing abre Planner por defecto.
3. **Precio contextual con selector operable:** SKU \`PHYSICAL_QR | FLYER | FLIPBOOK\`, bracket \`1–50 | 51–100 | 101–150\`, perfil seleccionado o no seleccionado. Preservar comparación desktop; en móvil permitir selección sin scroll lateral. Mostrar resumen visible/accesible de SKU, capacidad y **PVP estándar de API pública en MXN antes de IVA**, un **único CTA contextual** (no CTA por cada una de las nueve celdas). Cambiar perfil no recalcula PVP.
4. **Sin perfil:** CTA «Elegir cómo contratar» solicita selección explícita, sin modal B2B automático.
5. **Individual:** alternativa I aprobada: SKU + bracket + PVP público + inclusión/exclusión/demos y salida **sólo informativa** («Ver opciones para mi evento», «Conocer cómo funciona»). No «Cotizar», lead, checkout, contacto inventado ni tercer formulario.
6. **Planner:** CTA del precio seleccionado abre sólo el modal \`PLANNER_AGENCY\` existente. Condiciones partner sujetas a evaluación; PVP público **no** es tarifa partner.
7. **Venue:** CTA abre sólo el modal \`VENUE\` existente. Precio Venue sujeto a operación/volumen efectivo (M-1), **no** al bracket estándar ni al volumen declarado; no asignar tier por seleccionar perfil.
8. **Contexto B2B:** SKU + bracket deben ser **visibles y editables antes del envío** y viajar exclusivamente por \`notes\` del DTO actual, sin nuevas propiedades, endpoint, formularios o tipos. Conservar notas previas (por ejemplo, solicitud de interfaz exclusiva); evitar contexto duplicado, truncamiento silencioso, inyección y superar longitud máxima de 1000 caracteres. Respetar idempotencia, rate limiting, honeypot, privacidad, doble envío, éxito y errores.

**Fuente de verdad de PVP:** \`apps/landing/src/use-public-pricing.ts\`, \`public-pricing-model.ts\`, cliente público existente. Nunca copiar importes a JSX/configuración ni inferir descuentos. En loading/error/unavailable no mostrar precio ficticio; reintentar de manera accesible. La selección visual no congela cotización.

**Alcances comerciales por SKU:** QR/EventOps = pases QR, Scanner/Staff, croquis cuando aplique; **sin** invitación visual, RSVP público ni álbum. Flyer = dos piezas principales, RSVP, QR, hasta dos rondas consolidadas. Flipbook = hasta diez páginas, RSVP, QR, hasta dos rondas consolidadas. Scanner requiere conexión para validación. Capacidad MVP: 1–150; no prometer precio confirmado para más de 150.

## 2. Alcance P2: implementar sólo esto

- Etiquetar capturas, videos y recorridos como **demostración/simulación**; quitar calificativos «real» engañosos y corregir «BOda» → «Boda» (incluye alt/aria/copy donde proceda).
- Separar editorial/visualmente la propuesta recurrente Venue (QR/Staff/Scanner/operación) del adicional «interfaz exclusiva»: proyecto a medida con cotización separada, sin backend dedicado; mantener modal VENUE y notas existentes.
- Responsive 320, 360, 390, 768, 1024 y 1440; contraste, controles por teclado, foco restaurado al cerrar modal, Escape, anuncios de estados, objetivos táctiles y reduced-motion en video/animaciones con controles o fallback adecuados.

**Aplazado / prohibido:** plegar las cinco escenas de demo o reescribir su estructura; acordeón de campos opcionales B2B; analytics, rastreo, CRM, tercer formulario, contacto manual no verificado, cambios de API/SDK/DTO/DB, roles/permisos, catálogo, tarifas, pagos, precios, infraestructura, despliegue y refactor amplio del design system. No tocar backend para resolver una necesidad visual.

## 3. Puntos concretos de código

Inspeccionar primero \`apps/landing/src/App.tsx\`, \`config/landing-config.ts\`, \`components/{LandingHero,LandingHeader,LandingPricing,LandingServices,LandingProductProof,LandingPlanners,LandingVenue,CommercialLeadModal}.tsx\`, \`public-pricing-model.ts\`, \`use-public-pricing.ts\` y tests relacionados. Priorizar estado local en App o hook ligero, props tipadas y componentes existentes, sin nueva dependencia por defecto.

\`scripts/verify-landing.mjs\` aún verifica el H1 antiguo: **actualizar sus expectativas sin eliminar cobertura**. Preservar el flujo de personalización exclusiva y distinguir contexto de precio de notas libres. No insertar PII en querystrings ni logs.

## 4. QA obligatorio, independiente

Si existen subagentes: **A** implementa y escribe tests; **B** (no autor) revisa diff, contratos, pruebas, screenshots y emite PASS/FAIL. Si no existen, declarar «QA independiente pendiente» y no autoproclamar PASS; solicitar una revisión separada. Ningún cierre técnico sin ese dictamen.

Casos de aceptación mínimos:

- **I:** sin perfil → escoger individual → Flyer/51–100 → PVP API + alcance → navegación informativa. Jamás abre Planner/Venue ni crea lead/cuenta.
- **P:** elegir Planner → Flipbook/101–150 → resumen PVP estándar (no partner) → modal \`PLANNER_AGENCY\` con selección visible/editable, notas válidas, resultado de envío correcto.
- **V:** elegir Venue → QR/EventOps/1–50 → aviso de cotización Venue distinta del PVP → modal \`VENUE\` con contexto; personalización exclusiva sigue separada.
- Cambiar perfil conserva SKU/bracket; sin perfil no hay Planner implícito. Pricing loading/unavailable/error/retry no inventa valor. Modal conserva datos tras validación/error; cubre 409 y 429 y éxito sólo al confirmar API.
- Tab/Enter/Space/Escape, restauración de foco, aria-live, reduced-motion, video fallback, contraste, sin overflow ni errores de consola en seis anchuras. Demo correctamente rotulada y QR sin RSVP/álbum. No cambiar DTO/precios/contratos.

Pruebas del repo, ajustando a cobertura realmente impactada:

~~~bash
pnpm --filter @invitaciones/landing test
pnpm --filter @invitaciones/landing lint
pnpm --filter @invitaciones/landing typecheck
pnpm --filter @invitaciones/landing build
pnpm landing:verify
pnpm qa:focused
pnpm format:check
~~~

\`landing:verify\` necesita servidor local según \`scripts/verify-landing.mjs\`; documentar comando/URL usados. Añadir pruebas focalizadas para estados/rutas que falten, sin omitir aserciones ni elevar timeouts para esconder defectos.

**Capturas reales** mediante Playwright: desktop 1440 y mobile 360 (Hero/perfiles, pricing seleccionado, Planner/Venue modal); revisión también en 320/390/768/1024. Guardar evidencias con nombre inequívoco del ticket y sin datos personales/secretos. Versionar capturas optimizadas o facilitar artefacto verificable; un path local ignorado por Git por sí solo **no** acredita entrega remota.

## 5. Commit, CI, registro y cierre

1. Revisar \`git status\` y evitar mezclar modificaciones ajenas. No reescribir historia ni hacer force push.
2. Implementar exclusivamente este ticket; registrar resumen del diff y pruebas. Obtener QA independiente PASS antes del cierre.
3. Crear **un commit de implementación** con \`LAND-UX-20261102-02\`; push al remoto autorizado, sin deploy. Capturas/evidencia deben ser recuperables.
4. Consultar GitHub Actions y reportar el run del **mismo SHA**; exigir \`quality=success\` y todos los jobs requeridos, no asumir éxito mientras corren.
5. **Codex no tiene Drive:** NO intentar conectar ni declarar que actualizó TICKETS/AGENTES/HANDOFFS. Entregar reporte listo para que el agente UI/UX lo registre en Drive. PM acepta y cierra; Codex no se autoautoriza release.
6. Si surge dependencia real fuera de UI, detener sólo esa parte y reportar al PM: archivo, reproducción, causa, contrato afectado y propuesta. Frontend no se activa automáticamente.

**Reporte final:** SHA/enlace; archivos cambiados; P1/P2; logs y comandos de QA; nombre/dictamen del revisor independiente; capturas 1440/360 y verificaciones responsive; run y estado \`quality\`; bloqueo si falta algo. **No desplegar ni ejecutar staging.**
