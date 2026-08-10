# Contrato del workspace operativo del Evento

## Alcance

El workspace operativo es la experiencia autenticada que utiliza el Planner después de activar un
Evento. La configuración previa permanece en el wizard y la operación posterior vive en un contexto
separado dentro del shell autenticado de `apps/client`.

El destino funcional completo de CODEX-124 tendrá tres áreas:

- **Resumen**;
- **Mesas y distribución**;
- **Staff**.

CODEX-124A implementa **Resumen** y CODEX-124B implementa **Mesas y distribución** cuando el Evento tiene Croquis.
Las áreas no funcionales no se muestran, no tienen rutas placeholder ni presentan estados deshabilitados o textos de
“próximamente”. CODEX-124C agregará Staff cuando sea funcional.

CODEX-124B está implementado y pendiente de aceptación humana; su contrato normativo se documenta más abajo.

## Ruta canónica y resolución autoritativa

La entrada canónica es:

```text
/eventos/:eventId
```

La ruta consulta `GET /events/:eventId` mediante TanStack Query con una key que incluye `eventId`,
propaga `AbortSignal` y nunca reutiliza metadata visible de otro Evento durante una navegación. La API
conserva la autoridad de sesión, permisos y ownership; el frontend no filtra Clientes ni compara IDs de
ownership.

`EventResponseDto.serviceCode` proyecta el código del Servicio actualmente contratado a partir de la
relación autoritativa `Event.serviceId → Service.code`. El Resumen traduce ese código con el mapper
compartido y no consulta `GET /services`: el catálogo representa lo disponible para contratar hoy, no el
historial contractual de un Evento.

La proyección directa no filtra `Service.isActive`, no resuelve precio vigente y no evalúa promociones.
Desactivar un Servicio comercial o cerrar la vigencia de sus precios no cambia la etiqueta de Eventos
existentes. Si `Event.serviceId` es nulo, `serviceCode` es nulo y la UI usa el fallback natural **Servicio
no disponible**. Un fallo del catálogo nunca se representa como ausencia de servicio en el workspace.

El upgrade Flyer → Flipbook todavía no está implementado. Cuando se implemente conforme a
`SERVICE_UPGRADE_FLOW.md`, su commit atómico deberá actualizar `Event.serviceId`, que continuará siendo
la fuente del servicio contratado actual; `activatedServiceId` conserva exclusivamente el snapshot
histórico de la activación inicial.

## Guard por estado

La respuesta autoritativa determina el destino antes de montar contenido operativo:

| Estado API | Destino |
| --- | --- |
| `DRAFT`, `CONFIGURED` | `/eventos/:eventId/configuracion/datos` |
| `READY_TO_ACTIVATE` | `/eventos/:eventId/configuracion/revision` |
| `ACTIVE`, `EVENT_DAY`, `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED`, `CANCELLED` | workspace operativo |

No se reinterpretan estados ni se crean transiciones. Los estados operativos o terminales nunca vuelven
al wizard desde esta ruta.

## Shell y navegación

El workspace reutiliza `ClientShell`, `AuthProvider`, el tema y la navegación de cuenta existentes. No
crea otro sidebar, login, `ThemeProvider` ni navegación global.

El contexto local muestra:

- acción textual **Volver a eventos**;
- nombre del Evento como único `h1` de la vista cargada;
- estado natural mediante el mapper compartido;
- fecha y hora en `es-MX` y `Event.timeZone`;
- navegación local con únicamente **Resumen** en CODEX-124A.

El workspace no presenta Invitados, Invitación, Confirmación de asistencia ni pasos del wizard como
navegación operativa. La Invitación digital permanece congelada conforme al PRD.

## Resumen

Resumen responde qué Evento se está operando y en qué situación se encuentra. Usa hechos de
`EventResponseDto` y derivaciones presentacionales existentes, sin métricas inventadas ni requests para
cards decorativas.

Presenta, cuando están disponibles:

- estado natural;
- fecha y hora del Evento;
- tipo social natural;
- servicio contratado con nombre comercial;
- capacidad;
- uso de Mesas y distribución.

No muestra IDs, ownership, claves, tokens, enums, porcentajes de avance, engagement, check-ins,
información financiera ni “última actividad”. Los datos faltantes usan lenguaje natural y no muestran
`null`, `undefined` o `N/A`.

## Presentación de estados

| Estado API | Etiqueta | Tratamiento en CODEX-124A |
| --- | --- | --- |
| `ACTIVE` | Activo | Evento operativo, sin acciones de lifecycle |
| `EVENT_DAY` | Día del evento | Estado con jerarquía visible, sin acciones de Staff o Scanner |
| `CLOSED` | Cerrado | Consulta sin volver al wizard ni ofrecer reapertura |
| `ALBUM_PUBLISHED` | Álbum publicado | Consulta sin administración del Álbum ni tokens públicos |
| `ARCHIVED` | Archivado | Solo lectura; informa que ya no admite cambios operativos |
| `CANCELLED` | Cancelado | Solo lectura; informa que el Evento fue cancelado |

El estado no se comunica únicamente mediante color.

## Carga y errores

- Mientras se resuelve el Evento se muestra carga neutra con `role="status"` y no se renderiza metadata
  previa.
- Un `401` usa la infraestructura común de expiración de sesión y conserva el `returnTo` interno.
- Un `403` muestra acceso no permitido sin revelar ownership ni existencia de otros Clientes.
- Un `404` muestra que el Evento no está disponible, sin IDs.
- Red, `429`, `5xx` o respuesta inválida muestran **No pudimos cargar este evento.** y **Reintentar**.
- El retry de ese estado vuelve a consultar únicamente `GET /events/:eventId`; el Resumen no inicia
  requests a `GET /services`.
- `operationId`, si existe, se presenta solo como `Referencia: ...`.

## Responsive y accesibilidad

La vista usa un ancho legible y layout de una columna en móvil, sin tabla administrativa ni scroll
horizontal. **Volver a eventos** conserva un target táctil mínimo de 44 × 44 px.

La vista mantiene landmarks del shell, un único `h1`, navegación local con nombre accesible,
`aria-current`, foco visible, lectura por teclado, estado textual además del color, carga anunciada y el
tratamiento global de `prefers-reduced-motion`.

## Fuera de alcance de CODEX-124A

- asignación de Mesas, seating o movimiento de Asistentes;
- StaffTokens, accesos Staff, QR Staff o Scanner;
- lifecycle, cierre, reapertura, cancelación o archivo;
- edición de Invitación o Croquis;
- Álbum operativo, reportes, realtime o métricas adicionales;
- cambios de Prisma, schema, migraciones, endpoints, estados o readiness.

## CODEX-124B — Workspace operativo: Mesas y asignación por Mesa (implementado, pendiente de aceptación)

### Alcance y navegación

CODEX-124B agrega únicamente **Mesas y distribución** dentro de `/eventos/:eventId`. La navegación local queda:

```text
Resumen | Mesas y distribución
```

La entrada está condicionada por la proyección autoritativa del Evento:

- con `floorplanEnabled=false`, **Mesas y distribución** no aparece en la navegación, no muestra placeholder y no
  inicia ninguna resolución de Floorplan;
- con `floorplanEnabled=true`, puede aparecer conforme al Servicio y estado descritos debajo;
- `FLYER` y `FLIPBOOK` muestran Croquis read-only y Split View nominal de Asistentes;
- `PHYSICAL_QR` muestra únicamente Croquis read-only y ocupación por Mesa. No muestra lista/panel de Asistentes ni
  consulta `/seating`; no fabrica Assistant, Invitation, Contact o seating para representar `PhysicalPass`;
- `DEMO` no obtiene un workspace operativo real. Se conservan sus guards existentes y no se inventa esta sección.

La asignación inicial de Mesa de cada `PhysicalPass` conserva exactamente `PHYSICAL_PASSES_CONTRACT.md`. CODEX-124B
no agrega reasignación de pases físicos ni cambia su tabla, ciclo de vida o capacidad compartida.

**Staff** continúa oculto hasta CODEX-124C. El workspace reutiliza el shell, guard de estado y consulta del Evento
de CODEX-124A. No crea una ruta paralela, no reabre el wizard y no edita geometría, imagen, nombres, capacidad,
colores, lock ni coordenadas del Croquis.

Para `FLYER`/`FLIPBOOK`, la superficie combina un Croquis contextual de solo lectura con un panel de asignación.
Seleccionar una Mesa por click, tap o alternativa DOM/teclado abre el Split View y muestra nombre, ocupación `X/Y`,
lugares disponibles e indicador textual de Mesa completa. Para `PHYSICAL_QR`, seleccionar una Mesa muestra esos
datos de ocupación sin controles nominales. Zonas decorativas no abren asignación.

### Panel de asignación por Mesa

El panel nominal, exclusivo de `FLYER`/`FLIPBOOK`, ofrece:

- búsqueda de Asistentes;
- tabs **Sin mesa** y **En esta mesa**;
- filtro por el Grupo existente;
- selección múltiple;
- CTA **Asignar X a Mesa Y**;
- desasignación individual y cambio de Mesa explícitos;
- estado de check-in cuando ayude a explicar que un cambio posterior se audita.

La semántica de selección es cerrada:

- seleccionar manualmente una o varias filas usa `POST /seating/assign` tanto para asignar como para moverlas en
  bloque a otra Mesa;
- `POST /seating/assign-family` sólo se ejecuta desde la acción visible **Asignar familia completa**, después de
  mostrar la cantidad afectada. Filtrar o seleccionar a un miembro nunca dispara esa intención;
- `POST /seating/assign-group` sólo se ejecuta desde **Asignar grupo completo**, después de mostrar nombre del Grupo
  y cantidad afectada. Aplicar un filtro de Grupo nunca muta;
- `PATCH /seating/:assistantId` cambia la Mesa o desasigna a una sola persona con `tableShapeId:null`;
- v1 no ofrece bulk-unassign ni emite N `PATCH` silenciosos. Una necesidad futura exige decisión de producto y API
  explícitas.

No se crean familias, lados, segmentos ni otra entidad. La API conserva autoridad de ownership, elegibilidad,
capacidad, estado, post-check-in y concurrencia.

### Flujo Cambiar mesa

Desktop, tablet y mobile conservan la misma intención; sólo cambia el contenedor del panel:

```text
Mesa actual → En esta mesa → seleccionar una o varias filas → Cambiar mesa
→ selector de Mesas TABLE: nombre + ocupación/capacidad + lugares disponibles
→ las Mesas completas aparecen deshabilitadas → seleccionar destino
→ Mover X personas a Mesa Y → POST /seating/assign autoritativo
```

En desktop el selector vive en el Split View; en tablet, en el drawer; en mobile, en el bottom sheet con CTA sticky
de al menos 44 px. La disponibilidad mostrada es informativa: el backend decide bajo locks. Un `409` de capacidad
refresca Mesa origen y destino y conserva únicamente la selección que siga siendo elegible.

### Responsive, touch y accesibilidad

Desktop usa `Croquis read-only/contextual | Panel de asignación`. Tablet y mobile conservan el Croquis como
superficie principal; tap selecciona Mesa, pinch hace zoom y dos dedos desplazan el viewport. El panel se presenta
como drawer o bottom sheet sin destruir el contexto del Croquis. Selección y acciones táctiles usan targets de al
menos 44×44 px y no dependen de hover, right-click ni doble click. El scroll de página con un dedo permanece natural
fuera de una manipulación.

### Read model operativo mínimo requerido

La auditoría del API vigente concluye que `GET /events/:eventId/invitations` no es suficiente: anida Asistentes pero
`AssistantResponseDto` no contiene `floorplanShapeId`; Grupo exige correlacionar Contacto e Invitación; y descargar
todo el agregado para cada búsqueda no ofrece paginación ni un límite estable para ~1,800 Asistentes. Consultar una
Invitación, Contacto o Mesa por fila produciría N+1.

CODEX-124B implementa un único read model mínimo:

```http
GET /api/v1/events/:eventId/seating?scope=UNASSIGNED|TABLE&tableShapeId=<uuid>&groupId=<uuid>&search=<text>&cursor=<opaque>&limit=<n>
```

La respuesta contiene `items`, `nextCursor` y un resumen autoritativo. Cada item proyecta solamente `assistantId`,
`name`, Invitación con conteos elegibles/asignados completos, Grupo nullable con esos mismos conteos, Mesa actual
nullable y estado de check-in necesario para la operación. El
resumen incluye conteos de sin Mesa y de la Mesa seleccionada, además de ocupación/capacidad autoritativas. No
incluye teléfonos, tokens, QR ni reglas duplicadas. Filtros, búsqueda y cursor se resuelven en una consulta acotada
con joins, sin N+1. `scope` se limita a `UNASSIGNED|TABLE`; no existe `ALL` sin necesidad demostrada.

Los candidatos reflejan las invariantes vigentes de seating: `Assistant.deletedAt=null`, respuesta confirmada,
Invitación activa/no eliminada/no cancelada e identidad compatible con privacidad. En `ACTIVE`/`EVENT_DAY` los
controles mutables sólo operan sobre esos candidatos. Los conteos de Invitación y Grupo representan el agregado
completo elegible, no la página, viewport, búsqueda, filtro ni selección local; `assignedAssistantCount` permite
advertir antes de mover personas que ya tienen Mesa.

La búsqueda normaliza mayúsculas/minúsculas, diacríticos y espacios antes de comparar. El orden es determinista:
nombre normalizado ascendente, filas con `name=null` después de las filas con nombre y UUID de `assistantId`
ascendente como desempate total. `checkedIn` se deriva autoritativamente del check-in vigente, nunca de estado
calculado por Client. El límite es `1..100`, el cursor es opaco y el query count debe permanecer acotado con joins o
agregados, sin N+1. Una prueba de integración con aproximadamente 1,800 Assistant valida paginación, orden, filtros,
privacidad y conteo de queries. El límite de 150 Contactos/Invitaciones no cambia.

El endpoint es una proyección de lectura, no una entidad ni nueva regla. Su contrato final, OpenAPI, SDK y pruebas se
se implementan dentro de CODEX-124B conforme al plan aprobado. El límite de **150 Contactos/Invitaciones por Evento**
permanece intacto; la escala operativa de **~1,800 Asistentes** mide filas nominales potenciales y no eleva aquel
límite contractual.

### Mutaciones, idempotencia y realtime

El panel reutiliza exclusivamente:

- `POST /events/:eventId/seating/assign`;
- `POST /events/:eventId/seating/assign-family`;
- `POST /events/:eventId/seating/assign-group`;
- `PATCH /events/:eventId/seating/:assistantId`.

El mapping normativo es: selección manual uno/muchos y movimiento bulk → `assign`; familia completa explícita →
`assign-family`; grupo completo explícito → `assign-group`; cambio o desasignación individual → `PATCH`. Ningún
filtro dispara una mutación y ningún movimiento bulk se degrada a N requests si `assign` expresa la intención.

Cada intención conserva `Idempotency-Key`. Una respuesta confirmada se aplica localmente y se reconcilia con el read
model; un fallo del refresh nunca repite la mutación. Ante red, `429` o `5xx`, la misma llave y payload quedan
reservados hasta consultar autoridad. `seating.updated` v1 solo invalida/refresca REST; no se crea otro evento,
namespace, room ni transporte realtime.

Cambiar filtros o páginas invalida únicamente la lectura nominal; no reconstruye Stage, shapes ni Floorplan. Una
invalidación conserva viewport y Mesa seleccionada cuando continúan siendo válidos.

### Concurrencia

- Si una Mesa se llena, el backend rechaza o confirma según el orden real; la UI adopta ocupación autoritativa y
  conserva seleccionados elegibles para otra decisión.
- Si otro Planner mueve al mismo Asistente, el siguiente snapshot prevalece y se retira cualquier selección ya no
  compatible.
- Si llega realtime durante selección, se invalida el resumen/lista sin rerenderizar el Croquis completo; la
  selección se intersecta con los IDs todavía elegibles.
- Un resultado incierto se reconcilia antes de permitir una intención nueva y nunca repite una mutación confirmada.
- El cambio post-check-in conserva la política backend y se presenta como cambio auditable, no como prohibición de UI.
- Si el Evento cierra o se cancela, el guard autoritativo convierte el panel a solo lectura, cancela requests en vuelo
  y no ofrece reintentar mutaciones.

Para `FLYER`/`FLIPBOOK` con Croquis, `ACTIVE` y `EVENT_DAY` permiten lectura y sólo las mutaciones que confirme el
backend. `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y `CANCELLED` son de solo lectura. Una transición autoritativa a un
estado no mutable mientras el panel está abierto cancela la intención pendiente y elimina los CTAs de escritura; el
Client no duplica la máquina de estados del backend.
