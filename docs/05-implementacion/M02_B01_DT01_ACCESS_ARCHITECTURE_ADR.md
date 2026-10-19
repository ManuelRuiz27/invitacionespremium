# M02-B01-DT01 — ADR de arquitectura: control de acceso (decisión de producto ratificada parcialmente)

Estado: **ADR-01/ADR-02 RATIFICADAS EN PRODUCTO — RESTO PROPUESTA TÉCNICA — NO AUTORIZA CÓDIGO**  
Fecha: **2026-10-19**  
Base: [DT00 auditoría estática](./M02_B01_DT00_RUNTIME_AUDIT.md) · [M02-B01 requisitos funcionales aprobados](../01-producto/06B1_M02_B01_ACCESOS_QR_NOMINAL_ANONIMO.md)  
No introduce código ni modifica los contratos de runtime existentes. **Decisión expresa de Product (2026-10-19):** adoptar el servicio funcional `ACCESS_CONTROL` con `NOMINAL` o `ANONYMOUS` como modalidad exclusiva por Evento; preservar `PHYSICAL_QR` vigente sin alterar su semántica. Estos identificadores están **aprobados para la futura implementación**, pero todavía **no existen** como nuevas capacidades en el runtime. La arquitectura restante y la vía financiera se revisarán en tickets posteriores. [Gate SQL](./M02_B01_DT01_SQL_COMPATIBILITY_GATE.md).

## 1. Problema y criterio decisorio

El salón debe operar **Eventos NOMINAL o ANÓNIMO**, uno por Evento, sin diseño Flyer/Flipbook ni RSVP público. Debe reutilizar tenant, Staff, Scanner, capacidad, seating y reportes existentes **sin convertir `Invitation.CONFIRMED` en una confirmación ficticia** y sin tocar el valor histórico de `PHYSICAL_QR` para M01/legacy.

Criterios en orden:

1. preservar seguridad, PostgreSQL, invariantes y regresiones M01;
2. separar derecho de **ingreso** de respuesta **RSVP**;
3. evitar duplicar identidad `Assistant` y `CheckIn` nominal;
4. mantener `PhysicalPass` anónimo sin contacto/identidad;
5. evitar acoplar capacidades funcionales con `CommercialChannel` o licencia;
6. permitir migraciones y rollout de compatibilidad sin romper eventos históricos.

## 2. Arquitectura recomendada — decisiones técnicas propuestas

### ADR-01 — Modalidad explícita en Evento: APROBADA POR PRODUCTO (schema aún no implementado)

Proponer `Event.accessMode?: NOMINAL | ANONYMOUS` (nombre final validado en DTO/Prisma).

- `NULL` para todos los Eventos legacy no M02-B01; **sin backfill inferido desde serviceCode ni precio**.
- Debe ser **obligatorio** cuando el nuevo servicio de control de acceso B01 se elija, y no aplicable en servicios Flyer/Flipbook/Demo legacy.
- Modo seleccionado por Provider en el intake/prepare. `NOMINAL` y `ANONYMOUS` son mutuamente excluyentes dentro del Evento.
- Inmutable tras primeras credenciales emitidas, aun si después se revocan; cambiar requiere nuevo Evento o un futuro procedimiento migratorio especializado.
- API y PostgreSQL deben impedir generación, acceso y check-in de modalidad opuesta.

**Se descarta:** derivar modalidad de `MANAGED`, `ORGANIZATION`, `VENUE`, `ClientType` o precio.

### ADR-02 — Servicio funcional separado y compatibilidad legacy: APROBADA POR PRODUCTO (pricing diferido)

**Decisión aprobada:** crear `ServiceCode.ACCESS_CONTROL` para nuevos eventos B01, con `Event.accessMode` obligatorio. **Conservar** `ServiceCode.PHYSICAL_QR` sin cambios de significado para Eventos históricos. En nuevos eventos `ACCESS_CONTROL + ANONYMOUS` se reutiliza `PhysicalPass`; en `ACCESS_CONTROL + NOMINAL` se reutiliza la identidad Assistant + una credencial individual nueva.

Motivo: `PHYSICAL_QR` actual es intrínsecamente un SKU de pase anónimo; reinterpretarlo como entrada nominal contaminaria el contrato, preflight y reporting de Eventos antiguos.

Cambios posteriores necesarios: enum Prisma + migración, catálogo/seed, compatibilidad del `PhysicalPassesModule` y readiness, contratos de servicios/activación y respuestas Client. **No crear precios, tiers ni cobro en este ADR.** La nueva modalidad Managed Organizaciones se habilitaría mediante preparación/autorización Provider, no simulando el saldo en Ledger.

**Opciones consideradas, no recomendadas:**
- Reutilizar `PHYSICAL_QR` como contenedor también nominal: menos catálogo inicialmente, pero vuelve engañosa la semántica y obliga a excepciones extensas sobre contratos físicos.
- Crear `NOMINAL_QR` y `ANONYMOUS_QR` como dos nuevos ServiceCodes: duplica el catálogo cuando hay una sola capacidad comercial de control de acceso con modos técnicos seleccionables.

**Gate posterior a la decisión (NO bloquea el consenso de producto):** verificar compatibilidad SQL de activación/intake de Managed Organización, ampliar de manera acotada el catálogo y la preparación, validar migraciones y obtener autorización de implementación por ticket. **La aprobación de `ACCESS_CONTROL` no incluye nuevos precios, una tarifa Venue, créditos ni suscripción.** Las condiciones comerciales deberán resolverse en su propia fase. Preservar el funcionamiento y disponibilidad actuales de `PHYSICAL_QR` para legacy.

### ADR-03 — Identidad nominal: REUSE Contact → Invitation (interno) → Assistant

Usar el agregado vigente para registrar el asistente nominal y evitar una segunda entidad `Guest`. Para B01 nominal mínimo, **un Contact principal → una Invitation interna → un Assistant principal**; un `Group` puede agrupar varios Contactos. El B01 no crea QR compartido/familiar.

La `Invitation` interna existe para mantener integridad referencial de `Assistant`/`CheckIn` y compatibilidad operacional. **No se distribuye su link público, no hay diseño, no hay RSVP, y los estados de Invitation/Assistant NO se fuerzan artificialmente a `CONFIRMED`**.

Teléfono opcional **sólo** si `serviceCode=ACCESS_CONTROL` y `accessMode=NOMINAL`. Un teléfono informado sí se valida como E.164. Preservar la validación antigua para todos los demás productos. CSV puede conservar columnas `name,whatsapp_phone,group` permitiendo celda vacía sólo B01 nominal; no romper preview/import legacy.

El agrupamiento en `Group` no crea derechos de ingreso adicionales: uno por Assistant individual.

**Nota de escala:** con esta forma simple un Contact suele representar un asistente; el límite de 150 Contacts/Event sigue siendo efectivo hasta ticket/certificación específicos. No se promete un piloto nominal de >150 personas.

### ADR-04 — Credencial nominal individual: nueva entidad hija ligera

Proponer `AssistantAccessCredential` (nombre tentativo) para B01 nominal, **una vigente por Assistant**. No alterar `Invitation.qrTokenNonce` ni el propósito existente `QR` de las invitaciones M01.

Campos mínimos propuestos:

```text
id UUID
eventId UUID
assistantId UUID
qrTokenNonce / qrTokenVersion     // secreto interno; firma por propósito NOMINAL_ACCESS
issuedAt, issuedByUserId
revokedAt?, revokedByUserId?, revocationReasonCode?
createdAt
```

- FK compuesta `(assistantId,eventId)` hacia Assistant del mismo Evento; vínculo Client/tenant se obtiene del Evento.
- `UNIQUE` parcial de credencial **no revocada** por Assistant; índice en eventId, assistantId, revokedAt.
- Nonce/versión/propósito de firma separados de Invitation, PhysicalPass y Staff; nunca persistir QR completo.
- Reemisión: revocar explícitamente credencial **no usada**, emitir nueva con nonce diferente dentro de transacción; preservar historial/folio y auditoría. Credential con CheckIn activo no se puede revocar/reemitir por el flujo inicial.
- SVG bajo demanda para usuario autenticado y autorizado; QR opaco sin PII; cabeceras `no-store`, `nosniff`, CSP defensiva.
- **No** declarar `usedAt` autoritativo en la credencial: la fuente de ingreso nominal sigue siendo `CheckIn`, evitando un segundo estado susceptible de divergir.

### ADR-05 — Un solo CheckIn nominal, con prueba de credencial

Mantener `CheckIn` como historial de entrada individual por Assistant. Proponer `CheckIn.assistantAccessCredentialId?` con FK compuesta a la credencial vigente del mismo Assistant/Evento para entradas B01. Los CheckIns de Invitation QR de M01 mantienen `NULL` para ese campo.

Separar el **camino de autorización** sin duplicar dominio:

- M01 digital (sin accessMode B01): comportamiento `Invitation.CONFIRMED` + `Assistant.CONFIRMED` sin cambios.
- M02 B01 NOMINAL: valida `ACCESS_CONTROL + NOMINAL`, credencial firmada vigente/no revocada, Staff de ese Evento, Contact/Invitation/Assistant activos, estado de Evento y Mesa/Lugar operativos; **no** exige respuesta RSVP `CONFIRMED`.
- SQL trigger de `CheckIn` debe exigir credencial válida y referencial para la excepción B01. **No aceptar** un `CheckIn` B01 sin referencia de credencial, aunque provenga de la API.
- Conservar el índice único parcial de CheckIn activo por Assistant, idempotencia y reversión del dominio actual; extender snapshots/consulta para la nueva variante sin romper decoder histórico.
- Todas las comprobaciones dentro de transacción serializable con orden estable Evento → Staff → Credencial → Invitation → Contact → Assistant → Mesa/Lugar → CheckIn, documentando locks finales con análisis de deadlocks.

**Interfaz propuesta (NO existente):** operación de Scanner `POST /api/v1/scanner/:staffToken/nominal-access/scan` con `qrToken` + `Idempotency-Key`. Hace ingreso individual atómico y devuelve estado, nombre y Mesa/Lugar mínimos. Mantener `/scanner/:staffToken/scan` + `/check-in` antiguos tal cual. Reutilizar `ScannerModule`, `CheckIn`, auditoría y `StaffToken`, no crear un segundo backend de scanner.

La nueva ruta debe gestionar idempotency-key global y ser segura contra dos dispositivos escaneando simultáneamente. Repetir una misma solicitud confirmada devuelve snapshot estable; un escaneo distinto de un acceso ya usado devuelve estado de rechazo sin generar nueva entrada.

### ADR-06 — PHYSICAL_PASS permanece anónimo

Reutilizar `PhysicalPass` y propósito `PHYSICAL_PASS` existentes. Extender autorización de generación/scan/readiness de forma **acotada** para `ACCESS_CONTROL + ANONYMOUS`, preservando `PHYSICAL_QR` legacy. Una credencial NOMINAL jamás puede pasar por ese path; no se crean Contacts ni CheckIns a partir de un pase.

**Provider prepara el lote en M02 Managed:** añadir superficie administrativa auditada para generación de pases; no permitir a Platform Admin impersonar Organization Planner ni desactivar `assertTechnicalMutationAllowed` global para clientes Managed. Organization Admin/Planner pueden operar listados, descarga/distribución y mesa según contratos, no el builder ni configuración técnica; cualquier autoservicio adicional es decisión M03.

Para RF10 proponer revocación **pre-uso** con marcador explícito `revokedAt/revokedByUserId` y `revocationReasonCode` en `PhysicalPass`, si arqueología SQL confirma la modificación compatible. Revocación invalida scan/SVG y libera capacidad operativa según regla de cupo; folio no se reutiliza, `usedAt` de usados no se altera. Una implementación alternativa con soft delete exige demostrar equivalencia contractual y auditoría; no asumir que `deletedAt` es seguro.

**SQL:** ampliar constraints/triggers a `PHYSICAL_QR legacy` **o** `ACCESS_CONTROL+ANONYMOUS`; garantizar misma Mesa, estado operativo, rango monotónico, bloqueo de revoke vs scan y no sobrecupo.

### ADR-07 — Croquis / seating y capacidad por modalidad

- B01 NOMINAL: ocupar Mesa mediante Assistant vigente, sin utilizar la condición de RSVP `CONFIRMED` para decidir elegibilidad; el permiso de asignación se deriva de pertenencia y credencial B01, con mismo Floorplan/seat/table actual. No crear `FloorplanB01`.
- B01 ANONYMOUS: Mesa (`TABLE`) por pase, sin lugar exacto `SEAT`; preservar `PHYSICAL_QR` legacy.
- Contar de forma coherente según modo: NOMINAL = invitados/asistentes con derecho vigente, ANONYMOUS = pases vigentes no revocados; la ocupación de Mesa debe considerar registros ya utilizados para no liberar físicamente un lugar sólo por cambio de credencial.
- En eventos antiguos coexistentes dejar invariantes actuales; B01 no autoriza mezclar nominal/anónimo.
- No deducir asistencia real de créditos emitidos; métricas de emisión y entradas son distintas.

**DB/readiness:** coherencia de cupos ante generate/revoke/reissue, reducción de capacidad, cambio de mesa, check-in simultáneo; para NOMINAL sin RSVP el readiness exige credenciales válidas y estructura de Mesas cuando Croquis esté habilitado, no `PhysicalPass` ni Diseño.

### ADR-08 — Organización MANAGED: separar Provider setup de operación Cliente

Crear una **capacidad Admin explícita** para intake y activación de `ORGANIZATION + MANAGED + ACCESS_CONTROL`, reusando preparación/event lifecycle y audit. No reutilizar de manera insegura el endpoint de Planner managed que exige `ClientType.PLANNER`, ni la ruta comercial legacy que cobra créditos. Mantener `createdByUserId` como Provider real, `assignedPlannerUserId` como responsable y tenant `clientId` como Organización.

Respetar:
- Provider: crea Evento, define modalidad/capacidad, prepara Croquis y, en ANONYMOUS, los pases; autoriza activación.
- Organization Admin: ve cartera y supervisa; gestiona equipo y cuando su API esté habilitada, operación de invitados/mesas/Staff.
- Organization Planner: sólo eventos asignados; registra/importa invitados nominales, acomoda personas, gestiona distribución y Staff.
- Staff: sólo escanea y devuelve información mínima del propio Evento.

**Crítico:** el funcionamiento actual de `PhysicalPassesService.generate` no está disponible para un Cliente MANAGED por política de perfil; no resolverlo abriendo endpoints técnicos Client globalmente. Conservar `SELF_SERVICE` futuro y no convertir `VENUE` en perfil de permisos.

### ADR-09 — Alcance operacional del MVP

- **Ingresos tardíos:** B01 v1 mantiene alta/importación de Contactos sólo en estados de preparación, hasta decisión posterior; no prometer agregar nombres una vez que el Evento sea ACTIVE/EVENT_DAY. ANONYMOUS puede seguir comportamiento de lotes vigente por Estado donde se permita por contrato.
- **Revocación:** sólo credenciales **sin entrada/uso**; no se implementan reversas físicas usadas; la reversión nominal actual queda en el módulo CheckIn y requiere permisos explícitos.
- **Límites:** pilotos dentro del máximo efectivo de 150 Contactos/Evento para nominal y máximo 3 Staff activos; aforos mayores, offline y escaneo masivo requieren scope de escala/QA aparte.
- **Reportes:** en B01 primero dashboard REST con conteos correctos, no modificar indiscriminadamente PDF Attendance/PhysicalPasses. Aplicar retención/anonimización existente.
- **Entrega:** descarga segura y/o impresión; sin WhatsApp API, tracking de envíos ni almacenamiento público de PDF.
- **Migración legacy:** no backfill de accessMode, no cambio de claves/firma de QR de Invitation/PhysicalPass antiguos, no reescritura de su histórico.

## 3. Diagramas de responsabilidad y datos (PROPUESTOS)

```text
Client (ORGANIZATION, operatingProfile=MANAGED)
   └─ Event (serviceCode=ACCESS_CONTROL, accessMode)
         ├─ NOMINAL
         │    └─ Contact ─ Invitation (interna, RSVP PENDING)
         │                     └─ Assistant ─ AssistantAccessCredential
         │                          ├─ seating existente
         │                          └─ CheckIn (+credentialId)  ← StaffToken
         └─ ANONYMOUS
              └─ PhysicalPass (folio, mesa, token existente, uso único) ← StaffToken

Provider/Admin: setup y activación
Org Admin/Planner: invitados, mesas, entrega, Staff
Scanner: resuelve token por propósito y verifica eventId
```

No dibujar una «tabla Access» genérica que fusiona Assistant y PhysicalPass: generaría cardinalidades, caducidad y auditoría innecesariamente complejas.

## 4. Superficies API/DTO objetivo (PROPOSAL ONLY)

| Operación | Propuesta | Seguridad |
|---|---|---|
| Intake Evento access-only | Extensión Admin MANAGED para Organización con `accessMode` | `PLATFORM_ADMIN` |
| Actualizar modo (pre-credenciales) | Admin-only, bloquea cambio irreversible | `PLATFORM_ADMIN` |
| Registrar/CSV nominados | Adaptar rutas `/events/:id/contacts` según modalidad | Organización autorizada, EventAccessPolicy |
| Emitir/obtener QR nominal | `/events/:id/nominal-access-credentials/...` | Owner autorizado, sin QR en JSON |
| Revocar QR nominal no usado | Operación idempotente por credencial | Owner autorizado, con audit |
| Generar pases anónimos | Admin explícito Provider; reutiliza domain `PhysicalPassesService` | `PLATFORM_ADMIN`, no impersona |
| Obtener SVG/lista de pases | Endpoints actuales con gating por modo | Org Admin/Planner autorizado |
| Revocar pase físico no usado | Nueva operación idempotente sobre PhysicalPass | Rol autorizado según matriz |
| Escanear nominal | `POST /scanner/:staffToken/nominal-access/scan` | StaffToken + Idempotency-Key |
| Escanear anónimo | `POST /scanner/:staffToken/physical-passes/scan` actual | StaffToken + Idempotency-Key |
| Vista de asistencia | REST read-only por Evento y modalidad | Org/Admin/Planner, sin PII anónima |

Los paths nuevos y DTO finales requieren contratos OpenAPI/tickets aprobados. No son rutas implementadas.

## 5. Matriz de estados/invariantes

| Caso | NOMINAL B01 | ANONYMOUS B01 | Legacy |
|---|---|---|---|
| Firma QR | nuevo propósito `NOMINAL_ACCESS` por Assistant | `PHYSICAL_PASS` por pase | `QR` por Invitation / `PHYSICAL_PASS` |
| QR disponible para descarga | credencial vigente durante preparación; validación sólo en Evento operativo | pase vigente imprimible | reglas actuales |
| RSVP requerido | **No** | No | Sí cuando el servicio digital lo requiere |
| Mesa sin Croquis | null | null | contrato del servicio |
| Mesa con Croquis | Assistant seating vigente | TABLE en PhysicalPass | reglas actuales |
| Ingreso válido | `ACTIVE`/`EVENT_DAY` + Staff + credencial no revocada + sin CheckIn activo | `ACTIVE`/`EVENT_DAY` + Staff + pase no usado | reglas actuales |
| Segundo ingreso | `ASSISTANT_ALREADY_CHECKED_IN` o error neutral; replay idempotente | `PHYSICAL_PASS_ALREADY_USED` o replay | reglas actuales |
| Revocación | solo sin CheckIn, histórico retenido | solo sin `usedAt`, folio retenido | no ampliar legacy automáticamente |
| Modo posterior a emisión | bloqueado | bloqueado | `accessMode=NULL` inalterado |

## 6. Reglas de migración segura y QA de aceptación del ADR

1. Migraciones aditivas: `Event.accessMode nullable`, nuevo Servicio no aplicado a Events antiguos; `AssistantAccessCredential`, campo opcional referencial en `CheckIn`, marcador de revocación de PhysicalPass; indices/constraints/trigger en orden con preflight de históricos.
2. Estado legado persiste: `Invitation.qrTokenNonce` y `PhysicalPass.qrTokenNonce` sin tocar, staff token y QR previos continúan siendo verificables.
3. CheckIn trigger: rama legacy intacta y rama B01 NOMINAL sólo con credencial real; una sentencia SQL directa sin derecho comprobado debe fallar.
4. Contact phone: dato nullable ya existe pero chequeos de aplicación y PostgreSQL deben preservarse para legacy; el nuevo nullable es condicional.
5. Idempotencia: generación, cancelación, reemisión, scan/replay e inicio/activación de Evento sin doble efecto; firmas que unan request al actor/evento/credencial.
6. Concurrencia PostgreSQL real: dos scans, scan/revoke, generate/activate, seat assignment/scan, same key other actor, cambio de estado, última capacidad.
7. Regresión M01: RSVP + family invitation QR, design, scanner batch check-in y Finance; regresión `PHYSICAL_QR` anónimo legacy.
8. No modificar contratos de runtime hasta que tickets BUILD implementen y prueben esas rutas, modelos y triggers.
9. Rutas Admin y Client prueban aislamiento, ownership por `assignedPlannerUserId` y ausencia de impersonación; no `createdByUserId` como permiso implícito.
10. Validación presencial en Scanner móvil con conectividad real; sin compromiso de offline y con procedimiento operacional de contingencia.

## 7. Registro de decisiones / gates de aprobación

| ID | Estado | Quién debe ratificar |
|---|---|---|
| ADR-01 Event.accessMode explícito / un modo por Evento | **PRODUCTO APROBADO (2026-10-19)**; DB/API por especificar | Technical Owner para constraints |
| ADR-02 Servicio `ACCESS_CONTROL` nuevo, conservar `PHYSICAL_QR` | **PRODUCTO APROBADO (2026-10-19)**; FINANCE/PRICE BOOK no incluido | Technical Owner para implementación y Finance posterior |
| ADR-03 Reusar Contact→Invitation interna→Assistant | RECOMENDADO | Technical Owner |
| ADR-04 AssistantAccessCredential individual | RECOMENDADO | Technical Owner/Security |
| ADR-05 CheckIn unificado, excepción SQL verificable | RECOMENDADO CON GATE SQL | Technical Owner/Security |
| ADR-06 PhysicalPass Provider/Managed + revocación | RECOMENDADO CON GATE DB | Technical Owner |
| ADR-07 Seating/readiness por modalidad | RECOMENDADO CON GATE FLOORPLAN | Technical Owner |
| ADR-08 Managed Organization Admin paths | RECOMENDADO CON GATE RELEASE | Product + Technical Owner |
| ADR-09 límite de pilot y post-activation | RECOMENDADO, validar necesidad real del salón | Product |

**Resultado DT01:** el esquema funcional `ACCESS_CONTROL + Event.accessMode` quedó ratificado por Product; el resto de la arquitectura sigue siendo propuesta. **NO hay autorización de implementación** hasta revisar y probar las migraciones/triggers en workspace, cerrar decisiones técnicas pendientes y autorizar tickets, prioridad y release M02. El [gate SQL estático](./M02_B01_DT01_SQL_COMPATIBILITY_GATE.md) identifica constraints actuales concretos; la ejecución PostgreSQL sigue pendiente. Si Product decide mantener M02 después de M01, no modificar START_HERE ni roadmap M01 para simular que ya se lanzó.

## 8. Secuencia de CODE handoff al aprobar DT01

1. [`DT02A` — foundation especificada](./M02_B01_DT02A_ACCESS_CONTROL_FOUNDATION.md): Event accessMode + service/Managed Organization Provider intake, preparación de activación **fail-closed hasta DT06**; pruebas de rol, SQL, auditoría y DB. Ticket no autorizado todavía.
2. `DT02B` Contact phone opcional sólo NOMINAL + CSV/provisioning y seating eligibility.
3. `DT03` Credencial QR individual, SVG seguro, revocación idempotente + constraints.
4. `DT04` Scanner nominal + extensión CheckIn y trigger branch, regresiones M01.
5. `DT05` PHYSICAL_QR legacy + ACCESS_CONTROL/ANONYMOUS, Admin generation, revoke no usado.
6. `DT06` Readiness/cupo/seating/revocation frente a carrera.
7. `DT07` Provider/Client/Scanner UI y OpenAPI SDK.
8. `DT08` Conteos operativos y consistencia reportes.
9. `DT09` E2E/UAT con 2 Eventos en la misma Organización y regresión M01.

El orden podrá refinarse por dependencias técnicas reales; ninguna fase autoriza crear nuevas tarifas, anualidades, pasarelas o autoservicio M03.
