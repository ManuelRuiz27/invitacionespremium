# UI-02 — Wizard, Invitados y Confirmación

Estado: **READY FOR CODE DESPUÉS DE UI-01**  
Prioridad: **P0 del refactor visual Client**  
Fuente visual superior: `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`.

## 1. Objetivo

Hacer que la preparación de un Evento se sienta como un flujo continuo y guiado, no como una colección de formularios dentro de cards.

Este ticket cubre:

- shell visual del Wizard;
- pasos no-Croquis del Wizard salvo Invitación, que se reserva para UI-03;
- Invitados/Contactos;
- importación CSV;
- Confirmación;
- Revisión sólo en su composición general cuando sea necesario para coherencia del Wizard.

No modifica Croquis ni su paso interno.

## 2. Lectura obligatoria

Codex debe leer, en orden:

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`
4. `docs/03-ui-ux/07_UI_UX_FLOW.md`
5. `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`
6. `docs/04-tecnico/CONTACTS_CONTRACT.md`
7. `docs/04-tecnico/INVITATIONS_CONTRACT.md`
8. `docs/04-tecnico/PUBLIC_RSVP_CONTRACT.md` sólo para lenguaje/semántica que afecte Confirmación;
9. `docs/05-implementacion/14_CODEX_RULES.md`
10. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`
11. este ticket.

Croquis se rige exclusivamente por sus contratos especializados y queda fuera.

## 3. Software archaeology obligatorio

Inspeccionar antes de editar:

- `apps/client/src/wizard/WizardLayout.tsx`
- `apps/client/src/wizard/WizardPage.tsx`
- `apps/client/src/wizard/wizard-model.ts`
- `apps/client/src/wizard/autosave/**`
- `apps/client/src/wizard/data/**`
- `apps/client/src/wizard/contacts/ContactsStep.tsx`
- `apps/client/src/wizard/confirmation/ConfirmationStep.tsx`
- `apps/client/src/wizard/review/**`
- tests `wizard-flow`, `wizard-copy`, `wizard-editors`, `wizard-draft` y tests específicos de Contactos/Confirmación si existen.

Leer el paso Croquis sólo para confirmar frontera de integración; no modificarlo.

## 4. Invariantes

No cambiar:

- secuencia de pasos por Servicio;
- rutas del Wizard;
- creación diferida del Evento;
- autosave de 900 ms y flush contractual;
- handling de resultados inciertos;
- readiness backend-authoritative;
- permisos;
- API;
- DTOs;
- import preview/commit;
- límites;
- reglas de Confirmación;
- Croquis.

## 5. WizardLayout

### Objetivo visual

Pasar de:

```text
PageHeader
[ Paper: guardado + estado + Stepper ]
[ Paper: contenido ]
[ navegación ]
```

A una composición continua:

```text
← Eventos                                      Guardado

Nombre del Evento
Datos   Invitados   Invitación   Confirmación   Mesas   Revisión
───────────────────────────────────────────────────────────────
Contenido del paso
───────────────────────────────────────────────────────────────
Salir                                      Anterior   Continuar
```

### Reglas

- no `Paper` obligatorio alrededor del progreso;
- no `Paper` obligatorio alrededor del contenido;
- conservar un único `h1` correcto;
- progreso accesible y navegable según comportamiento vigente;
- desktop/tablet puede usar tabs/stepper ligero;
- mobile usa tabs/segmento scrollable o alternativa equivalente, no un stepper vertical pesado por obligación;
- footer sticky permitido si no tapa contenido ni foco;
- no cambiar URL al simplificar visualmente el progreso.

## 6. Estado de guardado

Conservar semántica actual, cambiar presencia visual:

- `saving` → **Guardando…** visible;
- `saved` → **Guardado** discreto;
- `idle` no necesita `Sin cambios pendientes` permanente;
- error → mensaje accionable y visible;
- cambiar de paso/salir sigue haciendo flush conforme al contrato.

No introducir botón manual Guardar como nueva tarea.

## 7. Headers y copy de pasos

Eliminar descripciones genéricas que sólo repiten la pantalla.

Mantener ayudas únicamente cuando:

- previenen error;
- explican una consecuencia;
- aclaran formato o regla no evidente.

Ejemplos de copy técnico que no debe aparecer:

- readiness;
- idempotencia;
- E.164;
- IANA;
- enum de Servicio/Estado.

## 8. Invitados / Contactos

### Modelo mental

Título visible preferente: **Invitados**.

El backend mantiene `Contacto` y `Asistente` separados. Este ticket no mezcla entidades; sólo presenta la gestión de Contactos de manera natural.

### Layout

Priorizar:

- búsqueda/escaneo rápido;
- nombre;
- WhatsApp;
- Grupo cuando exista;
- acción contextual.

Desktop puede utilizar filas compactas. Evitar cards por persona salvo que una condición mobile lo justifique.

### Acciones

- `Agregar invitado` o copy natural equivalente abre/activa el flujo vigente de alta;
- edición conserva campos autorizados;
- eliminación conserva confirmación;
- acciones secundarias pueden vivir en menú `…` si siguen accesibles por teclado/touch.

No esconder una acción necesaria detrás de hover.

## 9. Importar lista CSV

Presentar como flujo progresivo:

```text
Importar invitados
1. Descargar plantilla
2. Seleccionar archivo
3. Revisar datos
4. Importar
```

### Mantener exactamente

- preview sin persistencia definitiva;
- validación por fila;
- bloqueo si supera límite;
- preview completo;
- commit contractual;
- idempotencia vigente;
- no perder errores útiles.

No mostrar todos los controles de importación permanentemente en la vista principal de Invitados.

## 10. Confirmación

### Objetivo

La superficie debe responder:

- quién confirmó;
- quién sigue pendiente;
- quién no asistirá;
- si la Confirmación está abierta/cerrada;
- qué puede hacer el Planner.

### Conteos

Presentarlos inline o en una franja tipográfica:

```text
48 confirmaron   12 pendientes   6 no asistirán
```

No crear `MetricCard` para cada conteo.

### Jerarquía

Cuando existan pendientes:

1. pendientes;
2. confirmados;
3. no asistirán.

Si la pantalla actual de preactivación sólo configura reglas de Confirmación y no dispone todavía de respuestas reales, no inventar listados. Aplicar el mismo principio task-first al contenido que realmente existe.

### Apertura/cierre

Mostrar estado natural y control contextual cuando el contrato lo permita.

No usar `RSVP` como copy visible.

## 11. Revisión

No alterar contenido financiero/readiness contractual.

Visualmente:

- lista clara de lo listo y lo pendiente;
- blockers como instrucciones accionables;
- costo/fuente de cobro con precisión;
- CTA Activar dominante cuando sea válido;
- no convertir cada checklist item en card.

## 12. Croquis — frontera dura

El `selectedStep === 'croquis'` puede necesitar integrarse dentro del nuevo shell del Wizard, pero:

- no cambiar contenido interno;
- no cambiar spacing/layout interno del Builder;
- no cambiar `FloorplanStep.tsx`;
- no cambiar `packages/floorplan`;
- no cambiar drawer/inspector/inventory;
- no cambiar contrato de Seating.

Si el nuevo WizardLayout aplica un wrapper que afecta Croquis, resolver la excepción en el shell, no editando Croquis.

## 13. Responsive

### Desktop

- progreso horizontal discreto;
- contenido con ancho legible;
- acciones inferiores estables.

### Tablet

- evitar demasiadas columnas;
- progreso scrollable si es necesario.

### Mobile

- tabs/progreso scrollable;
- formularios lineales;
- CTA inferior accesible;
- diálogos/drawers existentes conservan focus management.

## 14. Accesibilidad

- un `h1` por vista;
- labels reales;
- error asociado al control;
- progreso con nombre accesible;
- navegación por teclado;
- focus trap de dialogs;
- targets >=44 px;
- feedback de autosave por texto, no sólo color.

## 15. Tests obligatorios

Actualizar/agregar tests para demostrar:

1. rutas/pasos por Servicio no cambian;
2. `PHYSICAL_QR` sigue sin montar pasos digitales;
3. navegación paso anterior/siguiente conserva comportamiento;
4. autosave y flush no cambian;
5. error de guardado sigue visible;
6. idle no necesita copy `Sin cambios pendientes`;
7. Invitados conserva alta/edición/eliminación;
8. CSV preview/commit no cambia;
9. máximo contractual sigue bloqueando;
10. Confirmación usa copy natural;
11. revisión sigue consumiendo estado autoritativo;
12. Croquis no recibe cambios internos;
13. teclado/mobile siguen operables.

## 16. QA visual

Evidencia reproducible para:

- nuevo Evento sin nombre;
- Evento con nombre;
- Datos;
- Invitados con lista;
- Invitados vacío;
- importar CSV con errores;
- Confirmación;
- Revisión con blockers;
- Revisión lista para activar;
- mobile;
- tablet;
- paso Croquis integrado sin cambios visuales internos.

## 17. No-go

No tocar:

- `apps/client/src/wizard/floorplan/**`;
- `packages/floorplan/**`;
- `SeatingWorkspace`;
- API/DB/OpenAPI;
- design/hotspots salvo ajustes mínimos de wrapper requeridos para compilar; el rediseño de Invitación pertenece a UI-03.

## 18. Definition of Done

UI-02 termina cuando:

- el Wizard deja de estar visualmente encapsulado en múltiples Papers;
- progreso/guardado son discretos;
- Invitados se siente como lista de personas;
- importación usa progressive disclosure;
- Confirmación prioriza tareas/pendientes sin cards métricas;
- Revisión mantiene precisión;
- funcionalidad, autosave, rutas y readiness no cambian;
- Croquis no fue modificado;
- tests y QA pasan.
