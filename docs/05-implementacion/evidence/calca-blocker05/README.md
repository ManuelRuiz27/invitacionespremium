# Evidencia CALCA-BLOCKER-05

Reproducción focalizada del intento 7, no recertificación CALCA-06. [Informe](../../CALCA_BLOCKER05_SCALABLE_TABLE_SELECTION.md).

Con dependencias/builds instalados, Chromium y PostgreSQL loopback con CREATE DATABASE:

```powershell
$env:npm_execpath = Join-Path (Split-Path (Get-Command pnpm).Source) 'node_modules/pnpm/bin/pnpm.mjs'
pnpm exec node docs/05-implementacion/evidence/calca-blocker05/run-reproduction.mjs
```

El wrapper copia sólo el ciclo de recursos propios del runner histórico a `var/qa/calca-blocker05`, reemplaza namespace/entrypoint y ejecuta este journey. Usa DB/storage/procesos propios y exige puertos 5300/5373/5374/5375 libres. No termina procesos ajenos ni modifica los contenedores existentes. El contador heredado `support` espera dos Asistentes ficticios confirmados; no ejecuta la antigua suite support ni CALCA-06.

Se reutilizan raster horizontal y patrón de posiciones/tamaños/nombres de 100/200 Mesas del intento 7. Son UUID nuevos de fixtures ficticias; no una copia de la antigua DB. El escenario de 50 Mesas agrega dos nombres largos con prefijo compartido y una zona no asignable. Los límites comerciales no se modifican: estas son regresiones gráficas con el Evento de 150 derechos del harness, no certificación comercial de activación.

La selección y los clicks/taps son nativos, sin `force`, estilos ni estado inyectados. Se lee geometría del canvas, selector, resumen y `elementFromPoint`. El probe DOM retrasa sólo la petición del módulo lazy Konva: verifica el fallback Suspense real con la imagen válida, sin simular el renderer. Las mutaciones de asignación se comprueban mediante UI y lectura PostgreSQL. El ensayo de 50 lugares reutiliza el raster vertical y su generador para verificar la selección espacial de BLOCKER-04 y la sincronización con la Mesa padre.

Resultados, PNG y hashes finales se publican aquí. Logs completos e intentos iniciales separados se conservan ignorados en `var/qa/calca-blocker05`; archivar antes de repetir. Datos ficticios, sin credenciales, tokens ni QR utilizables. La evidencia histórica CALCA-06/BLOCKER-04 permanece intacta.
