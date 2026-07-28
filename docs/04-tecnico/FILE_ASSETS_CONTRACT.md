# Contrato técnico de FileAssets

## Alcance

`FileAssetsModule` implementa el almacenamiento privado común para archivos del dominio. CODEX-060 incluye
storage local, subida autenticada de imágenes, consulta, contenido autenticado, asociación interna y limpieza
de huérfanos. No incluye Flyer, Flipbook, Hotspots, Croquis, Álbum, QR gráfico, reportes PDF ni frontend.

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
CODEX-060 registra el resolver de `INVITATION`; módulos posteriores pueden registrar adapters sin cambiar
storage. `createGeneratedAsset` es interno y se prueba con `INVITATION_QR_SVG`, pero no genera todavía el QR.

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

El contenido solo se entrega para `READY`, con `Content-Type`, `Content-Length`, ETag derivado y
`Content-Disposition: inline`. No existen endpoints públicos en CODEX-060.

## Borrado y limpieza

`DELETE` marca `DELETED`, establece `deletedAt`, conserva bytes y es idempotente. Un asset asociado responde
`409 FILE_ASSET_ASSOCIATED`.

La limpieza programada elimina mediante `FileStorage` los assets no asociados que superaron la retención:
`UPLOADING`, `FAILED`, `DELETED` y `READY`. Los deja en `DELETED` y genera una auditoría agregada `SYSTEM`.
Nunca toca assets asociados ni elimina por cancelar o archivar un Evento.

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
