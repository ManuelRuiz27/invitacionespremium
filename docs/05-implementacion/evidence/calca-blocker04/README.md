# Evidencia CALCA-BLOCKER-04

[Informe](../../CALCA_BLOCKER04_DENSE_SEAT_SELECTION.md). Reproducción focalizada; no es una recertificación CALCA-06.

Con dependencias/builds instalados, PostgreSQL loopback con CREATE DATABASE y Chromium:

```powershell
$env:npm_execpath = Join-Path (Split-Path (Get-Command pnpm).Source) 'node_modules/pnpm/bin/pnpm.mjs'
pnpm exec node docs/05-implementacion/evidence/calca-blocker04/run-reproduction.mjs
```

El runner copia a `var/qa/calca-blocker04` sólo el ciclo de recursos propios del runner histórico y sustituye namespace/entrypoint. Usa DB, storage y procesos propios en puertos 5300/5373/5374/5375; no termina procesos preexistentes. El contador heredado espera una persona ficticia confirmada. No ejecuta la certificación histórica ni las suites SVG/recovery que dan nombre a esa clave interna.

Se reutilizan el raster vertical original, el patrón de 50 Seats y el punto normalizado documentado en el intento 4. El snapshot completo de todos los UUID/coordenadas de aquel intento no se archivó: esta fixture reconstruye el patrón desde su generador y conserva exactamente el punto conocido; los UUID son nuevos. No se afirma identidad byte a byte de la antigua DB.

`reproduce.mjs` usa servicios reales, finalización Admin, gestos nativos de mouse/touch y asignación Planner. Lee la geometría pintada de Konva y observa `pointerup`; no inyecta estado ni estilos del producto. Cada observación publica coordenadas, distancias, rival más cercano y selección efectivamente resaltada. La asignación se comprueba en el payload HTTP, PostgreSQL y UI después de reload.

PNG con datos ficticios; sin credenciales ni QR utilizables. Los resultados y hashes finales se publican aquí; logs completos e intentos iniciales separados permanecen ignorados en `var/qa/calca-blocker04`. Archivar cada intento antes de repetir. CALCA-06 histórico permanece intacto.
