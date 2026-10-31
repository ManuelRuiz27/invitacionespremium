# CALCA-06 — Certificación final de Modo Calca

**Dictamen: BLOCKED. Recomendación: BLOCKED para piloto comercial controlado.** Un QA completo verde no compensa el defecto de integridad observado al desasignar un Lugar desde Planner. No se implementó una corrección dentro de este ticket.

Producto certificado: `main` en `fd0756d68946b91272a4363a67d3b2caa475bbe6` (CALCA-05). Hash SHA-256 del runtime: `2128973ca424f148dfdf86e94675e20d4ece58d2bc4b37fea03657813419eace`. El commit de este informe sólo agrega documentación y evidencia; no cambia ese producto. Ejecuciones locales del 30 y 31 de octubre de 2026, con horas UTC en los JSON.

La certificación sigue [roadmap 24](./24_FLOORPLAN_TRACE_MODE_ROADMAP.md), [UX Calca](../03-diseno/FLOORPLAN_TRACE_MODE_UX.md), [QA02](./QA02_CI_QA_EXECUTION.md) y los contratos especializados vigentes. El procedimiento, las fuentes ficticias y las limitaciones están en [evidence/calca06](./evidence/calca06/README.md). No se añadieron features, endpoints, estados, permisos, migraciones, SDK, lógica de dominio ni límites comerciales. No se borró UI.

## 1. Alcance y método

Se utiliza Admin, Planner y Scanner reales con API y PostgreSQL reales en bases efímeras exclusivas del harness. Las sesiones usan los roles existentes. La preparación SQL de fixtures no se presenta como una nueva capacidad de activación: el journey M01 vigente se ejecutó en `qa:full`.

Las fuentes son planos ficticios dibujados mediante geometría y texto explícitos: horizontal 1600×1000, vertical 1000×1500, cuadrado 1200×1200 y SVG irregular sanitizado de 100/200 elementos. Sin OCR, IA ni CAD. La creación de Mesas y los 50/150 lugares de los recorridos principales pasan por la UI. Los ensayos de 50/100/200 Mesas preparan volumen mediante operaciones API existentes y verifican selección y revisión en la UI; certifican escala gráfica, no capacidad comercial nueva. El Evento mantiene capacidad 150.

Los viewports son 1440×900 y 1024×768. La segunda configuración usa emulación táctil y tap nativo; el ensayo de gestos incluye pan/pinch nativo CDP. No es una prueba física de tablet ni Scanner. La corrección múltiple utiliza los modificadores de teclado existentes.

Las colocaciones son seriales, esperando confirmación y lectura autoritativa. Las cantidades de POST y los hashes de identidad son evidencia de esos ensayos; **no se declara exactly-once** ni idempotencia nueva. Las capturas son PNG nativos del viewport con datos ficticios, sin URLs, tokens o credenciales.

## 2. Hallazgos que bloquean el piloto

### P0 — Desasignar deja una referencia persistida al Lugar

Secuencia reproducida: distribución SEAT finalizada → Planner asigna o abre una asignación existente → «Quitar Mesa» → HTTP 200. En PostgreSQL, `floorplan_shape_id` queda `NULL`, pero `floorplan_seat_id` conserva el mismo UUID. El contrato exige limpiar ambos campos al desasignar.

La proyección del Croquis muestra ese Lugar con `occupied: false`. Después de desbloquear mediante la operación existente, Provider intenta eliminarlo y recibe `409 FLOORPLAN_SEAT_OCCUPIED`. La UI y las restricciones persistidas discrepan sobre disponibilidad. No se debe operar el piloto con esa inconsistencia ni proponer reparación manual de datos como workaround.

Evidencia inicial: [intento 3](./evidence/calca06/attempts/attempt-3/results.json). Confirmación y prueba de impacto: [intento 4](./evidence/calca06/attempts/attempt-4/results.json), hallazgo `SEAT_UNASSIGN_RETAINS_SEAT` y escenario `released-seat-conflict-probe`. Los JSON publican las condiciones y hashes, sin identificadores de personas. La descripción inicial de un intento no sustituye el valor observado: la API proyecta **libre**, mientras DELETE rechaza por ocupado.

Trazabilidad de código, sólo lectura:

- [SeatingWorkspace](../../apps/client/src/workspace/SeatingWorkspace.tsx): `onUnassign` utiliza `UPDATE` con `tableShapeId: null` y el endpoint vigente de seating.
- [DTO](../../apps/api/src/floorplan/floorplan.dto.ts): el contrato actual de esa operación sólo recibe `tableShapeId`.
- [Floorplan service](../../apps/api/src/floorplan/floorplan.service.ts): la actualización por Mesa no limpia la referencia exacta.
- [Contrato detallado, §6](../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md): desasignar limpia Mesa y Lugar; no se permite divergencia entre ambos.

El servicio API y workspace Client de esos caminos son idénticos a los anteriores a CALCA-00 (`c4d3997969ed2793c63c41cc60c8d491407a1fd1`): blobs Git `06081d04f0ea3137f9fc1faef04ce409195f7e5c` y `7f96f9793fcfbff5338b4356fb5e1424585f95d5`, respectivamente. Es un defecto previo descubierto por un gate más fuerte, no una regresión introducida por documentación CALCA-06.

**Corrección de la evidencia anterior:** CALCA-05 consideró suficiente observar Mesa nula al desasignar. Eso no certifica que el Lugar se libere. Su afirmación de paridad del consumidor SEAT queda limitada por este resultado. El informe histórico no se usa como sustituto de la comprobación de ambos campos.

### P1 — Selección de Lugar distinta al punto elegido en un plano denso de Planner

En el fixture vertical de 50 lugares, tras corregir un Lugar fuera del bbox de su Mesa —coordenadas globales válidas—, un click nativo en el centro del Lugar esperado selecciona/asigna otro Lugar. Se observa usando los controles actuales de zoom al 207.36%. El [intento 4](./evidence/calca06/attempts/attempt-4/results.json), hallazgo `DENSE_SEAT_HIT_TARGET`, conserva punto normalizado y hashes distintos del UUID esperado y del asignado.

En [Konva](../../packages/floorplan/src/FloorplanKonvaRenderer.tsx), el radio/hit area del render normal del consumidor escala junto con el plano; Trace tiene otro tratamiento de presentación. Esto explica una posibilidad de solapamiento y debe investigarse en un ticket de corrección. No se generaliza a toda selección ni se declara que subir el zoom resuelva este caso. El diálogo explícito de cambio de Lugar permite elegir por etiqueta, pero no certifica la precisión de la selección directa requerida.

### P1 — Lista de Mesas superpuesta al canvas en tablet

Con 100 Mesas a 1024×768, abrir «Mesas y zonas», seleccionar por nombre y cerrar la lista deja el canvas encima del `summary` y de parte de los botones. El click normal no alcanza el control: Playwright registra `canvas intercepts pointer events` durante el timeout de 15 s vigente. La [captura inicial](./evidence/calca06/attempts/attempt-6/failure.png) muestra texto/lista detrás del plano; [el intento 6](./evidence/calca06/attempts/attempt-6/results.json) conserva el fallo completo.

Se continúa el ensayo independiente con foco y Enter nativos, sin forzar clicks, inyectar estilos o cambiar el DOM. Esa alternativa no convierte el escenario con puntero/touch en PASS. Se registra como `DENSE_NAME_LIST_OVERLAP`, se mantiene P1 y se requiere corrección separada. Es un problema operacional de la alternativa por nombre precisamente cuando la densidad la vuelve necesaria.

La repetición acotada [intento 7](./evidence/calca06/attempts/attempt-7/results.json) lo reproduce con 100 Mesas en tablet y 200 en ambos viewports: [100/1024](./evidence/calca06/attempts/attempt-7/name-list-100-1024-close-0.png), [200/1440](./evidence/calca06/attempts/attempt-7/name-list-200-1440-close-1.png), [200/1024](./evidence/calca06/attempts/attempt-7/name-list-200-1024-close-2.png).

### P1 — PHYSICAL_QR permite construir lugares exactos

El [intento 9](./evidence/calca06/attempts/attempt-9/results.json) verifica un Evento ficticio legacy `SELF_SERVICE / PHYSICAL_QR`. Admin ofrece «Por lugar exacto», el PATCH de modo devuelve 200, se habilita «Trazar lugares» y se persiste un Seat. Se reproduce a [1440](./evidence/calca06/attempts/attempt-9/physical-1440-observed-trace.png) y [1024](./evidence/calca06/attempts/attempt-9/physical-1024-observed-trace.png).

Esto contradice la compatibilidad TABLE-only de PHYSICAL_QR en la UX Calca y el contrato detallado. No se certifica ni autoriza asignar pases físicos a Seats. No amplía la dirección comercial M01 ni convierte el fixture legacy en una nueva oferta. La suite histórica PHYSICAL_QR pasa sus journeys actuales, pero no cubría esta entrada administrativa a SEAT. ANONYMOUS sí rechaza el cambio con 409 `PHYSICAL_PASS_TABLE_INVALID` y mantiene cero Seats.

### P1 — Capacidad asignable desincronizada al pasar de TABLE a SEAT

La revisión final de capturas motivó un probe independiente: dos Mesas TABLE con capacidad 12/24 → cambiar a SEAT → revisar sin crear Seats. La API conserva capacidades 12/24 con **cero** lugares activos no bloqueados, en vez de la capacidad derivada exigida por §7 del contrato detallado. [Intento 10](./evidence/calca06/attempts/attempt-10/results.json), [1440](./evidence/calca06/attempts/attempt-10/capacity-1440-review-zero-places.png), [1024](./evidence/calca06/attempts/attempt-10/capacity-1024-review-zero-places.png).

La revisión muestra correctamente «0 definidos» y la advertencia «Sin lugares definidos», pero también «12/24 asignables» porque usa la autoridad actual. No es un cálculo inventado por el frontend: falta sincronización en la autoridad. Es P1 operacional por capacidad disponible engañosa. No se creó una regla de readiness ni se bloqueó el botón en frontend; corregirlo requiere un ticket separado sobre el contrato existente. Este probe realiza cero escrituras de Seats.

## 3. Matriz de escenarios y evidencia visual

La matriz verificable se entrega junto con los resultados de cada intento. Un PASS de construcción no se convierte en PASS de extremo a extremo si falla el consumidor. Los escenarios no alcanzados por un error del harness se identifican separadamente; no son aprobados por inferencia.

[Matriz completa](./evidence/calca06/MATRIX.md), [resultados estructurados](./evidence/calca06/scenario-matrix.json), [capturas y medidas DOM](./evidence/calca06/screenshots.json), [P2](./evidence/calca06/remaining-p2.json) y [ledger de fallos/repeticiones](./evidence/calca06/qa/execution-ledger.json).

| Fuente            | Lugares / Mesas | Construcción, corrección, revisión, lock y reload a 1440 / 1024 | Handoff SEAT                    |
| ----------------- | --------------- | --------------------------------------------------------------- | ------------------------------- |
| Raster horizontal | 150 / 6         | PASS / PASS                                                     | FAIL: desasignación             |
| Raster vertical   | 50 / 2          | PASS / PASS                                                     | FAIL: precisión / desasignación |
| Raster cuadrado   | 50 / 2          | PASS / PASS                                                     | FAIL: precisión / desasignación |
| SVG irregular 200 | 50 / 2          | PASS / PASS                                                     | FAIL: precisión / desasignación |

Son 600 colocaciones continuas de la etapa principal, seriales y confirmadas, con 25 por Mesa. Las correcciones y probes adicionales se registran aparte. La falla del primer handoff a 1440 impide alcanzar Scanner en ese caso; los otros siete escenarios SEAT sí verifican asignación, cambio de Lugar y localización Scanner, y fallan posteriormente al desasignar. TABLE comprueba asignar/mover/desasignar y Scanner en ambos viewports.

| Estado clave (captura nativa) | 1440                                                                                      | 1024×768                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Plano cargado                 | [entrada](./evidence/calca06/attempts/attempt-5/landscape-1440-01-entry.png)              | [entrada](./evidence/calca06/attempts/attempt-6/landscape-1024-01-entry.png)              |
| Trace activo, 25 lugares      | [trazando](./evidence/calca06/attempts/attempt-5/landscape-1440-02-trace-25.png)          | [trazando](./evidence/calca06/attempts/attempt-6/landscape-1024-02-trace-25.png)          |
| Corrección                    | [selección/panel](./evidence/calca06/attempts/attempt-5/landscape-1440-03-correction.png) | [selección/panel](./evidence/calca06/attempts/attempt-6/landscape-1024-03-correction.png) |
| Revisión 150 lugares          | [revisión](./evidence/calca06/attempts/attempt-5/landscape-1440-04-review.png)            | [revisión](./evidence/calca06/attempts/attempt-6/landscape-1024-04-review.png)            |
| Finalizada y recargada        | [sólo lectura](./evidence/calca06/attempts/attempt-5/landscape-1440-05-finalized.png)     | [sólo lectura](./evidence/calca06/attempts/attempt-6/landscape-1024-05-finalized.png)     |
| Scanner SEAT                  | [Mesa/Lugar](./evidence/calca06/attempts/attempt-5/portrait-1440-scanner.png)             | [Mesa/Lugar](./evidence/calca06/attempts/attempt-6/portrait-1024-scanner.png)             |

En la etapa Trace normal, el canvas domina frente a los controles, Manual/SVG siguen visibles como secundarios y los paneles contextuales no dimmean el plano. No se observa overflow horizontal ni backdrop modal en esas capturas. Esto no se generaliza a la lista densa: sus P1 quedan abiertos. Los viewports, áreas y targets medidos constan en los JSON; la revisión visual no convierte todos los controles en conformes a 44 px.

| Regresión independiente                                    | 1440                      | 1024×768                                          |
| ---------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| TABLE 50: selección, capacidades autoritativas, cero Seats | PASS                      | PASS                                              |
| TABLE 100                                                  | PASS                      | FAIL P1 lista superpuesta                         |
| TABLE 200                                                  | FAIL P1 lista superpuesta | FAIL P1 lista superpuesta                         |
| Revisión TABLE después de cerrar por teclado               | PASS en 50/100/200        | PASS en 50/100/200; el gate de puntero sigue FAIL |
| SVG 100/200: selección nativa, cancelar sin Shape huérfano | PASS                      | PASS                                              |
| Recuperación, gestos y lock/unlock                         | PASS                      | PASS                                              |
| PHYSICAL_QR TABLE-only                                     | FAIL P1                   | FAIL P1                                           |
| Capacidad derivada al cambiar TABLE→SEAT sin lugares       | FAIL P1                   | FAIL P1                                           |

SVG adicional: cinco uploads hostiles devuelven 400 (script, foreignObject, handler, DTD/XXE y referencia externa). Reemplazar SVG 200→100 requiere confirmación explícita de desvinculación; cancelar conserva la fuente, confirmar preserva UUID/etiqueta/padre de Seats, UUID de Shapes y asignación, y limpia los bindings SVG. [Intento 8](./evidence/calca06/attempts/attempt-8/results.json).

Integridad y recuperación en [intento 9](./evidence/calca06/attempts/attempt-9/results.json), ambos viewports: doble gesto pendiente produce un POST; pan/zoom/drag/toolbar producen cero escrituras (pinch táctil incluido en 1024); Terminar conserva Mesa y sus confirmaciones; TABLE/sin padre/lock no ofrecen trazado. 409/429/503 antes de commit, timeout antes de envío, respuesta perdida después de commit real, write confirmado con GET 503 y lock concurrente real detienen la sesión sin replay. Dos intenciones explícitas de lock, separadas por un unlock, producen dos POST: no son reintentos. Lock confirmado con GET fallido conserva el estado «Guardado · falta actualizar» y no repite el lock; respuesta perdida recupera la autoridad mediante lectura. Reload conserva la identidad y sólo lectura. Capturas: [confirmado/GET fallido 1440](./evidence/calca06/attempts/attempt-9/recovery-1440-lock-confirmed-refresh-failed.png), [1024](./evidence/calca06/attempts/attempt-9/recovery-1024-lock-confirmed-refresh-failed.png).

Renombrar/renumerar conserva UUID y padre, movimiento simple/múltiple conserva posiciones relativas y permite coordenadas fuera del bbox padre. Bloquear/eliminar ocupado se rechaza por UI y API 409; renumerar conserva asignación. Manual y Trace eligen etiquetas libres después de bajas/renombres. Son gates de la etapa de construcción, distintos del defecto P0 posterior de desasignación.

## 4. QA completo y sensibilidad temporal

`pnpm qa:full`: **PASS inicial**, 2381.62 s de pipeline (39:41.62); wrapper 2382.36 s. No se repitió el QA completo ni se alteraron timeouts, retries o assertions.

| Capa                                                            | Resultado inicial                      |
| --------------------------------------------------------------- | -------------------------------------- |
| Formato, lint, typecheck, Prisma/migraciones, OpenAPI/SDK/rutas | PASS                                   |
| Vitest, ocho workspaces                                         | 1659/1659                              |
| Checks Node SDK                                                 | 9/9                                    |
| Tooling de QA                                                   | 18/18                                  |
| Integración API, PostgreSQL aislado                             | 481/481, 38 archivos                   |
| Builds                                                          | 8/8                                    |
| M01 y PHYSICAL_QR                                               | 4/4 journeys                           |
| ACCESS_CONTROL / UX01 / DT09 operacional                        | 3/3 journeys                           |
| Catálogo/contratos/cobros PR01/PR02/PR03                        | 3/3 journeys                           |
| Flipbook Chromium/WebKit                                        | 74/74                                  |
| Guías                                                           | 5/5 tests; 39 PNG; PDF 14/21/2 páginas |

Vitest: API 434, SDK 169, UI 6, Floorplan 110, Landing 67, Scanner 62, Client 466 y Admin 345. Los nueve checks Node SDK son adicionales. No se suman ejecuciones repetidas a la cantidad de casos únicos. El warning de `pg` sobre consultas simultáneas en un cliente es previo y no equivale a un fallo del test; permanece registrado.

CALCA-05 había tenido tres fallos Admin transitorios y después 14/14 focalizados. Aquí Admin pasa inicialmente 345/345; dentro de esa ejecución preparación pasa 142/142 (87.629 s de tests del archivo). Después del cierre de QA completo se realizaron dos observaciones seriales independientes del mismo archivo: 142/142 (Vitest 105.38 s; wrapper 106.60 s) y 142/142 (112.97 s; wrapper 114.14 s). Son tres observaciones sin reproducción de aquel fallo, **no evidencia de flakiness cero ni demostración de su causa resuelta**.

Los fallos iniciales de los nuevos guiones de evidencia y sus repeticiones se registran aparte. No se ocultan con el resultado verde de las suites existentes. El informe separa errores de importación/selectores/posicionamiento del harness, defectos del producto y negativos HTTP intencionales.

| Ejecución nueva de evidencia              | Fallo inicial / continuación                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint inicial                              | Import sin uso en guion nuevo; corregido sólo en evidencia. Lint posterior PASS.                                                                                             |
| Inicial, antes del navegador              | Ruta relativa de import incorrecta; no ejecutó fixtures.                                                                                                                     |
| Intento 2                                 | Primer fallo P0 al comprobar liberación del Seat. No se declaró PASS.                                                                                                        |
| Intento 3                                 | P0 conservado; pointer absoluto fuera de destino visible en retrato. Se cambia sólo el guion a locator nativo con scroll.                                                    |
| Intento 4                                 | P0 y P1 de precisión; selector parcial de destino coincidía con once botones. La continuación usa nombre exacto.                                                             |
| Intento 5                                 | Cuatro construcciones desktop PASS, consumidor FAIL; el guion esperaba el título desktop de Manual en tablet. La UI ofrecía correctamente su catálogo compacto.              |
| Intento 6                                 | Cuatro construcciones tablet PASS, consumidor FAIL; P1 de lista a 100 Mesas detiene escala.                                                                                  |
| Intento 7, sólo soporte                   | P1 reproducido a 100/200 Mesas; TABLE consumidores y SVG 100/200 pasan. El 201 frente a 200 documentado detiene setup de reemplazo: discrepancia P2 registrada, no ignorada. |
| Intento 8, SVG/recuperación/restricciones | SVG/security/reemplazo PASS. El guion intentaba entrar nuevamente después de unlock, cuando Trace ya estaba correctamente conservado. No es fallo del producto.              |
| Intento 9, recuperación/restricciones     | Recuperación PASS en ambos viewports. PHYSICAL_QR FAIL en ambos, ANONYMOUS PASS. Termina BLOCKED por el P1; sin fallos de harness.                                           |
| Intento 10, capacidad                     | Confirma P1 de capacidad 12/24 frente a cero lugares, en ambos viewports. Cero Seats escritos; sin fallo de harness.                                                         |

No se aumentó ningún timeout/retry ni se debilitó una assertion del producto. La alternativa de teclado conserva el FAIL de puntero; el cambio de expectativa HTTP queda registrado como P2 y sólo permite preparar el fixture restante. El ledger mantiene hashes de todos los logs locales, sus extractos, resultados iniciales y metadatos de cada repetición. No se combinan observaciones parciales para afirmar una ejecución completa verde.

La primera verificación de PNG rechazó un objeto candidato de jsQR vacío: cero bytes, texto y chunks. Se conservan el fallo y el diagnóstico; la verificación final usa el criterio del verificador oficial de guías, que rechaza todo payload QR no vacío. No se borró, editó ni enmascaró retroactivamente una captura para lograr el resultado.

El render de guías sólo cambió fechas de creación/modificación de tres PDF. Antes de restaurarlos a HEAD se verificó contenido idéntico eliminando únicamente esas fechas; se conserva `metadata-restoration.json`. No forman parte del diff final.

## 5. DT09 aislado y serial

Ejecutado dentro de la fase de integración de `qa:full`, mediante el harness documentado, con DB propia y sin otros builds, tests ni navegador de certificación simultáneos. No se lanzó integración contra la base compartida. Cada modalidad conserva 150 derechos, dos lectores y cinco Mesas; muestras del dashboard durante escaneos.

| Modo      | Dashboard p95 ms / muestras | Scanner p50 / p95 / máximo ms | Errores / deadlocks |
| --------- | --------------------------- | ----------------------------- | ------------------- |
| NOMINAL   | 53.87 / 181                 | 98.36 / 137.58 / 159.15       | 0 / 0               |
| ANONYMOUS | 49.37 / 180                 | 40.78 / 80.88 / 3811.39       | 0 / 0               |

Los gates vigentes son p95 dashboard ≤1500 ms, Scanner ≤2000 ms y al menos 20 muestras. El máximo ANONYMOUS de 3811.39 ms se reporta; no se confunde con incumplimiento de p95. ANONYMOUS registra 19 conflictos P2034 recuperados, 16 rollbacks y como máximo un waiter; no son errores finales ni deadlocks. NOMINAL no registra conflictos serializables. Los JSON conservan operaciones y medidas; no se declara SLA de producción.

## 6. Tiempos observados y ergonomía

Medición local, Node 22.18.0, pnpm 11.15.1, PostgreSQL 16.15, Windows x64, Intel i3-1215U (ocho procesadores lógicos), 16.835 GB RAM, red loopback sin throttling. La versión exacta de Chromium consta en cada intento.

Los tiempos son de automatización wall time desde plano cargado; crear incluye guardar y GET posterior; trazar incluye la activación y confirmación serial de cada POST; finalizar incluye lock y GET. Se excluyen setup y capturas intermedias del tramo medido. No miden velocidad de un operador humano.

| Fuente / viewport | Entrar Calca s | Crear Mesa s | Trazar 10 s | Trazar 25 s | Revisar s | Finalizar s |
| ----------------- | -------------: | -----------: | ----------: | ----------: | --------: | ----------: |
| landscape-1440    |           0.20 |         0.39 |        2.00 |        4.98 |      0.29 |        0.23 |
| portrait-1440     |           0.17 |         0.42 |        1.84 |        4.71 |      0.27 |        0.21 |
| square-1440       |           0.17 |         0.42 |        1.92 |        4.91 |      0.17 |        0.27 |
| svg-200-1440      |           0.28 |         0.38 |        2.29 |        5.31 |      0.25 |        0.18 |
| landscape-1024    |           0.22 |         0.60 |        2.57 |        6.09 |      0.29 |        0.38 |
| portrait-1024     |           0.18 |         0.44 |        2.23 |        5.51 |      0.25 |        0.31 |
| square-1024       |           0.16 |         0.41 |        2.00 |        4.86 |      0.22 |        0.18 |
| svg-200-1024      |           0.21 |         0.56 |        2.66 |        6.12 |      0.25 |        0.20 |

Ocho observaciones, una por fuente/viewport: [datos exactos](./evidence/calca06/timings.json). No se seleccionan sólo los tiempos más rápidos. Los intentos previos conservan sus tiempos propios; no se mezclan con éstos para construir una media.

**No existe una línea base pre-Calca comparable. No se afirma mejora porcentual ni ahorro de tiempo.** Tampoco se comparan estos tiempos Windows con GitHub Actions.

## 7. P2 re-evaluados y límites no bloqueantes

No se corrigen en CALCA-06. El objetivo táctil documentado sigue siendo 44×44; controles heredados de 42 px no se declaran conformes.

| P2 / límite                                               | Impacto y tratamiento actual                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botones heredados de 42 px y disclosures menores          | Incumplimiento parcial del target de 44 px en controles secundarios; usar puntero/teclado en piloto supervisado. No exime el objetivo.                                                                                                                                                                                                                                                        |
| Texto decorativo sobre mobiliario                         | Re-inspeccionado en [referencia visual CALCA-05 del mismo hash de runtime](./evidence/calca06/qa/calca05-decorative-reference-1440.png): «Pista» compite con el texto impreso. Es evidencia histórica re-evaluada, no una captura nueva de CALCA-06. No bloquea esas acciones; zoom/pan ayuda, sin prometer toda rotulación legible a escala inicial.                                         |
| Puntos de Seats muy próximos en Trace                     | Usar zoom y «Seleccionar lugar por nombre»; el panel expone la etiqueta completa. Se conserva la distinción respecto del P1 de precisión del consumidor Planner.                                                                                                                                                                                                                              |
| Explicación de SVG deshabilitado mediante title en raster | Descubribilidad débil en touch; la herramienta sigue presente y funciona con SVG. No se presenta tooltip hover como ayuda táctil completa.                                                                                                                                                                                                                                                    |
| Contraste/rotulación restantes                            | Lugares sin seleccionar omiten etiquetas largas en Trace; el seleccionado muestra etiqueta completa y nombre accesible. La presentación normal de sólo lectura puede conservar clutter heredado.                                                                                                                                                                                              |
| Multi-selección con modificador                           | Se conserva el comportamiento de teclado existente; no se certifica un gesto multi-select exclusivamente táctil nuevo.                                                                                                                                                                                                                                                                        |
| HTTP de asignación exacta                                 | En el setup de reemplazo SVG, `POST seating/assign-seats` devuelve 201; OpenAPI/SDK documentan 200. El intento 7 conserva esa assertion fallida. La continuación prepara el fixture exigiendo explícitamente el 201 observado, sin modificar API/SDK ni dar por conforme su documentación. El cuerpo y los consumidores funcionan con ese 2xx; corregir la discrepancia requiere otro ticket. |

Las capturas y las medidas DOM permiten comprobar canvas dominante, overflow, panel contextual y tamaños. La inspección visual no prueba ergonomía física prolongada ni reemplaza una prueba con operadores. Estos límites no convierten los P0/P1 en aceptables.

## 8. Candidatos para un ticket separado de limpieza

No hay autorización ni prueba suficiente para retirar Manual, SVG, inventario o engine/fallback. El reemplazo operacional completo está bloqueado.

| Candidato acotado                                                                                  | Evidencia y condición para limpieza futura                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prop `selectedTableName` de `AdminFloorplanTraceEntry`                                             | Se declara/pasa, pero no se consume en su cuerpo. Validar typecheck y regresión del estado de selección antes de retirarla.                                               |
| Condicional `compact` anidado dentro de la misma rama compact de `AdminFloorplanPreparationHeader` | Duplicación estática demostrable. Simplificar sólo en ticket posterior con comparación de header y recovery.                                                              |
| Finalización en opciones históricas y footer de revisión                                           | Dos affordances para la misma operación; son candidatas a consolidación, no a borrado inmediato: Manual/SVG, lock, error y navegación deben conservar rutas equivalentes. |

No se propone eliminar protecciones de ocupación, recuperación, confirmaciones, lock/unlock, sanitización/reemplazo SVG, historial Shape ni alternativas accesibles. No existe undo/redo persistido de Seats y no se simula mediante borrar/recrear.

## 9. Decisión y siguiente paso

**BLOCKED.** Abrir tickets correctivos separados para los hallazgos P0/P1, mantener los contratos existentes y repetir los gates afectados con comprobación de UUID/Mesa/Lugar y disponibilidad autoritativa. Conservar las observaciones iniciales y repetir el journey Provider → Planner → Scanner antes de reconsiderar un piloto. CALCA-06 entrega evidencia; no incorpora esas correcciones.

Resultado: **un P0, cuatro P1 y siete P2/limitaciones documentadas**. Los candidatos de limpieza no autorizan ningún borrado. [Verificación de artefactos y limpieza](./evidence/calca06/qa/final-verification.json), [manifiesto SHA-256](./evidence/calca06/manifest.json). Las bases efímeras propias fueron eliminadas; los contenedores y procesos de desarrollo preexistentes no se alteraron.
