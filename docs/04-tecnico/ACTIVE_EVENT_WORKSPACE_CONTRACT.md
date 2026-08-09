# Contrato del workspace operativo del Evento

## Alcance

El workspace operativo es la experiencia autenticada que utiliza el Planner después de activar un
Evento. La configuración previa permanece en el wizard y la operación posterior vive en un contexto
separado dentro del shell autenticado de `apps/client`.

El destino funcional completo de CODEX-124 tendrá tres áreas:

- **Resumen**;
- **Mesas y distribución**;
- **Staff**.

CODEX-124A implementa únicamente **Resumen**. Las otras áreas no se muestran, no tienen rutas placeholder
y no presentan estados deshabilitados ni textos de “próximamente”. CODEX-124B y CODEX-124C las agregarán
cuando sean funcionales.

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
