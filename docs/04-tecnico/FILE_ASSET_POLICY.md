# Política de archivos y FileAsset

## Objetivo

Definir cómo se suben, vinculan, autorizan, publican, ocultan y eliminan los archivos del sistema.

Todos los archivos deben pasar por API. Ningún frontend guarda archivos directamente ni expone credenciales del storage.

## Tipos de archivo MVP

| Tipo lógico | Formatos MVP temprano | Límite funcional |
|---|---|---|
| Flyer inicial | JPG/PNG | 1 archivo |
| Flyer QR | JPG/PNG | 1 archivo |
| Página Flipbook | JPG/PNG | Máximo 10 páginas |
| Croquis | JPG/PNG | 1 archivo activo por Evento |
| Foto de álbum | JPG/PNG | Máximo 35 por Álbum |
| Reporte PDF | PDF generado por sistema | Bajo demanda |
| QR invitación/pase | SVG generado por backend | Uno por recurso correspondiente |

PDF subido por usuario se rechaza en MVP temprano. La conversión de PDF de una página a imagen queda fuera del alcance inicial.

## Ownership permitido

`FileAsset` debe pertenecer a un recurso de negocio existente.

Valores conceptuales permitidos para `owner_type`:

- `FLYER_INITIAL`
- `FLYER_QR`
- `FLIPBOOK_PAGE`
- `FLOORPLAN`
- `ALBUM_PHOTO`
- `GENERATED_REPORT`
- `INVITATION_QR`
- `PHYSICAL_PASS_QR`

`owner_id` debe corresponder al recurso dueño real y resolverse en backend.

No se permite:

- archivo sin owner;
- owner inventado por frontend;
- reutilizar un archivo entre Clientes distintos;
- cambiar `owner_id` después de publicar sin una operación explícita y auditada.

## Campos mínimos de FileAsset

- `id` UUID;
- `client_id`;
- `event_id` si aplica;
- `owner_type`;
- `owner_id`;
- `storage_provider`;
- `storage_key`;
- `original_name`;
- `mime_type`;
- `size_bytes`;
- `checksum`;
- `status`;
- `is_public`;
- `created_by`;
- `created_at`;
- `updated_at`;
- `deleted_at`.

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
- `HIDDEN` conserva bytes y relación, pero bloquea acceso público.
- `DELETED` representa borrado lógico; no implica eliminación física inmediata.

## Flujo de subida

1. Usuario autenticado solicita subir archivo al módulo dueño.
2. Backend valida rol, ownership, estado del Evento, formato y límite.
3. Backend crea `FileAsset` en `UPLOADING`.
4. Backend guarda archivo en storage local o S3 compatible.
5. Backend valida MIME real, tamaño y checksum.
6. Si es válido, cambia a `READY`.
7. Si falla, cambia a `FAILED` y registra log técnico.
8. El módulo dueño asocia el archivo dentro de una transacción.

## Autorización de lectura

### Usuario autenticado

Puede leer el archivo si tiene acceso al recurso dueño conforme a `ACCESS_MATRIX.md`.

### Staff por token

Solo puede leer:

- croquis del Evento asociado;
- assets mínimos necesarios para scanner;
- nunca teléfonos, reportes, finanzas ni archivos de otros Eventos.

### Público

Solo puede leer archivos servidos por endpoints públicos autorizados:

- invitación válida;
- QR después de confirmar;
- álbum con acceso permitido.

No debe recibir `storage_key` interno.

## Exposición pública

Los assets públicos deben entregarse mediante:

- endpoint controlado por API; o
- URL firmada de corta duración en storage futuro.

No usar buckets públicos generales en producción.

No incluir en URLs públicas:

- teléfonos;
- nombres completos;
- IDs secuenciales;
- tokens reutilizables distintos al token público autorizado.

## Sustitución de archivos

Al reemplazar Flyer, página Flipbook o croquis:

1. subir nuevo archivo;
2. validar que quede `READY`;
3. actualizar relación del owner;
4. marcar archivo anterior como `HIDDEN` o `DELETED` según corresponda;
5. auditar before/after;
6. conservar trazabilidad si el Evento ya estaba activo.

Nunca borrar primero el archivo anterior y después intentar subir el nuevo.

## Reglas por tipo

### Flyer

- Debe existir archivo inicial y archivo QR antes de marcar diseño completo.
- Si ambos son el mismo archivo lógico, pueden reutilizar la referencia solo dentro del mismo Evento.
- Hotspots se almacenan como entidades separadas.

### Flipbook

- Mínimo 1 y máximo 10 páginas.
- Cada página debe tener orden único dentro del Flipbook.
- Reordenar páginas no modifica el archivo; modifica la relación/posición.

### Croquis

- Solo un croquis activo por Evento.
- Bloquear/desbloquear croquis no cambia el estado del FileAsset.
- Las mesas/zonas usan coordenadas relativas y no se incrustan en los bytes de la imagen.

### Álbum

- Máximo 35 fotos.
- El orden se guarda en la relación FotoÁlbum.
- Publicar/despublicar álbum no elimina fotos.

### Reportes

- Son generados por el sistema.
- Deben asociarse al Evento y al usuario solicitante.
- Deben conservar metadata de plantilla, fecha y parámetros usados.
- No deben ser públicos sin autorización.

### QR SVG

- Se genera en backend.
- El SVG no debe contener datos sensibles visibles en texto.
- El contenido codificado debe ser token opaco o URL controlada.

## Ciclo de vida por estado del Evento

| Estado/acción del Evento | Efecto en archivos |
|---|---|
| En preparación | Acceso solo para usuarios autorizados y preview. |
| Activo / Día del evento | Assets públicos disponibles según token y reglas del servicio. |
| Cerrado | Invitación puede seguir disponible según flujo; scanner bloqueado. Álbum aún no publicado salvo transición correspondiente. |
| Álbum publicado | Fotos disponibles solo para Invitaciones con acceso permitido. |
| Archivado | Todos los links públicos quedan ocultos; archivos se conservan. |
| Cancelado | Mostrar mensaje de cancelación; ocultar contenido operativo y bloquear QR. Archivos se conservan. |
| Borrado lógico | Ocultar al Cliente; conservar archivos necesarios para auditoría, finanzas y restauración. |
| Restauración por Platform Admin | Restablecer relaciones visibles según estado previo, sin regenerar archivos innecesariamente. |

## Eliminación física

En MVP no debe ejecutarse eliminación física inmediata de assets asociados a:

- Eventos activados;
- movimientos financieros;
- reportes;
- auditoría;
- recursos restaurables.

La eliminación física futura debe realizarse mediante proceso controlado, después de la retención definida y verificando que no existan referencias activas.

## Seguridad

- Validar MIME por contenido, no solo extensión.
- Generar nombres internos no predecibles.
- Limitar tamaño por configuración del módulo.
- Bloquear path traversal.
- No ejecutar archivos subidos.
- Eliminar metadata no necesaria de imágenes si la política de privacidad lo requiere.
- Registrar intentos inválidos y errores de storage.
- Mantener storage separado por ambiente.

## Invariantes

- Todo FileAsset pertenece a un Cliente.
- Todo FileAsset operativo de Evento pertenece al mismo Cliente que el Evento.
- Un archivo `DELETED` no puede publicarse.
- Un archivo `FAILED` no puede usarse en activación.
- Archivar o cancelar no hace hard delete.
- Frontend nunca decide directamente el `storage_key` definitivo.

## Códigos de error recomendados

- `FILE_UNSUPPORTED_TYPE`
- `FILE_SIZE_EXCEEDED`
- `FILE_OWNER_MISMATCH`
- `FILE_NOT_READY`
- `FILE_LIMIT_EXCEEDED`
- `FILE_ACCESS_DENIED`
- `FILE_STORAGE_FAILURE`
- `FILE_ALREADY_DELETED`