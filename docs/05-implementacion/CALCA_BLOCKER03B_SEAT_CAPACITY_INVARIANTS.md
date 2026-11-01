# CALCA-BLOCKER-03B — Capacidad derivada y transición a SEAT

**Resultado: PASS del ticket.**

Base: `main`, `f842bdb4c343fc6015aca4e16c80c6fcb64dcdae`. Sustituye el intento CALCA-BLOCKER-03 bloqueado por la incompatibilidad SQL. No es recertificación CALCA-06 ni aprobación global de piloto.

## Causa e invariantes

El servicio cambiaba `seatingMode` sin recalcular capacidades; el trigger `sync_floorplan_seat_capacity` sólo se ejecutaba al escribir Seats. Además, las definiciones efectivas de `assert_floorplan_shape_capacity` y `assert_assistant_seating` procedían de `20261020190000_add_anonymous_access_passes`: contaban Assistant y PhysicalPass como ocupación de capacidad también en SEAT. Una Mesa con capacidad 12, cero Seats y una persona pendiente rechazaba capacidad 0. Cinco personas pendientes impedían asignar un Seat aunque hubiera tres lugares libres.

Los contratos detallados §§6/7/10 permiten conservar asignaciones por Mesa como pendientes de precisión; la capacidad SEAT depende exclusivamente de los lugares activos no bloqueados. La corrección mantiene esa distinción en la transacción existente, sin nueva regla de readiness ni eliminación de datos.

## Migración forward

[`20261101170000_align_seat_transition_capacity`](../../apps/api/prisma/migrations/20261101170000_align_seat_transition_capacity/migration.sql) contiene una transacción DDL con dos funciones redefinidas y la ampliación a INSERT del trigger de capacidad de Shapes. Los 55 directorios históricos permanecen idénticos a HEAD.

| Superficie SQL                      | Comportamiento final                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacidad de TABLE en TABLE         | Conserva límite por Assistant activos + PhysicalPass activos/no revocados y los errores existentes                                                   |
| Capacidad de TABLE en SEAT          | Se deriva del count de Seats del mismo Event/Floorplan/Mesa, no borrados ni bloqueados, en INSERT/UPDATE; personas pendientes no imponen mínimo      |
| Eliminar/convertir Mesa ocupada     | Sigue contando todas las referencias operacionales protegidas en ambos modos; la excepción de capacidad no permite borrar o convertir Mesas ocupadas |
| `assert_assistant_seating` en TABLE | Conserva validación de padre y suma de ocupación, incluido PhysicalPass                                                                              |
| `assert_assistant_seating` en SEAT  | Conserva validación de Mesa activa y Event; no usa las personas pendientes como ocupación de capacidad                                               |

Se auditaron también las definiciones efectivas de `sync_floorplan_seat_capacity` y `assert_assistant_floorplan_seat`, ambas de `20260904120000_add_detailed_floorplan_seating`. Permanecen sin cambios: creación/bloqueo/desbloqueo/borrado de Seat actualizan la capacidad; validación de Seat activo/no bloqueado/modo, FK compuesta de parent/Event e índice único de ocupación continúan vigentes. No se habilita cambiar el padre de un Seat mediante DTO ni se amplía esa operación.

La normalización de capacidad al insertar una Mesa en SEAT evita que un valor manual de creación vuelva a persistir sin lugares. No crea Seats ni transforma geometría. No hay backfill: la migración sólo redefine las funciones/trigger; las filas existentes no se reescriben al aplicarla.

## Servicio y compatibilidad

`setSeatingModeAdministrative` mantiene autorización, lock, lifecycle y guarda BLOCKER-02 antes de cualquier cambio. TABLE→SEAT cambia el modo y recalcula todas las TABLE activas mediante SQL acotado a Event/Floorplan, antes de auditoría y recomputación de preparación, dentro de la misma SERIALIZABLE. No escapa un estado intermedio; se preservan UUID, Seats, etiquetas, mappings y asignaciones. SEAT→TABLE conserva su flujo y confirmación; no restaura capacidades manuales anteriores.

`assign-seats` sigue derivando la Mesa desde el Seat y conserva idempotencia/snapshot/publicación. Las rutas genéricas con destino de Mesa positivo continúan rechazadas en SEAT conforme a [BLOCKER-01](./CALCA_BLOCKER01_EXACT_SEAT_UNASSIGN.md). PHYSICAL_QR y ANONYMOUS siguen rechazando SEAT con `PHYSICAL_PASS_TABLE_INVALID`, conservando capacidades 12/24, conforme a [BLOCKER-02](./CALCA_BLOCKER02_PHYSICAL_TABLE_ONLY.md). Sin schema Prisma, endpoint, DTO, SDK, rol, readiness o regla comercial nueva. Sin cambios de UI de producto, Planner o Scanner.

## PostgreSQL y regresiones

| Gate                                                                          | Resultado observado                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: 12/24, cero Seats/personas → SEAT                                          | Capacidades 0/0 en respuesta, DB y GET; cero Seats                                                                                               |
| B: capacidad 12, una persona con Mesa y sin Seat                              | Transición aprobada, capacidad 0, Mesa conservada, Seat NULL                                                                                     |
| C/D: cinco personas pendientes, tres Seats                                    | Capacidad 3, las cinco personas conservan Mesa; asignación exacta por `assign-seats` aprobada con ambos IDs coherentes; replay conserva snapshot |
| E: 10 Seats activos, dos bloqueados; otra Mesa con tres activos y uno borrado | Capacidades 8/3; 14 filas originales de Seats idénticas tras transición                                                                          |
| F: crear/desbloquear/bloquear/borrar                                          | Secuencia 8→9→10→9→8, cada valor igual al count activo/no bloqueado                                                                              |
| G: TABLE, Assistant + PhysicalPass activo                                     | Reducir capacidad por debajo de ocupación y agregar otra persona a Mesa llena siguen rechazados                                                  |
| H: Mesa ocupada TABLE/SEAT                                                    | Borrado API y borrado lógico/cambio de kind por SQL rechazados, incluso con asignación pendiente                                                 |
| I: PHYSICAL_QR y ANONYMOUS                                                    | Cambio SEAT rechazado sin modificar capacidades                                                                                                  |
| J: integridad exacta                                                          | Unicidad, bloqueo/borrado ocupado, movimientos, parent/Event, aislamiento e historial de check-in conservados por casos nuevos e históricos      |
| Mesa creada después de entrar a SEAT                                          | Devuelve capacidad 0; una escritura SQL manual de 99 se normaliza al count (0 o 1), sin fabricar lugares                                         |

Suite final: **56/56 PASS** con PostgreSQL real y un worker, incluidos BLOCKER-01/02. No se cambian timeouts/retries/workers ni se debilitan assertions históricas. [Observaciones estructuradas](./evidence/calca-blocker03b/db-evidence.json).

## Fresh, upgrade y drift

[Verificador reproducible](./evidence/calca-blocker03b/verify-migration.mjs), [resultados](./evidence/calca-blocker03b/migration.json):

- Fresh: las 56 migraciones desde cero, PASS.
- Upgrade: 55 migraciones de HEAD, fixture real con una persona pendiente, reproducción del rechazo antiguo, nueva migración, filas conservadas y transición posterior a capacidad 0, PASS.
- Repetir deploy no aplica nada; la nueva migración figura una sola vez, finalizada y con checksum correcto en ambos casos.
- Prisma validate, igualdad de funciones efectivas fresh/upgrade y drift **base contra cadena de migraciones** con shadow DB propia: PASS, diff vacío.
- Diagnóstico separado SQL↔schema Prisma: el repo ya contiene diferencias de defaults UUID/updatedAt, nombres de índices y FKs anteriores a este ticket. El diff crudo devuelve 2 también en HEAD. Se conserva su SHA y se exige que fresh/upgrade produzcan exactamente el mismo SQL que HEAD: **cero diferencia nueva**. No se declara que el diff crudo sea vacío ni se modifica schema/historia para ocultarlo.

## Reproducción Admin del intento 10

Admin/API/PostgreSQL reales, raster ficticio original y Chromium nativo; cero mocks o inyección de estado/estilos. Se ejecuta sólo un probe independiente, sin ejecutar `certify.mjs` ni modificar la [certificación histórica](./CALCA06_TRACE_MODE_CERTIFICATION.md).

| Estado                                  | 1440×900                                                                                         | 1024×768                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 12/24 → SEAT, cero Seats                | [captura](./evidence/calca-blocker03b/attempts/reproduction/capacity-1440-zero-places.png)       | [captura](./evidence/calca-blocker03b/attempts/reproduction/capacity-1024-zero-places.png)       |
| Una persona pendiente, capacidad 12 → 0 | [captura](./evidence/calca-blocker03b/attempts/reproduction/capacity-1440-pending-precision.png) | [captura](./evidence/calca-blocker03b/attempts/reproduction/capacity-1024-pending-precision.png) |

**4/4 PASS**: «0 asignables · 0 definidos», Mesa de la persona conservada y Seat NULL; cero Seats/POST de Seats. Canvas visible y advertencias informativas; Finalizar sigue habilitado por las reglas existentes. [Resultados y métricas](./evidence/calca-blocker03b/attempts/reproduction/results.json).

## QA y ledger de intentos

API Floorplan unidades **58/58 PASS**; Admin Floorplan/review **149/149 PASS** en la primera ejecución. Lint/typecheck/build **15/15 PASS** (2m35.294s, sin cachés) y scripts de evidencia aprobados; comandos/hashes/resultados en [qa.json](./evidence/calca-blocker03b/qa.json).

La primera suite nueva tuvo 52 aprobados/2 fallos: una expectativa de error inventada en el test de unicidad (el servicio conserva Prisma `P2002`) y un nonce de fixture que incumplía formato. Se corrigieron sólo los tests: siguiente ejecución 54/54; tras agregar la regresión de creación normalizada, 55/55; la comprobación directa adicional de parent/Event, Seats inválidos y Mesa con ocupación exacta termina en 56/56 final. No se suman las ejecuciones repetidas como casos nuevos.

El verificador de migración registró primero el diagnóstico de diferencias SQL/Prisma preexistentes; después fallaron preparaciones nuevas por formato de hash, servicio ya sembrado, checksum READY y asociación de asset. Se corrigieron fixtures respetando los constraints normales. El resultado fresh/upgrade final está separado de todos esos intentos.

Publicación obligatoria de guías: **PASS** en el rerun sin cambios: 39 PNG, PDF 14/21/2 páginas, cinco checks de tooling y verificación final aprobados. Se conserva el contenido nuevo de los PDF Admin/Salón; el PDF de usabilidad se restaura porque sólo variaba metadata. Runtime coincidente con reproducción y guías; cero DB efímeras propias sobrantes. Se registró un primer fallo de recorte del objetivo de aforo, después de aprobar el journey y los PDF; se conserva separado del rerun, sin cambiar recortes, masks ni assertions. No se declara flakiness cero.

## Límites

Quedan fuera selección densa de Seats en Planner, superposición de listas de 100/200 Mesas y todos los P2. No se ejecutan qa:full/DT09/CALCA-06 ni se certifica el piloto global. La recomendación global continúa BLOCKED hasta resolver los otros dos P1 y recertificar por separado.
