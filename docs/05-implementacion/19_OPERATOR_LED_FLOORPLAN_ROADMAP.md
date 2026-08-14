# 19 — Roadmap de implementación: Operator-led + Croquis V2

Estado: **Roadmap de ejecución aprobado para la siguiente etapa**  
Objetivo: llegar a piloto real con el menor desarrollo nuevo posible, reutilizando el producto existente.

## 1. Principio de ejecución

No reconstruir InvitacionesPremium.

La estrategia es:

```text
producto actual funcional
        +
reducción de superficie self-service
        +
acceso provider-led explícito
        +
Croquis V2 Sticker sobre motor actual
        +
QA de piloto
```

Cada bloque debe ejecutarse en PR/commit pequeño y auditable. No combinar todo el roadmap en una sola tarea de Codex.

## 2. Dependencias normativas

Antes de cualquier bloque leer:

- `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`;
- `docs/01-producto/04_OPERATOR_LED_MVP.md`;
- `docs/05-implementacion/14_CODEX_RULES.md`;
- `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`;
- contratos especializados de los módulos tocados.

Para Croquis:

- `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
- `docs/03-diseno/FLOORPLAN_UX_TARGET.md`.

Para acceso provider-led:

- `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`;
- `docs/01-producto/ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md`.

## 3. Bloque OP-01 — Baseline y mapa de superficie

Objetivo: verificar el estado real antes de mutar código.

Entregables:

- identificar rutas/componentes actuales de configuración de Evento, Invitación, Floorplan y Seating;
- identificar endpoints Planner que actualmente mutan geometría;
- identificar componentes reutilizables en Admin y Client;
- mapear tests existentes;
- documentar gaps concretos del ADR operator-led;
- no modificar comportamiento de producto salvo corrección mínima indispensable descubierta por tests.

Criterio de salida:

- mapa de archivos/endpoints y plan de cambio mínimo;
- suite relevante verde o fallos preexistentes claramente aislados.

## 4. Bloque OP-02 — Capability administrativa provider-led

Objetivo: implementar la frontera de acceso definida por `ADR_OPERATOR_LED_ACCESS.md`.

Prioridad: **bloqueante para piloto**.

Alcance mínimo:

- superficie administrativa explícita para las operaciones de preparación realmente requeridas;
- target `clientId/eventId` validado;
- actor interno real;
- auditoría;
- ownership/tenant isolation;
- invariantes de estado y negocio reutilizados;
- sin impersonación;
- sin bypass de créditos/readiness.

Tests mínimos:

- happy path;
- cross-tenant denial;
- resource not found/no leakage;
- estado incompatible;
- auditoría actor/Evento;
- regresión de endpoints Planner.

No construir todavía una gran UI de backoffice si endpoints/casos de uso pueden validarse primero.

## 5. Bloque OP-03 — Separación de superficies Operator / Planner

Objetivo: reflejar el perfil de lanzamiento sin romper capacidades existentes.

Operator:

- accede a preparación/configuración autorizada;
- obtiene entry point al Builder de Croquis.

Planner:

- conserva invitados/distribución/RSVP/seating;
- no recibe mutación de geometría del Croquis en launch surface;
- recibe geometría read-only + Seating Workspace.

Preferir feature gating/routing explícito y seguro sobre borrar código reutilizable.

No confundir navegación con autorización: backend del bloque OP-02 sigue siendo requisito.

## 6. Bloque FP-01 — Shell visual Croquis V2

Objetivo: llevar el Builder actual a la composición objetivo sin cambiar contratos.

Referencia visual legacy autorizada:

- `Soft-Monkey_InvitacionesPremium/docs/floorplan-ux-redesign-roadmap.md`;
- únicamente componentes legacy concretos citados durante la tarea para entender composición/ergonomía.

Conservar:

- MUI;
- design tokens;
- Konva/React Konva;
- modelos actuales;
- persistencia actual;
- tests.

Implementar/refinar:

- topbar del workspace;
- catálogo/paleta lateral;
- canvas dominante;
- panel contextual;
- estado/summary discreto;
- responsive desktop/tablet;
- progressive disclosure.

No implementar todavía nuevos tipos de dominio.

## 7. Bloque FP-02 — Catálogo Sticker

Objetivo: formalizar la interacción Sticker sobre `FloorplanShape` existente.

Catálogo inicial:

- Mesa redonda;
- Mesa rectangular;
- Mesa imperial;
- Mesa principal;
- Pista;
- Barra;
- Escenario/DJ;
- Entrada;
- Baños;
- Zona;
- Texto/etiqueta.

Para cada sticker definir explícitamente su mapping al contrato actual.

Acciones:

- colocar;
- seleccionar;
- mover;
- rotar;
- duplicar;
- resize cuando aplique;
- propiedades esenciales;
- eliminación segura.

No crear entidad `Sticker`.

## 8. Bloque FP-03 — Persistencia e interacción robusta

Objetivo: asegurar que el nuevo shell/interacción no degrade el motor actual.

Validar:

- normalización `0..1`;
- drag/transform end;
- autosave/guardado vigente;
- conflictos de versión;
- undo/redo;
- reload y fidelidad del layout;
- background/plano;
- eliminación/duplicación;
- errores y recuperación.

No persistir coordenadas de viewport.

## 9. Bloque FP-04 — Seating Workspace de Planner

Objetivo: mantener el workspace funcional existente y alinearlo visualmente sólo donde aporte claridad.

Preservar:

- geometría read-only;
- selección de Mesa;
- búsqueda/filtros;
- asignación múltiple;
- familia/grupo;
- mover/desasignar;
- capacidad;
- concurrencia;
- realtime.

No reconstruir `SeatingWorkspace` desde legacy.

La prioridad aquí es confiabilidad y baja carga cognitiva, no paridad visual perfecta con el Builder.

## 10. Bloque FP-05 — QA de escala y operación

Objetivo: probar condiciones parecidas a Evento real.

Escenarios mínimos:

- 50 Mesas;
- 100 Mesas;
- 200 Mesas;
- lista grande de asistentes;
- tablet landscape;
- desktop;
- dos sesiones con conflicto;
- reconexión/realtime;
- mover/asignar en cargas rápidas;
- errores de red alrededor de una mutación confirmada;
- refresco tras cambios;
- Evento en modo consulta/read-only.

No aceptar regresiones de check-in/QR/RSVP por cambios de Croquis.

## 11. Bloque PILOT-01 — Readiness de primer Evento

Objetivo: determinar si existe un camino operable end-to-end.

Checklist:

- alta/preparación del Evento;
- material de Invitación;
- lista de Contactos;
- distribución de links;
- RSVP;
- Croquis si aplica;
- seating;
- Staff access;
- scanner;
- contingencia de check-in;
- cierre;
- reporte necesario;
- auditoría de acciones críticas.

Toda feature que no bloquee este camino queda fuera del piloto.

## 12. Bloque PILOT-02 — Instrumentación operativa mínima

Registrar consistentemente por Evento:

- tiempo de preparación total;
- tiempo de Invitación;
- tiempo de Croquis;
- cantidad de invitados/Mesas;
- incidencias;
- soporte Planner;
- cambios de último minuto;
- fallos/reintentos de check-in;
- trabajo manual repetitivo.

Puede comenzar con un mecanismo simple; no construir analytics platform antes de tener datos.

## 13. Después del piloto

Priorizar únicamente con evidencia:

```text
frecuencia × tiempo × riesgo/error × repetibilidad
```

Candidatos típicos a automatizar primero:

- pasos operator-led frecuentes y repetitivos;
- importación/limpieza de listas si consume tiempo;
- duplicación de configuraciones/plantillas;
- operaciones de Croquis repetitivas;
- incidencias frecuentes con solución determinista.

No asumir que el producto debe llegar a full self-service.

## 14. Not now explícito

Hasta nueva decisión:

- `Seat`/`SeatAssignment` persistente;
- Planner Floorplan Builder;
- CAD/shape editor avanzado;
- migración a Tailwind/shadcn/Radix por apariencia;
- merge de repositorios;
- WhatsApp API;
- offline completo;
- expansión de roles;
- reescritura de finanzas/promociones;
- automatización que no haya aparecido en operación real.

## 15. Orden recomendado de ejecución

```text
OP-01
  ↓
OP-02
  ↓
OP-03
  ↓
FP-01
  ↓
FP-02
  ↓
FP-03
  ↓
FP-04
  ↓
FP-05
  ↓
PILOT-01
  ↓
PILOT-02
```

FP-01 puede explorarse visualmente en paralelo con OP-02, pero no se considera listo para uso real del proveedor hasta completar la frontera de acceso.

## 16. Definición de éxito de esta etapa

No es “terminar todo el SaaS”.

Es demostrar que InvitacionesPremium puede operar Eventos pagados reales con:

- experiencia profesional para Planner;
- control técnico suficiente para el proveedor;
- invitación/RSVP/seating/check-in confiables;
- esfuerzo manual medible;
- arquitectura preparada para automatizar sólo lo que la evidencia justifique.