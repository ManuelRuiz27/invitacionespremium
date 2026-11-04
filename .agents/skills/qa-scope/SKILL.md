---
name: qa-scope
description: "Seleccionar y limitar el QA local por archivos modificados y riesgo L0-L3 en InvitacionesPremium. Usar al preparar o ejecutar cambios de código, especialmente cuando el prompt incluye contrato de validación; no usar para certificación o release completos."
---

# QA dirigido

1. Identificar diff esperado, criterio de aceptación y riesgo. `AGENTS.md` define los pisos L0-L3 y los controles irrenunciables.
2. Definir comandos de QA ANTES de desarrollar. Después comprobar si el diff incluye dependencias adicionales.
3. Preferir `pnpm qa:quick -- --files=<rutas>` o `pnpm qa:focused -- --files=<rutas> --risk=<nivel>`. Para journeys necesarios usar `--journeys=managed,access-control,public-catalog,flipbook,guide` según corresponda.
4. Si no se conoce el comando preciso, usar **una vez** `--dry-run` para inspeccionar qué ejecutará; no iniciar `qa:full` por costumbre.
5. Riesgo L3 exige regresiones críticas, pruebas negativas y revisión independiente. No bajar el riesgo declarado si el archivo o comportamiento es de seguridad, auth, QR/check-in, migraciones o finanzas.
6. Ejecutar pruebas desde un proceso normal; no consultar su estado cada minuto mediante llamadas al modelo. Capturar salida extensa en archivo local y mostrar sólo errores/últimas líneas.
7. Si las pruebas dirigidas pasan y el diff no cambia, terminar QA local. CI en GitHub comprueba el SHA exacto después del push; no declararlo verde antes de que termine.

**Salida compacta:** nivel, comandos ejecutados, resultado, pruebas omitidas deliberadamente y causa, regresiones nuevas o bloqueos.
