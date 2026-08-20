# FP-04 — Seating Workspace de Planner: alineación visual y operativa

Estado: **CONTRATO TÉCNICO PARA IMPLEMENTACIÓN**  
Prerequisito: FP-03 aprobado/cerrado.  
Ámbito principal: `apps/client/src/workspace/SeatingWorkspace.tsx`, pruebas del Active Event Workspace y reutilización read-only de `@invitaciones/floorplan`.

## 1. Objetivo

Alinear el Seating Workspace vigente con Croquis V2 sin reconstruirlo ni cambiar su dominio.

La Planner debe sentir que controla **personas → Mesas** sobre un plano ya preparado por el Provider.

FP-04 es principalmente un refactor UI/UX y de composición. La lógica operativa actual es base obligatoria y debe preservarse.

## 2. Baseline funcional que NO se reescribe

Conservar exactamente la infraestructura actual para:

- Floorplan read-only;
- selección de Mesa;
- búsqueda con debounce;
- filtro por grupo;
- scope `UNASSIGNED | TABLE`;
- paginación por cursor;
- selección múltiple;
- asignación individual/múltiple;
- asignación de invitación completa;
- asignación de grupo completo;
- mover entre Mesas;
- desasignar;
- validación de capacidad;
- idempotency key estable en retry incierto;
- reconciliación tras error de red;
- recuperación `409`;
- realtime de ocupación;
- modo terminal/read-only;
- Physical QR sin lista nominal.

No crear un segundo Seating Workspace ni portar uno desde legacy.

## 3. Modelo mental y jerarquía

Modelo mental visible:

```text
Sin mesa / Personas
        ↓
seleccionar
        ↓
Mesa elegida
        ↓
asignar / mover / quitar
```

El Canvas comunica infraestructura y selección. El panel comunica personas y acciones.

No exponer lenguaje de dominio técnico como `UNASSIGNED`, `TABLE`, IDs, DTOs, claves de idempotencia o enums.

## 4. Composición desktop

Cuando ninguna Mesa está seleccionada:

- Canvas ocupa el ancho útil;
- mostrar una instrucción breve para seleccionar Mesa;
- mostrar un resumen discreto derivado sólo de datos autoritativos ya disponibles.

Cuando una Mesa está seleccionada:

- Canvas sigue siendo dominante;
- panel lateral fijo/estable alrededor de 360–420 px cuando exista espacio;
- evitar una proporción 60/40 que haga competir el panel con el plano;
- la Mesa seleccionada debe seguir siendo evidente en el renderer.

No introducir layout global nuevo.

## 5. Resumen operativo permitido

Se puede mostrar únicamente con datos ya existentes:

- número de Mesas del Floorplan;
- capacidad total sumando Mesas;
- ocupación total sumando Mesas;
- lugares disponibles;
- asistentes `Sin mesa` usando `SeatingWorkspacePage.summary.unassignedCount` cuando esté disponible;
- ocupación/capacidad/disponibilidad de Mesa seleccionada.

No calcular ni etiquetar como "confirmados" datos que el contrato actual no entregue inequívocamente.

No usar color como único indicador.

## 6. Panel de Mesa

Cabecera compacta:

- nombre de Mesa;
- `ocupación / capacidad`;
- disponibles / Mesa completa;
- cerrar panel.

Debajo:

- tabs naturales `Sin mesa` / `En esta mesa`;
- búsqueda;
- filtro de grupo;
- lista nominal;
- selección;
- acción primaria contextual sticky.

La acción primaria debe seguir siendo:

- `Asignar N a [Mesa]` en Sin mesa;
- `Cambiar mesa de N` en En esta mesa.

No introducir drag-and-drop de personas a Mesas en FP-04.

## 7. Progressive Disclosure en personas

Reducir ruido visual sin esconder capacidades.

Cada fila debe priorizar:

1. checkbox/selección;
2. nombre;
3. grupo o estado de ingreso;
4. acción contextual necesaria.

`Invitación completa` y `Grupo completo` siguen existiendo sólo donde el contrato actual las permite. Pueden compactarse visualmente como acciones secundarias, pero deben seguir siendo accesibles por teclado/touch y no requerir hover exclusivo.

`Quitar Mesa` sigue disponible en scope de Mesa.

No cambiar reglas de familia/grupo.

## 8. Estados de selección y capacidad

Mostrar de forma clara:

- cantidad seleccionada;
- capacidad disponible de Mesa;
- selección que excede disponibilidad;
- acción primaria deshabilitada cuando corresponda;
- copy natural del motivo.

No permitir sobrecupo visualmente si backend lo prohíbe.

## 9. Empty/loading/error states

Cubrir explícitamente:

- cargando Croquis;
- error Floorplan/image;
- ninguna Mesa seleccionada;
- Sin mesa vacío;
- Mesa sin asistentes;
- búsqueda sin resultados;
- filtro sin resultados;
- modo consulta/Evento terminal;
- feedback de mutación confirmada;
- conflicto 409;
- resultado incierto;
- realtime terminal.

No usar un único mensaje genérico para estados semánticamente distintos cuando la UI ya tiene datos para diferenciarlos.

## 10. Conflictos y resultado incierto

Preservar exactamente el patrón actual:

- `409` => refetch Floorplan + Seating, selección se reconcilia;
- error incierto => refetch Seating y comprobar `intentIsReflected`;
- si no se puede confirmar => conservar `uncertainIntent`;
- retry usa la MISMA idempotency key;
- nunca emitir una nueva key en retry del mismo intento incierto.

FP-04 puede mejorar copy/jerarquía del Alert, pero no cambiar el protocolo.

## 11. Realtime

Preservar `useWorkspaceRealtime` y actualización de ocupación.

Cuando Evento pasa a estado terminal:

- abortar mutación en curso conforme al comportamiento actual;
- dejar workspace en consulta;
- explicar el estado naturalmente;
- no desmontar el Croquis innecesariamente.

No crear realtime alterno.

## 12. Physical QR

Preservar el comportamiento diferenciado:

- Croquis read-only;
- selección de Mesa;
- ocupación/capacidad;
- sin `seating()` nominal;
- sin acciones familiares/grupo/mover nominales.

La mejora visual no debe convertir Physical QR en flujo digital nominal.

## 13. Responsive

### Tablet

- Canvas prioritario;
- panel como Drawer lateral cuando no haya ancho suficiente;
- targets >=44 px;
- selección y acción sticky accesibles.

### Mobile

- Drawer/bottom sheet existente como base;
- no comprimir desktop a dos columnas;
- mantener búsqueda, filtros, lista y CTA accesibles sin hover.

No se exige rediseño completo del Active Event Workspace fuera de lo necesario para Seating.

## 14. Reutilización Floorplan

Preferir consumo directo de `@invitaciones/floorplan` si el cambio elimina un re-export histórico sin afectar otras rutas.

El renderer en Seating es siempre:

- read-only para geometría;
- sin draft;
- sin create/update/delete de shapes;
- sin catálogo Sticker;
- sin lock/unlock provider.

No modificar `FloorplanSurface` salvo que exista un ajuste compartido estrictamente necesario y con regresión Admin/Client cubierta.

## 15. Performance de este ticket

FP-04 debe evitar regresiones obvias con:

- 50+ Mesas renderizadas;
- lista/paginación de 50 personas;
- búsqueda/filtros;
- selección múltiple.

La certificación formal 50/100/200 Mesas y cargas de operación pertenece principalmente a FP-05.

No agregar virtualización o nueva librería sin evidencia de necesidad.

## 16. Tests obligatorios

Preservar y/o ampliar `ActiveEventWorkspacePage.test.tsx` para demostrar:

1. Floorplan disabled no monta Seating;
2. Digital abre Croquis read-only;
3. ninguna llamada de geometry mutation;
4. Physical QR no llama seating nominal;
5. seleccionar Mesa mantiene panel correcto;
6. resumen usa sólo datos contractuales;
7. Sin mesa count correcto;
8. búsqueda y grupo conservan query contract;
9. selección múltiple conserva IDs;
10. capacidad bloquea selección/CTA excedida como hoy;
11. assign conserva una idempotency key;
12. uncertain retry reutiliza la misma key;
13. family/group flows no cambian;
14. move conserva endpoint/intención vigente;
15. unassign conserva endpoint/intención vigente;
16. 409 hace refetch y no replay inseguro;
17. realtime actualiza ocupación;
18. terminal aborta y deja read-only;
19. tablet usa Drawer lateral;
20. mobile usa bottom Drawer;
21. empty/search/filter states tienen copy específica;
22. teclado/touch conserva targets y navegación.

No reescribir tests para ocultar pérdida funcional.

## 17. QA visual obligatorio

Reportar pasos reproducibles para:

- desktop sin Mesa seleccionada;
- desktop Mesa seleccionada;
- Mesa completa;
- Sin mesa con selección múltiple;
- selección mayor a disponibilidad;
- búsqueda sin resultados;
- 409/conflicto;
- resultado incierto/retry;
- tablet landscape;
- mobile bottom sheet;
- Physical QR;
- modo consulta.

Screenshots opcionales; si no existen, documentar route, viewport, fixture y secuencia.

## 18. Fuera de alcance

NO:

- backend;
- OpenAPI;
- Prisma/migrations;
- nuevos endpoints Seating;
- nueva regla de capacidad;
- nueva entidad Seat/SeatAssignment;
- drag invitado→Mesa;
- Builder Planner;
- mutación de geometría;
- cambios Admin Builder;
- Scanner;
- Staff;
- RSVP;
- Finance;
- nuevo realtime;
- nueva librería de estado;
- nueva librería de virtualización sin blocker demostrado;
- FP-05.

## 19. Definition of Done

FP-04 termina cuando la Planner puede operar el Seating Workspace con menor carga cognitiva y mejor jerarquía visual, preservando íntegramente las garantías actuales de idempotencia, capacidad, familia/grupo, move/unassign, realtime, recuperación de conflictos y geometría read-only.