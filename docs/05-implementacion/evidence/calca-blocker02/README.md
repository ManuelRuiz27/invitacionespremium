# Reproducción CALCA-BLOCKER-02

Alcance: sólo PHYSICAL_QR TABLE-only y defensa del estado SEAT heredado. No ejecuta ni modifica CALCA-06. [Informe](../../CALCA_BLOCKER02_PHYSICAL_TABLE_ONLY.md).

Requisitos: PostgreSQL loopback con CREATE DATABASE, dependencias/builds del repositorio y Chromium. Puertos 5300/5373/5374/5375 libres; el runner no termina procesos preexistentes.

```powershell
$env:npm_execpath = Join-Path (Split-Path (Get-Command pnpm).Source) 'node_modules/pnpm/bin/pnpm.mjs'
pnpm exec node docs/05-implementacion/evidence/calca-blocker02/run-reproduction.mjs
```

El runner genera bajo `var/qa/calca-blocker02/` una copia del harness de recursos propios ya probado. Cambia sólo entrypoint, namespace de salida y resolución de imports de esa copia temporal. Crea/elimina DB, storage, secretos y descendientes propios; el runner y los helpers históricos permanecen intactos. La implementación de producto usa el código actual del workspace.

`reproduce.mjs` reutiliza el raster horizontal y helpers puros de fixture/gestos, crea datos ficticios SELF_SERVICE/PHYSICAL_QR y opera Admin/API reales sin mocks de respuesta ni inyección de estado/estilos del producto. El único estado heredado se siembra explícitamente en la DB aislada. El intento 9 histórico no se sobrescribe y `certify.mjs` no se ejecuta.

Las imágenes son PNG nativos del viewport. Los JSON publican métricas, conteos y hashes, sin cookies, conexiones o secretos. Los logs completos permanecen ignorados en `var/qa/calca-blocker02/`; `qa.json` conserva su hash y separa preparación fallida de fixtures del resultado final. Una nueva reproducción debe archivarse como observación separada antes de sobrescribir sus salidas.
