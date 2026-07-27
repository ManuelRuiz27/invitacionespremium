# Contrato de ciclo de vida posterior del Evento

## Alcance

`EventsModule` controla los cambios posteriores a la activación: entrada automática al día del Evento,
cierre, reapertura, cancelación y archivado. Estas operaciones no crean movimientos financieros,
comprobantes, refunds ni reversals.

## Estados y transiciones

| Acción | Origen permitido | Destino |
|---|---|---|
| `EVENT_DAY` automática | `ACTIVE` cuya fecha local es hoy | `EVENT_DAY` |
| `CLOSE` | `ACTIVE`, `EVENT_DAY` | `CLOSED` |
| `REOPEN` | `CLOSED` | `EVENT_DAY` si la fecha local es hoy; en otro caso `ACTIVE` |
| `CANCEL` | `DRAFT`, `CONFIGURED`, `READY_TO_ACTIVATE`, `ACTIVE`, `EVENT_DAY` | `CANCELLED` |
| `ARCHIVE` | `CLOSED`, `ALBUM_PUBLISHED` | `ARCHIVED` |

`CANCELLED` y `ARCHIVED` son terminales. Una cancelación conserva datos y, cuando existen, todos los
snapshots de activación. No devuelve créditos ni modifica ledger, balance o deuda.

PostgreSQL admite exclusivamente las transiciones anteriores, además de:

```text
DRAFT -> CONFIGURED
CONFIGURED -> DRAFT
CONFIGURED -> READY_TO_ACTIVATE
READY_TO_ACTIVATE -> CONFIGURED
READY_TO_ACTIVATE -> ACTIVE
CLOSED -> ALBUM_PUBLISHED
```

Asignar nuevamente el mismo estado está permitido para actualizaciones que no sean transiciones. Cualquier
otro cambio, incluido SQL directo, es rechazado por `enforce_event_status_transition`.

## Endpoints

```http
POST /api/v1/events/:eventId/close
POST /api/v1/events/:eventId/reopen
POST /api/v1/events/:eventId/cancel
POST /api/v1/events/:eventId/archive
```

Todos requieren `Idempotency-Key` de 8 a 128 caracteres y responden el `Event` persistido. `cancel` no
recibe cuerpo: el producto todavía no define campos de motivo o mensaje.

## Permisos y ownership

- `INDEPENDENT_PLANNER`: Eventos de su Cliente;
- `ORGANIZATION_ADMIN`: todos los Eventos de su Organización;
- `ORGANIZATION_PLANNER`: únicamente Eventos creados por su usuario dentro de la Organización;
- `PLATFORM_ADMIN`: bloqueado en `/events/**`.

Un Evento inexistente, eliminado lógicamente o fuera del ownership responde `404 EVENT_NOT_FOUND`.

## Atomicidad, concurrencia e idempotencia

Cada transición manual ejecuta con aislamiento PostgreSQL `Serializable`:

1. bloquea el Evento mediante `SELECT ... FOR UPDATE`;
2. vuelve a validar existencia, ownership y estado;
3. actualiza el estado;
4. agrega auditoría;
5. guarda el resultado exacto de idempotencia;
6. confirma todo en una sola transacción.

`EventStateOperation` es una tabla técnica append-only con `eventId`, acción, `idempotencyKey` global y
`resultSnapshot`. Repetir la misma llave para el mismo Evento y acción devuelve exactamente el resultado
guardado. Usarla para otro Evento o acción responde `409 EVENT_STATE_IDEMPOTENCY_CONFLICT`. Triggers
PostgreSQL prohíben actualizar o eliminar operaciones confirmadas.

Las solicitudes concurrentes con la misma llave producen una sola transición y una sola auditoría. Una llave
distinta después de consumar la transición se evalúa contra el estado actual y, si no es válida, responde
`409 EVENT_INVALID_STATE_TRANSITION`.

## Entrada automática a `EVENT_DAY`

Un proceso programado del API evalúa cada minuto Eventos `ACTIVE`. Compara la fecha de `eventDateTime` con
la fecha actual en la zona IANA persistida en `timeZone`; no compara únicamente la fecha UTC.

La transición automática usa actor `SYSTEM`, bloqueo por Evento, aislamiento `Serializable`, auditoría
`EVENT_ENTER_EVENT_DAY` e idempotencia técnica por Evento y fecha local. Ejecutarla repetidamente o en
paralelo no duplica cambios ni auditorías.

## Auditoría y efectos

| Acción | Auditoría | Efecto permitido |
|---|---|---|
| cierre | `EVENT_CLOSE`, actor `USER` | estado |
| reapertura | `EVENT_REOPEN`, actor `USER` | estado |
| cancelación | `EVENT_CANCEL`, actor `USER` | estado |
| archivado | `EVENT_ARCHIVE`, actor `USER` | estado |
| día del Evento | `EVENT_ENTER_EVENT_DAY`, actor `SYSTEM` | estado |

Las mutaciones preservan snapshots de activación y no insertan `LedgerEntry`, `Receipt`,
`DebtPaymentAllocation` ni cambios de `BalanceCache`.

## Integración futura

Quedan diferidos publicación operativa de Álbum, Contactos, Invitaciones, StaffTokens, QR/scanner,
upgrades, refunds y reversals. Al incorporar StaffTokens, cierre, cancelación y archivado deberán expirar
accesos en la misma transacción de estado.
