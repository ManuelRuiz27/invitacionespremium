# Roadmap — Client UI V2 / Task-first Planner Experience

Estado: **READY FOR IMPLEMENTATION**  
Ámbito: `apps/client`, `apps/scanner` y componentes compartidos de `packages/ui` estrictamente necesarios.  
Fuente visual superior: `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`.

## 1. Objetivo

Transformar la experiencia Cliente de InvitacionesPremium desde una composición SaaS genérica basada en cards, wrappers y dashboards de métricas hacia una interfaz de trabajo para planners centrada en:

```text
Evento → tarea → contexto → acción
```

El roadmap es un **refactor de experiencia y presentación**. No autoriza cambios de dominio, roles, permisos, estados, API, OpenAPI, Prisma, pricing, readiness ni Croquis.

## 2. Alcance

Incluye:

- shell Cliente;
- navegación;
- dashboard/lista de Eventos;
- wizard excepto Croquis;
- Invitados/Contactos;
- Confirmación;
- editor Flyer/Flipbook;
- workspace de Evento activo fuera de Croquis;
- compartir Invitaciones/WhatsApp;
- Finanzas Cliente;
- Scanner;
- componentes compartidos necesarios.

## 3. Fuera de alcance absoluto

No tocar en UI-01..UI-04:

- `apps/client/src/wizard/floorplan/**`;
- internals de `apps/client/src/workspace/SeatingWorkspace.tsx`;
- `packages/floorplan/**`;
- contratos/documentación de Croquis;
- FP-06;
- backend/API salvo que exista un bug previo imprescindible y documentado fuera de este roadmap;
- Admin app;
- Landing;
- pricing;
- Auth/roles;
- WhatsApp API;
- nuevos estados de mensajería.

Si un ticket encuentra que una mejora visual necesita uno de esos cambios, debe detener únicamente esa parte y reportar el blocker.

## 4. Baseline observado

La implementación actual contiene varios patrones que deben corregirse selectivamente:

- `DashboardPage.tsx` monta `EventSummaryCards` antes de la lista;
- `EventSummaryCards.tsx` usa `MetricCard` para Total/En preparación/Activos/Finalizados;
- `EventsList.tsx` muestra tabla desktop con capacidad y última actualización como datos primarios y cards en mobile;
- `ClientNavigation.tsx` usa un patrón de navegación tipo botón por item;
- `WizardLayout.tsx` encapsula progreso y contenido en `Paper` y mantiene copy descriptivo genérico;
- el editor de Invitación ya tiene interacción visual pero aún puede reducir inspector/formulario y dar más protagonismo a la pieza gráfica;
- `InvitationDistribution.tsx` conserva funcionalidad correcta pero debe presentarse como **Compartir invitaciones** y priorizar WhatsApp;
- Finanzas puede reducir cards sin perder trazabilidad;
- Scanner debe reforzar su carácter de microapp de una sola tarea.

Estos hallazgos orientan el trabajo, pero la implementación debe inspeccionar el código vigente antes de modificarlo.

## 5. Orden obligatorio

```text
UI-01 Visual foundation + Shell + Eventos
        ↓
UI-02 Wizard + Invitados + Confirmación
        ↓
UI-03 Invitation Experience
        ↓
UI-04 Active Event + Sharing + Finance + Scanner
```

No ejecutar UI-03/UI-04 como mega-refactor simultáneo con UI-01. Cada ticket debe dejar CI verde y una superficie coherente.

## 6. UI-01 — Visual foundation + Shell + Eventos

Contrato: `UI01_CLIENT_FOUNDATION_EVENTS.md`.

Objetivos:

- establecer jerarquía visual transversal;
- reducir chrome del shell;
- eliminar dashboard KPI-first;
- convertir Eventos en lista operacional;
- ajustar shared UI sin romper Admin/Landing/Croquis.

Criterio de salida: `/eventos` deja de sentirse como dashboard SaaS genérico y se convierte en punto de entrada operacional.

## 7. UI-02 — Wizard + Invitados + Confirmación

Contrato: `UI02_WIZARD_GUESTS_CONFIRMATION.md`.

Objetivos:

- simplificar `WizardLayout`;
- eliminar wrappers/copy redundante;
- mantener autosave/guards intactos;
- presentar Contactos como Invitados/personas;
- presentar Confirmación por pendientes/confirmados/no asistirán;
- no tocar el paso Croquis.

Criterio de salida: preparar un Evento se siente como flujo continuo, no como colección de formularios en cards.

## 8. UI-03 — Invitation Experience

Contrato: `UI03_INVITATION_EXPERIENCE.md`.

Objetivos:

- imagen/página dominante;
- páginas de Flipbook compactas;
- acciones directamente sobre la pieza gráfica;
- inspector contextual;
- conservar acciones en cualquier página, cardinalidad, move/reorder/delete y readiness actuales.

Criterio de salida: la Invitación se siente como el producto visual premium que el Planner está preparando.

## 9. UI-04 — Evento activo + Sharing + Finance + Scanner

Contrato: `UI04_OPERATIONAL_SURFACES.md`.

Objetivos:

- convertir `/eventos/:eventId` en centro de trabajo;
- presentar compartir Invitaciones con WhatsApp primero;
- reducir ornamentación financiera sin perder precisión;
- hacer Scanner más directo;
- no modificar Seating/Croquis internamente.

Criterio de salida: el Evento activo muestra tareas y acciones, no un catálogo de módulos/cards.

## 10. Reglas de arquitectura

- conservar React + TypeScript + MUI;
- conservar TanStack Query y patrones de fetching existentes;
- no crear DTOs manuales divergentes de OpenAPI;
- no crear un design system paralelo;
- `packages/ui` puede evolucionar, pero un cambio compartido debe comprobar regresión en todas las apps consumidoras;
- preferir composición local cuando un patrón sólo pertenece a Client;
- no mover reglas de negocio a `packages/ui`.

## 11. Reglas de copy

Eliminar frases que sólo describen la pantalla.

Ejemplos de copy a evitar:

- “Consulta el estado y los datos principales...”;
- “Completa los pasos para dejar tu evento listo...”;
- instrucciones técnicas sobre autosave, idempotencia o validación.

Mantener copy cuando:

- previene error;
- explica consecuencia;
- distingue una restricción;
- resuelve un empty/error state.

## 12. QA transversal

Cada ticket debe:

- conservar tests de comportamiento existentes;
- agregar/modificar tests para la nueva jerarquía sin testear implementación CSS frágil;
- ejecutar typecheck/lint/tests/build de paquetes afectados;
- probar desktop, tablet y mobile;
- verificar teclado/foco;
- documentar rutas/fixtures para QA visual;
- comprobar que no se modificó Croquis por accidente.

## 13. Regresión obligatoria

Antes de cerrar cada ticket:

- Auth y rutas siguen funcionando;
- roles conservan navegación autorizada;
- Planner de Organización hace cero requests financieros;
- estados técnicos siguen ocultos;
- autosave conserva semántica;
- design readiness sigue backend-authoritative;
- WhatsApp no se representa como delivery confirmado;
- Scanner no amplía datos;
- ninguna suite de Floorplan/Croquis se rompe por cambios shared.

## 14. Definition of Done del roadmap

El roadmap termina cuando:

1. Dashboard no depende de scorecards/cards para explicar el producto;
2. navegación y shell no dominan la pantalla;
3. Wizard usa una jerarquía continua y limpia fuera de Croquis;
4. Invitados y Confirmación priorizan personas/pendientes;
5. Invitación prioriza la pieza gráfica;
6. Evento activo prioriza trabajo y acciones;
7. Compartir Invitaciones prioriza WhatsApp sin inventar estado de envío;
8. Finanzas conserva precisión con menos ornamentación;
9. Scanner prioriza cámara/resultado/check-in;
10. Croquis queda sin cambios dentro de este roadmap;
11. accesibilidad, permisos, seguridad y comportamiento actual pasan regresión.
