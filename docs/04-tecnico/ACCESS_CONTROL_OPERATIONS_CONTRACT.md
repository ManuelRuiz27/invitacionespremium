# Contrato operativo de ingresos y aforo — M02-B01-DT08

Ámbito: exclusivamente Organización activa Managed, servicio `ACCESS_CONTROL`, modalidad exclusiva
`NOMINAL` o `ANONYMOUS`. Consulta del estado actual, sin reportes persistidos, Finance, auditoría de
lectura, nuevas entidades, migraciones ni cambios de emisión, QR, Scanner, activación o reversión.

## Superficies y autorización

| Superficie | Autorización | Respuesta |
| --- | --- | --- |
| `GET /api/v1/events/:eventId/access-operations?page=1` | Organization Admin del tenant; Organization Planner actualmente asignado, mediante EventAccessPolicy/eventOwnedWhere | Resumen, Mesas y detalle mínimo discriminado |
| `GET /api/v1/admin/clients/:clientId/events/:eventId/access-operations` | Platform Admin auténtico, usuario vigente y clientId nulo; tenant/Evento exactos | Sólo resumen y Mesas |

Eventos ajenos o eliminados: `404 EVENT_NOT_FOUND`. Los roles excluidos no acceden a rutas Client ni
Admin. StaffToken no autentica estas rutas. Legacy, Cliente inactivo/no Managed o modalidad ausente:
`409 ACCESS_OPERATIONS_EVENT_NOT_ELIGIBLE`. No hay impersonación.

La consulta conserva estados `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE`, `ACTIVE`, `EVENT_DAY`,
`CLOSED`, `CANCELLED`, `ARCHIVED`, dentro de las políticas de acceso y privacidad existentes.
Cabeceras: `Cache-Control: private, no-store`, `nosniff`, `Referrer-Policy: no-referrer`.

## Fotografía consistente y fuentes

`AccessControlOperationsService`, registrado en EventsModule, ejecuta una transacción PostgreSQL
`RepeatableRead` y `READ ONLY`. Ownership, estado, privacidad, resumen, Mesas y página de detalle
pertenecen al mismo snapshot MVCC. La proyección usa CTE y agregaciones SQL; no toma locks `FOR UPDATE`,
no recalcula readiness y no publica realtime. Timeout transaccional 10 segundos; maxWait 5 segundos.
`asOf` es `transaction_timestamp()` de PostgreSQL. No se acumulan deltas ni se consultan snapshots
históricos de nombres, CheckIn o reportes. No se usa `FloorplanShape.occupancy` como ingreso.

| Contador | NOMINAL | ANONYMOUS |
| --- | --- | --- |
| `capacity` | Event.capacity | Event.capacity |
| `issuedHistorical` | Todas las AssistantAccessCredential, incluidas revocadas | Todos los PhysicalPass, incluidos revocados |
| `revokedHistorical` | Credenciales con revokedAt | Pases con revokedAt |
| `activeRights` | Assistant distintos con credencial no revocada y agregado actualmente elegible | Pases no revocados y no borrados |
| `entered` | Derechos vigentes con CheckIn no revertido | Derechos vigentes con usedAt |
| `pending` | activeRights − entered | activeRights − entered |
| `availableCapacity` | capacity − activeRights | capacity − activeRights |

NOMINAL exige Assistant principal interno `PENDING`, nombre actual no nulo, sin borrado/anonimización;
Invitation individual interna `PENDING`, límite adicional cero, no cancelada/eliminada; Contact no
borrado/anonimizado. No exige RSVP confirmado. Nombres iguales conservan UUID distintos. Reemisión
no agrega otro derecho para la misma persona; reversión elimina sólo el ingreso activo.

Un borrador sin capacidad y sin derechos devuelve `capacity=null`, `availableCapacity=null`, restantes
contadores cero e historial real; no inventa aforo cero. Con capacidad configurada se cumplen
`activeRights=entered+pending`, `availableCapacity=capacity-activeRights`,
`0<=entered<=activeRights<=capacity`, con máximo certificado de 150 derechos.

## Mesas e integridad

Sólo se incluyen TABLE activas del Floorplan activo cuando floorplanEnabled. NOMINAL agrupa por
Assistant.floorplanShapeId; ANONYMOUS por PhysicalPass.floorplanShapeId, únicamente TABLE.
Cada Mesa proyecta `tableId`, `tableName`, `capacity`, `activeRights`, `entered`, `pending`,
`availableCapacity`. Capacidad SEAT se verifica contra lugares activos no bloqueados; el detalle
nominal muestra el lugar actual válido. Las Mesas vacías también aparecen. Sin Croquis, `tables=[]`.

Todos los derechos deben tener Mesa válida si el Croquis la exige, y lugar válido en SEAT. Los
derechos e ingresos de Mesas concilian con el Evento. Se detectan sobreaforo, Mesa/Lugar incompatible,
doble credencial vigente o CheckIn activo duplicado/sin derecho vigente/con otra credencial, material
de modalidad ajena y pase simultáneamente usado/revocado. No se recortan contadores para ocultarlos:
`409 ACCESS_OPERATIONS_INCONSISTENT`, mensaje técnico seguro sin identidades ni cifras parciales.
Un borrador con Croquis aún incompleto pero cero derechos puede consultarse.

## Detalle, paginación y privacidad

OpenAPI publica `AccessOperationalSummaryDto`, `NominalAccessOperationsDto` y
`AnonymousAccessOperationsDto`; la respuesta Client es `oneOf` discriminado por accessMode.

- NOMINAL: assistantId, nombre actual permitido, grupo nullable, Mesa nullable, lugar nullable,
  `PENDING|ENTERED` y enteredAt nullable. Orden SQL por nombre NFKC en minúsculas, luego UUID.
- ANONYMOUS: passNumber, Mesa nullable, `UNUSED|USED|REVOKED`, usedAt nullable. Orden por folio
  ascendente; incluye huecos revocados sin reciclar ni renumerar. No identidad ficticia.

`page` es entero positivo canónico, máximo 9,999,999, sin otros filtros de servidor. Cada página tiene
como máximo 150 filas: detailPage, detailPageSize=150, detailTotal. NOMINAL detailTotal=activeRights;
ANONYMOUS detailTotal=issuedHistorical. El historial puede exceder 150 por revocaciones; todos los
contadores y Mesas cubren el Evento completo, independientemente de la página. No hay consultas N+1.
Fuera de rango se devuelve página vacía con el total real. Query inválido:
`400 ACCESS_OPERATIONS_INVALID_QUERY`.

Nunca se entregan teléfono, RSVP, enlaces públicos, QR, nonce, firma, Staff, snapshots o Finance.
Provider nunca recibe detalles nominales ni por folio. No se reconstruyen identidades anonimizadas.
Se respetan los límites ya definidos en REPORTS_CONTRACT usando reloj PostgreSQL, incluso si un
scheduler se retrasa: desde eventDateTime+30 días la ruta Client NOMINAL devuelve
`410 ACCESS_OPERATIONS_DETAIL_EXPIRED`; desde eventDateTime+6 meses ambas superficies devuelven
`410 ACCESS_OPERATIONS_CONTENT_EXPIRED`. No se crean ventanas nuevas ni se accede a GeneratedReport.

## SDK e interfaces

Wrappers derivados de OpenAPI: `events.getAccessOperations(eventId,signal?,page=1)` y
`adminEventPreparation.getAccessOperations(clientId,eventId,signal?)`. Requester autenticado con
credentials include, AbortSignal y ApiError; no Idempotency-Key. Validación estricta de claves,
modalidad, paginación, timestamps, unicidad, aritmética y conciliación; rechaza datos extra sensibles.

Client integra la sección **Ingresos y aforo**, cuatro cifras globales, capacidad/históricos, Mesas y
detalle paginado con búsqueda/filtros locales sólo sobre la página cargada. Admin integra únicamente
resumen/Mesas en detalle del Evento ACCESS_CONTROL. No hay mutaciones de ingreso ni Scanner Provider.

TanStack Query aísla tenant/Evento/modalidad/página según superficie, propaga AbortSignal y refresca al
montar, recuperar foco y manualmente. Polling de respaldo cada 10 segundos sólo mientras la respuesta
autoritativa siga ACTIVE/EVENT_DAY, sin polling de cerrados. Client invalida REST mediante señales
existentes del room dashboard (`checkin.created`, `checkin.reverted`, `seating.updated`, cierre/cancelación,
conexión/reconexión); ANONYMOUS usa polling porque PhysicalPass no publica un nuevo evento realtime.
Una falla de red conserva la última lectura marcada **desactualizada**, con asOf y reintento. Errores
autoritativos de acceso, privacidad o integridad retiran el snapshot anterior. No se cierra sesión por red.

## Evidencia

Ver [implementación y QA reproducible DT08](../05-implementacion/M02_B01_DT08_IMPLEMENTATION.md).
M01, PHYSICAL_QR, reportes, Finance y certificación de piloto DT09 conservan su alcance.
