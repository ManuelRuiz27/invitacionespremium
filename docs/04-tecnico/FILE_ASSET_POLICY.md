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
| QR Invitación/Pase | SVG generado por backend | Uno por recurso correspondiente |

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

No se permite:

- archivo sin owner;
- owner inventado por frontend;
- reutilizar un archivo entre Clientes distintos;
- asociar un archivo de un Evento a otro Evento;
- cambiar `owner_id` después de publicar sin una operación explícita y auditada;
- utilizar un `file_type` incompatible con su `owner_type`.

Ejemplos válidos:

- `owner_type=FLYER` + `file_type=FLYER_INITIAL_IMAGE`;
- `owner_type=FLYER` + `file_type=FLYER_QR_IMAGE`;
- `owner_type=INVITATION` + `file_type=INVITATION_QR_SVG`;
- `owner_type=GENERATED_REPORT` + `file_type=GENERATED_REPORT_PDF`.

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
9. El módulo dueño asocia el archivo dentro de una transacción.

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

### Flipbook

- Mínimo 1 y máximo 10 páginas.
- Cada página debe tener orden único dentro del Flipbook.
- Reordenar páginas no modifica el archivo; modifica la relación/posición.
- El diseño y orden quedan congelados al activar Evento.

### Croquis

- Solo un croquis activo por Evento.
- Bloquear/desbloquear croquis no cambia el estado del FileAsset.
- Las mesas/zonas usan coordenadas relativas y no se incrustan en los bytes de la imagen.
- Staff recibe solo la representación necesaria para localizar mesa, sin teléfonos.

### Álbum

- Máximo 35 fotos.
- El orden se guarda en la relación FotoÁlbum.
- Publicar/despublicar Álbum no elimina fotos.
- El acceso público requiere token de Álbum separado por Invitación elegible.
- Al despublicar, expirar o archivar, los assets dejan de resolverse públicamente.

### Reportes

- Son generados por el sistema.
- Deben asociarse al Evento y al usuario solicitante.
- Deben conservar metadata de plantilla, fecha y parámetros usados.
- No deben ser públicos sin autorización.
- Su historial operativo se conserva durante el periodo definido para reportes; el MVP contempla consulta histórica de seis meses.

### QR SVG

- Se genera en backend.
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