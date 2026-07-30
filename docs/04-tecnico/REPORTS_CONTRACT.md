# Contrato de reportes PDF

## Alcance

`ReportsModule` implementa exclusivamente los reportes `ATTENDANCE` y `PHYSICAL_PASSES`. El backend
autoriza y conserva el dataset autoritativo, fija su hash y valida el PDF técnico renderizado por un
frontend autenticado. No existe renderizador productivo, CSV, Excel, correo ni endpoint público.

## Modelo y estados

`GeneratedReport` pertenece a un Cliente, Evento y usuario solicitante. Conserva tipo, estado, modo de
privacidad, versión de plantilla, reloj del snapshot, límites temporales, dataset, SHA-256 canónico,
parámetros, expiración de carga, FileAsset opcional e idempotencia.

Estados irreversibles:

- `AUTHORIZED`: snapshot autorizado sin archivo;
- `READY`: PDF validado y FileAsset `READY`;
- `HIDDEN`: contenido nominal oculto;
- `EXPIRED`: retención concluida.

`PHYSICAL_PASSES` siempre es `AGGREGATE`. Attendance puede ser `DETAILED` únicamente antes de
`eventDateTime + 30 days`. La retención termina en `eventDateTime + 6 months`. Los límites son
intervalos `[inicio, fin)` calculados con reloj PostgreSQL.

## Datasets v1

Attendance incluye datos básicos del Evento; conteos de Invitaciones, Asistentes y CheckIns; incidencias
por CheckIns revertidos e Invitaciones canceladas; y, solo en modo detallado, nombre de Asistente,
Invitación, Grupo, estado `CHECKED_IN|NO_SHOW`, Mesa y fechas de ingreso/reversión. Nunca incluye IDs
nominales, teléfonos, tokens, staff ni finanzas.

Physical Passes incluye datos básicos del Evento, totales usados/no usados y filas con número de pase,
estado `USED|UNUSED`, Mesa y fecha de uso. No incluye nonce, QR, token, staff ni IDs internos.

Los parámetros v1 son backend-owned: `locale=es-MX`, `pageSize=A4` y zona horaria del Evento. SHA-256
usa JSON canónico con claves ordenadas y conserva el orden autoritativo de arrays.

## Proyección temporal y replay

`projectGeneratedReportAt(report, now)` es la proyección única usada por autorización nueva, replay,
listados Cliente/Admin, carga, descarga y scheduler. Siempre recibe reloj PostgreSQL.

- antes de `detailedUntil`, Attendance puede conservar `DETAILED` y filas nominales;
- desde `detailedUntil`, Attendance se proyecta `AGGREGATE`, con `rows=[]`, hash agregado y sin
  `fileUploadPath`; un PDF nominal deja de estar disponible aunque el scheduler aún no haya corrido;
- desde `retentionUntil`, autorización y replay responden `410 REPORT_CONTENT_EXPIRED`, listados
  proyectan `EXPIRED`, no existe download/upload y Physical Passes proyecta `passes=[]`.

La política temporal prevalece sobre el replay. La misma `Idempotency-Key` no crea otro reporte ni
auditoría, pero devuelve la proyección segura vigente. Reutilizarla para otro Evento o tipo devuelve
`409 REPORT_IDEMPOTENCY_CONFLICT`.

`fileUploadPath` solo existe para un reporte `AUTHORIZED`, antes de `uploadExpiresAt` y
`retentionUntil`, y —si era nominal— antes de `detailedUntil`.

## Concurrencia y recuperación de carga

Las operaciones críticas usan transacciones `Serializable` y el orden de locks:

1. Evento;
2. filas fuente ordenadas;
3. GeneratedReport;
4. FileAsset.

La carga reserva un FileAsset `GENERATED_REPORT/GENERATED_REPORT_PDF`, escribe storage fuera de la
transacción y confirma después bajo locks. Una barrera diferida por Reporte coordina solicitudes
concurrentes sin polling ni transacciones abiertas durante I/O. Los mismos bytes reproducen el
resultado; bytes distintos reciben `REPORT_FILE_ALREADY_ATTACHED`. Solo el ganador crea asset
operativo y auditoría.

Si storage, transacción final, auditoría o expiración concurrente impiden confirmar, el backend elimina
los bytes y vuelve a bloquear Evento → Reporte → FileAsset. La reserva queda `FAILED`, sin `ownerId` ni
`associatedAt`, con metadata técnica mínima. No bloquea una nueva reserva. Un fallo de eliminación
física nunca la convierte en asset operativo.

## Validación del PDF

La carga acepta exclusivamente `file`, `templateVersion` y `datasetHashSha256`. Comprueba límite de
tamaño, MIME `application/pdf`, magic `%PDF-`, estructura, ausencia de cifrado y entre 1 y 200 páginas.
La metadata exige:

- Subject exacto `InvitacionesPremium Report {reportId}`;
- token exacto `template:{version}`;
- token exacto `dataset:{datasetHashSha256}`.

No se aceptan coincidencias parciales como `template:10` o un hash con sufijo.

## Endpoints y permisos

Rutas Cliente:

- `GET /api/v1/events/:eventId/reports`;
- `POST /api/v1/events/:eventId/reports/attendance-pdf`;
- `POST /api/v1/events/:eventId/reports/physical-passes-pdf`;
- `POST /api/v1/events/:eventId/reports/:reportId/file`;
- `GET /api/v1/events/:eventId/reports/:reportId/download`.

Planner independiente accede a su Cliente; Admin de Organización a su Organización; Planner de
Organización solo a Eventos creados por él. Fuera de ownership responde `404`. Platform Admin usa solo
los listados metadata `GET /api/v1/admin/reports` y
`GET /api/v1/admin/reports/events/:eventId`; no descarga ni recibe dataset.

Solo Eventos `closed`, `album_published` o `archived` autorizan reportes. Attendance requiere `FLYER` o
`FLIPBOOK`; Physical Passes requiere `PHYSICAL_QR`.

## Aislamiento y descarga

La descarga revalida sesión, ownership, Evento, reporte, FileAsset y ventanas. Entrega nombre genérico,
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` y
`Referrer-Policy: no-referrer`, sin storage key, nombre interno o checksum completo.

`GENERATED_REPORT_PDF` se excluye de `GET /events/:eventId/file-assets`. Las rutas genéricas get,
content y delete responden `404 FILE_ASSET_NOT_FOUND`, incluso mientras el asset está `READY`. El
endpoint de descarga del Reporte es el único camino a sus bytes.

## Scheduler y auditoría

`reports-retention` corre cada hora y está deshabilitado en tests. En `detailedUntil` elimina filas
nominales, recalcula el hash, oculta el PDF y audita `REPORT_PRIVACY_EXPIRE`. En `retentionUntil`
conserva metadata y agregado mínimo, vacía `rows/passes`, marca `EXPIRED`, oculta el asset y audita
`REPORT_RETENTION_EXPIRE`. La reejecución es idempotente.

Auditorías permitidas: `REPORT_AUTHORIZE`, `REPORT_FILE_ATTACH`, `REPORT_PRIVACY_EXPIRE` y
`REPORT_RETENTION_EXPIRE`. Su metadata se limita a tipo, privacidad, plantilla, estado, fechas,
presencia/tamaño de archivo y conteos agregados. No contiene hashes completos, nombres, teléfonos,
tokens, storage keys, nombres internos ni dataset.

## Integridad PostgreSQL

La migración 32 crea enums, tabla, FKs `RESTRICT`, unicidad global de idempotencia y archivo, checks de
hashes/JSON/fechas/estados, inmutabilidad y protección contra `DELETE`/`TRUNCATE`.

La migración 33 reemplaza las funciones de integridad y reinstala el trigger inverso:

- Reporte `READY` exige asset `READY`, owner, tipo, Cliente y Evento exactos;
- Reporte `HIDDEN|EXPIRED` con asset exige `HIDDEN|DELETED`;
- asset `READY` exige Reporte `READY` y `fileAssetId` exacto;
- asset `HIDDEN` exige Reporte `HIDDEN|EXPIRED`;
- un segundo asset operativo por Reporte es rechazado;
- solo residuos `FAILED|DELETED` pueden quedar sin owner.

Los constraint triggers son `DEFERRABLE INITIALLY DEFERRED`. La limpieza controlada de pruebas conserva
`session_replication_role=replica`.

Las integraciones cubren proyección previa al scheduler, aislamiento FileAsset, recovery de
storage/auditoría, cargas iguales/distintas y SQL directo. Las carreras usan barreras verificables y
promesas diferidas, no sleeps arbitrarios.
