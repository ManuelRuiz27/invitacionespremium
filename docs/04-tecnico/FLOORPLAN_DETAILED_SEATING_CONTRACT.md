# Contrato especializado — Croquis con asignación por lugar exacto

Estado: **FUENTE DE VERDAD — APROBADO**  
Ámbito: Croquis V2, Builder del proveedor, Seating Workspace de Planner, persistencia, API, scanner/check-in y OpenAPI relacionados.  
Decisión de producto: incorporar un modo opcional de acomodo por asiento/lugar individual para Eventos boutique o montajes que requieran precisión visual.

## 1. Autoridad y sustituciones

Este contrato es una decisión posterior y específica de Croquis. Para el alcance descrito aquí, **sustituye expresamente** cualquier texto anterior que deje la asignación persistente por silla/asiento en `Not now`, fuera del MVP o únicamente como representación visual.

En particular sustituye, solo para esta capability:

- `docs/01-producto/02_PRD.md`: exclusión de asignación persistente por silla/asiento;
- `docs/03-diseno/FLOORPLAN_UX_TARGET.md`: sección que trate sillas sin identidad persistente;
- `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`: sección 13 `Asientos individuales` y cualquier prohibición equivalente;
- `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`: la afirmación de que Croquis no cambia payload, readiness o validación, únicamente cuando el Evento utiliza el modo detallado;
- `docs/04-tecnico/09_MODELO_DATOS_CONCEPTUAL.md`, `10_SCHEMA_PRISMA_GUIDE.md` y `11_API_CONTRACTS.md` cuando su silencio o descripción previa asuma exclusivamente asignación por Mesa.

No sustituye roles, ownership, operator-led, QR, RSVP, estados, créditos, pricing ni reglas financieras.

## 2. Caso de uso aprobado

Existen Croquis reales donde la geometría de las Mesas no es regular ni puede representarse de forma útil como una Mesa simétrica generada por el sistema. Ejemplos:

- mesas en U;
- mesas curvas o serpentinas;
- mesas imperiales compuestas;
- montajes asimétricos;
- mesas o mobiliario dibujados directamente en el plano base;
- Eventos pequeños donde cada silla/lugar debe corresponder visualmente con una persona concreta.

En estos casos, el valor operacional está en identificar **cada lugar individual** sobre el Croquis, aunque la Mesa padre sea irregular o su forma visual no sea exacta.

El sistema no debe intentar convertir estos montajes en CAD ni exigir que la geometría de la Mesa reproduzca físicamente el mobiliario.

## 3. Dos modos de acomodo

Cada Croquis utiliza exactamente un modo de acomodo activo:

### `TABLE`

Nombre visible: **Acomodo por mesa**.

- conserva el comportamiento actual;
- la Mesa tiene capacidad configurable;
- una persona se asigna a una Mesa;
- no existe obligación de seleccionar lugar exacto.

### `SEAT`

Nombre visible: **Acomodo por lugar exacto**.

- cada lugar tiene identidad persistente;
- cada lugar pertenece a una Mesa;
- cada lugar tiene posición libre sobre el plano;
- una persona se asigna a un lugar exacto;
- la Mesa continúa existiendo como agrupador lógico y para compatibilidad operacional.

La UI no muestra `TABLE` ni `SEAT` como enums.

El modo detallado es **opcional**. No se activa automáticamente por cantidad de invitados, tipo social ni servicio.

## 4. Perfil operator-led

La decisión no cambia la separación de responsabilidades del lanzamiento.

### Proveedor / Builder

Puede:

- seleccionar el modo del Croquis durante preparación;
- construir Mesas y Zonas;
- crear, posicionar, duplicar, renumerar, bloquear o eliminar lugares;
- ajustar lugares manualmente sobre montajes irregulares;
- finalizar la distribución.

Lo hace mediante la capability administrativa explícita y auditada ya autorizada para Croquis. No se habilita impersonación.

### Planner / Seating Workspace

Puede:

- consultar la geometría en read-only;
- en modo `TABLE`, asignar personas a Mesas;
- en modo `SEAT`, asignar personas a lugares exactos;
- mover una persona entre lugares;
- desasignar;
- buscar y filtrar personas;
- consultar Mesa, lugar, ocupación y pendientes.

La Planner **no obtiene edición de geometría** por esta decisión. “Opción para Planner” significa que puede operar el acomodo detallado una vez preparado, no que recibe el Builder self-service durante el perfil operator-led.

## 5. Modelo de dominio

Se aprueba una entidad técnica persistente `FloorplanSeat` porque el lugar requiere identidad, integridad relacional, unicidad de ocupación, auditoría y consultas. No debe almacenarse como JSON opaco dentro de `FloorplanShape`.

### `FloorplanSeat`

Pertenece a:

- un `Event`;
- un `Floorplan`;
- exactamente una `FloorplanShape` activa de `kind=TABLE`.

Campos conceptuales mínimos:

- `id` UUID;
- `eventId`;
- `floorplanId`;
- `floorplanShapeId` — Mesa padre;
- `label` — etiqueta humana estable dentro de la Mesa;
- `x`, `y` — coordenadas normalizadas respecto al plano completo, rango `0..1`;
- `isBlocked` — lugar físico visible pero no asignable;
- `createdAt`;
- `updatedAt`;
- `deletedAt` para borrado lógico.

No persistir píxeles de viewport. El tamaño visual del círculo/silla es presentación y no crea una dimensión de dominio en esta primera versión.

### Coordenadas globales

Los lugares usan coordenadas relativas al **plano completo**, no a la caja geométrica de la Mesa. Esto permite:

- posiciones asimétricas;
- lugares fuera del perímetro aproximado de una shape;
- mesas dibujadas en la imagen base;
- curvas y composiciones irregulares;
- reposicionamiento manual exacto.

La relación con la Mesa es semántica, no una restricción geométrica de contención.

## 6. Relación con `Assistant`

Se agrega conceptualmente `Assistant.floorplanSeatId` nullable además de `Assistant.floorplanShapeId` existente.

En modo `SEAT`, una asignación válida establece ambos campos en la misma transacción:

```text
floorplanSeatId -> lugar exacto
floorplanShapeId -> Mesa padre de ese lugar
```

El backend deriva `floorplanShapeId` desde el lugar. El cliente no puede enviar una combinación Mesa/Lugar contradictoria.

Invariantes:

- un Asistente activo ocupa como máximo un lugar;
- un lugar asignable puede pertenecer como máximo a un Asistente activo;
- el lugar y la Mesa deben pertenecer al mismo Evento/Croquis;
- un lugar bloqueado no puede recibir asignación;
- una Zona nunca puede ser Mesa padre de un lugar;
- una persona no puede conservar `floorplanSeatId` de una Mesa distinta a `floorplanShapeId`;
- desasignar en modo detallado limpia Mesa y lugar;
- cambiar de lugar actualiza ambos valores atómicamente cuando cambia de Mesa.

## 7. Capacidad en modo detallado

En `SEAT`, la capacidad asignable de una Mesa **se deriva de sus lugares activos y no bloqueados**.

Por tanto:

- la UI oculta edición manual de `capacity` para Mesas en modo detallado;
- crear/desbloquear un lugar incrementa la capacidad asignable;
- bloquear/eliminar un lugar la reduce;
- no se puede bloquear/eliminar un lugar ocupado;
- backend mantiene `FloorplanShape.capacity` sincronizada con el número de lugares activos no bloqueados para conservar compatibilidad con contratos existentes;
- una Mesa detallada debe conservar al menos un lugar asignable para considerarse estructuralmente válida.

La sincronización de capacidad debe ocurrir en la misma transacción de la mutación de lugares.

## 8. Identidad y etiquetas de lugar

Cada lugar tiene una etiqueta humana estable y única entre lugares activos de su Mesa.

Ejemplos visibles:

- `1`, `2`, `3`;
- `A1`, `A2`;
- `Cabecera 1`.

El Builder puede renumerar. Renumerar cambia la etiqueta, no el UUID ni la asignación existente.

La UI puede generar etiquetas secuenciales por defecto. No debe usar posición visual o índice de render como identidad persistente.

## 9. Lugar bloqueado

`isBlocked=true` representa una silla/lugar dibujado que deliberadamente no se utilizará.

Reglas:

- continúa visible;
- no cuenta como capacidad disponible;
- no acepta Asistente;
- no puede bloquearse mientras esté ocupado;
- puede desbloquearse durante estados donde la geometría sea editable;
- Staff lo ve únicamente como parte del plano, sin datos personales.

No crear estados adicionales de lugar sin una decisión posterior.

## 10. Cambio de modo

El modo se selecciona durante preparación.

### `TABLE -> SEAT`

Permitido únicamente mientras la geometría sea editable.

- conserva Mesas/Zonas existentes;
- el Builder debe crear lugares para las Mesas que seguirán siendo asignables;
- las asignaciones por Mesa existentes pueden mantenerse temporalmente como pendientes de precisión, pero el modo detallado no se considera operacionalmente completo hasta que cada persona que requiera acomodo tenga lugar exacto;
- la UI debe identificar esas personas como **Mesa asignada, falta lugar** durante la transición.

### `SEAT -> TABLE`

Requiere confirmación explícita porque pierde precisión.

- solo durante preparación;
- no debe existir check-in;
- `floorplanSeatId` se limpia conservando `floorplanShapeId` de la Mesa padre;
- los lugares se conservan como datos del Croquis mientras la operación se completa o se eliminan lógicamente conforme a la implementación aprobada, pero nunca se reutilizan como asignaciones ocultas;
- la acción se audita.

Una vez activado el Evento, el modo de acomodo no cambia.

## 11. Builder — interacción requerida

En modo **Acomodo por lugar exacto**, el Builder debe permitir como mínimo:

- seleccionar una Mesa;
- `Agregar lugar` mediante click/tap sobre el plano;
- arrastrar un lugar libremente;
- duplicar un lugar;
- selección múltiple de lugares;
- mover una selección múltiple;
- eliminar lugares no ocupados;
- bloquear/desbloquear lugares no ocupados;
- renumerar/reetiquetar;
- deshacer/rehacer las operaciones visuales soportadas por el historial actual;
- zoom/pan/fit sin alterar coordenadas persistidas;
- guardar al completar una interacción estable.

Para Mesas simples, la UI **puede** ofrecer `Crear lugares automáticamente` como punto de partida. La distribución automática nunca es autoridad: cada lugar sigue siendo editable manualmente.

Para Mesas curvas, en U, serpentinas o representadas en la imagen base, el flujo principal es la colocación libre de lugares.

No exponer coordenadas `x/y`, UUID, JSON ni términos de schema en el flujo normal.

## 12. Seating Workspace — interacción requerida

En `SEAT` el modelo mental visible cambia a:

```text
Persona -> lugar exacto -> Mesa
```

Debe permitir:

- seleccionar un lugar libre en el Croquis;
- asignar una persona confirmada;
- seleccionar una persona y después un lugar;
- mover entre lugares;
- desasignar;
- búsqueda por persona;
- filtros existentes de Grupo/estado cuando apliquen;
- indicar Mesa + etiqueta de lugar;
- resaltar el lugar seleccionado sin depender solo del color;
- distinguir libre, ocupado, bloqueado y seleccionado;
- resolver conflictos de concurrencia mediante respuesta autoritativa y refetch.

En modo detallado, las operaciones familiares/grupales no pueden asignar varias personas a un único lugar. Si se ofrece operación masiva, debe recibir un mapeo explícito `assistantId -> seatId` y ser all-or-none.

## 13. API contractual

Los contratos deben publicarse en OpenAPI y el frontend debe consumir tipos generados.

### Lectura

`GET /events/:eventId/floorplan` agrega:

- `seatingMode`;
- lugares activos cuando el modo sea `SEAT`, o una colección/endpoint equivalente tipado sin duplicar fuente de verdad.

### Configuración de modo

- `PATCH /events/:eventId/floorplan/seating-mode`

Payload conceptual:

```json
{ "seatingMode": "TABLE | SEAT" }
```

Respeta estados, lock, ownership y perfil operator-led.

### Lugares

- `POST /events/:eventId/floorplan/shapes/:shapeId/seats`
- `PATCH /events/:eventId/floorplan/seats/:seatId`
- `PATCH /events/:eventId/floorplan/seats/batch`
- `DELETE /events/:eventId/floorplan/seats/:seatId`

`POST` puede aceptar creación individual o lote acotado conforme al DTO final. `batch` existe para movimientos/renumeración múltiples y debe ser transaccional.

### Asignación detallada

- `POST /events/:eventId/seating/assign-seats`

Requiere `Idempotency-Key`.

Payload conceptual:

```json
{
  "assignments": [
    { "assistantId": "uuid", "seatId": "uuid" }
  ]
}
```

El lote es all-or-none.

`PATCH /events/:eventId/seating/:assistantId` se amplía para aceptar `seatId` o `null` cuando `seatingMode=SEAT`. El backend deriva la Mesa.

Las rutas existentes de asignación por Mesa permanecen para `TABLE`.

## 14. Persistencia y constraints

La implementación Prisma/PostgreSQL debe materializar como mínimo:

### `Floorplan`

- nuevo enum/campo `seatingMode = TABLE | SEAT`, default `TABLE` para compatibilidad.

### `FloorplanSeat`

- UUID;
- FKs compuestas que impidan cruce de Evento, Floorplan y Mesa;
- soft delete;
- `x/y` finitos en `0..1`;
- etiqueta normalizada única entre lugares activos de una Mesa;
- índice por `floorplanId`;
- índice por `floorplanShapeId`.

### `Assistant`

- FK nullable `floorplanSeatId`;
- unicidad parcial para impedir dos Asistentes activos en un mismo lugar;
- validación transaccional de coherencia lugar -> Mesa -> Evento.

### Triggers/servicio de dominio

Deben impedir al menos:

- asignar lugar bloqueado/eliminado;
- asignar lugar de otro Evento;
- asignar lugar de Zona;
- eliminar/bloquear lugar ocupado;
- eliminar Mesa con lugares ocupados;
- reducir la disponibilidad por debajo de ocupación;
- divergencia entre `Assistant.floorplanSeatId` y `Assistant.floorplanShapeId`;
- mutaciones de geometría/lugares cuando el Croquis está finalizado o el Evento no es editable.

No confiar exclusivamente en validación frontend.

## 15. Readiness y cierre de Confirmación

La API sigue siendo autoridad.

### Activación

Con Croquis habilitado:

- modo `TABLE`: conserva reglas actuales;
- modo `SEAT`: además de Croquis/imagen/Mesa válidos, cada Mesa asignable debe tener al menos un lugar activo no bloqueado y la capacidad sincronizada debe ser coherente.

No se exige que todas las personas tengan lugar al activar, porque las Confirmaciones continúan después de activación.

### Cerrar Confirmación

En modo `TABLE`:

- todo Asistente confirmado que requiera Croquis debe tener Mesa.

En modo `SEAT`:

- todo Asistente confirmado debe tener lugar exacto activo y no bloqueado;
- la Mesa se deriva de ese lugar;
- una persona con Mesa pero sin lugar sigue siendo pendiente.

Se conserva el dominio `EVENT_FLOORPLAN_PENDING_SEATING`; la respuesta puede ampliar el detalle, pero la UI muestra lenguaje natural: **Faltan N personas por acomodar**.

## 16. Scanner y check-in

En modo detallado, Scanner agrega información mínima:

```text
Mesa 8
Lugar 4
```

Y el plano puede resaltar el lugar exacto.

Payload Staff permitido:

```json
{
  "table": { "id": "uuid", "name": "Mesa 8" },
  "seat": { "id": "uuid", "label": "4", "x": 0.42, "y": 0.31 }
}
```

No incluir teléfono, contacto completo ni información de otros Asistentes.

Con `floorplanEnabled=true` y `seatingMode=SEAT`, un nuevo check-in requiere:

- Mesa válida;
- lugar válido, activo y no bloqueado;
- coherencia Mesa/Lugar/Asistente.

El cambio de lugar después del check-in continúa permitido solo para usuario autorizado y debe quedar auditado, igual que el cambio de Mesa vigente.

## 17. Realtime

No se crea una segunda infraestructura.

Las mutaciones confirmadas de asignación reutilizan el mecanismo `seating.updated` existente o su evolución explícitamente documentada. Si el payload vigente no puede representar `seatId`, debe actualizarse `REALTIME_PAYLOADS.md` antes de emitir información nueva.

Nunca emitir nombres, teléfonos o tokens por agregar soporte de lugares.

Los consumidores recuperan estado por REST después de reconectar o ante conflicto.

## 18. Compatibilidad

- Croquis existentes migran con `seatingMode=TABLE`;
- `Assistant.floorplanSeatId` inicia `NULL`;
- no cambia el significado de `Assistant.floorplanShapeId`;
- el renderer de Croquis existente continúa siendo la base;
- Konva/React Konva continúa como motor visual;
- no crear `FloorplanV2` paralelo;
- no crear backend paralelo;
- no portar persistencia del repositorio legacy.

## 19. Servicios

Primera implementación autorizada de `SEAT`:

- `FLYER`;
- `FLIPBOOK`;
- `DEMO` cuando use el mismo flujo nominal.

`PHYSICAL_QR` conserva asignación por Mesa en esta iteración. Asignar un PaseFisicoQR a un lugar exacto requeriría resolver unicidad de ocupación entre `Assistant` y `PhysicalPass`, por lo que queda fuera de este ticket y no debe improvisarse.

## 20. Fuera de alcance

- OCR o detección automática de sillas desde la imagen;
- reconstrucción vectorial del plano;
- CAD;
- modelos 3D;
- cálculo físico de distancias;
- auto-seating por afinidad;
- asignación exacta para `PHYSICAL_QR`;
- self-service de geometría para Planner durante operator-led;
- pricing/add-on comercial para este modo, hasta decisión comercial separada.

## 21. QA mínimo

Backend/DB:

- migración `TABLE` compatible;
- crear/editar/mover/bloquear/eliminar lugar;
- unicidad de etiqueta por Mesa;
- unicidad de ocupación;
- cruce de Evento rechazado;
- Zona rechazada como padre;
- bloqueo/eliminación de lugar ocupado rechazados;
- sincronización de capacidad;
- idempotencia de lote;
- concurrencia: dos usuarios intentando el mismo lugar;
- release por rechazo/cancelación/eliminación nominal;
- check-in detallado exige lugar válido.

Frontend Builder:

- click/tap para crear;
- drag libre;
- duplicar;
- multi-select/mover;
- bloquear/desbloquear;
- renumerar;
- undo/redo;
- zoom/pan;
- plano horizontal, vertical y cuadrado;
- montaje irregular sin depender de geometría simétrica.

Seating Workspace:

- persona -> lugar;
- lugar -> persona;
- mover/desasignar;
- conflicto 409;
- estados libre/ocupado/bloqueado/seleccionado;
- Mesa + lugar visibles;
- pendientes con Mesa pero sin lugar durante transición.

Scanner:

- muestra Mesa y lugar;
- resalta lugar cuando hay Croquis;
- no filtra PII adicional;
- check-in falla de forma accionable si falta lugar en modo detallado.

Escala mínima a probar:

- Evento boutique: 50 personas / ~50 lugares;
- Evento medio: 150 personas / ~150 lugares;
- 50 Mesas existentes continúan operables en modo `TABLE`.

## 22. Criterio de terminado

La capability está lista cuando:

1. el proveedor puede preparar libremente lugares individuales sobre cualquier Croquis, incluso alrededor de Mesas irregulares;
2. cada lugar tiene identidad persistente y pertenece a una Mesa;
3. la Planner puede asignar una persona a un lugar exacto sin editar geometría;
4. la Mesa se conserva como agrupador y compatibilidad operacional;
5. capacidad, concurrencia y ocupación están protegidas en backend/DB;
6. Scanner muestra Mesa + lugar y puede resaltarlo;
7. Croquis existentes siguen funcionando sin migración manual;
8. OpenAPI, SDK y tests quedan actualizados;
9. no se introduce CAD, OCR ni un segundo motor de Croquis;
10. `PHYSICAL_QR` permanece sin asignación por lugar hasta una decisión posterior.