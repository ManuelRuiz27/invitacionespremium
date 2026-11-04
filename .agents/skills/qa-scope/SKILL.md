---
name: qa-scope
description: "Seleccionar QA L0-L3 para InvitacionesPremium. Si existe contrato TDD, aplicar tdd-scope sin ampliar pruebas ni código."
---

# QA dirigido

1. El prompt define riesgo, archivos y comandos. `AGENTS.md` conserva controles de seguridad.
2. Para tareas TDD ejecutar únicamente `pnpm qa:tdd -- --contract=<ruta> --baseline=<SHA_RED> --run`; el runner fija comandos y valida el scope antes y después.
3. Para tareas sin TDD usar `qa:quick` o `qa:focused` con rutas precisas; `qa:full` sólo cuando sea necesario para certificación autorizada.
4. Si aparecen dependencias o pruebas insuficientes fuera de un contrato, marcar `BLOCKED` y solicitar revisión a ChatGPT. No agregar suites ni editar las pruebas para forzar PASS.
5. No repetir QA PASS sin cambios, no hacer polling y entregar sólo resultados relevantes. CI y revisión independiente L3 son controles separados.
