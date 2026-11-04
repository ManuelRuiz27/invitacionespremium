---
trigger: glob
globs: "apps/**/*.tsx, apps/**/*.css, apps/**/*.scss, packages/ui/**/*.tsx, packages/ui/**/*.css"
description: "Aplicar al editar componentes visuales, estilos, layouts y accesibilidad con Gemini/Antigravity."
---

# UI/UX — Antigravity

- Trabajo exclusivo de diseño/presentación: jerarquía visual, layout, estilos, responsive, estados visuales, microcopy y accesibilidad de interfaz.
- Conservar los contratos y la lógica React vigente. No modificar hooks de negocio, SDK/API, autenticación, roles, pricing, estados de evento, Prisma ni persistencia.
- Reutilizar `packages/ui`, componentes existentes y tokens del proyecto; evitar dependencias nuevas y refactorizaciones ajenas.
- Responsivo y accesibilidad: verificar únicamente las vistas y breakpoints afectados; teclado, foco, contraste y reduced-motion cuando correspondan al cambio.
- Clasificar QA según `AGENTS.md`; para correcciones visuales L0/L1, no ejecutar por rutina suites de DB, Scanner, M01 o Flipbook que no estén afectadas.
- Si el diff revela un cambio funcional, comunicarlo con evidencia y separar la modificación para Codex. No crear transferencia formal si no existe dependencia.
- Entregar diff y evidencia visual concisa; no generar informes o capturas redundantes.
