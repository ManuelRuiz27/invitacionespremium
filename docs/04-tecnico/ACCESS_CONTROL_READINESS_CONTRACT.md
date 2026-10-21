# Readiness y activación ACCESS_CONTROL — DT06

Estado: **CONTRACT — runtime implementado**. Alcance: Organización activa MANAGED,
servicio ACCESS_CONTROL activo y Planner de Organización vigente asignado en el mismo tenant.
No habilita UI, reportes, licencias ni Finance.

## Autoridad y lectura

`resolveAccessControlReadiness(tx,eventId)` comparte el predicado PostgreSQL
`resolve_access_control_readiness()` con la guarda de primera activación y reutiliza
`resolveFloorplanReadiness()`. No utiliza readiness digital ni el de PHYSICAL_QR.

- `GET /api/v1/events/:eventId/access-readiness`: Organization Admin o Planner asignado.
- `GET /api/v1/admin/clients/:clientId/events/:eventId/access-readiness`: Platform Admin real,
  con coincidencia exacta de Cliente y Evento.

Respuesta: `{complete,accessMode,blockers,activeMaterialCount,capacity}`. Los blockers son códigos
únicos ordenados; no contiene nombres, teléfonos, material criptográfico ni información comercial.
Estas lecturas no cambian estados ni producen auditoría.

## Reglas comunes

Nombre no vacío, tipo social, fecha/hora, zona válida y capacidad positiva son obligatorios.
Se exige Cliente activo MANAGED, servicio activo, asignación válida y material vigente. La primera
activación rechaza cualquier CheckIn histórico (también revertido) o pase utilizado previamente.
No exige diseño, RSVP confirmado, Confirmación habilitada, destinos públicos, regalos, Staff previo,
precio, créditos ni comprobante.

`recomputeAccessControlPreparationStatus()` mantiene:

- DRAFT con datos básicos incompletos;
- CONFIGURED con datos completos y blockers;
- READY_TO_ACTIVATE cuando el resolver está completo.

Respeta las aristas existentes pasando por CONFIGURED cuando corresponde. Se invoca durante edición
de Evento, registro/eliminación/importación nominal, emisión/revocación, cancelación de Invitation y
mutaciones de Croquis/asignaciones. SQL degrada preparación READY al invalidar Cliente, servicio o
Planner. No cambia automáticamente estados operativos, cerrados, cancelados o archivados.
La activación siempre vuelve a leer los requisitos, aunque otra escritura haya forzado READY.

## NOMINAL

Cada Contacto vigente conserva una Invitation interna INDIVIDUAL y un único Assistant principal,
con nombre coherente y respuestas PENDING. Cada Assistant registrado vigente requiere exactamente
una credencial no revocada, del mismo Evento, con nonce y versión válidos. Se cuentan UUID de
Assistant; nombres repetidos y ausencia de teléfono son válidos. Historial revocado no duplica derechos.
Material vigente de una identidad eliminada/anonimizada es inconsistente y debe revocarse.
No admite PhysicalPass, acompañantes ni más de 150 personas/contactos nominales.

SQL y API impiden emitir derechos por encima de capacidad o reducirla por debajo de derechos
vigentes. Un registro pendiente de emisión o sustitución bloquea readiness; no se oculta del checklist.
Las asignaciones existentes siguen perteneciendo al Assistant hasta su desasignación o eliminación.

## ANONYMOUS

Usa exclusivamente PhysicalPass. Los no revocados cuentan como derechos; los utilizados conservan
ocupación, y antes de la primera activación cualquier uso impide readiness. Revocación libera cupo
sin borrar historia. La numeración se comprueba sobre todo el historial, incluidos revocados:
los huecos en la lista vigente son legítimos. No admite agregados nominales ni SEAT.

## Croquis

Sin Croquis, el material vigente no conserva Mesa/Lugar. Con Croquis requiere imagen READY,
Mesas activas del mismo Evento/Croquis y capacidades coherentes. Cada persona/pase vigente debe
tener Mesa válida. NOMINAL conserva TABLE o SEAT; SEAT exige lugar activo, no bloqueado y coherente
con Mesa/Croquis. ANONYMOUS sólo admite TABLE. Se reutilizan las reglas actuales de ocupación,
integridad, inmutabilidad y edición operativa; no se crea otro dominio de seating.

## Activación, SQL y concurrencia

La única activación es el POST Provider existente. Preflight y escritura ocurren en Serializable,
con Evento como primer lock común frente a material, registro y cupo. Los conflictos de PostgreSQL
se reintentan de forma acotada. Readiness incompleto devuelve 409 con código específico y
`details.blockers`; la transacción completa se revierte, incluida auditoría.

La migración `20261020210000_add_access_control_readiness` añade una guarda específica que exige
preparación persistida, Serializable y readiness completo al establecer por primera vez el snapshot.
Rechaza INSERT ya activado, cambios simultáneos de configuración y snapshot inválido. No reemplaza
las guardas históricas de referencias, máquina de estados, completitud o inmutabilidad de M01.
Las guardas de aforo nominal toman el mismo lock de Evento. SQL directo que adquiere primero filas
hijas puede abortar por deadlock/serialización; no obtiene una excepción de integridad.

La activación Managed guarda sólo actor Provider real, servicio, fecha y clave, sin snapshot
financiero, Ledger ni Receipt. `accessActivationResultSnapshot` conserva privadamente la respuesta
original de B01 y queda inmutable; la misma clave/Evento la devuelve incluso tras cierre/cancelación,
sin nueva auditoría. Una clave usada por otro Evento produce conflicto. No se cambia el replay M01.

## Códigos de preparación

Además de los códigos especializados de Croquis:

- EVENT_ACCESS_CONTROL_CONTEXT_INVALID
- EVENT_SERVICE_NOT_AVAILABLE
- EVENT_ACCESS_MODE_INVALID
- EVENT_PLANNER_ASSIGNMENT_INVALID
- EVENT_BASIC_DATA_INCOMPLETE
- EVENT_ACCESS_CAPACITY_EXCEEDED
- EVENT_ACCESS_MATERIAL_MISSING
- EVENT_ACCESS_MATERIAL_INCONSISTENT
- EVENT_ACCESS_CREDENTIAL_MISSING
- EVENT_ACCESS_PRIOR_ENTRY
- EVENT_ACCESS_SEATING_INCOMPLETE
- PHYSICAL_PASS_NUMBERING_INCONSISTENT

## Límite conocido conservado

El trigger histórico de creación de Staff exige al Planner de Organización ser creador del Evento,
mientras ownership API usa asignación. DT06 no amplía permisos de Staff: las pruebas de ingreso real
crean Staff mediante Organization Admin, autorizado por ambas capas. Corregir esa divergencia requiere
el corte correspondiente; no se introduce impersonación ni se debilita el trigger.
