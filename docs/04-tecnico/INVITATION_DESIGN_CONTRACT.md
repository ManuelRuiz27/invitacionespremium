# Contrato técnico de Flyer, Flipbook y Hotspots

## Alcance

`InvitationDesignModule` administra la configuración autenticada de invitaciones digitales antes de
activar un Evento. CODEX-061 incluye Flyer, Flipbook, Hotspots, readiness del diseño, asociación con
FileAssets, ownership y auditoría transaccional. No incluye RSVP público, QR generado, scanner, croquis,
Álbum, PDF, WhatsApp, frontend ni el upgrade Flyer → Flipbook posterior a la activación.

## Modelos

### InvitationDesign

- UUID y `eventId`;
- tipo cerrado `FLYER` o `FLIPBOOK`;
- referencias opcionales según el tipo a las dos variantes del Flyer;
- timestamps y borrado lógico.

PostgreSQL permite un solo diseño activo por Evento. El tipo se deriva del servicio configurado real:
Flyer admite únicamente `FLYER`, Flipbook únicamente `FLIPBOOK`; QR pase físico y Demo no admiten estos
diseños. No se modifica el servicio activado ni ningún snapshot financiero.

### Flyer

Un diseño Flyer activo conserva exactamente:

- un FileAsset `FLYER_INITIAL_IMAGE`;
- un FileAsset `FLYER_QR_IMAGE`.

Ambos son `READY`, pertenecen al mismo Cliente y Evento y quedan asociados al UUID del
`InvitationDesign` con `ownerType=FLYER`. Crear el Flyer reclama ambos assets en la misma transacción.

Al sustituir una variante se bloquean Evento, diseño y assets. Primero se valida el nuevo staging, después
se cambia la referencia y se reclama el nuevo asset; solo entonces el anterior pasa a `HIDDEN`. Un fallo en
cualquier paso revierte la referencia, el claim, el ocultamiento y las auditorías.

### FlipbookPage

Cada página es una fila independiente con UUID, `designId`, `eventId`, `fileAssetId`, posición,
timestamps y borrado lógico. El asset es `FLIPBOOK_PAGE_IMAGE`, `READY`, del mismo Cliente/Evento y queda
asociado al UUID de la página mediante el resolver `FLIPBOOK_PAGE`.

Las páginas activas:

- son entre cero y diez durante edición, y entre una y diez para readiness;
- tienen posiciones únicas y continuas `1..N`;
- se consultan por posición y UUID para un orden determinista;
- se reordenan en una transacción;
- al eliminarse, sus posiciones posteriores se compactan, sus Hotspots se eliminan lógicamente y su asset
  pasa a `HIDDEN`;
- al sustituir su imagen siguen el mismo orden seguro de validar, referenciar, reclamar y ocultar.

Una restricción de exclusión diferible permite reordenar sin estados inválidos visibles al commit.

### Hotspot

Hotspot es una entidad relacional separada. Pertenece al diseño y a uno de estos owners visuales:

- `FLYER`, sin página;
- `FLIPBOOK_PAGE`, con FK compuesta a una página del mismo diseño y Evento.

Acciones cerradas:

- `RSVP`;
- `LOCATION`;
- `GIFT_REGISTRY`;
- `QR_AREA`;
- `EXTERNAL_LINK`.

`QR_AREA` solo representa una región visual; no genera ni entrega el QR. `EXTERNAL_LINK` requiere una URL
HTTPS absoluta con host válido, sin credenciales, query, fragment, espacios, controles ni protocolo
alternativo. Zod y PostgreSQL aplican la misma forma; las demás acciones rechazan URL. Un `PATCH` nunca
descarta silenciosamente una URL incompatible: actualizar URL requiere que la acción actual o resultante
sea `EXTERNAL_LINK`, y cambiar a otra acción limpia la URL.

Las coordenadas `x`, `y`, `width` y `height` son `DECIMAL(9,8)` relativas al owner visual. PostgreSQL y
Zod exigen valores finitos dentro de `[0,1]`, ancho y alto positivos y que el rectángulo no salga del
lienzo. `priority` es entero no negativo.

Cada diseño admite como máximo tres Hotspots `EXTERNAL_LINK`. El límite se serializa bloqueando el diseño
y se vuelve a comprobar mediante trigger diferible.

En Flipbook, la página activa en posición `1` es la portada. `RSVP`, `LOCATION` y `GIFT_REGISTRY` solo se
crean o cambian sobre la portada. La única página activa que contiene `QR_AREA` se deriva como página QR;
no existe columna o entidad adicional. `EXTERNAL_LINK` solo opera sobre portada o página QR. Dos intentos
concurrentes de establecer páginas QR diferentes se serializan y PostgreSQL conserva una sola.

Un Hotspot activo de Flipbook requiere página y diseño activos de la misma combinación
`designId/eventId`. El borrado de página elimina lógicamente sus Hotspots en la misma transacción; una
escritura directa no puede dejar un Hotspot activo sobre una página eliminada.

## Readiness

`GET /api/v1/events/:eventId/design/readiness` devuelve `complete`, `designType` y bloqueos estables.

La parte de diseño está completa cuando:

- Flyer: existe el diseño compatible, ambas variantes están `READY` y asociadas, y existen Hotspots
  activos válidos individuales para `RSVP`, `LOCATION`, `GIFT_REGISTRY` y `QR_AREA`;
- Flipbook: existe el diseño compatible, hay de una a diez páginas con orden continuo y assets `READY`;
  la portada contiene `RSVP`, `LOCATION` y `GIFT_REGISTRY`, y una página activa contiene `QR_AREA`.

`EXTERNAL_LINK` es opcional y nunca sustituye una acción requerida. Readiness ignora Hotspots eliminados
o cuyo owner visual no esté activo. Un reordenamiento puede cambiar la portada: las acciones de la
portada anterior dejan de contar y el resultado baja inmediatamente.

Bloqueos:

- `INVITATION_DESIGN_SERVICE_UNSUPPORTED`;
- `INVITATION_DESIGN_MISSING`;
- `INVITATION_DESIGN_TYPE_MISMATCH`;
- `FLYER_INITIAL_IMAGE_MISSING`;
- `FLYER_QR_IMAGE_MISSING`;
- `FLIPBOOK_PAGE_COUNT_INVALID`;
- `FLIPBOOK_PAGE_ORDER_INVALID`;
- `FLIPBOOK_PAGE_ASSET_INVALID`;
- `FLYER_RSVP_HOTSPOT_MISSING`;
- `FLYER_LOCATION_HOTSPOT_MISSING`;
- `FLYER_GIFT_REGISTRY_HOTSPOT_MISSING`;
- `FLYER_QR_AREA_HOTSPOT_MISSING`;
- `FLIPBOOK_COVER_PAGE_MISSING`;
- `FLIPBOOK_COVER_RSVP_HOTSPOT_MISSING`;
- `FLIPBOOK_COVER_LOCATION_HOTSPOT_MISSING`;
- `FLIPBOOK_COVER_GIFT_REGISTRY_HOTSPOT_MISSING`;
- `FLIPBOOK_QR_PAGE_MISSING`;
- `FLIPBOOK_HOTSPOT_OWNER_INVALID`;
- `FLIPBOOK_HOTSPOT_PLACEMENT_INVALID`.

La activación vuelve a calcular este checklist dentro de su transacción, antes de ledger o comprobante. Un
diseño incompleto responde `409 EVENT_INVITATION_DESIGN_INCOMPLETE` con los bloqueos y no genera efectos
financieros. Si una mutación vuelve incompleto un Evento que estaba `READY_TO_ACTIVATE`, baja a
`CONFIGURED`; CODEX-061 no promueve por sí solo a readiness global porque los demás módulos conservan sus
propios requisitos.

## Estados, ownership y permisos

Crear, sustituir, reordenar o eliminar solo opera en `DRAFT`, `CONFIGURED` y `READY_TO_ACTIVATE`. Desde
`ACTIVE` en adelante el diseño queda congelado. La lectura autenticada continúa según ownership.

- Planner independiente: Eventos de su Cliente;
- Admin de Organización: Eventos de la Organización;
- Planner de Organización: solo Eventos creados por ese usuario;
- Platform Admin no usa rutas operativas;
- recurso inexistente, eliminado o ajeno: `404`.

Cliente, Evento, servicio y actor siempre se derivan de sesión y base de datos. Los requests no aceptan
`clientId`, `storageKey`, checksum, owner ID genérico ni datos de Invitados.

## Endpoints

```http
GET    /api/v1/events/:eventId/design
GET    /api/v1/events/:eventId/design/readiness
POST   /api/v1/events/:eventId/design/flyer
PATCH  /api/v1/events/:eventId/design/flyer/initial-image
PATCH  /api/v1/events/:eventId/design/flyer/qr-image
POST   /api/v1/events/:eventId/design/flipbook
POST   /api/v1/events/:eventId/design/flipbook/pages
PATCH  /api/v1/events/:eventId/design/flipbook/pages/reorder
PATCH  /api/v1/events/:eventId/design/flipbook/pages/:pageId/asset
DELETE /api/v1/events/:eventId/design/flipbook/pages/:pageId
GET    /api/v1/events/:eventId/hotspots
POST   /api/v1/events/:eventId/hotspots
PATCH  /api/v1/events/:eventId/hotspots/:hotspotId
DELETE /api/v1/events/:eventId/hotspots/:hotspotId
```

No existen endpoints públicos en CODEX-061. Las respuestas incluyen IDs técnicos, posiciones,
coordenadas, acciones y timestamps; nunca storage keys, rutas, checksum completo, bytes, tokens, cookies,
nombres o teléfonos.

## Auditoría

Cada mutación registra dentro de la misma transacción:

- creación de diseño;
- claim, ocultamiento y sustitución de assets;
- creación, sustitución, reordenamiento y eliminación de páginas;
- creación, edición y eliminación de Hotspots;
- cambios del resultado de readiness.

La auditoría usa snapshots técnicos sanitizados y omite URLs, storage keys, rutas, checksums, bytes y
datos personales. Una falla de auditoría revierte la operación completa.

## Invariantes PostgreSQL

- FKs reales diseño/Evento, diseño/FileAsset, página/diseño/Evento/FileAsset y
  Hotspot/diseño/página/Evento;
- un diseño activo por Evento mediante exclusión diferible;
- forma compatible de Flyer/Flipbook;
- referencias de variantes Flyer únicas y distintas;
- un asset por página;
- posición positiva, única y continua;
- máximo diez páginas activas;
- coordenadas y forma URL/acción, incluida validación directa de host, credenciales, query, fragment,
  espacios y controles;
- owner visual compatible con tipo de diseño y página activa;
- una sola página QR activa por Flipbook;
- máximo tres enlaces externos;
- FileAsset `READY`, owner y pertenencia Cliente/Evento compatibles al commit;
- servicio configurado compatible al commit, incluso si se modifica directamente;
- identidad y ownership inmutables; sin restauración operativa de filas eliminadas;
- triggers contra `TRUNCATE` en las tres tablas.

Los triggers de hijos bloquean la fila del diseño. Las validaciones estructurales son
`DEFERRABLE INITIALLY DEFERRED`, por lo que sustituciones, reordenamientos y compactaciones pueden cambiar
varias filas atómicamente sin confirmar estados intermedios.

## Fuera de alcance

CODEX-061 no implementa CODEX-070, acceso público, Confirmación, QR gráfico, scanner, frontend, croquis,
Álbum, reportes PDF, WhatsApp ni conversión de PDF. El workflow post-activación Flyer → Flipbook permanece
en una tarea independiente conforme a `SERVICE_UPGRADE_FLOW.md`.
