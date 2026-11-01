# Evidencia CALCA-BLOCKER-03B

Ejecuciones focalizadas de PostgreSQL/migración y reproducción nativa del intento 10; no sustituyen CALCA-06. [Informe](../../CALCA_BLOCKER03B_SEAT_CAPACITY_INVARIANTS.md).

Con dependencias/builds instalados, PostgreSQL loopback con CREATE DATABASE y Chromium:

```powershell
$env:npm_execpath = Join-Path (Split-Path (Get-Command pnpm).Source) 'node_modules/pnpm/bin/pnpm.mjs'
pnpm exec node docs/05-implementacion/evidence/calca-blocker03b/verify-migration.mjs
pnpm exec node docs/05-implementacion/evidence/calca-blocker03b/run-reproduction.mjs
```

El primer script crea dos DB propias (fresh/upgrade) y sus shadows; aplica el historial anterior desde una copia temporal, verifica el rechazo antiguo con una persona pendiente y comprueba el upgrade sin reescribir filas. Compara drift contra migraciones y separa el diff SQL/Prisma previo. No altera migraciones históricas ni la DB compartida.

El segundo copia a `var/qa/calca-blocker03b` únicamente el ciclo de recursos propios del runner histórico, cambia entrypoint/namespace y ejecuta `reproduce.mjs`. La clave de contador heredada espera una persona ficticia confirmada; no ejecuta suites SVG/recovery históricas. Requiere puertos 5300/5373/5374/5375 libres; no termina procesos preexistentes. Conserva Finance/check-in y elimina exclusivamente sus recursos al terminar.

Se reutilizan helpers puros y el raster de CALCA-06; su runner, scripts, informe y resultados no se sobrescriben ni ejecutan. PNG nativos sin datos reales, conexiones, tokens o QR. `qa.json` publica hashes/resúmenes; logs completos y diagnósticos SQL permanecen ignorados en `var/qa/calca-blocker03b`. Archivar una observación anterior antes de repetir y sobrescribir resultados.
