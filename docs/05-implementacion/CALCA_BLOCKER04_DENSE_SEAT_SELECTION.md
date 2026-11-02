# CALCA-BLOCKER-04 — Selección precisa de lugares densos

**Resultado: PASS del ticket.** La recertificación comercial continúa pendiente.

Base: `main` en `07f45f7eeb8ad8294c30e978f9da498035c8bd0b`. Alcance: selección de Seats en consumidores de sólo lectura; sin cambios API, DB, SDK, dominio, asignación Planner ni edición Calca.

## Causa y corrección

Los hit regions locales de Konva crecían con el zoom; el nodo pintado encima podía recibir el click aunque otro centro estuviera más cerca. Los botones DOM de 44 px presentaban la misma ambigüedad por orden de apilado.

Ambos renderers comparten resolución espacial en `pointerup`: centro normalizado convertido a coordenadas de pantalla, distancia cuadrada y radio fijo de **22 CSS px (diámetro 44 px)**. Gana el centro más cercano dentro del radio inclusive. Sólo ante distancias matemáticamente iguales se prioriza un Seat bloqueado y luego el ID lexicográficamente menor. No hay epsilon ni dependencia del orden de pintado. Un Seat bloqueado participa como candidato pero no emite selección; nunca se salta hacia el vecino libre. Ocupación, parent y asignación siguen bajo el flujo existente.

El frame Konva procede del contenido realmente pintado, no de su contenedor exterior, que puede recortarse al abrir el panel lateral. DOM usa el rectángulo transformado del plano. Zoom/pan no alteran coordenadas persistidas. Konva mantiene el diámetro de interacción en pantalla; DOM compensa su escala para conservar 44 px.

Un guard de gesto consume como máximo una intención: cancela al superar 5 px, ante varios pointers, cancelación, salida o wheel; pan y estado deshabilitado no seleccionan. Se omiten callbacks posteriores de nodos solapados. Teclado/nombres accesibles y resaltado permanecen disponibles. La regla se limita a SEAT de sólo lectura con callback de selección, sin movimiento ni captura de creación y fuera de `tracePresentation`; Manual/Trace editable conservan sus handlers.

## Verificación

Pruebas de Floorplan **133/133** (17 archivos); Client `ActiveEventWorkspacePage` **52/52**; Admin Floorplan **149/149**. Lint/typecheck/build de Floorplan y dependencias/consumidores Admin, Client y Scanner: **18/18** tareas aprobadas. Se cubren centros de 50 Seats, orden invertido, vecinos solapados, empates exactos, bloqueados, ocupados, límite/fuera de radio, traslación, escalas 0.5/1/2.0736/4, gesto doble, drag, pinch, wheel y accesibilidad DOM. Konva y DOM ejecutan la misma fixture/gestos; incluye contenedor recortado con canvas más ancho.

Publicación obligatoria de guías **PASS en la primera ejecución**: journey UX02, 39 PNG con inventario/hashes/máscaras y sin QR decodificable, PDF de 14/21/2 páginas con assertions de imágenes/paginación/overflow/ancho móvil, cinco checks de tooling. Admin y Salón conservan el contenido regenerado; Usabilidad se restaura por variar sólo CreationDate/ModDate. La verificación final vuelve a comprobar los artefactos y el mismo hash de runtime de la reproducción.

La reproducción nativa y los detalles de cierre se registran en [results.json](evidence/calca-blocker04/attempts/reproduction/results.json) y [qa.json](evidence/calca-blocker04/qa.json). Método e instrucciones en [README](evidence/calca-blocker04/README.md).

| Reproducción real | Centros resueltos | Zoom                 | Asignación HTTP → PostgreSQL → reload | Escrituras de geometría Planner |
| ----------------- | ----------------: | -------------------- | ------------------------------------- | ------------------------------: |
| 1440×900, mouse   |             19/19 | 1 / 2.0736 / 4 + pan | UUID exacto, misma Mesa/Lugar         |                               0 |
| 1024×768, touch   |             19/19 | 1 / 2.0736 / 4 + pan | UUID exacto, misma Mesa/Lugar         |                               0 |

Cada viewport conserva 50 Seats, realiza un único POST `assign-seats` con el Seat seleccionado y luego lo desasigna por el flujo existente. Se leen `floorplan_shape_id` y `floorplan_seat_id` directamente de PostgreSQL y se verifica label/selección tras recargar. El runner verifica Finance/check-in y limpia sus recursos propios. No se afirma exactly-once ni se cambia el comportamiento transaccional.

Ejemplo del punto original `(0.33150371, 0.37560058)` a 2.0736x (CSS px; precisión completa en JSON):

| Viewport | Gesto observado          | Centro esperado          | Centro rival             | Distancia esperado / rival | Resultado     |
| -------- | ------------------------ | ------------------------ | ------------------------ | -------------------------- | ------------- |
| 1440     | (835.406067, 690.111816) | (835.406093, 690.111794) | (801.184000, 711.571750) | 0.000034 / 40.394042       | UUID esperado |
| 1024     | (414.056824, 619.678223) | (414.056824, 619.678225) | (389.211584, 635.258153) | 0.000002 / 29.326100       | UUID esperado |

En ambos casos POST/DB/reload conservan `f3ec1772-c517-4a17-8d5e-c8062bd33dbb`, `Lugar 1`, parent `4422ed1c-4893-498f-b8d1-eecfff186d98`. Son identificadores de una fixture ficticia eliminada al terminar.

Capturas a 207.36%:

| Viewport | Antes                                                                                      | Punto original seleccionado                                                                    | Vecino independiente                                                                   |
| -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1440     | [Plano](evidence/calca-blocker04/attempts/reproduction/1440-01-dense-before-selection.png) | [Lugar esperado](evidence/calca-blocker04/attempts/reproduction/1440-02-expected-selected.png) | [Vecino](evidence/calca-blocker04/attempts/reproduction/1440-03-neighbor-selected.png) |
| 1024     | [Plano](evidence/calca-blocker04/attempts/reproduction/1024-01-dense-before-selection.png) | [Lugar esperado](evidence/calca-blocker04/attempts/reproduction/1024-02-expected-selected.png) | [Vecino](evidence/calca-blocker04/attempts/reproduction/1024-03-neighbor-selected.png) |

Abrir el panel existente cambia el área visible del canvas; para las capturas seleccionadas se hace pan mediante su toolbar conservando la selección. El JSON añade centro e ID resaltado y verifica que el marcador esté dentro del canvas/viewport antes del PNG. No se alteran estilos ni estado mediante evaluación de página.

Comandos focalizados:

```powershell
pnpm --filter @invitaciones/floorplan test
pnpm --filter @invitaciones/client exec vitest run src/workspace/ActiveEventWorkspacePage.test.tsx
pnpm --filter @invitaciones/admin exec vitest run src/events/admin-event-preparation.test.tsx
pnpm exec turbo run lint typecheck build --filter=@invitaciones/floorplan... --filter=@invitaciones/client... --filter=@invitaciones/admin... --filter=@invitaciones/scanner... --concurrency=1
```

## Intentos iniciales y límites

Los primeros typechecks detectaron inicialización de refs/tipos opcionales y una opción de test incompatible con Testing Library; se corrigieron antes de los PASS. La primera reproducción pasó el punto original y falló al vecino; la investigación encontró diferencias entre el contenedor recortado y el contenido pintado, además del posicionamiento del arnés. Se corrigió el frame y añadió una regresión explícita. El segundo intento pasó los centros a 1x/2.0736x pero solicitó un click fuera del canvas visible a 4x. El intento siguiente también evidenció que el arnés intentaba desplazar un ancestro que no hacía visible el punto. El cuarto completó las selecciones y asignación de escritorio, pero su assertion de texto tenía un separador mal codificado; se corrigió sólo el literal del arnés. Esos fallos se conservan por separado y no se ocultan como un primer PASS. Los dos arranques sin `npm_execpath` no ejecutaron el journey. El primer lint del arnés detectó un import sin uso y la declaración global de `requestAnimationFrame`; el lint final pasa.

No se ejecuta QA full, DT09 ni CALCA-06 completo. No se declara flakiness cero. No se modifican timeouts, reintentos ni assertions para obtener PASS.

Dos ejecuciones funcionales completas y la ejecución final con marcadores visibles pasan 38/38 cada una. Los dos cierres finales registran explícitamente salida 0 del arnés y del proceso; la primera pasada completa tenía diagnóstico PowerShell por stderr de Prisma y no un fallo del journey. No se atribuyen los errores iniciales de navegación/texto a temporalidad del producto. El warning de tamaño de bundle es heredado y no falla el build. La revisión React conserva la pila MUI, handlers/ref locales, nombres accesibles y callbacks existentes de edición; no incorpora listeners globales de producción ni estado de negocio nuevo.

## Pendiente fuera de este ticket

La superposición de nombres de 100/200 Mesas sigue siendo P1 y requiere ticket propio. Los P2 históricos siguen abiertos: texto decorativo, botones heredados de 42 px, puntos muy próximos que requieren zoom/selección por nombre y pulido de etiquetas/contraste. Resolver esta selección no autoriza un piloto ni reemplaza la recertificación CALCA-06. No se elimina UI ni código legado.
