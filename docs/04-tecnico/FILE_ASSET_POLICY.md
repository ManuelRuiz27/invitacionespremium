# Política de archivos y FileAsset

## Objetivo

Definir cómo se suben, vinculan, autorizan, publican, ocultan y eliminan los archivos del sistema.

Todos los archivos deben pasar por API. Ningún frontend guarda archivos directamente ni expone credenciales del storage.

## Tipos de archivo MVP

| Tipo lógico | Formatos MVP temprano | Límite funcional |
|---|---|---|
| Flyer inicial | JPG/PNG | 1 archivo activo |
| Flyer QR | JPG/PNG | 1 archivo activo |
| Página Flipbook | JPG/PNG | Máximo 10 páginas |
| Croquis | JPG/PNG | 1 archivo activo por Evento |
| Foto de álbum | JPG/PNG | Máximo 35 por Álbum |
| Reporte PDF | PDF generado por sistema | Bajo demanda |
| QR Invitación | SVG generado bajo demanda por backend | Uno derivado por Invitación; no se persiste como FileAsset |
| QR Pase físico | SVG generado bajo demanda por backend | Uno derivado por Pase; no se persiste como FileAsset |

PDF subido por usuario se rechaza en MVP temprano. La conversión de PDF de una página a imagen queda fuera del alcance inicial.

## Separación entre owner y tipo de archivo

`owner_type` identifica el recurso de negocio dueño del archivo.

`file_type` identifica el contenido lógico almacenado.

No usar `owner_type` para representar variantes como “imagen inicial” o “imagen QR”.

### Valores conceptuales permitidos de `owner_type`

- `FLYER`
- `FLIPBOOK_PAGE`
- `FLOORPLAN`
- `ALBUM_PHOTO`
- `GENERATED_REPORT`
- `INVITATION`
- `PHYSICAL_PASS`

Estos valores corresponden a recursos ya definidos. No crean roles ni módulos nuevos.

### Valores conceptuales permitidos de `file_type`

- `FLYER_INITIAL_IMAGE`
- `FLYER_QR_IMAGE`
- `FLIPBOOK_PAGE_IMAGE`
- `FLOORPLAN_IMAGE`
- `ALBUM_PHOTO_IMAGE`
- `GENERATED_REPORT_PDF`
- `INVITATION_QR_SVG`
- `PHYSICAL_PASS_QR_SVG`

## Ownership permitido

`FileAsset` debe pertenecer a un recurso de negocio existente.

- `owner_id` debe corresponder al recurso dueño real y resolverse en backend.
- `client_id` debe coincidir con el Cliente del recurso dueño.
- `event_id`, cuando aplique, debe coincidir con el Evento del recurso dueño.

Durante la subida puede existir temporalmente un asset sin `owner_id`. Es staging técnico preparado:

- conserva `client_id`, `event_id`, `owner_type` y `file_type` derivados por backend;
- nunca se considera asociado a una configuración;
- nunca se expone por endpoints públicos;
- solo puede asociarse mediante el resolver especializado del owner;
- queda sujeto a la limpieza de huérfanos.

No se permite:

- tratar un staging sin owner como archivo operativo;
- owner inventado por frontend;
- reutilizar un archivo entre Clientes distintos;
- asociar un archivo de un Evento a otro Evento;
- cambiar `owner_id` después de publicar sin una operación explícita y auditada;
- utilizar un `file_type` incompatible con su `owner_type`.

Ejemplos válidos para archivos que sí se persisten:

- `owner_type=FLYER` + `file_type=FLYER_INITIAL_IMAGE`;
- `owner_type=FLYER` + `file_type=FLYER_QR_IMAGE`;
- `owner_type=GENERATED_REPORT` + `file_type=GENERATED_REPORT_PDF`.

`INVITATION_QR_SVG` permanece como tipo conceptual reservado, pero CODEX-071 no crea el FileAsset: el
SVG de Invitación se deriva bajo demanda. No debe agregarse una fila o bytes de storage para materializarlo.

`PHYSICAL_PASS_QR_SVG` también permanece reservado: CODEX-100 deriva el SVG autenticado bajo demanda y
no crea fila, bytes ni `storageKey`.

## Campos mínimos de FileAsset

- `id` UUID;
- `client_id`;
- `event_id` si aplica;
- `owner_type`;
- `owner_id`;
- `file_type`;
- `storage_provider`;
- `storage_key`;
- `original_name`;
- `mime_type`;
- `size_bytes`;
- `checksum`;
- `status`;
- `created_by_user_id` si aplica;
- `created_at`;
- `updated_at`;
- `deleted_at`.

No usar un booleano `is_public` para omitir autorización. La visibilidad pública depende siempre del endpoint, token y estado del recurso.

## Estados del archivo

Enum sugerido `file_asset_status`:

- `UPLOADING`
- `READY`
- `FAILED`
- `HIDDEN`
- `DELETED`

### Reglas

- Solo archivos `READY` pueden asociarse a una configuración activa.
- `FAILED` conserva metadata técnica para diagnóstico, pero no se muestra al Cliente como archivo válido.
- `HIDDEN` conserva bytes y relación, pero bloquea acceso público y operativo normal.
- `DELETED` representa borrado lógico; no implica eliminación física inmediata.
- Un archivo `HIDDEN` o `DELETED` no puede resolverse mediante endpoint público.

## Flujo de subida

1. Usuario autenticado solicita subir archivo al módulo dueño.
2. Backend valida rol, ownership, estado del Evento, formato y límite.
3. Backend crea `FileAsset` en `UPLOADING`.
4. Backend genera `storage_key` interno no predecible.
5. Backend guarda archivo en storage local o S3 compatible.
6. Backend valida MIME real, tamaño y checksum.
7. Si es válido, cambia a `READY`.
8. Si falla, cambia a `FAILED` y registra log técnico.
9. El módulo dueño asocia el archivo mediante `claimReadyAsset` dentro de una transacción.

Si falla la asociación después de guardar bytes, el sistema debe conservar el asset como no asociado/oculto para limpieza controlada; no debe publicarlo.

## Autorización de lectura

### Usuario autenticado

Puede leer el archivo si tiene acceso al recurso dueño conforme a `ACCESS_MATRIX.md`.

### Staff por token

Solo puede leer:

- croquis del Evento asociado;
- assets mínimos necesarios para scanner;
- únicamente cuando el Evento está `active` o `event_day`.

Nunca puede leer:

- teléfonos;
- reportes;
- finanzas;
- archivos de otros Eventos;
- invitaciones completas si no son necesarias para la operación.

### Público

Solo puede leer archivos servidos por endpoints públicos autorizados:

- Invitación mediante token de Invitación;
- QR después de confirmar y solo durante `active` o `event_day`;
- Álbum mediante token de Álbum separado y vigente.

No debe recibir:

- `storage_key` interno;
- ruta física;
- IDs internos innecesarios;
- tokens de otros propósitos.

## Exposición pública

Los assets públicos deben entregarse mediante:

- endpoint controlado por API; o
- URL firmada de corta duración en storage futuro.

No usar buckets públicos generales en producción.

Una URL firmada:

- no sustituye la validación inicial del token público;
- debe expirar;
- debe limitarse al asset autorizado;
- no debe reutilizarse para otros recursos.

No incluir en URLs públicas:

- teléfonos;
- nombres completos;
- IDs secuenciales;
- tokens reutilizables distintos al token público autorizado.

## Sustitución de archivos

Proceso general:

1. subir nuevo archivo;
2. validar que quede `READY`;
3. validar estado del recurso dueño;
4. actualizar relación del owner;
5. marcar archivo anterior como `HIDDEN` o `DELETED` según corresponda;
6. auditar before/after;
7. conservar trazabilidad cuando exista operación previa.

Nunca borrar primero el archivo anterior y después intentar subir el nuevo.

### Restricción por estado

- Flyer y Flipbook pueden sustituirse únicamente en `draft`, `configured` o `ready_to_activate`.
- Al pasar a `active`, el diseño público queda congelado.
- No permitir reemplazo de Flyer/Flipbook en `active`, `event_day`, `closed`, `album_published`, `archived` o `cancelled`.
- Croquis/mesas siguen las reglas operativas específicas y toda modificación posterior a activación debe auditarse.
- Álbum puede prepararse antes del cierre; su publicación/despublicación sigue `EVENT_STATE_MACHINE.md`.

## Reglas por tipo

### Flyer

- Debe existir archivo inicial y archivo QR antes de marcar diseño completo.
- Si ambos son el mismo archivo lógico, pueden reutilizar la referencia solo dentro del mismo Flyer/Evento.
- Hotspots se almacenan como entidades separadas.
- El diseño queda congelado al activar Evento.
- `owner_id` es el UUID del `InvitationDesign`; el resolver valida el mismo Cliente y Evento.
- Sustituir reclama el nuevo staging y solo después oculta el asset anterior dentro de la misma transacción.

### Flipbook

- Mínimo 1 y máximo 10 páginas.
- Cada página debe tener orden único dentro del Flipbook.
- Reordenar páginas no modifica el archivo; modifica la relación/posición.
- El diseño y orden quedan congelados al activar Evento.
- `owner_id` de cada asset es el UUID de `FlipbookPage`; su resolver exige página, diseño y Evento activos.
- Eliminar una página compacta posiciones, elimina lógicamente sus Hotspots y conserva el asset como `HIDDEN`.

### Croquis

- Solo un croquis activo por Evento.
- El staging usa `ownerType=FLOORPLAN` y `fileType=FLOORPLAN_IMAGE`; acepta exclusivamente JPG/PNG.
- Al crear, el backend reclama el asset `READY` y fija `ownerId` al UUID del Croquis dentro de la misma
  transacción; Cliente y Evento deben coincidir.
- El reemplazo reclama el asset nuevo antes de cambiar la FK y después oculta el anterior. Cualquier fallo
  revierte las tres acciones y conserva la imagen previa.
- La FK `RESTRICT`, el trigger diferido de compatibilidad y el trigger sobre FileAsset impiden eliminar,
  ocultar, reasignar o cruzar la imagen activa.
- Bloquear/desbloquear croquis no cambia el estado del FileAsset.
- Las mesas/zonas usan coordenadas relativas y no se incrustan en los bytes de la imagen.
- Staff recibe el contenido autenticado únicamente con Evento `active | event_day`, cache privado
  `no-store` y proyección necesaria para localizar Mesa, sin teléfonos, `storageKey`, rutas físicas ni
  checksum completo.

### Álbum

- Máximo 35 fotos.
- La subida `ALBUM_PHOTO/ALBUM_PHOTO_IMAGE` se habilita solo en `active`, `event_day` y `closed`; esta
  excepción no abre esos estados a Flyer, Flipbook ni Croquis.
- Los bytes deben ser JPEG o PNG reales y el asset debe estar `READY`, sin owner y en el mismo Cliente
  y Evento antes de asociarse.
- El orden se guarda en la relación FotoÁlbum.
- Publicar/despublicar Álbum no elimina fotos.
- El acceso público requiere token de Álbum separado por Invitación elegible.
- Al despublicar, expirar o archivar, los assets dejan de resolverse públicamente.
- El endpoint público de foto revalida el token y entrega `private, no-store`, `nosniff` y
  `Referrer-Policy: no-referrer`, sin nombre original, storage key, ruta ni checksum completo.

### Reportes

- El backend autoriza el dataset y el frontend autenticado renderiza el PDF.
- La carga especializada valida estructura, límite de 200 páginas y binding de metadata al reporte.
- El FileAsset queda `GENERATED_REPORT/GENERATED_REPORT_PDF`, asociado al mismo Cliente y Evento.
- La descarga es privada y nunca expone storage key, nombre interno o checksum completo.
- El PDF nominal se oculta a los 30 días post-Evento; metadata y agregado mínimo se retienen seis meses.
- El contrato completo vive en `REPORTS_CONTRACT.md`.

### QR SVG

- Se genera en backend.
- El QR de Invitación se genera bajo demanda y no se persiste en FileAsset, disco o PostgreSQL.
- El SVG no debe contener datos sensibles visibles en texto.
- El contenido codificado debe ser token opaco o URL controlada.
- QR de Invitación y QR de Pase físico usan propósitos y tokens distintos.
- Cerrar/cancelar/archivar bloquea su operación conforme al tipo de Evento.

## Ciclo de vida por estado del Evento

| Estado/acción del Evento | Efecto en archivos |
|---|---|
| `draft` / `configured` / `ready_to_activate` | Acceso para usuarios autorizados y preview. Se permiten sustituciones conforme al módulo. |
| `active` / `event_day` | Diseño de Invitación congelado. Assets públicos disponibles según token y servicio. QR operativo. |
| `closed` | Scanner y QR bloqueados. Invitación puede mostrar estado cerrado. Álbum aún no es público salvo transición correspondiente. |
| `album_published` | Fotos disponibles solo mediante token de Álbum vigente para Invitaciones elegibles. |
| `archived` | Todos los links públicos quedan ocultos; archivos se conservan. |
| `cancelled` | Solo se muestra mensaje de cancelación; contenido visual operativo, QR, scanner y Álbum quedan ocultos. Archivos se conservan. |
| Borrado lógico | Ocultar al Cliente y al público; conservar archivos necesarios para auditoría, finanzas y restauración. |
| Restauración por Platform Admin | Restablecer relaciones visibles según estado previo, sin regenerar archivos innecesariamente. No reactivar tokens expirados automáticamente. |

## Eliminación física

En MVP no debe ejecutarse eliminación física inmediata de assets asociados a:

- Eventos activados;
- movimientos financieros;
- reportes;
- auditoría;
- recursos restaurables.

La eliminación física futura debe realizarse mediante proceso controlado, después de la retención definida y verificando que no existan referencias activas.

Los bytes huérfanos por subidas fallidas pueden eliminarse mediante limpieza técnica controlada cuando:

- nunca fueron asociados a un recurso activo;
- no se necesitan para diagnóstico;
- se cumple la retención técnica definida.

La limpieza debe reclamar primero el registro con una transición condicional a `DELETED` mientras
`owner_id IS NULL`; solo después del commit puede eliminar los bytes. No debe mantener una transacción de
base de datos abierta durante I/O de storage. Si la eliminación física falla, el registro permanece
`DELETED` y puede reintentarse después de la retención. La misma fila y versión no pueden reclamarse dos
veces por schedulers concurrentes.

La asociación y el borrado genérico deben bloquear y volver a validar la misma fila dentro de sus
transacciones. Si la asociación gana, el borrado genérico no puede marcar `DELETED`; si el borrado o cleanup
gana, el asset deja de ser asociable antes de cualquier eliminación física.

## Seguridad

- Validar MIME por contenido, no solo extensión.
- Generar nombres internos no predecibles.
- Limitar tamaño por configuración del módulo y ambiente.
- Bloquear path traversal.
- No ejecutar archivos subidos.
- Eliminar metadata no necesaria de imágenes cuando pueda contener ubicación u otros datos personales.
- Registrar intentos inválidos y errores de storage.
- Mantener storage separado por ambiente.
- No registrar tokens, URLs firmadas completas ni contenido binario en logs.
- Toda descarga autenticada usa cache privado sin almacenamiento y `nosniff`.

## Invariantes

- Todo FileAsset pertenece a un Cliente.
- Todo FileAsset operativo de Evento pertenece al mismo Cliente y Evento que su owner.
- `owner_type` y `file_type` deben ser compatibles.
- Un archivo `DELETED` o `HIDDEN` no puede publicarse.
- Un archivo `FAILED` no puede usarse en activación.
- Archivar o cancelar no hace hard delete.
- Frontend nunca decide directamente el `storage_key` definitivo.
- Cambiar un FileAsset no cambia ownership del recurso.
- Un token público no concede acceso general al storage.

## Códigos de error recomendados

- `FILE_UNSUPPORTED_TYPE`
- `FILE_SIZE_EXCEEDED`
- `FILE_OWNER_MISMATCH`
- `FILE_TYPE_OWNER_MISMATCH`
- `FILE_NOT_READY`
- `FILE_LIMIT_EXCEEDED`
- `FILE_ACCESS_DENIED`
- `FILE_EVENT_STATE_LOCKED`
- `FILE_STORAGE_FAILURE`
- `FILE_ALREADY_DELETED`
