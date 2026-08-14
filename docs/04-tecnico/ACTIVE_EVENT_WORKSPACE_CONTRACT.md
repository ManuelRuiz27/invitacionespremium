# Contrato del workspace operativo del Evento

## Alcance

El workspace operativo es la experiencia autenticada que utiliza el Planner después de activar un
Evento. La configuración previa permanece en el wizard y la operación posterior vive en un contexto
separado dentro del shell autenticado de `apps/client`.

El destino funcional completo de CODEX-124 tendrá cuatro áreas operativas según Servicio y configuración:

- **Resumen**;
- **Invitaciones** para Flyer/Flipbook;
- **Mesas y distribución** cuando el Evento usa Croquis;
- **Staff**.

CODEX-124A implementa **Resumen**, CODEX-124B implementa **Mesas y distribución** y CODEX-124D implementa la
distribución manual de **Invitaciones** digitales. Las áreas no funcionales o no aplicables no se muestran, no tienen
rutas placeholder ni presentan estados deshabilitados o textos de “próximamente”. CODEX-124C agregará Staff cuando
sea funcional.

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
- navegación local únicamente con áreas funcionales para el Servicio y configuración actuales.

La navegación operativa nunca reabre pasos del wizard ni permite editar Flyer/Flipbook después de activar. La sección
**Invitaciones** es una superficie de distribución y consulta del agregado ya congelado, no el editor de Invitación ni
la configuración de Confirmación de asistencia.

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

| Estado API | Etiqueta | Tratamiento operativo |
| --- | --- | --- |
| `ACTIVE` | Activo | Evento operativo; permite compartir Invitaciones digitales y mutaciones operativas autorizadas |
| `EVENT_DAY` | Día del evento | Conserva las reglas operativas de `ACTIVE`; permite compartir Invitaciones y operar el día del Evento |
| `CLOSED` | Cerrado | Consulta; sin nuevos envíos de Invitaciones ni nuevas mutaciones de seating |
| `ALBUM_PUBLISHED` | Álbum publicado | Consulta; sin nuevos envíos de Invitaciones |
| `ARCHIVED` | Archivado | Solo lectura; links públicos ocultos y sin cambios operativos |
| `CANCELLED` | Cancelado | Solo lectura; sin nuevos envíos y con vista pública mínima de cancelación |

El estado no se comunica únicamente mediante color.

## Carga y errores

- Mientras se resuelve el Evento se muestra carga neutra con `role="status"` y no se renderiza metadata
  previa.
- Un `401` usa la infraestructura común de expiración de sesión y conserva el `returnTo` interno.
- Un `403` muestra acceso no permitido sin revelar ownership ni existencia de otros Clientes.
- Un `404` muestra que el Evento no está disponible, sin IDs.
- Red, `429`, `5xx` o respuesta inválida muestran un mensaje natural y una acción de reintento sobre las lecturas
  afectadas; una lectura fallida no se interpreta como ausencia del recurso.
- `operationId`, si existe, se presenta solo como `Referencia: ...`.

## Responsive y accesibilidad

La vista usa un ancho legible y layout de una columna en móvil, sin tabla administrativa ni scroll
horizontal obligatorio. **Volver a eventos** y las acciones operativas críticas conservan un target táctil mínimo de
44 × 44 px.

La vista mantiene landmarks del shell, un único `h1`, navegación local con nombre accesible,
`aria-current`, foco visible, lectura por teclado, estado textual además del color, carga anunciada y el
tratamiento global de `prefers-reduced-motion`.

## CODEX-124D — Distribución manual de Invitaciones digitales

### Alcance

`FLYER` y `FLIPBOOK` exponen **Invitaciones** en el workspace. `PHYSICAL_QR` no la muestra porque no crea Contactos ni
Invitaciones digitales; `DEMO` no distribuye Invitaciones reales.

La superficie consume los contratos existentes:

```http
GET /api/v1/events/:eventId/contacts
GET /api/v1/events/:eventId/invitations
```

No agrega entidad de mensajería, endpoint de envío, migración ni webhook. El máximo contractual de 150 Contactos
permite correlacionar ambas lecturas en Client por `Invitation.contactId → Contact.id` sin N+1. El backend conserva
autoridad de ownership y privacidad.

Cada fila presenta únicamente datos operativos ya autorizados al usuario autenticado:

- nombre del Contacto;
- WhatsApp normalizado cuando siga disponible;
- cantidad nominal de personas de la Invitación;
- estado natural derivado de `Invitation.responseStatus`: **Sin respuesta**, **Confirmada** o **No asistirá**;
- **Cancelada** cuando `cancelledAt` existe.

No existe estado visible **Enviada**, **Entregada** o **Leída** porque el MVP no integra WhatsApp API y abrir una
conversación externa no demuestra que el mensaje haya sido transmitido. No se persiste `sentAt`, delivery receipt ni
auditoría ficticia de envío.

### Acciones

En `ACTIVE` y `EVENT_DAY`, una Invitación digital no cancelada puede:

- **Enviar por WhatsApp**: abrir `https://wa.me/<telefono>?text=<mensaje>` con el número E.164 reducido a dígitos y
  un mensaje preparado que contiene el `invitationLink` individual;
- **Copiar enlace**: copiar exactamente `invitationLink` sin regenerar token;
- **Abrir invitación**: abrir el mismo link público para revisión/compartición manual.

El usuario completa el envío dentro de WhatsApp. No hay POST, retry idempotente ni confirmación backend porque esta
acción no es una mutación del dominio.

Una Invitación cancelada nunca ofrece acciones de distribución. Si el teléfono ya no está disponible por privacidad,
no se muestra **Enviar por WhatsApp**, aunque copiar el link puede seguir disponible únicamente mientras el Evento
admita nuevos envíos. `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y `CANCELLED` conservan consulta de estados pero retiran
todas las acciones de distribución.

### Búsqueda y filtros

Con un máximo de 150 Invitaciones, búsqueda por nombre/WhatsApp y filtro por respuesta son locales después de las dos
lecturas autoritativas. Cambiar búsqueda/filtro no produce requests adicionales ni altera Invitaciones. La lista no
muestra números técnicos, tokens ni IDs.

### Errores y privacidad

- `401` sigue el manejo global de sesión expirada;
- una falla de Contactos o Invitaciones muestra error recuperable y reintenta ambas lecturas, sin interpretar la otra
  como fuente completa;
- Contactos anonimizados no recuperan ni reconstruyen teléfono;
- el link individual solo se usa en acciones explícitas del Planner y nunca se escribe en logs, métricas o auditoría.

## Fuera de alcance de CODEX-124A

- asignación de Mesas, seating o movimiento de Asistentes;
- distribución manual de Invitaciones;
- StaffTokens, accesos Staff, QR Staff o Scanner;
- lifecycle, cierre, reapertura, cancelación o archivo;
- edición de Invitación o Croquis;
- Álbum operativo, reportes, realtime o métricas adicionales;
- cambios de Prisma, schema, migraciones, endpoints, estados o readiness.

## CODEX-124B — Workspace operativo: Mesas y asignación por Mesa (implementado, pendiente de aceptación)

### Alcance y navegación

CODEX-124B agrega únicamente **Mesas y distribución** dentro de `/eventos/:eventId`. La entrada está condicionada por
la proyección autoritativa del Evento:

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
nullable y estado de check-in necesario para la operación. El resumen incluye conteos de sin Mesa y de la Mesa
seleccionada, además de ocupación/capacidad autoritativas. No incluye teléfonos, tokens, QR ni reglas duplicadas.
Filtros, búsqueda y cursor se resuelven en una consulta acotada con joins, sin N+1. `scope` se limita a
`UNASSIGNED|TABLE`; no existe `ALL` sin necesidad demostrada.

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
implementan dentro de CODEX-124B conforme al plan aprobado.

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
