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

El autosave se comunica mediante `Guardando…`, `Cambios guardados` o `No pudimos guardar los cambios`.
Las acciones inferiores se llaman `Continuar` y `Salir`; ambas conservan el flush previo y las garantías
contra pérdida de cambios, sin presentar el guardado como una tarea manual.

## Contrato de presentación

- ningún estado técnico del Evento se muestra directamente; el wizard usa el mapper compartido y presenta
  `DRAFT`/`CONFIGURED` como **En preparación** y `READY_TO_ACTIVATE` como **Listo para activar**;
- tipos sociales y servicios usan nombres comerciales en español; los códigos internos nunca son el nombre
  visible;
- `RSVP` solo existe internamente; el texto visible usa **Confirmación de asistencia**;
- IANA, E.164 y la exigencia HTTPS permanecen en valores, normalización y validación internas; los controles
  muestran `Zona horaria`, `Número de WhatsApp`, `Ubicación` y `Mesa de regalos` con ayuda natural;
- `operationId` puede mostrarse únicamente como referencia secundaria;
- idempotencia y reconciliación permanecen internas y nunca forman parte del copy principal;
- mensajes, checklist y errores indican la acción que debe realizar el Planner, no la validación del sistema.

## Datos, Contactos y CSV

`datetime-local` representa el wall-clock del Evento. La conversión busca el instante de la zona IANA de
`draft.timeZone`, no la zona del navegador. Horas inexistentes o ambiguas por DST se rechazan sin cerrar el
diálogo ni alterar el borrador. Cambiar la zona conserva explícitamente la hora escrita y emite un único
patch atómico con `timeZone` y `eventDateTime`. Los parches síncronos se acumulan sobre la referencia más
reciente del draft y el wall-clock adopta cambios autoritativos cuando no existe una edición activa.

Contactos permite alta, edición de nombre/WhatsApp/Grupo y eliminación confirmada. La capacidad visible se
basa en Asistentes nominales autorizados de Invitaciones, no en el número de Contactos. El preview presenta
todas las filas y errores antes del commit.

### Cambio de servicio digital antes de activar

Cambiar entre Flyer y Flipbook mientras el Evento permanece en preparación requiere resolver primero cualquier
diseño activo incompatible. La UI consulta el diseño de forma autoritativa y, si existe, solicita confirmación
explícita antes de enviar el cambio. El diálogo explica que se reiniciará únicamente el diseño de la Invitación;
Contactos, Invitaciones, Asistentes, Confirmación, Croquis y el resto de la configuración se conservan.

`PATCH /events/:eventId` admite `resetInvitationDesign: true` exclusivamente como consentimiento para un cambio
Flyer ↔ Flipbook que vuelve incompatible el diseño activo. Si el cambio necesita ese reset y el campo no está
presente, la API rechaza con `409 EVENT_INVITATION_DESIGN_RESET_REQUIRED` sin modificar el Evento. Con consentimiento,
una sola transacción debe:

1. bloquear y volver a validar el Evento en preparación;
2. marcar con borrado lógico el diseño incompatible, sus páginas y sus acciones;
3. ocultar sus FileAssets conforme a la política vigente, sin hard delete;
4. cambiar el servicio y recalcular readiness;
5. registrar auditoría del reset y del cambio de servicio.

El resultado deja como máximo un diseño activo y nunca uno incompatible con el servicio configurado. El campo no
habilita cambios postactivación, no crea diseños paralelos y no reutiliza el workflow de upgrade postactivación.

## Flyer, Flipbook y Hotspots

Los previews descargan blobs privados y revocan cada Object URL. Flyer acepta solo JPG/PNG, presenta imagen
inicial y QR, y permite sustituir ambas. Flipbook administra de 1 a 10 páginas, portada, selección, alta,
sustitución, eliminación y orden persistido.

### Modelo interno del área interactiva

Backend, API y código interno conservan la entidad `Hotspot`, las propiedades `x`, `y`, `width`, `height` y
`priority`, y las acciones cerradas `RSVP`, `LOCATION`, `GIFT_REGISTRY`, `QR_AREA` y `EXTERNAL_LINK`. Las
coordenadas relativas, la prioridad, la pertenencia a Flyer o página y el payload enviado a la API no cambian.

### Modelo visible para el Planner

La UI presenta **Acciones de la invitación** y nunca exige conocer Hotspots, coordenadas, dimensiones
normalizadas, prioridad o enums. Las cinco acciones visibles son:

- **Confirmar asistencia**: abre la confirmación de asistencia;
- **Ver ubicación**: abre la ubicación configurada para el Evento;
- **Mesa de regalos**: abre la mesa de regalos configurada;
- **Mostrar QR**: muestra el acceso QR cuando esté disponible;
- **Enlace adicional**: abre el enlace externo configurado.

`Agregar acción` inicia un flujo guiado: elegir una de esas acciones, colocar el área sobre la vista previa,
moverla o cambiar su tamaño y guardarla. Crear usa valores técnicos iniciales deterministas y `priority=0`;
editar conserva coordenadas y prioridad existentes. Guardar o eliminar refresca la fuente autoritativa y sale
del modo de edición; cancelar descarta solamente el borrador local.

El canvas permite seleccionar, arrastrar y redimensionar con pointer o touch. La superficie de los controles
táctiles importantes es al menos equivalente a 44×44 px y durante la manipulación directa se evita el scroll
accidental sin bloquear el scroll normal de la página. La alternativa de teclado usa acciones con nombres
naturales para mover arriba, abajo, izquierda o derecha y para hacer el área más ancha, angosta, alta o baja;
nunca muestra números relativos como solución accesible.

La superficie relativa del editor coincide exactamente con los límites renderizados del `<img>` cargado mediante
el Object URL privado existente. No usa una proporción fija, `letterboxing`, padding ni márgenes de `contain` como
parte de `0..1`. Editor y renderer público comparten la misma proyección porcentual de `x`, `y`, `width` y `height`,
sin modificar el payload.

En Flipbook, `Agregar acción` deriva sus opciones de la posición actual y de los Hotspots autoritativos: la portada
admite las acciones de portada y el enlace opcional; una página intermedia solo puede convertirse en página QR si
no existe otra; y el enlace opcional se ofrece fuera de portada únicamente en la página QR ya derivada. La UI no
ofrece crear una segunda página QR. Cambiar de página recalcula inmediatamente estas opciones.

Crear, editar y eliminar una acción bloquea envíos repetidos mientras la mutación está pendiente. Un fallo se
traduce a lenguaje natural dentro del editor y conserva selección, geometría y enlace para reintentar; el editor
solo abandona el borrador después del éxito autoritativo y su posterior actualización de lectura.

Cada área comunica su acción y la seleccionada se diferencia sin depender solo del color. El resumen
**Acciones configuradas** se deriva exclusivamente de los Hotspots autoritativos. En Flipbook se identifica
la portada o número visible de página sobre la que se trabaja, sin mostrar IDs. Los blockers de readiness se
traducen a instrucciones naturales y nunca se muestran como códigos.

Para `Enlace adicional`, la UI usa el label `Enlace`, la ayuda `Pega el enlace que quieres abrir desde la
invitación.` y el error `Ingresa un enlace web válido.`. La validación HTTPS contractual permanece interna.
La disponibilidad se deriva de todos los Hotspots autoritativos del diseño: al existir tres enlaces adicionales,
la UI deja de ofrecer crear un cuarto tanto en Flyer como en las páginas permitidas de Flipbook, sin impedir editar
o eliminar los existentes. Después de eliminar y refrescar la fuente autoritativa, la opción vuelve a estar
disponible.

Antes de guardar, el cliente aplica las restricciones deterministas de `EXTERNAL_LINK`: URL HTTPS absoluta con host
válido, sin credenciales, query, fragment, espacios, controles ni protocolo alternativo. El copy no expone esas
reglas técnicas y el backend conserva la autoridad final ante concurrencia o estado desactualizado.

## Croquis y pases

### Modelo interno del Croquis

Backend, API y código interno conservan `FloorplanShape`, `TABLE`, `DECORATIVE_ZONE`, las geometrías
`RECTANGLE`, `SQUARE`, `CIRCLE` y `POLYGON`, las coordenadas relativas `x`, `y`, `width`, `height`, la
rotación normalizada, `polygonPoints` y los endpoints existentes de lock/unlock. Mesa exige capacidad
positiva y Zona capacidad cero. No cambia ningún payload, endpoint, regla de readiness o validación.

La normalización mantiene cada forma dentro del plano, usa `width` como lado autoritativo y sincroniza
`height` en cuadrados y círculos. Los polígonos conservan entre 3 y 64 puntos finitos en rango y un área no
degenerada. La imagen privada JPG/PNG se carga mediante FileAsset y su Object URL se revoca conforme a la
política vigente.

### Modelo visible para el Planner

La UI presenta **Mesas y distribución** y permite **Agregar mesa** o **Agregar zona**. Las formas visibles
son **Redonda**, **Cuadrada** y **Rectangular**; una Zona también puede usar **Forma personalizada**. El
Planner captura el nombre y, únicamente para una Mesa, el **Número de lugares**. Nunca necesita conocer
enums, coordenadas, dimensiones, grados o puntos numéricos.

La superficie relativa coincide exactamente con los límites renderizados del `<img>` real, sin proporción
fija ni letterboxing dentro de `0..1`. Cada Mesa o Zona comunica nombre, tipo y capacidad cuando aplica; la
selección se distingue sin depender solo del color. Pointer/touch permite seleccionar, arrastrar y
redimensionar, mientras los botones con nombres naturales permiten mover, cambiar tamaño y girar con teclado.
Los controles táctiles importantes y los vértices de una forma personalizada tienen un área interactiva de
al menos 44×44 px. El scroll se inhibe solo durante la manipulación directa.

`CIRCLE` y `SQUARE` conservan internamente `width === height`. Para su representación, ese lado lógico escala
contra la dimensión física menor del owner renderizado y luego se convierte por separado a proporción horizontal
y vertical; así Redonda permanece circular y Cuadrada permanece cuadrada en imágenes horizontales, verticales o
cuadradas. La medición reacciona a cambios responsive. `RECTANGLE` y `POLYGON` conservan la proyección porcentual
directa de `x`, `y`, `width` y `height`.

**Forma personalizada** crea un polígono inicial válido y permite mover sus vértices sobre el plano; no
existe un campo textual de puntos. Círculos y cuadrados conservan lados iguales. Crear, editar y eliminar
usa copy específico de Mesa o Zona, conserva el borrador o selección ante fallo, bloquea envíos repetidos y
refresca desde la fuente autoritativa después del éxito.

Una edición activa es una tarea exclusiva: hasta guardar, eliminar cuando corresponda o cancelar, la UI no
permite iniciar otra Mesa/Zona, seleccionar otro elemento, sustituir la imagen, finalizar la distribución ni
cambiar la preferencia de uso del Croquis. Ninguna de esas acciones descarta implícitamente el borrador actual.

La traslación completa sigue el espacio del plano. En cambio, resize y edición de vértices invierten primero
la rotación visual de la shape y aplican el delta en sus ejes locales; `polygonPoints` conserva su sistema local
y el payload relativo existente.

El éxito confirmado de crear, actualizar o eliminar y un fallo posterior al refrescar son estados distintos.
La UI reconcilia localmente con la respuesta segura de la mutación, comunica que el cambio sí fue guardado y
ofrece actualizar el plano mediante una nueva lectura; esa acción nunca repite la mutación confirmada.

El lock se presenta como **Finalizar distribución** y el unlock como **Editar distribución**. Finalizar
protege imagen y formas contra cambios accidentales, pero no agrega una regla de readiness: la autoridad
continúa en backend. El estado finalizado mantiene plano, Mesas, Zonas y **Lugares distribuidos** visibles
en modo de solo lectura.

Pases permite cantidad y Mesa opcional, conserva varios lotes y rangos, lista usados/no usados y Mesa, y
descarga SVG como `pase-0001.svg`.

## Revisión y activación

Entrar a Revisión vacía autosave, recarga el Evento y consulta recursos del servicio. Digital consulta
Contactos, Invitaciones, Design Readiness y Croquis opcional. Physical QR consulta pases y Croquis, nunca
Design Readiness. El checklist es informativo; el botón solo se habilita con
`event.status === READY_TO_ACTIVATE`.

El diálogo accesible muestra costo de activación, saldo comprado y línea utilizada/disponible. Planner
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
