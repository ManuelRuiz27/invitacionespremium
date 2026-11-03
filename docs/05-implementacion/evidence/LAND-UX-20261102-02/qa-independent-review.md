# LAND-UX-20261102-02 — Dictamen QA independiente final

**PASS para el alcance UI original de LAND P1/P2, lenguaje comercial 2.1, encuadre y optimización de render. No avala publicación del pricing comercial revisado posteriormente; ver delimitación final.**

Revisor: /root/qa_independiente, distinto del autor. Revisé documentación, diff, pruebas, navegador y capturas. No modifiqué producto, contratos ni tests versionados. Última base publicada examinada: 98543ab5baf01e2bcee16a8efbbf3d98d1d9cba5, más el diff local de cierre. Los cambios ajenos en AGENTS.md no se tocaron.

## Alcance y comportamiento

- Leí íntegramente el ticket, incluida su sección 2.1, y documentación obligatoria M01/operator-led, roles, monorepo y contratos comerciales 05/05A/05B. No hay cambios de API, SDK, DTO, DB, roles, tarifas, contratos o infraestructura.
- Verifiqué Individual, Planner y salón: selección explícita; Individual únicamente informativo; precio estándar de API pública; selección conservada al cambiar perfil; propuestas profesionales/salón separadas del precio estándar. SKU/capacidad editables viajan sólo en notes, separados de notas libres, sin truncamiento ni pérdida de personalización.
- Revisé idempotencia, doble envío, cancelación, respuestas tardías, 409/429, privacidad, honeypot, límite serializado de 1000 caracteres y éxito sólo tras respuesta confirmada. QR excluye invitación visual, confirmación pública y álbum; Flyer/Flipbook conservan piezas/páginas y dos rondas.
- El copy visible/accesible y SEO usan lenguaje comercial comprensible. El barrido de texto visible, alt, aria-label, title y meta-description pasó en seis anchos y dentro del modal. Confirmé el SEO servido localmente con «confirmaciones de asistencia» y el mensaje unavailable «en este momento».

## Verificación independiente ejecutada

- qa-land-ux-independent.mjs: PASS de I/P/V en 320/360/390/768/1024/1440, sin overflow ni errores de consola; Space/Enter/Escape, foco restaurado y selección/precio conservados. Transporte simulado 409 -> 429 -> 201 conserva datos/llave y contexto únicamente en notes.
- qa-land-ux-pricing-states.mjs: PASS de loading -> HTTP 503 -> retry explícito -> matriz incompleta -> retry -> precio de API pública local real, sin precio ficticio. Revisé también pruebas de unavailable sin cliente configurado ni request.
- qa-land-ux-accessibility.mjs: PASS de video con controles/muted/poster, fallback por error, reduced-motion sin video, menú explícito y foco atrapado durante 24 Tab más Shift+Tab. Honeypot fuera de navegación; cierre/envío de 44px y perfiles de 48px. Contraste mínimo observado: 6.38:1 en página y 7.13:1 en etiquetas del modal.
- qa-land-ux-crop.mjs: PASS en escenas 3/4 y superficies Planner/salón a 360/1440. Naturales 2160x1350; encuadre CSS superior 28% e izquierdo 16%, overflow oculto y proporción dentro del 1% explicado por borde de 1px. Los archivos de imagen no se modificaron.
- qa-land-ux-memo.mjs: PASS sobre la optimización final. Los callbacks estables reciben selección actual FLIPBOOK/101–150; personalización y foco se conservan. Estado propio de escenas, cambio en vivo de reduced-motion y responsive del header siguen funcionando. El menú móvil consulta la intención seleccionada actual y no abre modal implícito.

El precio se contrastó con API local real. Las respuestas de lead independientes fueron interceptadas y no crearon leads: certifican UI y transporte, no persistencia/rate limiting backend. Chromium emulado no equivale a QA física ni aprobación de piloto.

## Capturas revisadas

Abrí las doce capturas finales desktop 1440/mobile 360 de Hero, perfiles, pricing Planner/salón y ambos modales, más las seis cápsulas de mesas/distribución/salón. El encuadre oculta la cabecera original con BOda y la barra lateral, conservando áreas operativas reconocibles y las cinco escenas. No hay distorsión visual material.

Las capturas de elementos altos ocultan sólo el header fijo durante la captura para evitar una superposición artificial; pruebas y capturas viewport conservan el header real. El reporte responsive examinado tiene seis anchos aprobados, customerLanguage=true, sin overflow ni errores de consola. El autor debe conservar las capturas/resultados finales recuperables junto con este dictamen.

## Pruebas y ajustes finales

Revisé landing-test-final.log: **9 archivos y 74 tests aprobados**, comando pnpm --filter @invitaciones/landing test --maxWorkers=1, duración 107.28s. Componentes reales, mismas aserciones/timeouts originales, sin retries nuevos. Confirmé qa:focused global aprobado: Passed in 3845.01s.

Hubo intentos anteriores fallidos: metadata esperaba el plural anterior y journeys sufrieron timeouts Windows incluso sin concurrencia. La corrección SEO conservó intacta su aserción. Se retiró el aislamiento temporal de componentes: no queda en el diff final.

La solución conserva diez secciones estáticas mediante memo y cuatro callbacks estables en App, evitando reconstrucciones ajenas a la selección. Revisé que no capturan estado obsoleto ni bloquean estado propio, contexto, responsive o reduced-motion. Las consultas de tests se acotaron a intención, pricing o diálogo sin eliminar comprobaciones.

**PASS independiente final emitido.** El autor aún debe comprobar el último lint/typecheck/build/formato, el verificador final y el CI del SHA de cierre. Este dictamen no declara CI remoto verde ni autoriza despliegue, release o piloto.

## Decisión posterior de pricing — fuera del PASS de publicación

Leí los cambios remotos 0ac769a15ba21e06d2a7d51af0959daba629b239 y d88521e5ef9ef69afe4d1560e50106ded0b0ad68 en los contratos 05 y 05B. Aprobaron documentalmente una reducción del 20% de los nueve precios estándar y presentación al consumidor con IVA general del 16% incluido. Los propios contratos indican que la decisión no actualiza Pricing V2: exige configuración versionada por Admin, conservación de precios/snapshots históricos y verificación de los nueve STANDARD mediante GET /public/pricing antes de anunciar las nuevas tarifas como activas. Partner, salón y Managed no reciben cambios automáticos.

LAND-UX-20261102-02 originalmente autorizó consultar la API vigente y mostrar importes antes de IVA, y prohibió modificar precios, API o contratos. La implementación revisada conserva esa fuente/proyección sin introducir importes nuevos, descuentos ni impuestos hardcodeados. Mis pruebas y capturas acreditan ese alcance original y la API local consultada; no acreditan la configuración/publicación de la nueva decisión comercial.

**Bloqueo delimitado para habilitación/publicación comercial:** queda pendiente configurar y verificar los nuevos precios estándar y autorizar/implementar su presentación conforme al 05B revisado, incluyendo tratamiento de subtotal/IVA/total desde la fuente autoritativa. El copy/proyección actual antes de IVA no queda certificado aquí como publicación conforme a esa revisión posterior. Se requiere un alcance posterior explícito para resolver esa diferencia; no se amplió implícitamente el ticket UI ni se ejecutó Admin, cambio de precios o despliegue. El PASS de UI original no avala anunciar el nuevo precio ni autoriza release.
