# Contrato técnico de FileAssets

## Alcance

`FileAssetsModule` implementa el almacenamiento privado común para archivos del dominio. CODEX-060 incluye
storage local, subida autenticada de imágenes, consulta, contenido autenticado, asociación interna y limpieza
de huérfanos. CODEX-061 agrega los adapters `FLYER` y `FLIPBOOK_PAGE`; Croquis, Álbum, QR gráfico,
reportes PDF y frontend permanecen fuera de este contrato.

## Modelo

`FileAsset` conserva UUID, Cliente, Evento, `ownerType`, `ownerId`, `fileType`, proveedor y clave de storage,
nombre original normalizado, MIME verificado, tamaño, checksum SHA-256, dimensiones, creador, estado, código
de fallo, asociación, timestamps y borrado lógico.

Estados:

- `UPLOADING`: staging técnico no público;
- `READY`: bytes validados y disponibles para asociación o lectura autenticada;
- `FAILED`: procesamiento fallido con código técnico;
- `HIDDEN`: bytes conservados sin acceso operativo;
- `DELETED`: borrado lógico terminal; los bytes se retiran únicamente por limpieza controlada.

Un asset `READY` sin `ownerId` continúa siendo staging técnico: no forma parte de una configuración y nunca
se expone públicamente. `ownerId` y `associatedAt` se establecen juntos.

## Compatibilidad

| Owner | File types |
|---|---|
| `FLYER` | `FLYER_INITIAL_IMAGE`, `FLYER_QR_IMAGE` |
| `FLIPBOOK_PAGE` | `FLIPBOOK_PAGE_IMAGE` |
| `FLOORPLAN` | `FLOORPLAN_IMAGE` |
| `ALBUM_PHOTO` | `ALBUM_PHOTO_IMAGE` |
| `GENERATED_REPORT` | `GENERATED_REPORT_PDF` |
| `INVITATION` | `INVITATION_QR_SVG` |
| `PHYSICAL_PASS` | `PHYSICAL_PASS_QR_SVG` |

La tabla vive en una única abstracción de dominio y también en un `CHECK` PostgreSQL. Cualquier otra
combinación responde `409 FILE_TYPE_OWNER_MISMATCH`.

## Configuración

```text
FILE_STORAGE_LOCAL_ROOT=var/file-assets
FILE_UPLOAD_MAX_BYTES=10485760
FILE_IMAGE_MAX_PIXELS=40000000
FILE_ORPHAN_RETENTION_SECONDS=86400
```

La raíz se resuelve por ambiente. No se publica como carpeta estática y se ignora en Git.

## Validación de imágenes

El multipart de Cliente acepta únicamente tipos de imagen de la tabla y bytes JPEG o PNG. El backend:

1. aplica el límite de bytes antes del dominio mediante Multer y vuelve a validarlo en el servicio;
2. identifica la firma binaria;
3. decodifica la imagen con `sharp`;
4. valida ancho, alto y píxeles máximos;
5. auto-orienta y re-encodea en el mismo formato;
6. elimina EXIF, XMP, IPTC e ICC no necesarios;
7. calcula SHA-256 sobre los bytes finales almacenados.

La extensión, nombre y `Content-Type` declarados no son fuente de verdad. PDF, SVG, HTML, WebP y formatos
distintos se rechazan. PDF y SVG generados existen solo en métodos internos.

Errores estables:

- `400 FILE_UNSUPPORTED_TYPE`;
- `413 FILE_SIZE_EXCEEDED`;
- `400 FILE_IMAGE_INVALID`;
- `400 FILE_IMAGE_DIMENSIONS_EXCEEDED`;
- `500 FILE_STORAGE_FAILURE`.

## Storage local

`FileStorage` es el límite del dominio y permite agregar un proveedor S3 compatible futuro.
`LocalFileStorage`:

- genera claves hexadecimales con 256 bits de entropía;
- rechaza claves que no satisfacen el formato interno;
- resuelve siempre dentro de la raíz configurada;
- crea directorios de manera segura;
- escribe primero un temporal exclusivo, sincroniza y hace rename atómico;
- elimina el temporal ante fallo;
- permite lectura y eliminación idempotente sin devolver rutas físicas.

El nombre original nunca se utiliza como ruta.

## Flujo de subida

`POST /api/v1/events/:eventId/file-assets` deriva Cliente, Evento y actor desde la sesión y PostgreSQL.
Opera solo en `DRAFT`, `CONFIGURED` y `READY_TO_ACTIVATE`.

El servicio crea primero `UPLOADING`, valida y normaliza bytes, escribe mediante `FileStorage` y cambia a
`READY` junto con su auditoría técnica. Ante cualquier fallo elimina bytes escritos, cambia a `FAILED` y
persiste únicamente un código técnico. Ningún DTO, auditoría o log contiene `storageKey`, ruta, checksum
completo o bytes.

## Asociación interna

`claimReadyAsset(assetId, owner, actorUserId, operationId?)` es transaccional y bloquea la fila:

- exige `READY`, no eliminado y no asociado;
- comprueba la combinación owner/file;
- resuelve Cliente y Evento desde el owner real mediante `FileAssetOwnerRegistry`;
- exige coincidencia exacta con el asset;
- asigna `ownerId` y `associatedAt` una sola vez;
- audita solo IDs y metadata técnica.

Las diferencias responden `409 FILE_OWNER_MISMATCH`. No existe endpoint genérico para recibir `ownerId`.
CODEX-060 registra el resolver de `INVITATION` y CODEX-061 registra `FLYER` y `FLIPBOOK_PAGE`. Los dos
adapters de diseño resuelven el Cliente y Evento desde FKs reales, excluyen owners eliminados y participan
en la misma transacción que crea o sustituye la referencia. `createGeneratedAsset` es interno y se prueba
con `INVITATION_QR_SVG`, pero no genera todavía el QR.

La sustitución de una imagen de diseño usa las operaciones internas transaccionales: valida y reclama el
nuevo staging antes de cambiar el asset anterior a `HIDDEN`. Nunca hay una ventana confirmada sin imagen
válida ni se oculta el archivo anterior si el claim nuevo falla.

## Endpoints

```http
POST   /api/v1/events/:eventId/file-assets
GET    /api/v1/events/:eventId/file-assets
GET    /api/v1/events/:eventId/file-assets/:fileAssetId
GET    /api/v1/events/:eventId/file-assets/:fileAssetId/content
DELETE /api/v1/events/:eventId/file-assets/:fileAssetId
```

Permisos:

- Planner independiente: Eventos de su Cliente;
- Admin de Organización: cualquier Evento de la Organización;
- Planner de Organización: únicamente Eventos creados por él;
- Platform Admin: no usa estas rutas operativas;
- Evento ajeno, inexistente o eliminado: `404`.

El contenido solo se entrega para `READY`, con `Content-Type`, `Content-Length`, ETag derivado,
`Content-Disposition: inline`, `Cache-Control: private, no-store` y
`X-Content-Type-Options: nosniff`. La respuesta no incluye clave de storage, ruta, checksum completo,
nombre interno ni filename en `Content-Disposition`. No existen endpoints públicos en CODEX-060.

## Borrado y limpieza

`DELETE` autoriza primero el Evento y después bloquea la fila del asset dentro de la transacción crítica. En
ese mismo bloqueo vuelve a comprobar `status`, `deletedAt` y `ownerId`: si ya está `DELETED` conserva
idempotencia; si está asociado responde `409 FILE_ASSET_ASSOCIATED`; en otro caso marca `DELETED`, establece
`deletedAt`, audita y conserva bytes. El bloqueo se comparte con `claimReadyAsset`, por lo que solo una
operación puede ganar: un claim confirmado impide el borrado genérico y un borrado confirmado impide el
claim.

La limpieza programada elimina mediante `FileStorage` los assets no asociados que superaron la retención:
`UPLOADING`, `FAILED`, `DELETED` y `READY`. Los deja en `DELETED` y genera una auditoría agregada `SYSTEM`.
Nunca toca assets asociados ni elimina por cancelar o archivar un Evento.

Cada candidato se reclama primero mediante una actualización condicional atómica que exige el mismo
`status`, `updatedAt` y `ownerId IS NULL`. La transición lógica a `DELETED`, su `deletedAt` y la auditoría se
confirman antes de tocar filesystem. Solo el proceso que obtuvo esa transición elimina los bytes y la
transacción PostgreSQL ya está cerrada cuando comienza el I/O.

Si el claim gana, la condición del cleanup afecta cero filas y los bytes permanecen. Si cleanup gana,
`claimReadyAsset` observa `DELETED` y rechaza la asociación. Un fallo físico no revierte el estado
`DELETED`: tras la retención, otra ejecución puede reclamarlo de nuevo y reintentar la eliminación.
`updatedAt` funciona como versión de la reclamación; ejecuciones concurrentes que leyeron la misma versión
no duplican el trabajo.

## Invariantes PostgreSQL

- compatibilidad exacta owner/file;
- tamaño no negativo y checksum SHA-256 válido;
- metadata completa para `READY`;
- código técnico obligatorio en `FAILED`;
- `deletedAt` obligatorio y exclusivo para `DELETED`;
- par indivisible `ownerId`/`associatedAt`;
- identidad, storage key y creador inmutables;
- metadata binaria inmutable desde `READY`;
- owner asignable una sola vez y solamente desde `READY`;
- transiciones de estado cerradas y `DELETED` terminal;
- `storageKey` globalmente único;
- FKs reales a Cliente, Evento y usuario creador;
- trigger que rechaza `TRUNCATE file_asset`.

El owner polimórfico se valida en el servicio y resolver especializado; no existen FKs falsas.
