# Contrato del Wizard de Evento

## Alcance y autoridad

`CODEX-121` implementa en `apps/client` la creación, reanudación, configuración y activación de Eventos.
La API sigue siendo la autoridad de ownership, estado, capacidad, readiness, precio, cobro e idempotencia.
El cliente no implementa páginas públicas ni `CODEX-122`.

La orquestación vive en `wizard/WizardPage.tsx` y `WizardLayout.tsx`; autosave, datos, Contactos, diseño,
Confirmación, Croquis, pases y Revisión tienen módulos separados. Ninguna regla se mueve a `packages/ui`.

## Rutas, servicios y dashboard

- `/eventos/nuevo` conserva la captura local hasta que existe información significativa;
- `/eventos/:eventId/configuracion/:step` reanuda por URL;
- digital: `datos`, `contactos`, `invitacion`, `confirmacion`, `croquis`, `revision`;
- `PHYSICAL_QR`: `datos`, `croquis`, `pases`, `revision`.

Una ruta incompatible se sustituye por `datos` antes de montar el paso. Physical QR no consulta
Contactos, Grupos, Invitaciones, Design ni Hotspots. El dashboard usa exactamente:

| Estado | Acción | Destino |
| --- | --- | --- |
| `DRAFT`, `CONFIGURED` | Continuar configuración | `configuracion/datos` |
| `READY_TO_ACTIVATE` | Activar evento | `configuracion/revision` |
| `ACTIVE` y posteriores | Ver evento | resumen autorizado |

## Creación, autosave e intentos

`createPromiseRef` coordina el único `POST /events`: clics y navegación concurrentes comparten la
promesa, bloquean controles y liberan la reserva ante error. El éxito adopta el Evento una vez. El
autosave consolida durante 900 ms, serializa `PATCH`, retiene el último valor fallido y se vacía antes de
cambiar de paso o salir.

Las llaves no se persisten en Web Storage. `AttemptManager` conserva solo un resultado incierto:

- CSV: la identidad es `previewId`; éxito o fallo definitivo limpia la llave y otro preview rota llave;
- pases: cada clic intencional crea llave nueva aunque cantidad/Mesa coincidan; un retry incierto conserva
  exactamente llave y payload. Recargar el listado actualiza la vista, pero nunca atribuye a ese intento
  un rango que pudo generar otro Planner; solo la respuesta idempotente del backend confirma el lote;
- activación: una llave por intento; red/timeout la conserva hasta reconciliar `GET /events/:id`; `ACTIVE`
  o un fallo definitivo la elimina.

## Datos, Contactos y CSV

`datetime-local` representa el wall-clock del Evento. La conversión busca el instante de la zona IANA de
`draft.timeZone`, no la zona del navegador. Horas inexistentes o ambiguas por DST se rechazan sin cerrar el
diálogo ni alterar el borrador. Cambiar la zona conserva explícitamente la hora escrita y emite un único
patch atómico con `timeZone` y `eventDateTime`. Los parches síncronos se acumulan sobre la referencia más
reciente del draft y el wall-clock adopta cambios autoritativos cuando no existe una edición activa.

Contactos permite alta, edición de nombre/WhatsApp/Grupo y eliminación confirmada. La capacidad visible se
basa en Asistentes nominales autorizados de Invitaciones, no en el número de Contactos. El preview presenta
todas las filas y errores antes del commit.

## Flyer, Flipbook y Hotspots

Los previews descargan blobs privados y revocan cada Object URL. Flyer acepta solo JPG/PNG, presenta imagen
inicial y QR, y permite sustituir ambas. Flipbook administra de 1 a 10 páginas, portada, selección, alta,
sustitución, eliminación y orden persistido.

El canvas permite seleccionar, mover y redimensionar Hotspots mediante pointer, con alternativa numérica
para `x`, `y`, `width`, `height` y prioridad. Acciones: RSVP, ubicación, mesa de regalos, área QR y enlace
adicional HTTPS. En Flipbook los Hotspots pertenecen a la página activa y se respetan las restricciones
autoritativas de portada/página. Los blockers de readiness se traducen a lenguaje visible.

## Croquis y pases

El Croquis tiene canvas y panel para `TABLE` y `DECORATIVE_ZONE` (Zona), con `RECTANGLE`, `SQUARE`,
`CIRCLE` y `POLYGON`. Permite crear, seleccionar, mover, redimensionar, editar y eliminar; normaliza cada
forma dentro del canvas, conserva un solo lado en cuadrado/círculo y valida puntos finitos, rango, cantidad
y área no degenerada del polígono antes del request. Círculos y polígonos se representan con su geometría
real y las interacciones operan sobre esa representación visible. Mesa exige capacidad
positiva y Zona capacidad cero. Lock impide edición hasta un unlock explícito y se muestra capacidad total.

Pases permite cantidad y Mesa opcional, conserva varios lotes y rangos, lista usados/no usados y Mesa, y
descarga SVG como `pase-0001.svg`.

## Revisión y activación

Entrar a Revisión vacía autosave, recarga el Evento y consulta recursos del servicio. Digital consulta
Contactos, Invitaciones, Design Readiness y Croquis opcional. Physical QR consulta pases y Croquis, nunca
Design Readiness. El checklist es informativo; el botón solo se habilita con
`event.status === READY_TO_ACTIVATE`.

El diálogo accesible muestra costo vigente, estimación, saldo comprado y línea utilizada/disponible. Planner
de Organización recibe texto específico y realiza cero requests financieros. El botón bloquea doble envío y
la reconciliación resuelve resultados inciertos.

Los códigos publicados se traducen sin mostrar mensajes técnicos por defecto; `operationId` aparece solo
como referencia secundaria. `401` conserva `returnTo`; red o `500` no expiran la sesión.

## Verificación

Las pruebas de componentes cubren creación concurrente, pasos incompatibles, CSV sucesivos, lotes iguales,
retry incierto frente a concurrencia ajena, zona distinta al navegador, DST, patches atómicos,
Flyer/Flipbook, CRUD de Hotspots y páginas, Object URLs, geometrías de Mesa/Zona, SVG,
Revisión digital/física, permisos financieros, diálogo y activación. Los tipos proceden exclusivamente de
OpenAPI mediante `@invitaciones/api-client`.
