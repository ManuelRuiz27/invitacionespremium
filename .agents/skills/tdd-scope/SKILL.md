---
name: tdd-scope
description: "Ejecutar TDD con tests y contrato fijados desde ChatGPT. Activar sólo cuando el prompt incluya rama tdd/<ID>, contrato y SHA RED."
---

# TDD — ejecución estricta

1. Verificar la rama `tdd/<ID>`, SHA completo RED, contrato y árbol local limpio, sin sobrescribir cambios ajenos.
2. Comprobar límites: `pnpm qa:tdd -- --contract=tdd/contracts/<ID>.json --baseline=<SHA_RED>`. `--dry-run` muestra QA aprobado.
3. Verificar RED: test falla por funcionalidad pendiente, no por errores de configuración. Si no, `BLOCKED`.
4. Implementar únicamente `implementationPaths`. `testPaths` y contrato son inmutables. Prohibido ampliar archivos, pruebas, agentes y dependencias sin revisión desde ChatGPT.
5. Ejecutar GREEN: `pnpm qa:tdd -- --contract=tdd/contracts/<ID>.json --baseline=<SHA_RED> --run`. Refactorizar sólo cuando sea imprescindible y dentro de alcance.
6. Si se identifica una prueba incorrecta, dependencia o regresión crítica no cubierta, reportar `BLOCKED`; no modificar aserciones ni añadir suites.
7. Entregar diff, SHA, resultado y PR. CI y QA independiente de L3 siguen siendo obligatorios.

El guard de scope no reemplaza sandbox, protección de ramas ni revisión humana.
