# LAND-UX-20261102-02 — Revisión QA independiente

**Dictamen vigente: PASS para UI P1/P2 y la sección editorial 2.1 del ticket, incluida revisión de las capturas finales.**

Revisor: `/root/qa_independiente`, subagente independiente del autor de la implementación. Base final revisada: `3bdcddbf5f9084ea8d8dfe2d36629fe1b3dd9f9f` más el diff de implementación del ticket. No modifiqué código de producto, contratos ni tests versionados. Los scripts independientes y resultados se generaron en `var/`.

## Evidencia revisada y ejecutada

- Leí el ticket íntegro, la entrada documental y dirección M01/operator-led, roles, límites del monorepo y contratos comerciales 05/05A/05B. Revisé el diff de App, perfiles, pricing, modal, copy, video, pruebas y verificador. No hay cambios de API, SDK, DTO, DB, tarifas, roles, contratos o infraestructura.
- Revisé los 73 tests de landing aprobados y su cobertura: Individual informativo; Planner/Venue correctos; contexto editable sólo en `notes`; preservación de personalización; longitud serializada <=1000; ausencia de truncamiento; strings de notas escapados; doble envío; abort; reintento con misma llave; 409/429; estados de pricing y reintento explícito. Lint, typecheck y build de landing tienen logs separados del autor. `git diff --check` no encontró errores.
- Ejecuté `node var/qa-land-ux-independent.mjs`: I/P/V en Chromium a 320, 360, 390, 768, 1024 y 1440; sin perfil implícito; navegación Individual sin modal ni lead; SKU/bracket/PVP conservados al cambiar perfil; edición del contexto; sin overflow de página ni modal; Space/Enter/Escape y restauración de foco. Resultado: PASS, `errors=[]`.
- En el mismo script probé respuestas HTTP 409 -> 429 -> 201 mediante interceptación local: se conservan datos y `submissionId`, no aparece éxito prematuro y la selección viaja exclusivamente en `notes`. No se enviaron leads al backend en esta prueba.
- Ejecuté `node var/qa-land-ux-pricing-states.mjs`: loading -> HTTP 503 -> retry explícito -> matriz incompleta -> retry explícito -> PVP público. Ningún estado intermedio muestra un importe ficticio. El oráculo de precios se obtuvo de la API pública local real. Revisé además las pruebas de `unavailable` por ausencia de cliente configurado: no se efectúa request.
- Ejecuté `node var/qa-land-ux-accessibility.mjs`: video normal con controles, muted y poster; fallback estático tras error; reduced-motion sin video; CTA genérico mobile solicita perfil sin preseleccionarlo; foco dentro del Dialog y 24 Tab más Shift+Tab sin salir ni alcanzar el honeypot. Controles de cierre y envío miden 44px de alto; perfiles 48px. Contraste calculado para textos de perfiles/precios/modal: mínimo 6.38:1 en página y 7.13:1 en etiquetas del modal, sin fallos bajo el umbral 4.5:1.
- Revisé visualmente las capturas reales Playwright 1440/360 de Hero, perfiles, pricing Planner/Venue y ambos modales. Lectura, selección y jerarquía son claras; comparación desktop preservada, móvil sin scroll lateral. Capturas de secciones ocultan únicamente el header fijo durante la captura para evitar su superposición artificial en una imagen de elemento alto; las pruebas y capturas viewport conservan el header real.
- Revisé `responsive-report.json`: seis anchos con contenido, navegación, secciones, copy Managed y límites de lanzamiento correctos; sin overflow, overlays ni errores de consola. Se mantienen cinco escenas de demo. QR no ofrece RSVP/álbum; Venue distingue PVP de cotización por operación y volumen efectivo M-1; interfaz exclusiva es adicional separado.
- Confirmé correcciones finales: caption visible de Hero y Planner rotulado como demostración; alt/aria sin calificativos engañosos ni `BOda`; objetivos touch de submit/retry/cerrar de 44px.

## Observaciones y límites

No quedan hallazgos bloqueantes de UI P1/P2. Este PASS se refiere al ticket y al código revisado. La prueba de estados de lead valida UI/contrato de transporte mediante respuestas interceptadas; no certifica persistencia ni rate limiting del backend. El PVP sí se verificó contra API local real. Chromium emulado no sustituye validación de hardware físico ni aprobación comercial/piloto.

Al emitir este dictamen, la suite global `qa:focused` y el CI remoto aún no habían terminado. Su aprobación y el estado `quality=success` sobre el mismo SHA publicado deben verificarse por separado antes del cierre técnico. Este dictamen no autoriza release ni despliegue.

## Artefactos independientes

- `qa-independent-results.json`: journeys, seis anchos y transporte simulado.
- `qa-independent-accessibility.json`: contraste, video/fallback, teclado y tamaños táctiles.
- `qa-independent-pricing-states.json`: estados de precio sin valores ficticios y recuperación explícita.

Los nombres de archivo son relativos al directorio de evidencia del ticket donde se publique este reporte.

## Observación posterior: ejecución concurrente duplicada

Revisé `landing-test-final.log`, correspondiente a una segunda suite landing ejecutada mientras continuaban QA global/Admin y generación de capturas. Presentó seis timeouts de 5000 ms en los journeys nuevos de App completo; 67 tests pasaron. No contiene fallos de aserción. La duración global pasó de 44.80 s en la ejecución aprobada a 96.38 s, con incremento importante también en setup/import. Es evidencia compatible con contención de recursos, sin demostrar por sí sola una regresión funcional.

El dictamen de UI permanece PASS con las condiciones de validación global y CI ya indicadas. Para cerrar el ticket se requiere completar una ejecución serial de landing, después de terminar las suites concurrentes, y reportar este intento fallido por separado. No se recomienda elevar timeouts ni reducir cobertura. Si reaparece en ejecución serial o CI, corresponde investigar el coste de render/consultas sobre App completo y la causa reproducible antes del cierre.

## Ampliación editorial recibida posteriormente

La base remota avanzó a `3bdcddbf5f9084ea8d8dfe2d36629fe1b3dd9f9f` e incorporó la sección 2.1 del ticket (lenguaje comercial y de nicho). La leí íntegra. El PASS anterior cubre la versión inicial revisada; la adaptación editorial y sus capturas requieren una revisión independiente adicional antes del cierre. Al registrar esta observación esa revisión está pendiente.

Revisión adicional de código y navegador 2.1: PASS. El copy actual usa precio estándar, confirmación de asistencia, equipo de recepción, plano de mesas y propuesta para salones/jardines; conserva nombres comerciales, condiciones de alcance y precisión tributaria/comercial. Mis tres scripts independientes fueron adaptados a las etiquetas nuevas y reejecutados con exit 0. El barrido adicional de texto visible, alt, aria-label, title y meta-description, también dentro del modal, pasó en los seis anchos (`editorialSection2_1=PASS` en `qa-independent-results.json`). Revisé además la acotación de consultas de tests a `#como-contratar` y al Dialog: mantiene las aserciones y los timeouts, sin reducir cobertura.

**Revisión visual/editorial final 2.1: PASS.** Abrí y revisé las doce capturas finales versionadas bajo `docs/05-implementacion/evidence/LAND-UX-20261102-02`: Hero, perfiles, selección Planner/salón y ambos modales en desktop 1440 y móvil 360. Son legibles, muestran el copy nuevo, mantienen los avisos comerciales y no presentan solapamiento del header en las capturas de pricing. Revisé el `responsive-report.json` final: `customerLanguage=true`, sin overflow ni errores de consola en los seis anchos. El cambio de la tercera escena a «Organizas la distribución de mesas» está reflejado en código y test y preserva las cinco escenas. No quedan condiciones pendientes de revisión visual o editorial.

Al emitir esta ampliación siguen pendientes la ejecución serial final de los 74 tests y los checks globales/CI señalados. El PASS de revisión independiente del ticket no sustituye esos resultados ni autoriza despliegue.

Revisión estática posterior: aprobado el ajuste del mensaje `unavailable` a «Los precios no están disponibles en este momento.» y la actualización exacta de su aserción. Sólo cambia copy; se conserva la rama de estado, el botón Reintentar y la ausencia de precio ficticio. No altera las capturas finales del estado de precios disponibles ni el dictamen PASS de UI/editorial.
