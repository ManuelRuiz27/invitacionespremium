# Contrato técnico de QR SVG de Invitación

## Alcance

`InvitationQrService`, integrado en `PublicRsvpModule`, implementa `CODEX-071`: proyecta la disponibilidad
del QR en la vista pública, genera el SVG bajo demanda y expone una resolución interna reutilizable por el
scanner futuro. No crea entidad `Qr`, tabla, FileAsset, archivo en storage ni timestamp de visualización.

Existe un QR por Invitación. El check-in implementado en `CODEX-081` es individual por Asistente.
Quedan fuera mesas, QR de PaseFisicoQR, frontend y cualquier endpoint público que valide directamente
el token QR.

## Token y payload

El único payload codificado es el resultado exacto de:

```ts
InvitationTokenService.issue(
  'QR',
  invitation.id,
  invitation.qrTokenNonce,
  invitation.qrTokenVersion
)
```

El propósito `QR` tiene prefijo y firma separados de `INVITATION`. Los tokens no son intercambiables. El
payload no contiene nombre, teléfono, Evento, Asistentes, mesa, `contactId`, URL pública, token de
Invitación ni datos financieros.

El token QR, nonce y versión nunca se exponen en JSON, headers, errores, auditoría, logs, metadata ni texto
del SVG.

## Vista pública

`GET /api/v1/public/invitations/:invitationToken` incluye `qr` únicamente en vistas `AVAILABLE`:

```json
{
  "qr": {
    "available": true,
    "contentPath": "/api/v1/public/invitations/<token-de-Invitación-codificado>/qr.svg"
  }
}
```

`available` es `true` solo cuando:

- Evento `ACTIVE` o `EVENT_DAY`, activo y no eliminado;
- Invitación y Contacto activos, no eliminados y no cancelados;
- Invitación `CONFIRMED`;
- existe exactamente un Asistente principal activo;
- todos los Asistentes activos están `CONFIRMED`.

`PENDING` y `REJECTED` devuelven `{ "available": false }` sin `contentPath`. Cerrar la Confirmación no
oculta un QR ya confirmado. Las vistas `CANCELLED` y `CLOSED` no contienen el campo `qr`; `ARCHIVED` y el
borrado lógico responden `404`.

## Endpoint SVG

```http
GET /api/v1/public/invitations/:invitationToken/qr.svg
```

No requiere sesión. Verifica el token de Invitación, bloquea Evento e Invitación en ese orden, vuelve a
consultar el agregado dentro de una transacción `Serializable`, comprueba la disponibilidad, emite
internamente el token QR y genera el SVG antes de liberar los locks.

Respuestas:

- token inválido, recurso eliminado o Evento `ARCHIVED`: `404 INVITATION_NOT_FOUND`;
- Invitación pendiente, rechazada o cancelada; Evento cancelado o fuera de `ACTIVE`/`EVENT_DAY`; agregado
  nominal incoherente: `409 QR_NOT_AVAILABLE`;
- fallo del generador o de la validación defensiva: `500 QR_GENERATION_FAILURE`.

Los errores son estables y no incluyen tokens, nonces, UUID internos, PII ni detalles del generador.

## SVG determinista y seguro

La generación usa `qrcode` con parámetros fijos:

- corrección de errores `M`;
- margen de cuatro módulos;
- ancho y alto de `512 × 512`;
- `viewBox` derivado de la matriz QR;
- módulos `#111827` sobre fondo `#FFFFFF`;
- entrada UTF-8.

El resultado contiene exclusivamente el elemento raíz SVG y dos paths vectoriales. Una validación
defensiva rechaza XML/DOCTYPE, `script`, `foreignObject`, `image`, `text`, `metadata`, `style`, event
handlers, `href`, `src`, `url(...)`, referencias externas, estructura inesperada o aparición literal del
token.

La misma Invitación, nonce y versión produce exactamente los mismos bytes y ETag. Cambiar nombres no
cambia el QR; Invitaciones distintas producen SVG distintos. El SVG no se persiste.

Headers:

```http
Content-Type: image/svg+xml; charset=utf-8
Content-Disposition: inline
Content-Length: <bytes UTF-8>
ETag: "sha256-<hash del SVG>"
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'none'
```

El ETag es el SHA-256 de los bytes SVG y no contiene token ni nonce. No se refleja ningún nombre de
archivo.

## Resolución interna

`InvitationQrService.resolveQrToken(qrToken)` devuelve:

```ts
Promise<{ eventId: string; invitationId: string } | null>
```

Verifica propósito `QR`, firma, UUID, nonce, versión y coincidencia con la Invitación. Bajo locks Evento →
Invitación vuelve a validar recursos activos, estado operativo, cancelación, Confirmación y coherencia
nominal. Devuelve `null` para material inválido sin revelar la causa. No existe endpoint HTTP para esta
operación en CODEX-071.

El Scanner comprueba dentro de la misma transacción que el `eventId` resuelto coincide con el Evento
del `StaffToken`; cualquier QR ajeno usa el error no enumerante `SCANNER_QR_NOT_FOUND`.

## Ciclo de vida

- confirmar hace visible y válido el QR ya aprovisionado, sin nonce ni escritura adicional;
- rechazar lo oculta e invalida sin rotar el nonce;
- reconfirmar mientras esté permitido restaura exactamente el mismo SVG/token;
- cerrar la Confirmación no lo invalida;
- cancelar la Invitación lo invalida permanentemente sin eliminar el nonce;
- cancelar, cerrar, archivar o eliminar el Evento lo bloquea;
- reabrir un Evento cerrado a `ACTIVE` o `EVENT_DAY` puede volver a validarlo;
- solo `ACTIVE` y `EVENT_DAY` son operativos.

## Concurrencia, auditoría y privacidad

Las lecturas usan el orden de lock Evento → Invitación, aislamiento `Serializable` y reintentos acotados.
Las carreras con confirmar, rechazar, cancelar, cerrar, reconfirmar y dos lecturas simultáneas se resuelven
según el orden serializado. Nunca se observa un agregado parcial.

Solicitar o resolver un QR no escribe Invitación, Asistente, ledger, comprobante ni auditoría. Las pruebas
usan barreras posteriores a locks reales, sin sleeps ni temporizadores arbitrarios.

## PostgreSQL

Las 22 migraciones existentes ya proporcionan:

- nonce QR único y no vacío;
- versión positiva;
- identidad, nonce, versión y pertenencia inmutables;
- pertenencia Invitación/Contacto/Evento;
- coherencia diferible de Invitación y Asistentes.

CODEX-071 no agrega migración porque el SVG y el token completo no se persisten.

## Frontera posterior

- `CODEX-080`: creación y ciclo de vida de `StaffToken`;
- `CODEX-081`: scanner, selección de Asistentes y check-in individual;
- QR de PaseFisicoQR: módulo y contrato independientes.

CODEX-071 no inicia ninguna de esas tareas.
