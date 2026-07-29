# Máquina de estados del Evento

## Objetivo

Definir las transiciones válidas del Evento para que backend, frontend, auditoría y pruebas usen la misma lógica.

Este documento complementa `05_REGLAS_NEGOCIO.md`. No sustituye la diferencia entre el estado técnico y el nombre visible en UI.

## Estados técnicos

| Estado técnico      | Nombre visible     | Descripción                                                                                                                                    |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`             | En preparación     | Evento creado con configuración incompleta.                                                                                                    |
| `configured`        | En preparación     | Configuración suficiente para continuar, pero todavía no cumple todos los requisitos de activación. Este estado puede permanecer oculto en UI. |
| `ready_to_activate` | Listo para activar | Cumple todos los requisitos funcionales para activarse.                                                                                        |
| `active`            | Activo             | Evento cobrado y habilitado para enviar invitaciones, confirmar asistencia y generar accesos de staff.                                         |
| `event_day`         | Día del evento     | Evento activo cuya fecha local corresponde al día del evento.                                                                                  |
| `closed`            | Cerrado            | Check-in bloqueado. Puede reabrirse mientras no esté archivado.                                                                                |
| `album_published`   | Álbum publicado    | Evento cerrado con álbum público publicado.                                                                                                    |
| `archived`          | Archivado          | Estado final. Links públicos ocultos y sin reapertura.                                                                                         |
| `cancelled`         | Cancelado          | Evento cancelado; confirmación, QR y tokens quedan bloqueados. Conserva datos y muestra el mensaje público de cancelación.                     |

## Reglas generales

1. Toda transición debe ejecutarse en backend dentro de una transacción.
2. Toda transición debe validar permisos, ownership y estado actual.
3. Toda transición genera registro de auditoría con `before_data`, `after_data`, actor y fecha/hora.
4. Las transiciones que consumen o devuelven créditos deben escribir primero en ledger dentro de la misma transacción.
5. `deleted_at` no es un estado del Evento. El borrado lógico es una acción separada.
6. `configured` y `ready_to_activate` pueden recalcularse por backend cuando cambia la configuración.
7. `event_day` no habilita permisos nuevos: conserva las reglas operativas de un Evento activo y habilita la operación del día del evento.
8. `archived` y `cancelled` son estados terminales para la operación normal.
9. Toda comparación temporal usa la zona horaria configurada en el Evento. La condición semántica de `event_day` es que la fecha local actual sea igual a la fecha local del Evento; el mecanismo técnico puede ser un proceso programado o una recalculación controlada en backend.
10. `cancelled` conserva una vista pública mínima para mostrar el mensaje de cancelación. No habilita Confirmación, QR, Álbum ni check-in.
11. `archived` oculta los accesos públicos de Invitación y Álbum.
12. El workflow Flyer → Flipbook definido en `SERVICE_UPGRADE_FLOW.md` es una operación interna del estado `active`; no crea un estado nuevo ni una transición `active → active` auditable como cambio de estado.
13. Al alcanzar `event_day`, cualquier upgrade pendiente expira sin cobro y el Flyer continúa activo.

## Requisitos para estar listo para activar

### Flipbook o Flyer

- datos básicos completos;
- servicio contratado definido;
- invitación configurada;
- al menos un Contacto/Invitación cargado;
- Confirmación de asistencia configurada;
- croquis/mesas válidos si el módulo fue activado;
- saldo comprado suficiente o línea de crédito disponible;
- Cliente no suspendido;
- ausencia de bloqueos administrativos aplicables.

### QR pase físico

- datos básicos completos;
- servicio contratado definido;
- pases configurados o listos para generarse según el flujo;
- croquis/mesas válidos si el módulo fue activado;
- saldo comprado suficiente o línea de crédito disponible;
- Cliente no suspendido;
- ausencia de bloqueos administrativos aplicables.

El preflight especializado exige además al menos un Pase activo, numeración consistente, total dentro de
`Event.capacity`, ningún uso antes de activar y, con Croquis, Mesa activa para cada Pase sin sobrecupo
combinado con Asistentes. No exige Contactos, Invitaciones, Asistentes, Confirmación, diseño digital,
Hotspots ni Álbum.

Cada actualización autenticada del Evento recalcula esta proyección dentro de la misma transacción. Un
Evento físico con datos básicos incompletos queda `draft`; con datos completos y readiness incompleto,
`configured`; y con readiness completo, `ready_to_activate`. Editar nombre, fecha o zona horaria de un
Evento físico listo no lo degrada mientras las invariantes sigan completas. Flyer y Flipbook conservan
su resolución de preparación propia.

## Tabla de transiciones

| Estado actual       | Acción o condición                                | Estado siguiente       | Actor                                                                                             | Validaciones principales                                                                               | Efectos obligatorios                                                                                                                                                        |
| ------------------- | ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`             | Completar configuración mínima                    | `configured`           | Sistema, después de una edición válida                                                            | Datos mínimos y servicio contratado                                                                    | Auditoría del cambio de estado si se persiste.                                                                                                                              |
| `configured`        | Dejar de cumplir configuración mínima             | `draft`                | Sistema                                                                                           | Recalcular completitud                                                                                 | No borrar datos.                                                                                                                                                            |
| `configured`        | Cumplir todos los requisitos de activación        | `ready_to_activate`    | Sistema                                                                                           | Checklist completo y capacidad financiera disponible                                                   | No consumir créditos todavía.                                                                                                                                               |
| `ready_to_activate` | Dejar de cumplir algún requisito                  | `configured`           | Sistema                                                                                           | Recalcular checklist                                                                                   | No consumir créditos.                                                                                                                                                       |
| `ready_to_activate` | Activar evento                                    | `active`               | Planner independiente, Admin de Organización o Planner de Organización autorizado sobre el Evento | Ownership, Cliente activo, saldo/línea, precio vigente, promoción aplicable, validaciones del servicio | Registrar cobro, ledger, comprobante interno, auditoría y habilitar invitaciones/tokens.                                                                                    |
| `active`            | La fecha local actual alcanza la fecha del Evento | `event_day`            | Sistema                                                                                           | Zona horaria y fecha del Evento                                                                        | Expirar upgrade pendiente si existe, auditar la transición y no duplicar cobros. No crear un evento Socket.IO adicional sin documentarlo en `REALTIME_PAYLOADS.md`.         |
| `active`            | Cerrar operación                                  | `closed`               | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Evento no archivado/cancelado                                                                          | Bloquear check-in y expirar tokens staff.                                                                                                                                   |
| `event_day`         | Cerrar operación                                  | `closed`               | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Evento no archivado/cancelado                                                                          | Bloquear check-in y expirar tokens staff.                                                                                                                                   |
| `closed`            | Reabrir antes de archivar                         | `active` o `event_day` | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | No archivado, no cancelado; elegir destino con la fecha local actual                                   | Reactivar check-in y auditar. Los tokens expirados permanecen expirados; se pueden crear nuevos tokens conforme a StaffAccess. El máximo es tres tokens activos por Evento. |
| `closed`            | Publicar álbum                                    | `album_published`      | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Servicio permite álbum, álbum válido y Evento cerrado                                                  | Generar tokens de álbum separados para Invitaciones elegibles, fijar publicación y expiración a 30 días.                                                                    |
| `album_published`   | Retirar publicación del álbum                     | `closed`               | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Evento no archivado                                                                                    | Expirar tokens de álbum, ocultar acceso público y auditar.                                                                                                                  |
| `album_published`   | Alcanzar la expiración de 30 días                 | `archived`             | Sistema                                                                                           | `album_expires_at` alcanzado                                                                           | Expirar tokens de álbum, ocultar Invitación y Álbum públicos, auditar y bloquear reapertura.                                                                                |
| `closed`            | Archivar                                          | `archived`             | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Evento cerrado                                                                                         | Ocultar links públicos y bloquear reapertura.                                                                                                                               |
| `album_published`   | Archivar anticipadamente                          | `archived`             | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Evento con álbum publicado                                                                             | Expirar tokens de álbum, ocultar Invitación y Álbum públicos y bloquear reapertura.                                                                                         |
| `draft`             | Cancelar                                          | `cancelled`            | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Ownership                                                                                              | Conservar datos y auditar. No hay devolución automática.                                                                                                                    |
| `configured`        | Cancelar                                          | `cancelled`            | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Ownership                                                                                              | Conservar datos y auditar. No hay devolución automática.                                                                                                                    |
| `ready_to_activate` | Cancelar                                          | `cancelled`            | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Ownership                                                                                              | Conservar datos y auditar. No hay devolución automática.                                                                                                                    |
| `active`            | Cancelar                                          | `cancelled`            | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Ownership                                                                                              | Cancelar upgrade pendiente si existe, bloquear Confirmación y QR, expirar tokens staff y mostrar mensaje público. Devolución solo manual por Platform Admin.                |
| `event_day`         | Cancelar                                          | `cancelled`            | Planner independiente, Admin de Organización o Planner de Organización autorizado                 | Ownership                                                                                              | Bloquear check-in, Confirmación y QR; expirar tokens staff y mostrar mensaje público. Devolución solo manual por Platform Admin.                                            |

## Workflow sin cambio de estado: Flyer → Flipbook

Con Evento `active` y antes de `event_day`:

- preparar upgrade mantiene `status=active`;
- configurar/preview privado mantiene `status=active`;
- cancelar preparación mantiene `status=active`;
- confirmar upgrade mantiene `status=active` y cambia únicamente servicio/diseño activo dentro de una transacción financiera;
- expirar preparación al llegar `event_day` no reemplaza la transición normal a `event_day`.

Toda la lógica se rige por `SERVICE_UPGRADE_FLOW.md`.

## Transiciones prohibidas

Estas transiciones deben responder con error de dominio y no modificar el Evento:

- `archived` → cualquier otro estado;
- `cancelled` → cualquier otro estado;
- `draft` o `configured` → `active` sin pasar validaciones de activación;
- `active` o `event_day` → `archived` sin cierre previo;
- `ready_to_activate` → `closed`;
- `closed` → `cancelled` como operación normal;
- cualquier transición que omita ledger cuando existe efecto financiero.

## Borrado lógico

El borrado lógico:

- puede aplicarse a Eventos en preparación, cerrados, archivados o cancelados según permisos;
- no cambia `status`;
- establece `deleted_at`;
- oculta el Evento al Planner;
- conserva auditoría y movimientos financieros;
- solo Platform Admin puede restaurarlo.

## Confirmación de asistencia

El estado de la Confirmación de asistencia no debe confundirse con el estado del Evento.

Un Evento `active` o `event_day` puede tener la Confirmación de asistencia abierta o cerrada. Cerrar la
Confirmación no cierra el Evento. Close/reopen bloquean la fila y solo alternan el par completo
`confirmation_closed_at`/`confirmation_closed_by_user_id`; repetir el estado actual es idempotente.

Mientras está abierta, el token de Invitación puede confirmar, rechazar o reconciliar acompañantes. Al
cerrarla, solo el usuario operativo con ownership puede aplicar un override nominal. `closed`,
`album_published`, `archived` y `cancelled` no aceptan una nueva transición de Confirmación.

## Códigos de error de dominio recomendados

- `EVENT_INVALID_STATE_TRANSITION`
- `EVENT_NOT_READY_TO_ACTIVATE`
- `EVENT_ALREADY_TERMINAL`
- `EVENT_CLIENT_SUSPENDED`
- `EVENT_INSUFFICIENT_CREDITS`
- `EVENT_CREDIT_LINE_UNAVAILABLE`
- `EVENT_FLOORPLAN_INCOMPLETE`
- `EVENT_FORBIDDEN`

Los errores específicos del upgrade se definen en `SERVICE_UPGRADE_FLOW.md`.

Los nombres pueden mapearse al estándar de errores del API, pero no deben perder su significado.

## Efecto StaffToken

Las transiciones operativas a `closed` o `cancelled` expiran, con un solo timestamp, todos los
StaffTokens activos dentro de la transacción del Evento. Un fallo de expiración/auditoría revierte la
transición. `closed → active|event_day` conserva `expiredAt`; cerrar Confirmación o cancelar una
Invitación no tiene este efecto.

## Efecto Scanner y CheckIn

`active` y `event_day` permiten scan, búsqueda y nuevas entradas. `closed` bloquea nuevas entradas pero
permite reversión autenticada; `album_published`, `archived`, `cancelled` y borrado lógico bloquean
también la reversión. Si una transición obtiene primero el lock del Evento, toda operación Scanner
posterior vuelve a validar y se rechaza; si el check-in obtuvo primero los locks, concluye atómicamente.

El timestamp persistido se obtiene con `clock_timestamp()` después de adquirir el lock del Evento. El
mismo valor se usa en todo el lote y en su auditoría, de modo que `expiredAt >= createdAt` aun cuando
una creación confirme mientras el cierre o la cancelación esperaba el lock. La fecha de resolución de
una reapertura permanece separada de este reloj de commit.
