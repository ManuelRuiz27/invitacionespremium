# Credenciales nominales individuales — M02-B01-DT03

Estado: **CONTRACT — runtime implementado en DT03**.

`NominalAccessModule` emite material individual para `ORGANIZATION + MANAGED + ACCESS_CONTROL + NOMINAL`.
Reutiliza `Assistant` principal, su Invitation interna y Contacto; no crea otra identidad de invitado ni
modifica RSVP. Invitation/Assistant permanecen `PENDING`, individuales y sin acompañantes adicionales.
Los nombres repetidos no identifican una credencial: la relación usa UUID del Assistant.

## Superficie autenticada

Prefijo: `/api/v1/events/:eventId/nominal-access-credentials`.

| Método | Sufijo | Contrato |
| --- | --- | --- |
| POST | `/assistants/:assistantId/issue` | Body `{}`; `Idempotency-Key` obligatorio; 201 |
| GET | raíz | Lista metadatos históricos del Evento; 200 |
| GET | `/:credentialId/svg` | SVG de la credencial no revocada y sujeto vigente; 200 |
| POST | `/:credentialId/revoke` | Body `{revocationReasonCode}`; `Idempotency-Key` obligatorio; 200 |

Solo `ORGANIZATION_ADMIN` del tenant y `ORGANIZATION_PLANNER` asignado pueden operar; se utiliza
`EventAccessPolicy`, nunca `createdByUserId` como permiso. Provider y Staff no usan estas rutas.
La Organización debe seguir activa y Managed. Eventos ajenos y sujetos/credenciales de otro Evento
devuelven 404. ANONYMOUS y servicios legacy devuelven 409 por incompatibilidad de modalidad.

Emisión, SVG y revocación admiten `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE`, `ACTIVE` y `EVENT_DAY`.
Así el material puede prepararse antes del Evento. DT06 recomputa preparación tras emisión/revocación,
sin modificar estados ya operativos ni permitir altas tardías de Contactos. Cancelación/cierre/archivo
bloquean operaciones nuevas y descarga. El listado
conserva historial autorizado, sin devolver Eventos eliminados.

El JSON contiene exclusivamente `id`, `eventId`, `assistantId`, `status` (`ISSUED`/`REVOKED`), `issuedAt`,
`revokedAt`, `revocationReasonCode` y `hasActiveCheckIn`. El estado describe emisión/revocación, no
autorización de entrada. `hasActiveCheckIn` se deriva del CheckIn existente con `revertedAt = null`.
No hay nombre, teléfono, Mesa, token, nonce, versión de token ni firma en JSON.

`revocationReasonCode` es un código técnico obligatorio, de 1–64 caracteres, con patrón
`^[A-Z][A-Z0-9_]{0,63}$`; no es un campo de observaciones libres ni debe contener PII.

## Persistencia e invariantes

`AssistantAccessCredential` conserva UUID, Evento, Assistant, nonce/versión propios, fecha/actor de
emisión, fecha/actor/motivo de revocación y timestamps. Las FK son restrictivas y la FK compuesta
`(assistantId,eventId)` prueba pertenencia. Un índice parcial permite como máximo una credencial
no revocada por Assistant, incluso bajo SQL directo y concurrencia.

La emisión exige un principal no eliminado ni anonimizado, Contacto e Invitation vigentes, modo
individual y respuestas `PENDING`. SQL valida modalidad, perfil, actor real y asignación; rechaza insertar
una credencial ya revocada. Identidad, token, emisión y creación son inmutables. La única actualización
permitida es una revocación completa, temporalmente coherente e irreversible. DELETE/TRUNCATE están
prohibidos, incluidos los registros revocados. `event_has_access_material()` incluye todo este historial.

Revocar o emitir una sustituta exige que el Assistant no tenga CheckIn vigente. Revocar un sujeto ya
eliminado/anonimizado sigue permitido si no tiene ingreso vigente; no restaura su identidad. La descarga
y resolución de material de ese sujeto quedan bloqueadas. Anonimización y eliminación de Contactos
conservan el historial técnico de credenciales y su tratamiento de privacidad vigente.

Reemisión significa revocar explícitamente la anterior y emitir con otra clave: nuevo UUID y nonce,
sin reciclar ni reactivar material. No hay una operación de sustitución de credenciales utilizadas.

## Idempotencia, transacciones y auditoría

`NominalAccessCredentialOperation` es un recibo técnico inmutable para ISSUE/REVOKE. La clave es única
entre ambas operaciones; SHA-256 liga acción, Evento, destino, actor y motivo. Guarda referencias,
firma de solicitud y fecha; no guarda snapshots con PII, SVG ni token completo.

Repetir la misma solicitud devuelve la respuesta original sin duplicar emisión, revocación o auditoría.
Reutilizar la clave para otro actor, Evento, destino, acción o motivo devuelve
`409 NOMINAL_ACCESS_IDEMPOTENCY_CONFLICT`. Una clave nueva sobre un Assistant con credencial no revocada
devuelve `NOMINAL_ACCESS_ALREADY_ISSUED`; sobre una credencial ya revocada devuelve
`NOMINAL_ACCESS_CREDENTIAL_REVOKED`.

El replay reautoriza tenant y asignación actuales antes de resolver el recibo. Puede reconstruir la
respuesta original después de revocación, cambios de estado, anonimización o eliminación lógica,
incluido Evento eliminado. No restaura validez: para material vigente siempre se consulta SVG/resolución.
Una respuesta ISSUE conserva los campos de emisión originales y revocación nula, aunque posteriormente
se haya revocado. El listado refleja el historial actual.

Las operaciones usan `Serializable` y reintentos acotados. Orden de locks: Evento → credencial, si existe
→ Invitation → Contacto → Assistant → CheckIns vigentes, por UUID cuando hay varios. El lock del Evento
serializa contra preparación, ownership, eliminación y anonimización. SQL directo usa los mismos
validadores; quien actualice filas directamente debe adquirir primero el Evento. PostgreSQL puede
abortar una carrera de SQL directo por deadlock/serialización en lugar de permitir una inconsistencia.

Emisión/revocación y recibo se auditan atómicamente con actor real, ids, timestamps y motivo técnico.
Fallar auditoría revierte la operación completa. Listar, obtener SVG y resolver el token no escribe
RSVP, Finance, CheckIn, invitado ni archivo.

## Firma y SVG

El token `na1.<credentialId>.<nonce>.<firma>` usa HMAC-SHA-256 con dominio exclusivo
`InvitacionesPremium:NOMINAL_ACCESS`. Reutiliza la configuración segura de signing existente, con
separación criptográfica de propósito respecto a INVITATION, QR y PHYSICAL_PASS. Nonce de 32 bytes
aleatorios y versión 1 son propios de la credencial; no se alteran los tokens legacy. El verificador
comprueba longitud, formato canónico, propósito, firma con comparación segura y material persistido
vigente; el token no contiene PII, teléfono ni Mesa.

SVG reutiliza el renderer vectorial existente con parámetros fijos y validación defensiva. Contiene
solo SVG y dos paths, sin texto, XML/DOCTYPE, scripts ni referencias externas; no incluye token literal.
Mismo material produce mismos bytes y ETag SHA-256; cambiar nombre no rota material. No se persiste SVG
ni token completo. Headers: `Content-Type: image/svg+xml; charset=utf-8`, `Content-Disposition: inline`,
`Content-Length`, ETag, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer` y `Content-Security-Policy: default-src 'none'`.

## Integración Scanner — DT04

`resolveTokenInTransaction(tx, token, expectedEventId)` es interno: devuelve únicamente ids de
credencial/Evento/Assistant o `null`, con pertenencia, firma, no revocación y agregado vigente.
Su llamador debe adquirir Evento antes de entrar y Staff antes de credencial. Este método comprueba
material; Scanner autoriza el ingreso y crea el CheckIn en la misma transacción Serializable.

DT04 agrega exclusivamente `POST /api/v1/scanner/:staffToken/nominal-access/scan` con `{qrToken}` y
`Idempotency-Key` obligatorio. Resuelve un Assistant principal interno `PENDING`, exige Staff vigente,
Evento `ACTIVE`/`EVENT_DAY`, Mesa/Lugar válidos cuando corresponde y ausencia de CheckIn activo.
No modifica RSVP ni genera ingresos de grupos. Reutiliza CheckIn, reversión, auditoría y realtime.
La FK `(assistantAccessCredentialId,assistantId,eventId)` conserva la identidad del material usado;
la referencia es inmutable. SQL exige credencial no revocada y agregado interno vigente.

Locks: Evento → Staff → credencial → Invitation → Contacto → Assistant → Mesa/Lugar → CheckIn.
El Evento común serializa scan/scan y scan/revoke/reissue; si gana el ingreso, revocación y sustitución
rechazan el Assistant utilizado. Si gana revocación, el token anterior deja de permitir nuevos ingresos.
Revertir utiliza el CheckIn existente y permite un ingreso posterior con material todavía vigente.

La respuesta mínima conserva nombre y Mesa/Lugar del individuo, sin teléfono ni material secreto.
El replay usa el snapshot original de CheckIn y revalida Staff/Evento actuales; no vuelve a crear ingreso,
auditoría ni realtime. La firma de solicitud separa NOMINAL_ACCESS de la selección legacy y liga Staff,
Evento y token completo mediante SHA-256. Las claves globales de CheckIn no pueden cruzar modalidades.

DT04 no habilita asignación nominal de seating, lotes anónimos, Finance, Pricing o UI.
DT06 habilita readiness/activación Provider con agregado vigente completo, sin RSVP ni Finance.
Ver [ACCESS_CONTROL_READINESS_CONTRACT.md](./ACCESS_CONTROL_READINESS_CONTRACT.md).
