# Contrato técnico de Álbum postevento

## Alcance

`AlbumsModule` implementa el Álbum postevento para Eventos cuyo servicio es `FLYER` o `FLIPBOOK`.
Permite preparar la configuración y hasta 35 fotos en `active`, `event_day` o `closed`; publicar desde
`closed`; despublicar; archivar anticipadamente; y expirar 30 días después de cada publicación.

No forman parte de este contrato frontend, video, comentarios, reacciones, ZIP, reconocimiento facial,
reportes, almacenamiento público, realtime nuevo ni Álbum para `PHYSICAL_QR` o `DEMO`.

## Modelos

### Album

Un Evento tiene como máximo un `Album`. Conserva:

- `id`, `eventId` y `createdByUserId`;
- `title` obligatorio de 1 a 120 caracteres de texto plano;
- `thankYouMessage` opcional de hasta 600 caracteres de texto plano;
- `themeSettings`, JSON estricto con `backgroundColor`, `textColor` y `accentColor`;
- `externalButtonLabel` y `externalUrl`, ambos completos o ambos nulos;
- `publishedAt` y `expiresAt`, ambos completos o ambos nulos;
- `createdAt`, `updatedAt` y `deletedAt`.

Los colores usan `#RRGGBB` en mayúsculas. La URL externa se normaliza con la política HTTPS segura de
Evento. Cuando existe una publicación, `expiresAt > publishedAt`.

El estado de respuesta es derivado:

- `DRAFT`: configuración no publicada;
- `PUBLISHED`: Evento `album_published` con fechas completas;
- `ARCHIVED`: Evento `archived`.

### AlbumPhoto

`AlbumPhoto` une un Álbum, su Evento y un `FileAsset`. Conserva posición positiva, timestamps y borrado
lógico. El backend mantiene posiciones activas continuas desde 1; el MVP no ofrece reordenamiento
manual. Eliminar una foto marca su relación como eliminada, compacta posiciones y cambia el FileAsset a
`HIDDEN` en la misma transacción. Los bytes se conservan.

### Invitation

El acceso público añade tres campos opcionales:

- `albumTokenNonce`;
- `albumTokenVersion`;
- `albumAccessExpiresAt`.

Los tres son nulos o los tres están completos. El nonce es único, tiene 256 bits aleatorios y no es el
token completo. Solo las Invitaciones elegibles reciben estos campos al publicar.

## Configuración visual

El request de creación requiere:

```json
{
  "title": "Nuestro gran día",
  "thankYouMessage": "Gracias por acompañarnos",
  "theme": {
    "backgroundColor": "#FFFFFF",
    "textColor": "#111111",
    "accentColor": "#C5A46D"
  },
  "externalButton": {
    "label": "Ver video",
    "url": "https://example.com/video"
  }
}
```

Los DTO Zod son estrictos. No aceptan claves adicionales, HTML, caracteres de control, colores
abreviados ni URLs HTTP. `externalButton` puede ser `null`.

## FileAssets

Las fotos usan exclusivamente:

```text
ownerType = ALBUM_PHOTO
fileType  = ALBUM_PHOTO_IMAGE
```

La subida autenticada existente acepta bytes JPEG o PNG reales en `active`, `event_day` y `closed`
únicamente para este tipo. La asociación exige asset `READY`, sin owner, del mismo Cliente y Evento.
Todo el lote se reclama o se revierte. Staging, PDF, MIME incompatible, asset ajeno o reutilizado se
rechazan. Un FileAsset asociado no puede ocultarse ni eliminarse por SQL directo.

## Endpoints autenticados

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/v1/events/:eventId/album` | Configuración y fotos activas |
| `POST` | `/api/v1/events/:eventId/album` | Crea el Álbum |
| `PATCH` | `/api/v1/events/:eventId/album` | Edita configuración |
| `POST` | `/api/v1/events/:eventId/album/photos` | Reclama un lote de FileAssets |
| `DELETE` | `/api/v1/events/:eventId/album/photos/:photoId` | Soft delete y compactación |
| `POST` | `/api/v1/events/:eventId/album/publish` | Publica; requiere `Idempotency-Key` |
| `POST` | `/api/v1/events/:eventId/album/unpublish` | Despublica; requiere `Idempotency-Key` |

Planner independiente opera su Cliente; Admin de Organización opera su Organización; Planner de
Organización solo sus Eventos. Platform Admin no impersona y Staff no accede.

Los DTO autenticados no exponen storage key, ruta física, checksum completo, tokens, nonces, PII ni
datos financieros.

## Publicación e idempotencia

Publicar ejecuta una transacción `Serializable`:

1. bloquea Evento, Álbum, fotos, FileAssets, Invitaciones, Asistentes y CheckIns en ese orden;
2. exige Evento `closed`, servicio digital y entre 1 y 35 fotos activas `READY`;
3. obtiene un único `clock_timestamp()` de PostgreSQL;
4. fija `publishedAt` y `expiresAt = publishedAt + 30 days`;
5. resuelve Invitaciones elegibles;
6. limpia accesos anteriores y genera nonce/version 1 para cada elegible;
7. cambia el Evento a `album_published`;
8. registra `ALBUM_PUBLISH` y `EventStateOperation`;
9. confirma todo o nada.

Una Invitación es elegible si ella y su Contacto están activos, no está cancelada y tiene al menos un
Asistente activo con CheckIn cuyo `revertedAt` es nulo. Anonimizar el nombre no elimina elegibilidad.

`EventStateOperation` usa `PUBLISH_ALBUM`, `UNPUBLISH_ALBUM` y `EXPIRE_ALBUM`. Repetir publicación o
despublicación con la misma llave, Evento y acción devuelve exactamente `resultSnapshot`: no rota
nonces, no extiende fechas y no crea auditoría adicional. Usar la llave para otro Evento o acción
responde `409 EVENT_STATE_IDEMPOTENCY_CONFLICT`.

## Despublicación, archivo y expiración

Despublicar exige `album_published`, cambia el Evento a `closed`, borra todos los accesos, limpia las
fechas de publicación y conserva configuración, fotos y bytes. Una publicación posterior genera fecha,
expiración y nonces nuevos; el token anterior nunca revive.

Archivar desde `album_published` bloquea Álbum e Invitaciones, invalida accesos en la misma transacción,
conserva metadata histórica y fotos, y deja el Evento en `archived`.

El scheduler `albums-expire` se ejecuta cada minuto fuera de `NODE_ENV=test`. Revalida bajo lock cada
Evento vencido, lo archiva, invalida accesos, audita como `SYSTEM` y crea una operación con llave:

```text
system:album-expiry:{eventId}:{expiresAt}
```

La fuente de verdad es PostgreSQL; ejecuciones concurrentes son idempotentes.

## Token y acceso público

`AlbumTokenService` emite:

```text
al1.{albumId}.{invitationId}.{nonce}.{signature}
```

La firma HMAC-SHA-256 usa separación `InvitacionesPremium:ALBUM` y comparación timing-safe. El token es
distinto de Invitación, QR y StaffToken; no se almacena completo, registra ni audita. Solo aparece
dentro del `contentPath` entregado a la Invitación elegible.

La vista pública de Invitación proyecta, con Evento `album_published`:

```json
{ "album": { "state": "AVAILABLE", "contentPath": "/api/v1/public/albums/al1..." } }
```

Una Invitación sin ingreso recibe:

```json
{ "album": { "state": "RESTRICTED", "message": "Álbum disponible solo para asistentes" } }
```

Cada resolución usa un único instante. `AVAILABLE` exige Álbum activo y publicado con `expiresAt > now`,
además de nonce, versión positiva y `albumAccessExpiresAt > now` para la Invitación. La comparación es
estricta: cuando `now === expiresAt` o `now === albumAccessExpiresAt`, el acceso ya venció. En ese caso
la vista pública de Invitación responde `404`, aunque el scheduler todavía no haya persistido
`archived`; `RESTRICTED` se reserva para una Invitación no elegible mientras la publicación sigue
vigente.

## Endpoints públicos

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/v1/public/albums/:albumToken` | Evento mínimo, configuración y fotos |
| `GET` | `/api/v1/public/albums/:albumToken/photos/:photoId/content` | Bytes privados JPEG/PNG |

Cada request revalida firma, nonce, versión, expiración, estado, pertenencia de la foto y elegibilidad.
Cualquier token inválido, vencido, despublicado, archivado o no elegible responde el mismo
`404 ALBUM_NOT_FOUND`.

La respuesta JSON no contiene IDs internos de Evento, Álbum, Invitación, Contacto, Asistente o
FileAsset; tampoco PII, storage, checksum ni otros tokens. La descarga incluye:

```text
Content-Type
Content-Length
ETag
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Un fallo de storage responde un error genérico sin claves ni rutas.

## Integridad PostgreSQL

La migración 31 implementa:

- unicidad de Álbum por Evento y nonce de Álbum;
- FKs `RESTRICT`, incluida la relación compuesta Álbum/Evento;
- checks de texto plano, JSON exacto, colores, botón/URL, pares de publicación y token;
- índice parcial único de posición activa;
- triggers de compatibilidad de servicio y estados mutables;
- constraint triggers diferidos para máximo 35, posiciones continuas y coherencia
  AlbumPhoto/FileAsset/Cliente/Evento/owner/tipo/MIME/estado;
- constraint triggers diferidos de publicación, expiración y elegibilidad;
- protección del FileAsset asociado frente a mutación incompatible;
- rechazo de `DELETE` y `TRUNCATE` para Album y AlbumPhoto.

Los prechecks reportan únicamente conteos. La limpieza controlada de pruebas puede deshabilitar triggers
con `SET LOCAL session_replication_role = replica`.

## Auditoría y concurrencia

Las acciones son `ALBUM_CREATE`, `ALBUM_UPDATE`, `ALBUM_PHOTOS_ADD`, `ALBUM_PHOTO_DELETE`,
`ALBUM_PUBLISH`, `ALBUM_UNPUBLISH` y `ALBUM_EXPIRE`. Solo registran IDs del recurso, conteos, posición,
fechas, claves de tema y presencia de botón. Un fallo de auditoría revierte toda la mutación.

Las operaciones usan aislamiento `Serializable`, reintentos de serialización y locks:

```text
Event → Album → AlbumPhoto → FileAsset → Invitation → Assistant → CheckIn
```

Las pruebas de integración coordinan carreras mediante locks PostgreSQL y `pg_stat_activity`, sin
temporizadores arbitrarios. Verifican creación única, máximo 35, mutaciones contra publicación,
reversión/reapertura en ambos órdenes, archivo, expiración, idempotencia y acceso público contra
invalidación.

El E2E digital crea Evento, Contactos, FileAssets, Flyer y Hotspots mediante HTTP, observa
`ready_to_activate` derivado y activa por el endpoint real. No modifica manualmente `status`,
`activatedAt` ni snapshots de activación. Las regresiones adicionales serializan la última mutación de
readiness, eliminación del último Contacto y eliminación de Hotspot obligatorio contra activación; el
resultado nunca activa ni cobra un Evento incompleto. También verifican que Invitación, Álbum y foto
respondan `404` exactamente en el límite de expiración antes de ejecutar el scheduler.

CODEX-110 no agrega eventos Socket.IO.
