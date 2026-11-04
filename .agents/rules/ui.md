---
trigger: model_decision
description: "Usar exclusivamente en tareas de diseño visual, UI/UX, CSS, responsive, accesibilidad, copy y presentación de componentes React con Gemini/Antigravity. No activar para cambios de lógica, hooks de negocio, contratos API o base de datos."
---

# Especialidad UI/UX — Gemini / Antigravity

- Preservar estructura de componentes, tipografía, temas y tokens ya existentes; reusar `packages/ui` donde aplique.
- En M01, la superficie Provider prepara; Planner administra invitados, RSVP, mesas y Staff. No mostrar ni habilitar constructores Provider en Client Managed.
- No modificar API, SDK, Prisma, roles, autenticación, permisos, estados de eventos, pricing o lógica funcional desde una tarea de diseño. Si el cambio lo requiere, señalar archivo y dependencia para asignación a Codex.
- Cambios visuales: ajustar sólo la vista/componente pedido; evitar reescritura de layout general, librerías nuevas, animaciones innecesarias o "mejoras" no autorizadas.
- Probar el viewport afectado y una contraparte móvil/desktop únicamente cuando la modificación altere responsive. Revisar teclado/foco, contraste, estados loading/error y reduced-motion cuando se hayan tocado.
- Para QA visual usar la skill `visual-qa` bajo demanda. No ejecutar E2E de Scanner, PostgreSQL o Flipbook para una corrección cosmética ajena a ellos; respetar la elevación de riesgo en componentes críticos.
- Entregar cambios y evidencia concisa, no portfolios ni reportes intermedios.
- Si una tarea visual cambia comportamiento automatizable, cumplir el contrato de `tdd-scope`; no crear TDD artificial para CSS/copy cosmético.
