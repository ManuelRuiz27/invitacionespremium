# Contrato de reportes PDF

## Alcance

`ReportsModule` implementa los reportes `ATTENDANCE` y `PHYSICAL_PASSES`. El backend autoriza la
operación, construye y persiste el dataset autoritativo, fija su hash y valida el PDF renderizado por un
frontend autenticado. No existe renderizador productivo, exportación CSV/Excel ni endpoint público.

## Modelo y estados

`GeneratedReport` pertenece a un Cliente, Evento y usuario solicitante. Conserva tipo, estado, modo de
privacidad, versión de plantilla, reloj del snapshot, límites de privacidad y retención, dataset,
SHA-256 canónico, parámetros, expiración de carga, FileAsset opcional e idempotencia.

Estados irreversibles:

- `AUTHORIZED`: snapshot autorizado, sin archivo asociado;
- `READY`: PDF validado y FileAsset `READY`;
- `HIDDEN`: contenido nominal oculto al vencer privacidad;
- `EXPIRED`: retención concluida.

`PHYSICAL_PASSES` siempre es `AGGREGATE`. Un reporte de asistencia puede ser `DETAILED` únicamente
antes de `eventDateTime + 30 days`. La retención termina en `eventDateTime + 6 months`. Los límites son
intervalos `[inicio, fin)` calculados con el reloj de PostgreSQL; `now >= límite` ya está vencido.

## Datasets v1

Asistencia incluye datos básicos del Evento; conteos de Invitaciones, Asistentes y CheckIns; incidencias
derivadas de CheckIns revertidos e Invitaciones canceladas; y, solo en modo detallado, nombre de
Asistente, Invitación, Grupo, estado `CHECKED_IN|NO_SHOW`, Mesa y fechas de ingreso/reversión. Nunca
incluye IDs nominales, teléfonos, tokens, staff ni datos financieros.

Pases físicos incluye datos básicos del Evento, totales usados/no usados y filas con número de pase,
estado `USED|UNUSED`, Mesa y fecha de uso. No incluye nonce, QR, token, staff ni IDs internos.

Los parámetros v1 son backend-owned: `locale=es-MX`, `pageSize=A4` y zona horaria del Evento. El hash
SHA-256 usa JSON canónico con claves de objetos ordenadas y conserva el orden autoritativo de arrays.

## Idempotencia y concurrencia

La `Idempotency-Key` es global. La firma une Evento, tipo y versión de plantilla. La misma solicitud
reproduce la proyección segura vigente sin crear otro snapshot, auditoría o ventana. Reutilizarla para
otro Evento o tipo devuelve `409 REPORT_IDEMPOTENCY_CONFLICT`.

Todas las operaciones críticas usan transacciones `Serializable` y el orden de locks:

1. Evento;
2. filas fuente ordenadas;
3. GeneratedReport;
4. FileAsset.

La carga reserva un único FileAsset `GENERATED_REPORT/GENERATED_REPORT_PDF`, escribe storage fuera de
la transacción y confirma después bajo locks. Los mismos bytes reproducen el resultado; bytes distintos
devuelven `REPORT_FILE_ALREADY_ATTACHED`. Solo una carga concurrente genera FileAsset y auditoría.

## Validación del PDF

El endpoint especializado acepta exclusivamente `file`, `templateVersion` y `datasetHashSha256`.
Comprueba tamaño configurado, MIME `application/pdf`, magic `%PDF-`, estructura válida, documento no
cifrado y entre 1 y 200 páginas. La metadata debe contener:

- Subject `InvitacionesPremium Report {reportId}`;
- keyword `template:{version}`;
- keyword `dataset:{datasetHashSha256}`.

Un binding incorrecto devuelve `REPORT_FILE_BINDING_INVALID`. El endpoint genérico de FileAssets sigue
rechazando PDF.

## Endpoints y permisos

Rutas Cliente:

- `GET /api/v1/events/:eventId/reports`;
- `POST /api/v1/events/:eventId/reports/attendance-pdf`;
- `POST /api/v1/events/:eventId/reports/physical-passes-pdf`;
- `POST /api/v1/events/:eventId/reports/:reportId/file`;
- `GET /api/v1/events/:eventId/reports/:reportId/download`.

Planner independiente accede a su Cliente; Admin de Organización a su Organización; Planner de
Organización solo a Eventos creados por él. Fuera de ownership responde `404`. Platform Admin usa
únicamente los listados metadata `GET /api/v1/admin/reports` y
`GET /api/v1/admin/reports/events/:eventId`; no puede descargar ni ve dataset.

Solo Eventos `closed`, `album_published` o `archived` autorizan reportes. Asistencia requiere `FLYER` o
`FLIPBOOK`; pases requiere `PHYSICAL_QR`. Evento cancelado u otro estado devuelve
`REPORT_EVENT_STATE_INVALID`; servicio incompatible, `REPORT_SERVICE_MISMATCH`.

## Descarga y retención

La descarga revalida sesión, ownership, Evento, reporte, FileAsset y ventanas. Devuelve PDF con nombre
genérico en español, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` y
`Referrer-Policy: no-referrer`; no expone storage key, nombre interno ni checksum completo.

El scheduler persistente `reports-retention` corre cada hora y está deshabilitado en tests. Al vencer
detalle elimina filas nominales del snapshot, recalcula el hash, oculta el PDF y audita
`REPORT_PRIVACY_EXPIRE`. Al vencer retención conserva metadata y agregado mínimo, marca `EXPIRED`,
oculta el archivo y audita `REPORT_RETENTION_EXPIRE`. La lectura aplica los límites aunque el scheduler
aún no haya persistido la transición.

## Integridad PostgreSQL

La migración 32 crea enums, tabla, FKs `RESTRICT`, unicidad global de idempotencia y asociación de
archivo, checks de hashes/JSON/fechas/estados y triggers diferidos de compatibilidad Cliente–Evento,
servicio y FileAsset. Triggers adicionales impiden mutar identidad, retroceder privacidad/estado,
reemplazar el PDF, `DELETE` y `TRUNCATE`. La limpieza controlada de pruebas conserva
`session_replication_role=replica`.

Auditorías permitidas: `REPORT_AUTHORIZE`, `REPORT_FILE_ATTACH`, `REPORT_PRIVACY_EXPIRE` y
`REPORT_RETENTION_EXPIRE`; su metadata no contiene nombres, teléfonos, tokens, storage keys ni dataset.
