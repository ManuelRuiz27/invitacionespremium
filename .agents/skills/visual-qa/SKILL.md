---
name: visual-qa
description: "Verificar cambios de diseño de InvitacionesPremium en Gemini/Antigravity: screenshots puntuales, responsive y accesibilidad sin suites generales. Usar exclusivamente cuando una modificación afecte UI visible."
---

# Validación visual focalizada

1. Identificar componente/ruta UI modificada y comparación contra el estado previo.
2. Para una corrección pequeña de copy/estilo, inspeccionar la vista afectada. Capturar screenshot sólo si aporta evidencia de un cambio visual o se pidió expresamente.
3. Si cambió layout o responsive, probar un viewport móvil relevante y uno desktop; ampliar breakpoints sólo ante desbordes o cambios de rejilla. No recorrer todas las pantallas por rutina.
4. Cuando corresponda, verificar foco, navegación por teclado, contraste, estados visuales y reduced-motion.
5. Usar QA L0/L1 según `AGENTS.md` y `qa-scope`, sin pruebas de DB/Scanner/Flipbook que el cambio no afecte.
6. Si aparece lógica de negocio o un cambio contractual, detener esa parte y solicitar intervención de Codex con una dependencia concreta. No reimplementar API en frontend.
7. Entrega: diff y máximo las evidencias visuales necesarias; terminar después de validar.
