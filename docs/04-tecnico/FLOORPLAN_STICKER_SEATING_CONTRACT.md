# Contrato especializado — Croquis V2 / Sticker Model + Seating Workspace

Estado: **FUENTE DE VERDAD PARA CROQUIS V2**  
Ámbito: `apps/client`, `apps/admin` cuando corresponda, API de Croquis/mesas/asignación, realtime y contratos OpenAPI relacionados.  
Contrato base que permanece vigente: `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`.  
Acceso operator-led: `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`.

## 1. Objetivo

Formalizar Croquis V2 como evolución del motor actual hacia una experiencia **Sticker + Progressive Disclosure**, sin sustituir el dominio ni reconstruir el módulo desde el repositorio legacy.

El lanzamiento separa dos superficies:

```text
Builder del proveedor
        ↓
construye infraestructura del salón

Seating Workspace de Planner
        ↓
asigna personas sobre infraestructura existente
```

Croquis V2 es un refactor de producto/UX sobre contratos actuales, no `FloorplanV2`, no un backend paralelo y no una migración de repositorios.

## 2. Orden de autoridad

Ante contradicción, prevalece:

1. ADRs aceptados aplicables;
2. reglas e invariantes del backend y contratos OpenAPI vigentes;
3. `EVENT_WIZARD_CONTRACT.md`;
4. este contrato;
5. `docs/03-diseno/FLOORPLAN_UX_TARGET.md`;
6. referencias visuales/renderizadas;
7. cualquier material del repositorio legacy.

`docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md` regula el uso del legacy.

## 3. Invariantes que NO se pueden romper

- La API continúa siendo autoridad de ownership, estado, permisos, readiness, capacidad y concurrencia.
- `FloorplanShape` continúa siendo la representación contractual mientras no exista una migración aprobada.
- `TABLE` y `DECORATIVE_ZONE` continúan como tipos internos válidos.
- Las geometrías contractuales actuales permanecen vigentes.
- Las coordenadas persistidas permanecen normalizadas en `0..1`.
- Canvas/Konva nunca se convierte en fuente de verdad persistente.
- Zonas no asignables continúan con capacidad cero.
- Las reglas de capacidad se validan en backend.
- Lock/unlock mantiene su semántica actual aunque la copy visible pueda evolucionar conforme al glosario autorizado.
- Un fallo de refresco posterior a una mutación confirmada no debe repetir la mutación.
- Realtime/REST actuales son la única infraestructura para sincronización operacional.
- La asignación por Mesa existente permanece como flujo contractual de lanzamiento.
- QR/check-in, RSVP, créditos, pricing, roles y estados no cambian por este refactor.

## 4. Ownership funcional en lanzamiento

### Builder / geometría

Durante el perfil operator-led:

- la mutación de geometría pertenece a la operación del proveedor;
- debe utilizar la capacidad administrativa explícita definida por `ADR_OPERATOR_LED_ACCESS.md`;
- no se habilita por impersonación ni ampliando silenciosamente endpoints Planner;
- toda mutación relevante debe conservar auditoría e invariantes actuales.

### Planner / seating

La Planner:

- consume el Croquis en modo read-only para geometría;
- selecciona Mesas;
- asigna personas;
- mueve personas entre Mesas;
- desasigna;
- usa acciones familiares/grupales soportadas;
- recibe ocupación/capacidad y actualización realtime.

UI read-only no sustituye autorización. La API debe reflejar la misma frontera.

## 5. Modelo Sticker

`Sticker` es exclusivamente un concepto de interacción.

No crear una entidad de negocio `Sticker` ni un nuevo `kind` por cada etiqueta visual.

El catálogo inicial puede proyectar:

### Mesas

- redonda;
- rectangular;
- imperial;
- principal.

### Zonas / apoyo visual

- pista;
- barra;
- escenario/DJ;
- entrada;
- baños;
- zona genérica;
- texto/etiqueta.

Cada elemento debe mapearse al modelo contractual vigente. Si una nueva representación exige semántica de dominio que el contrato no soporta, debe elevarse antes de implementarse.

## 6. Flujo del Builder

Modelo mental:

```text
Plano opcional
→ elegir sticker
→ colocar
→ mover/rotar/ajustar
→ configurar propiedades necesarias
→ repetir/duplicar
→ revisar
→ guardar/finalizar
```

No diseñar CAD ni exponer coordenadas, grados, IDs, enums o JSON en el flujo base.

Operaciones mínimas según tipo/estado:

- colocar;
- seleccionar;
- mover;
- rotar;
- redimensionar cuando aplique;
- duplicar;
- renombrar/etiquetar;
- configurar capacidad para Mesas;
- eliminar de forma segura;
- undo/redo;
- zoom/pan/fit.

## 7. Renderer Canvas/Konva

Se conserva la arquitectura actual de Konva/React Konva.

Regla:

```text
API / modelo normalizado
        ↓
adaptador de coordenadas
        ↓
Canvas / Konva (estado transitorio)
        ↓
adaptador inverso
        ↓
API / modelo normalizado
```

Durante drag/resize/rotate/zoom/pan puede existir estado transitorio local. Persistir únicamente al completar una interacción estable conforme al mecanismo actual.

No persistir píxeles de viewport.

No reemplazar Konva por código legacy ni introducir un segundo motor gráfico para conseguir paridad visual.

## 8. Componentes actuales que se preservan como base

La implementación debe partir de los componentes/contratos vigentes, incluyendo cuando sean aplicables:

- `apps/client/src/wizard/floorplan/FloorplanStep.tsx`;
- `apps/client/src/wizard/floorplan/FloorplanKonvaRenderer.tsx`;
- `apps/client/src/wizard/floorplan/FloorplanSurface.tsx`;
- `apps/client/src/wizard/floorplan/FloorplanToolbar.tsx`;
- `apps/client/src/wizard/floorplan/FloorplanTray.tsx`;
- `apps/client/src/wizard/floorplan/floorplan-geometry.ts`;
- `apps/client/src/wizard/floorplan/floorplan-history.ts`;
- `apps/client/src/wizard/floorplan/floorplan-sticker-style.ts`;
- `apps/client/src/workspace/SeatingWorkspace.tsx`;
- API/servicios Floorplan actuales;
- tests unitarios/de integración/performance existentes.

“Preservar como base” no significa que cada componente sea intocable; significa que la implementación se refactoriza sobre ellos y no crea una segunda solución equivalente sin justificación.

## 9. Seating Workspace

El workspace actual es la base funcional para Planner.

Debe conservar:

- geometría read-only;
- selección de Mesa;
- búsqueda;
- filtros existentes;
- asignación múltiple;
- asignación familiar/grupal cuando esté soportada;
- mover/desasignar;
- validación de capacidad;
- manejo de `409`/conflictos;
- idempotencia donde aplique;
- actualización realtime;
- recuperación por refetch cuando corresponda.

Croquis V2 no debe reconstruir Seating Workspace sólo para igualar el lenguaje visual del legacy.

## 10. Progressive Disclosure obligatorio

Default del Builder:

- catálogo de stickers legible;
- propiedades esenciales;
- controles avanzados cerrados;
- sin términos técnicos.

Default del Seating Workspace:

- personas sin Mesa / Mesa seleccionada;
- capacidad y disponibilidad;
- búsqueda/filtros;
- acciones de asignación necesarias.

Opciones visuales secundarias se revelan sólo cuando el contexto lo requiere.

## 11. Resumen, readiness y validación

La UI puede proyectar:

- Mesas totales;
- capacidad total;
- asistentes confirmados;
- asistentes con Mesa;
- asistentes sin Mesa;
- disponibilidad por Mesa;
- blockers/warnings retornados por contratos autorizados.

La UI no inventa reglas de activación. El backend sigue siendo autoridad.

## 12. Operación en vivo

La vista del día del Evento es read-only para geometría.

Puede mostrar ocupación/check-in mediante realtime existente con recuperación REST.

No se permite drag, resize, rotate o edición estructural desde una superficie de Staff sólo porque reutilice el renderer.

Cambio de mesa permitido por reglas existentes debe ejecutarse por la superficie autorizada y con auditoría; no implica editar geometría.

## 13. Asientos individuales

Una nueva capability persistente de asignación por silla/asiento queda en **Not now** para el lanzamiento operator-led.

Por tanto, Croquis V2 inicial **no requiere**:

- entidad `Seat` nueva;
- `SeatAssignment`;
- migración de schema para asientos;
- cambios al scanner para exigir asiento;
- drag de persona a silla persistente.

Si la UI actual puede dibujar sillas a partir de `capacity`, se consideran representación visual sin identidad persistente.

La asignación individual sólo podrá retomarse mediante una decisión posterior con evidencia de negocio, modelo de integridad y migración aprobados.

## 14. Performance y QA

Antes de considerar Croquis V2 listo para piloto, validar al menos:

- 50 Mesas;
- 100 Mesas;
- 200 Mesas;
- interacción tablet landscape;
- desktop;
- conflictos de versión/concurrencia;
- persistencia tras drag/transform estable;
- undo/redo;
- eliminación segura;
- Seating Workspace con lista grande;
- actualización realtime;
- regresión de contratos backend actuales.

No aceptar una mejora visual que degrade confiabilidad de operación.

## 15. Compatibilidad

- no reinterpretar Floorplans existentes de manera destructiva;
- no cambiar payloads sin migración/versionado y OpenAPI actualizado;
- cambios backend exigen integración, autorización, concurrencia y auditoría;
- SDK frontend deriva de OpenAPI, no de DTOs manuales divergentes;
- datos creados antes del refactor deben continuar renderizando o contar con migración explícita.

## 16. Uso del repositorio legacy

Únicamente se permite consultar el legacy para:

- composición visual;
- jerarquía;
- shell del workspace;
- ergonomía del constructor;
- sensación visual general.

Queda prohibido portar desde legacy:

- backend;
- modelos de datos;
- auth/roles;
- contratos API;
- persistencia;
- stack completo de UI;
- dependencias sólo por paridad estética;
- reglas de negocio.

## 17. Prohibiciones

Este contrato NO autoriza:

- crear `FloorplanV2` paralelo;
- fusionar repositorios;
- sustituir `FloorplanShape` de golpe;
- crear una segunda infraestructura realtime;
- duplicar reglas del backend en frontend;
- dar a Planner mutación de geometría en el perfil de lanzamiento;
- confiar en UI hiding como autorización;
- introducir un rol `Operator` sin ADR;
- migrar a Tailwind/shadcn/Radix sólo porque el legacy los use;
- hacer obligatoria asignación por asiento;
- modificar RSVP, créditos, precios, servicios, roles o estados del Evento;
- esconder cambios de negocio dentro de una tarea de UI/UX.

## 18. Criterio de terminado

Croquis V2 está listo para piloto cuando:

1. el proveedor puede construir el Croquis con Sticker Model mediante acceso operator-led explícito y auditado;
2. la Planner puede asignar personas sobre el Croquis sin editar geometría;
3. la persistencia y normalización actuales se conservan;
4. realtime/concurrencia siguen funcionando;
5. QA de escala y regresión pasa;
6. no existe dependencia funcional del repositorio legacy;
7. los cambios visuales respetan el design system del repo canónico.