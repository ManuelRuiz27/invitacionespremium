# Contrato especializado — Croquis Sticker y Asignación Opcional por Asiento

Estado: **FUENTE DE VERDAD PARA EL PRÓXIMO REFACTOR DE CROQUIS**  
Ámbito: `apps/client`, `apps/scanner`, API de Croquis/mesas/asignación y contratos OpenAPI relacionados.  
Contrato base que permanece vigente: `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`.

## 1. Objetivo

Evolucionar el armado del Croquis hacia un modelo **Sticker + Progressive Disclosure** sin sustituir las reglas de negocio actuales.

El Planner debe poder trabajar en dos extremos:

- evento masivo: crear muchas Mesas, colocarlas rápido y asignar por Mesa;
- evento boutique: activar opcionalmente lugares con identidad propia y asignar una persona a un asiento concreto.

La complejidad avanzada nunca debe aparecer como requisito del flujo base.

## 2. Orden de autoridad

Ante contradicción, prevalece:

1. reglas y invariantes del backend;
2. `EVENT_WIZARD_CONTRACT.md`;
3. este contrato;
4. `docs/03-diseno/FLOORPLAN_UX_TARGET.md`;
5. render visual de referencia.

Una referencia visual nunca autoriza por sí sola cambios de dominio.

## 3. Invariantes que NO se pueden romper

- La API sigue siendo autoridad de ownership, estado, permisos, readiness, capacidad y concurrencia.
- `FloorplanShape` sigue siendo la representación contractual de Mesas y Zonas mientras no exista una migración aprobada.
- `TABLE` y `DECORATIVE_ZONE` continúan siendo tipos internos válidos.
- `RECTANGLE`, `SQUARE`, `CIRCLE` y `POLYGON` continúan siendo geometrías vigentes.
- Las coordenadas persistidas continúan normalizadas en `0..1`; Canvas/Konva nunca se convierte en fuente de verdad persistente.
- `CIRCLE` y `SQUARE` deben conservar lados físicos iguales independientemente del aspect ratio del plano.
- Las Zonas continúan con capacidad cero.
- Lock/unlock continúa presentándose como `Finalizar distribución` / `Editar distribución` y conserva su semántica actual.
- Un fallo de refresco posterior a una mutación confirmada no debe repetir la mutación.
- Scanner y operación en vivo deben reutilizar realtime/REST existentes; no crear una segunda infraestructura realtime.
- La asignación por asiento es opcional y no invalida el flujo existente de asignación por Mesa.
- Eventos existentes permanecen en modo de asignación por Mesa hasta que el Planner active explícitamente la capacidad avanzada.

## 4. Modelo mental de producto

La Planner no dibuja un salón desde cero. El flujo objetivo es:

```text
Cargar plano real
→ Crear inventario de Mesas
→ Colocar Mesas como stickers
→ Ajustar visualmente
→ Asignar invitados por Mesa
→ [Opcional] Activar lugares individuales
→ Revisar
→ Finalizar distribución
```

No diseñar una herramienta CAD ni exponer coordenadas, grados, enums o geometría técnica.

## 5. Renderer Canvas/Konva

Se permite migrar la superficie manipulable a `react-konva` de forma incremental.

### Regla de arquitectura

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

Durante `drag`, `resize`, `rotate`, `zoom` y `pan`, el renderer puede mantener estado transitorio local. La persistencia se ejecuta al finalizar una interacción estable (`dragEnd`, `transformEnd` o equivalente).

No persistir píxeles de viewport.

La migración a Konva debe mantener paridad con las pruebas actuales antes de agregar nuevas capacidades.

## 6. Inventario y modelo Sticker

`Sticker` es un concepto de UX, no una nueva entidad de negocio.

El Planner puede crear Mesas masivamente mediante configuraciones como:

```text
40 × Redonda × 10 lugares
10 × Rectangular × 12 lugares
5 × Cuadrada × 8 lugares
```

Las Mesas creadas pero todavía no colocadas aparecen en una bandeja de elementos pendientes.

Acciones mínimas:

- arrastrar al Croquis;
- click/tap para colocar;
- buscar por nombre/número;
- duplicar;
- colocar automáticamente en una distribución inicial;
- ver contador de Mesas pendientes de colocar.

El nombre visible es independiente del identificador persistente. Renombrar `Mesa 12` a `VIP` nunca cambia su ID.

## 7. Manipulación visual

Una Mesa colocada admite, según permisos y estado:

- seleccionar con click/tap;
- mover;
- redimensionar;
- rotar;
- renombrar;
- cambiar color;
- duplicar;
- asignar invitados;
- mostrar/ocultar sillas.

El doble clic puede existir como shortcut de desktop, pero nunca como única vía de una acción porque la UI debe conservar compatibilidad touch.

### Snap

El ajuste magnético es opcional. Puede incluir:

- grid invisible;
- snap a otros elementos;
- guías de alineación;
- distribución uniforme.

Nunca redondear forzosamente todas las posiciones si el Planner desactiva el ajuste.

## 8. Color y contraste

La interacción primaria ofrece una paleta breve y los últimos cinco colores utilizados. Un selector avanzado se abre mediante `Personalizado…`.

Texto sobre un sticker debe elegir automáticamente un color que alcance contraste suficiente; objetivo WCAG AA cuando sea aplicable.

El estado nunca puede comunicarse exclusivamente por color.

## 9. Sillas visuales

`Mostrar sillas` es una preferencia visual y no activa por sí sola asignación individual.

Cuando una Mesa no tiene asignación individual habilitada, las sillas pueden generarse matemáticamente desde `capacity` y no requieren identidad persistente.

Distribución visual mínima:

- circular alrededor de Mesa redonda;
- por lados en Mesa cuadrada;
- proporcional al perímetro útil en Mesa rectangular.

## 10. Asignación opcional por asiento

La identidad individual de silla es una **capability opcional**, distinta de `Mostrar sillas`.

Control conceptual:

```text
Asignación de invitados
○ Por Mesa   [default]
○ Por asiento
```

### Modo Mesa

La relación funcional actual continúa sin cambios para los eventos que no activen asientos.

### Modo asiento

La asignación por asiento especializa una asignación existente; no debe eliminar la asociación con Mesa.

Modelo conceptual esperado:

```text
Attendee → Table
              └→ SeatAssignment [opcional]
```

No implementar `seatId` como sustituto de `tableId` en Asistente/Invitado.

### Seat

Si la capability está activa, una silla persistente requiere como mínimo:

- ID estable independiente de su posición;
- `tableId`;
- etiqueta visible opcional;
- geometría/posición relativa a la Mesa o al espacio acordado por implementación;
- estado activo/ocupable según el modelo aprobado.

Mover o renumerar una silla no cambia su ID.

### Integridad

- una silla ocupada no puede asignarse a dos asistentes;
- no se puede eliminar una silla ocupada sin resolver su asignación;
- activar asientos en una Mesa genera inicialmente tantos lugares como su capacidad actual;
- en modo asiento debe existir una sola autoridad para capacidad efectiva: el backend debe impedir divergencia entre capacidad y lugares activos;
- desactivar el modo asiento debe conservar la asociación del asistente con su Mesa; la política de conservación/eliminación del detalle de asiento debe quedar explícita antes de implementar.

## 11. Split View de asignación

Seleccionar una Mesa ofrece `Asignar invitados`.

Desktop: panel lateral persistente o drawer de aproximadamente 40–50%, sin depender de backdrop para mantener contexto cuando sea útil.  
Mobile: bottom sheet expandible o pantalla dedicada.

### Modo Mesa

Mostrar:

- nombre de Mesa;
- capacidad `ocupados / total`;
- búsqueda;
- filtros `Sin asignar` / `Asignados`;
- filtro por Grupo;
- selección múltiple;
- CTA `Asignar X a Mesa Y`.

### Modo asiento

Además:

- representación ampliada de Mesa y sillas;
- lugares libres/ocupados;
- bulk assignment automático a lugares disponibles;
- drag & drop de un asistente a un asiento concreto;
- reasignación y desasignación explícita.

Listas grandes deben virtualizarse o utilizar una estrategia equivalente. El objetivo es conservar interacción fluida con ~1,800 asistentes.

## 12. Resumen y validación

El Croquis debe poder mostrar, sin depender solo de color:

- Mesas totales;
- capacidad total;
- asistentes con Mesa;
- asistentes sin Mesa;
- Mesas completas;
- lugares disponibles;
- cuando aplique, asistentes con Mesa pero sin asiento.

Las reglas de activación/readiness continúan en backend. La UI solo proyecta blockers y advertencias autorizados.

## 13. Operación en vivo

La vista del día del Evento es una superficie de operación separada del editor, aunque puede reutilizar el mismo renderer.

Debe ser read-only para geometría:

- no drag;
- no resize;
- no rotate;
- no edición de labels/colores.

Puede mostrar ocupación/check-in actualizados mediante la infraestructura realtime existente, con recuperación REST como autoridad.

## 14. Scanner

El scanner continúa funcionando aunque no exista SeatAssignment.

Evento sin asiento:

```text
ACCESO VÁLIDO
MESA 14
Ana Martínez
```

Evento con asiento:

```text
ACCESO VÁLIDO
MESA 14 · ASIENTO 7
Ana Martínez
```

El asiento es información adicional; nunca requisito para validar un QR que contractualmente sea válido.

Feedback combina texto, icono y color. No fijar `120px`; utilizar escala responsive adecuada al viewport.

## 15. Progressive Disclosure obligatorio

Default para cualquier Evento:

- stickers sólidos;
- asignación por Mesa;
- sillas ocultas;
- controles avanzados cerrados.

Solo bajo acción explícita aparecen:

- sillas;
- edición avanzada de color;
- asignación individual;
- detalle exacto de Seat.

## 16. Migración y compatibilidad

- no reinterpretar Floorplans existentes;
- no activar Seat capability retroactivamente;
- no cambiar payloads existentes sin versión/migración y actualización de OpenAPI;
- cualquier cambio backend exige pruebas de migración, integración, concurrencia y auditoría;
- cualquier cambio de SDK procede de OpenAPI y no de DTOs manuales en frontend.

## 17. Prohibiciones

Sin aprobación explícita adicional, este contrato NO autoriza:

- sustituir `FloorplanShape` de golpe por un modelo incompatible;
- crear `FloorplanV2` o un editor paralelo;
- duplicar reglas de negocio en frontend;
- crear una segunda infraestructura WebSocket/Socket.IO;
- hacer obligatoria la asignación por asiento;
- borrar asociaciones de Mesa al asignar asiento;
- modificar RSVP, créditos, precios, servicios, roles o estados del Evento;
- alterar semántica QR/check-in fuera de la proyección opcional de asiento.
