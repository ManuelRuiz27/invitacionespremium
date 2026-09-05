# 22 — Roadmap independiente: Croquis funcional listo para operación real

Estado: **FUENTE DE EJECUCIÓN — ACTIVO**  
Prioridad: **P0 de producto antes del siguiente refactor visual de Croquis**  
Meta: **Tener un Croquis funcional como el objetivo operativo definido para InvitacionesPremium, tomando Planning Pod como referencia funcional de productividad, sin convertir el producto en CAD ni copiar su alcance completo.**

Referencia funcional externa: `https://planningpod.com/event-floor-plan-software`

## 1. Decisión

Antes de continuar con refinamiento visual del módulo de Croquis, se cerrará su funcionalidad end-to-end.

La UI puede recibir únicamente los controles mínimos necesarios para habilitar, probar y certificar una función. El rediseño visual, composición premium y pulido fino quedan subordinados a este roadmap.

La meta no es alcanzar paridad total con Planning Pod. La meta es alcanzar el conjunto de capacidades que InvitacionesPremium necesita para preparar y operar eventos reales con velocidad y precisión:

```text
Plano / Croquis base
        ↓
Construcción de Mesas, Zonas y Lugares
        ↓
Ajuste rápido y preciso del montaje
        ↓
Reutilización de distribuciones
        ↓
Asignación Planner
        ↓
Mesa / Lugar exacto
        ↓
Scanner / Check-in
```

## 2. Definición de éxito

La meta se considera cumplida únicamente cuando un Evento real puede recorrer, sin workarounds externos, los siguientes casos:

### Caso A — Evento estándar

1. Provider carga o crea el Croquis.
2. Crea Mesas y Zonas.
3. Define capacidad por Mesa.
4. Ajusta la distribución con operaciones rápidas.
5. Planner asigna personas a Mesas.
6. Croquis conserva el estado después de reload/concurrencia.
7. Scanner/Staff informa la Mesa correcta durante el Evento.

### Caso B — Evento boutique / montaje irregular

1. Provider carga un Croquis donde el mobiliario puede estar dibujado en la imagen base.
2. Activa **Acomodo por lugar exacto**.
3. Define una Mesa como agrupador lógico.
4. Coloca cada lugar exactamente sobre la silla/posición del Croquis mediante click/tap.
5. Reposiciona lugares libremente, incluso fuera de la caja geométrica de la Mesa.
6. Duplica, bloquea, elimina y renumera lugares.
7. Planner asigna una persona a cada lugar.
8. Puede moverla o desasignarla.
9. Scanner/Staff muestra `Mesa + Lugar` y puede resaltar la posición exacta.

### Caso C — Venue recurrente

1. Existe un espacio/salón reutilizable.
2. Existe al menos una distribución guardada para dicho espacio.
3. Al crear/preparar otro Evento se puede reutilizar esa distribución sin reconstruir el Croquis desde cero.
4. El nuevo Evento obtiene una copia independiente y editable dentro de sus reglas de estado.

Si cualquiera de estos tres casos requiere Excel, edición manual en DB, reconstruir el plano o recordar IDs técnicos, la meta aún no está cumplida.

## 3. Qué significa “funcional como el objetivo”

Planning Pod se usa únicamente como benchmark de productividad e interacción del dominio Floorplan.

InvitacionesPremium debe cubrir, como mínimo funcional:

- plano base real;
- mesas y zonas colocables;
- drag, resize y rotación;
- duplicación;
- snap útil;
- selección múltiple;
- mover selección;
- alineación y distribución;
- creación rápida de varias Mesas;
- lugares individuales persistentes;
- colocación libre de lugares;
- edición masiva básica de lugares;
- capacidad coherente;
- asignación por Mesa;
- asignación por Lugar exacto;
- búsqueda y reasignación de personas;
- locks, concurrencia, idempotencia y recuperación;
- reutilización de distribuciones;
- integración con Scanner/Check-in;
- pruebas de escala y operación real.

No se exige replicar herramientas de CAD, iluminación, A/V, tarimas, electricidad, trade shows, transporte o catálogos extensos de objetos.

## 4. Baseline actual que se preserva

No reconstruir Croquis.

Se reutilizan como baseline:

- `Floorplan`;
- `FloorplanShape`;
- `FloorplanSeat`;
- `Assistant.floorplanShapeId`;
- `Assistant.floorplanSeatId`;
- Builder Provider/Admin actual;
- `packages/floorplan`;
- renderer DOM/Konva vigente;
- catálogo Sticker;
- inventario de Mesas pendientes;
- normalización de coordenadas `0..1`;
- locks;
- historial existente;
- Seating Workspace actual;
- servicios de seating;
- realtime vigente;
- Scanner/check-in existente;
- OpenAPI y `@invitaciones/api-client` generado.

No crear `FloorplanV3`, segundo renderer, segundo Seating Workspace ni persistencia paralela.

## 5. Roadmap funcional

### CF-00 — Baseline funcional verificable

Estado inicial: **PARTIAL / REQUIERE CERTIFICACIÓN**  
Prioridad: **P0**

Objetivo: congelar qué funciona hoy antes de agregar más comportamiento.

Entregables:

- mapa de archivos y endpoints reales de Builder, Seating y Scanner;
- suite relevante verde;
- fixture reproducible de Evento estándar;
- fixture reproducible de Evento boutique con lugares;
- lista explícita de gaps contra este roadmap;
- cero cambios visuales no necesarios.

Gate de salida:

- se puede levantar localmente Builder + Client + API + DB;
- Croquis existente persiste y recarga sin divergencia;
- modo `TABLE` no presenta regresión;
- modo `SEAT` puede persistir al menos un lugar y una asignación válida.

---

### CF-01 — Cerrar Acomodo por lugar exacto

Estado inicial: **IN PROGRESS**  
Prioridad: **P0**  
Dependencia: FP-06.

Objetivo: convertir la implementación actual de `FloorplanSeat` en una herramienta realmente operable sobre montajes irregulares.

Debe quedar funcional:

- `Agregar lugar` entra en modo de colocación;
- click/tap sobre el plano define la posición exacta;
- drag individual reposiciona;
- duplicar lugar;
- eliminar lugar libre;
- bloquear/desbloquear;
- renombrar/renumerar;
- multi-select de lugares;
- mover selección múltiple;
- capacidad derivada visible y coherente;
- ningún requisito de contención dentro de la shape Mesa;
- persistencia después de reload;
- undo/redo donde el historial vigente lo soporte;
- backend rechaza mutaciones inválidas aunque frontend falle.

Debe eliminarse como flujo principal la suposición de que `Agregar lugar` significa “autodistribuir alrededor de una Mesa”. La autogeneración puede existir únicamente como acelerador opcional para Mesas simples.

Gate de salida:

- reproducir con fidelidad operacional una Mesa en U, una curva/serpentina y una Mesa dibujada en el background sin modificar la geometría del mobiliario.

---

### CF-02 — Productividad del Builder

Estado inicial: **PARTIAL**  
Prioridad: **P0/P1**

Objetivo: que construir 30–100 Mesas no sea una secuencia de edición individual lenta.

Implementar sobre el motor vigente:

- multi-select de shapes;
- mover conjunto;
- duplicar conjunto;
- eliminar conjunto con reglas de integridad;
- alinear izquierda/centro/derecha;
- alinear arriba/medio/abajo;
- distribuir horizontalmente;
- distribuir verticalmente;
- snap consistente;
- creación rápida de múltiples Mesas desde inventario;
- distribución inicial tipo grid/filas-columnas;
- numeración/nombres secuenciales cuando aplique;
- acciones batch transaccionales o estrategia segura equivalente.

No implementar CAD avanzado ni panel de propiedades masivo.

Gate de salida:

- crear y distribuir 50 Mesas estándar en una sesión razonable sin editar manualmente posición y nombre de cada Mesa una por una.

---

### CF-03 — Plantillas reutilizables de salón/espacio

Estado inicial: **NOT STARTED / DISCOVERY REQUIRED**  
Prioridad: **P1 ESTRATÉGICO**

Objetivo: evitar reconstrucción repetitiva en venues recurrentes.

Modelo funcional objetivo:

```text
Venue / Salón
└── Espacio
    ├── Distribución A
    ├── Distribución B
    └── Distribución C
```

La capability debe permitir:

- guardar una distribución reusable;
- incluir background, shapes y lugares cuando corresponda;
- nombre y descripción humana;
- duplicar plantilla hacia un Evento;
- crear copia independiente, no referencia mutable compartida;
- conservar coordenadas normalizadas;
- permitir ajustes específicos del Evento;
- impedir contaminación cross-tenant;
- versionar o duplicar sin sobrescribir Eventos históricos.

Antes de implementar, realizar discovery del modelo actual de Organization/Venue para no inventar una jerarquía incompatible.

Gate de salida:

- preparar un segundo Evento del mismo salón a partir de una distribución existente sin reconstruir manualmente el Croquis.

---

### CF-04 — Seating Workspace Planner completo

Estado inicial: **PARTIAL**  
Prioridad: **P0**

Objetivo: cerrar el control operativo de quién se sienta dónde.

#### En `TABLE`

Debe conservarse:

- persona → Mesa;
- mover;
- desasignar;
- operaciones familiares/grupo vigentes;
- capacidad;
- filtros/búsqueda;
- concurrencia;
- realtime.

#### En `SEAT`

Debe funcionar:

- persona → lugar;
- lugar → persona;
- mover lugar → lugar;
- desasignar;
- `Mesa X · Lugar Y`;
- libre / ocupado / bloqueado / seleccionado;
- mapeo masivo explícito `assistantId -> seatId` cuando exista operación batch;
- 409/refetch autoritativo;
- pendiente `Mesa asignada, falta lugar` durante transición permitida.

Gate de salida:

- una Planner puede acomodar completamente un Evento pequeño en modo detallado sin editar geometría ni utilizar herramientas Provider.

---

### CF-05 — Scanner / Staff conectado al Croquis

Estado inicial: **PARTIAL**  
Prioridad: **P0 para operación real**

Objetivo: que Croquis aporte valor el día del Evento.

Debe funcionar:

- `TABLE`: mostrar Mesa;
- `SEAT`: mostrar Mesa + Lugar;
- si existe plano autorizado, resaltar Mesa/lugar correspondiente;
- geometría read-only;
- mínima exposición de PII;
- estado de asignación coherente con backend;
- cambio post-check-in únicamente donde ya esté autorizado y siempre auditado;
- no permitir check-in incompatible con las reglas vigentes de seating detallado.

Gate de salida:

- Staff puede recibir a una persona y ubicarla operacionalmente sin consultar una lista externa.

---

### CF-06 — Integridad, historial, concurrencia y recovery

Estado inicial: **PARTIAL / TRANSVERSAL**  
Prioridad: **P0**

Objetivo: que las funciones anteriores sean confiables, no sólo demostrables.

Certificar:

- persistencia normalizada;
- reload fidelity;
- locks;
- readonly por estado;
- concurrency conflict;
- idempotencia;
- batch all-or-none donde aplique;
- undo/redo coherente con operaciones soportadas;
- recovery después de timeout/error de red;
- realtime después de commit;
- no doble ocupación;
- no capacidad negativa/sobrecupo inválido;
- no cross-event / cross-tenant;
- eliminación/bloqueo protegido cuando existe ocupación.

Gate de salida:

- dos sesiones simultáneas no pueden producir un estado imposible y el cliente siempre puede recuperar la autoridad desde REST/DB.

---

### CF-07 — QA funcional de escala y escenarios reales

Estado inicial: **PARTIAL**  
Prioridad: **P0 antes de declarar meta cumplida**

Escenarios mínimos:

#### Builder

- 50 Mesas;
- 100 Mesas;
- 200 Mesas;
- selección múltiple;
- grid;
- align/distribute;
- duplicación;
- reload;
- tablet landscape;
- desktop.

#### Detallado

- 50 lugares;
- 150 lugares;
- Mesa en U;
- montaje serpentino;
- lugares fuera de la caja de Mesa;
- lugares sobre mobiliario del background;
- bloqueo/eliminación;
- renumeración;
- asignación completa.

#### Operación

- lista grande de asistentes;
- Planner y Provider en sesiones distintas;
- conflicto concurrente;
- caída de red durante mutación;
- check-in con Mesa;
- check-in con Lugar;
- actualización de acomodo autorizada;
- read-only después de lock/estado incompatible.

Gate de salida:

- todos los criterios P0 verdes;
- P1 faltante documentado y no bloqueante;
- sin regresión de RSVP, invitaciones, QR o check-in.

---

### CF-08 — Freeze funcional y handoff a UI

Estado inicial: **BLOCKED por CF-01..CF-07**  
Prioridad: **GATE**

Objetivo: declarar estable el comportamiento antes de invertir en composición visual final.

Se permite pasar a la siguiente etapa UI cuando:

- Casos A, B y C de esta meta estén operables;
- no existan blockers P0 abiertos;
- contratos API estén congelados para el alcance;
- QA funcional esté verde;
- cualquier deuda P1 esté enumerada y aceptada;
- no sea necesario rediseñar nuevamente la arquitectura de Croquis para completar la UI.

A partir de este gate, `FLOORPLAN_UX_TARGET.md` puede ejecutarse como refactor/pulido visual sin inventar funcionalidad nueva.

## 6. Orden de ejecución

```text
CF-00 Baseline
   ↓
CF-01 Lugar exacto ─────────────┐
   ↓                            │
CF-02 Productividad Builder     │
   ↓                            │
CF-03 Plantillas Venue          │
   ↓                            │
CF-04 Seating Planner           │
   ↓                            │
CF-05 Scanner / Staff           │
   ↓                            │
CF-06 Integridad transversal ◄──┘
   ↓
CF-07 QA escala / E2E
   ↓
CF-08 Freeze funcional
   ↓
Refactor / pulido UI de Croquis
```

CF-06 debe ejecutarse de forma transversal en cada bloque; su gate final ocurre antes de CF-07.

## 7. Prioridad real

### P0 — bloquea meta

- colocación libre y edición real de lugares;
- multi-select mínimo necesario;
- productividad básica del Builder;
- Planner TABLE/SEAT completo;
- Scanner Mesa/Lugar;
- integridad/concurrencia;
- QA end-to-end.

### P1 — debe intentarse antes del freeze

- align/distribute completo;
- grid avanzado;
- plantillas reutilizables por Venue/Espacio;
- operaciones batch adicionales.

Si Plantillas requiere un cambio grande de dominio, puede separarse del gate de primera operación real únicamente mediante decisión explícita. No se elimina silenciosamente del roadmap.

## 8. Fuera de alcance hasta completar la meta

- rediseño visual general de Croquis;
- nuevas cards/paneles sólo por apariencia;
- animaciones no funcionales;
- migración de design system;
- CAD;
- OCR de planos;
- detección automática de sillas;
- reconstrucción vectorial;
- auto-seating por afinidad;
- Planner Builder self-service;
- catálogos extensos de mobiliario técnico;
- nueva arquitectura paralela.

OCR permanece como línea futura: primero necesitamos que la capa de lugares sea completamente operable de forma manual; después una detección automática podrá producir propuestas sobre esa misma capa.

## 9. Métricas de aceptación

La meta no se evalúa por número de componentes creados sino por trabajo completado.

Medir durante QA/piloto:

- tiempo para construir 50 Mesas;
- tiempo para reutilizar una plantilla;
- tiempo para colocar/corregir 50 lugares;
- cantidad de acciones manuales repetitivas;
- errores de asignación;
- conflictos recuperados;
- tiempo para localizar Mesa/Lugar en check-in;
- necesidad de soporte técnico durante preparación;
- necesidad de herramientas externas.

Estas métricas servirán para decidir automatización futura.

## 10. Definición final de “DONE”

`CROQUIS FUNCTIONAL TARGET = DONE` cuando:

```text
Provider puede construir rápido
        +
Provider puede representar montajes irregulares
        +
Planner puede acomodar por Mesa o Lugar
        +
Venue puede reutilizar una distribución
        +
Staff puede localizar a la persona el día del Evento
        +
DB/API preservan integridad bajo concurrencia
        +
QA de escala es verde
        +
ninguna operación crítica requiere workaround externo
```

Después de ese punto, los cambios de Croquis pueden concentrarse en UX visual, claridad, densidad, responsive y acabado premium sin seguir moviendo la base funcional.