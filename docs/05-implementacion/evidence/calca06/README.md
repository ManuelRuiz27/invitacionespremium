# Evidencia reproducible CALCA-06

Scope: certificación de las fuentes de producto del commit `fd0756d68946b91272a4363a67d3b2caa475bbe6`. No contiene features ni cambios de reglas. Los datos y planos son ficticios. El dictamen y los resultados cerrados se publican en [el informe](../../CALCA06_TRACE_MODE_CERTIFICATION.md).

## Ejecución

Desde la raíz del repositorio, con los requisitos de QA02 y PostgreSQL **loopback** que permita crear bases:

```powershell
New-Item -ItemType Directory -Force var/qa/calca06/performance | Out-Null
$env:DT09_PERF_DIR = Join-Path (Get-Location) 'var/qa/calca06/performance/full-initial'
pnpm qa:full
```

No ejecutar otros builds, tests o navegadores durante las cargas de integración. `qa:full` ejecuta las fases en serie; su harness crea/elimina la base propia. No se ejecuta `test:integration` directamente contra la base compartida.

Después de cerrar ese proceso:

```powershell
$env:npm_execpath = Join-Path (Split-Path (Get-Command pnpm).Source) 'node_modules/pnpm/bin/pnpm.mjs'
$env:CALCA06_ATTEMPT = 'initial'
$env:CALCA06_SCOPE = 'all'
pnpm exec node docs/05-implementacion/evidence/calca06/run.mjs
```

Elegir otro nombre de `CALCA06_ATTEMPT` para cada repetición, conservar el intento anterior y registrar motivo/resultado. No repetir automáticamente ni cambiar timeouts, retries o assertions para hacer pasar una prueba. Los guiones de certificación usan los contratos existentes; nunca son un endpoint del producto.

Para completar evidencia independiente después de un fallo ya registrado se explicita el alcance mediante `CALCA06_SCOPE`: `tablet-support` ejecuta las cuatro fuentes en tablet y luego las regresiones de escala/recuperación/restricciones; `support` ejecuta sólo esas regresiones; `svg-recovery-restrictions` omite TABLE; `recovery-restrictions` omite también SVG; `restrictions` sólo prueba elegibilidad. `capacity` contrasta la capacidad autoritativa tras TABLE→SEAT con cero lugares; `all` incluye también ese contraste. No se borra ni convierte en PASS el intento previo. Cada scope crea una base nueva; su PASS parcial no autoriza un piloto. Los resultados se consolidan con su intento de origen en [la matriz](./MATRIX.md), [tiempos](./timings.json), [capturas](./screenshots.json) y [ledger de ejecuciones](./qa/execution-ledger.json).

En la lista densa de Mesas, si el canvas intercepta un click durante el timeout vigente, se conserva el fallo P1, captura y volumen/viewport. Después se usa foco y Enter para continuar los ensayos independientes. El escenario con puntero sigue FAIL. No se usa `force`, inyección de estilos o activación programática de callbacks del producto.

`run.mjs` reutiliza el patrón del harness de `scripts/run-access-control-e2e.mjs`: comprueba puertos libres, exige PostgreSQL local, crea DB/storage/secretos propios, prepara migraciones, inicia API y apps y limpia únicamente sus descendientes y recursos. No termina procesos existentes ni migra datos compartidos. Los puertos son 5300/5373/5374/5375.

## Qué mide cada archivo

- `fixtures.mjs`: genera raster horizontal, vertical y cuadrado y SVG irregulares de 100/200 elementos. Sólo geometría/rotulación escritas manualmente, rasterizadas con Sharp; sin OCR/IA/CAD.
- `browser-helpers.mjs`: acciones nativas de navegador, medición del DOM y recorridos Planner/Scanner con sesiones reales. No inyecta callbacks del producto, estilos ni estado React.
- `certify.mjs`: upload por UI, Calca, Mesas, colocación continua, corrección, revisión, lock/reload, consumidores, escala gráfica, seguridad/reemplazo SVG y fallos de transporte. Los errores de red/HTTP inyectados están identificados; el resto usa API/PostgreSQL reales.
- `attempts/<intento>/results.json`: HEAD/hash de runtime, ambiente, escenarios, métricas, tiempos observados y errores de ese intento. Las capturas están junto al JSON.
- `fixtures.json`: tamaños, tipo y SHA-256 de los planos usados.

Los escenarios de 50/100/200 Mesas son regresión **gráfica** sobre un Evento de capacidad 150, no una ampliación comercial. Las Mesas se preparan por las operaciones API vigentes para alcanzar cada volumen; la selección/revisión se prueba por UI. La construcción Calca de las Mesas y los 50/150 lugares se hace por UI en los recorridos principales.

La transición a operación en fixtures completa el snapshot Managed y las transiciones existentes exclusivamente en la base aislada. No certifica por sí sola activación: ésta conserva su E2E M01 sin cambios dentro de `qa:full`.

## Tiempos, privacidad y límites

Los tiempos son wall time de automatización local: entrar desde plano cargado, crear una Mesa hasta el GET posterior, diez/25 colocaciones esperando confirmación y reconciliación, abrir revisión y confirmar lock con GET. Excluyen setup de datos y capturas intermedias. No son un estudio de operador humano ni SLA. No existe una línea base comparable pre-Calca y no se declara mejora porcentual.

La emulación 1024×768 usa `hasTouch` y tap nativo para colocar. El ensayo de recuperación agrega pan/pinch nativos por CDP. No equivale a aceptación física de tablet/Scanner. Las operaciones de multi-selección conservan los modificadores de teclado existentes.

Las capturas muestran exclusivamente el universo ficticio y el viewport, sin barra de URL. No se guardan contraseñas, cookies, tokens Staff/QR, respuestas privadas ni DOM completo. Los secretos viven en el proceso/storage efímero; se redactan al emitir un error. Los JSON publicados contienen métricas y hashes de identidad, sin UUID de personas ni conexiones. Los logs completos locales se conservan bajo `var/qa/calca06/`, ignorado por Git; el índice de ejecuciones conserva sus hashes y extractos de fallos.

Las comprobaciones de cantidades/calls acreditan esos ensayos bajo sus condiciones. No implican exactly-once ni idempotencia nueva para crear Seats. Cada resultado incierto detiene el trazado y recupera autoridad sin replay.
