# M02-B01-DT00 — Auditoría de runtime y contratos

Estado: **COMPLETE — STATIC AUDIT / DOCUMENTACIÓN — NO AUTORIZA CÓDIGO**  
Fecha: **2026-10-19**  
Baseline del código auditado: `main@320b3ed5414ba85ccc467bbe5855a97c47ee5681` (antes de este documento).  
Fuente funcional: [M02-B01](../01-producto/06B1_M02_B01_ACCESOS_QR_NOMINAL_ANONIMO.md)  
Salida asociada: [DT01 — ADR de arquitectura propuesta](./M02_B01_DT01_ACCESS_ARCHITECTURE_ADR.md)

## 1. Dictamen ejecutivo

**Viabilidad: SÍ, mediante adaptación del monorepo existente, pero NO está listo para licenciar o operar directamente como salón Managed.** No requiere un backend separado ni un rol `SALON_OWNER`. Hay **bloqueadores de dominio, seguridad y activación**, además de interfaz.

Hallazgos P0 comprobados leyendo código real:

1. **Managed Organización no se puede dar por implementado:** `EventsService.createManagedAdminIntake()` y `activateManagedAdmin()` validan explícitamente `ClientOperatingProfile.MANAGED` **y** `ClientType.PLANNER`. Los eventos `ORGANIZATION` no pasan esos flujos. La vía de intake comercial existente requiere quote/cobertura financiera.
2. **Generación de pase físico bloqueada en MANAGED:** `PhysicalPassesService.generate()` invoca `ClientOperatingProfilePolicy.assertTechnicalMutationAllowed()`, que rechaza `MANAGED`; `PlatformAdmin` no está autorizado a invocar la ruta Client actual. Se requiere superficie Provider explícita, sin impersonación.
3. **QR nominal actual NO satisface RF03:** `InvitationQrService` emite **un QR por Invitation** con `InvitationResponseStatus.CONFIRMED` y todos los Assistants confirmados; `ScannerService.scan()/checkIn()` trabajan con Invitation y selección de `assistantIds`. RF03 exige **uno por Assistant**, sin RSVP.
4. **Contactos exigen teléfono y acoplan invitación:** DTO de creación exige `whatsappPhone`; `ContactsService` normaliza y su CSV rechaza teléfono vacío; `InvitationProvisioningService.provisionForContact()` crea siempre Invitation + Assistant. El esquema almacena teléfono nullable por anonimización, pero eso **no** significa que el alta pueda omitirlo; hay que inspeccionar/ajustar constraints SQL para nueva modalidad.
5. **Pase anónimo es reutilizable con cambios delimitados:** `PhysicalPass` ya tiene folio, QR firmado, Mesa opcional, primer uso idempotente, auditoría y lock transaccional; está limitado a `ServiceCode.PHYSICAL_QR`. No expone revocación de no usado.
6. **Asignación y check-in actuales no deben reinterpretarse:** `CheckIn` es por Assistant/Invitation; DB y servicio exigen confirmado. Los pases físicos guardan `usedAt` en `PhysicalPass`; no generan `CheckIn`. El nuevo nominal puede **reutilizar** CheckIn, pero debe resolver legalmente sus invariantes y triggers.
7. **Límites efectivos:** `Contacts` bloquea >150 contactos/evento, Admin intake `1..150`, Staff 3 tokens activos/evento y `PHYSICAL_QR` sólo admite Mesa (`TABLE`), no `SEAT`; `Event.capacity` acepta valores mayores pero no certifica operación a escala.
8. **Ownership drift documental:** `EventAccessPolicy.eventOwnedWhere()` comprueba `assignedPlannerUserId` para `ORGANIZATION_PLANNER`; contratos antiguos todavía mencionan `createdByUserId`. El código actual prevalece como observación, y el contrato debe reconciliarse al implementar.

El nuevo M02-B01 requiere un flujo de **accesos** diferenciado de RSVP/diseño, no confirmaciones ficticias ni contactos inventados para los pases.

## 2. Método, validez y límites

- Fuente: repositorio GitHub oficial mediante lectura de archivos `main`, modelos Prisma, contratos especializados y métodos de servicios/DTO.
- **No** se ejecutó la aplicación, Docker, migraciones, suite SQL, tests, navegador, dispositivos físicos ni pruebas de carga. Por ello `EXISTS` significa **implementación observable estática**, no certificación E2E.
- No se verificó exhaustivamente todo el árbol de migraciones/CI; antes de autorizar cambios DB debe realizarse revisión de triggers y suites SQL precisas en el workspace.
- Los contratos técnicos vigentes describen comportamiento actual; B01 describe comportamiento deseado.

Clasificación: **EXISTS** reutilizable; **ADAPT** modificar alcance; **MISSING** nuevo; **CONFLICT** incompatible con invariant actual; **VALIDATE** verificar exhaustivamente DB/test/UI; **OUT** fuera de B01.

## 3. Evidencia por componente

| Componente | Evidencia observada | Estado B01 | Gap/acción |
|---|---|---|---|
| `schema.prisma` | `ClientOperatingProfile`, `CommercialChannel`, `ServiceCode`; `Event` con `clientId`, `assignedPlannerUserId`, service/capacity; sin discriminador B01 por Evento | ADAPT | Modo explícito por Evento y compatibilidad de eventos legacy |
| `event-access.policy.ts` | `clientId` y `assignedPlannerUserId` para Org Planner | EXISTS | Mantener; validar controllers y SQL que no hagan bypass |
| `client-operating-profile.policy.ts` | Rechaza toda mutación técnica Client si MANAGED | EXISTS + CONFLICT | Preservar gate; crear acciones Provider para preparación B01 |
| `events.service.ts` (Managed intake/activate) | Sólo `ClientType.PLANNER`; preflight por diseño Flyer/Flipbook o passes físicos | CONFLICT | Nuevo o ampliado flujo Managed **para ORGANIZATION**, condicionado y testeado |
| `events.dto.ts` | `adminManagedEventIntakeSchema` acepta servicio pagado, capacity 1..150, planner UUID | ADAPT | Soporte de Organización, modo B01 y asignación válida |
| `contacts.dto.ts` y `contacts.service.ts` | teléfono obligatorio; import `name,whatsapp_phone,group`; 150 contactos; mutación sólo preparación | CONFLICT | Teléfono opcional sólo B01 nominal; CSV y constraints; política de invitados tardíos |
| `invitation-provisioning.service.ts` | Contact crea Invitation + Assistant principal PENDING | ADAPT | Reutilizar identidad nominal sin crear experiencia pública ni RSVP ficticio |
| `invitation-qr.service.ts` | QR por Invitation confirmada; propósito `QR`; chequea todos los Assistants | CONFLICT | Credencial QR individual por Assistant, propósito distinto |
| `scanner.service.ts` | scanner invitation-QR, selección múltiple de Assistants confirmados, `CheckIn` único | ADAPT | Entrada individual B01 mediante credencial, sin abrir bypass a M01 |
| `physical-passes.service.ts` | `ServiceCode.PHYSICAL_QR`, lote serializable, folio no reutilizable, mesa TABLE, `usedAt` immutable | EXISTS + ADAPT | Provider generate; modo ANONYMOUS; revocación de no usado y readiness |
| `physical-passes.controller.ts` | generate/list/svg; scanner physical-pass scan; sin revoke | MISSING (RF10) | Endpoint/provider scope contractual nuevo |
| `Floorplan` / `Assistant.floorplanShapeId, floorplanSeatId` | seating nominal detallado; PHYSICAL_QR sólo TABLE; capacidad combinada de Assistant + PhysicalPass | EXISTS + VALIDATE | Condiciones de aforo por modalidad y estado de credencial; QR físico no SEAT |
| `StaffToken` / Scanner | Tokens Event-scoped con máximo 3 activos; estados ACTIVE/EVENT_DAY para operar | EXISTS | Preservar, QA de lectores concurrentes |
| `ServicesPricing` | `ServiceCode=FLIPBOOK/FLYER/PHYSICAL_QR/DEMO`; canal VENUE sólo PHYSICAL_QR | CONFLICT | Acordar service de control de acceso y Managed activation sin alterar comercial |
| `ReportsModule` | ATTENDANCE usa CheckIn, PHYSICAL_PASSES usa `usedAt`; PDF backend | ADAPT | Totales operativos por modo; Client reports UI no equivale a dashboard live |

## 4. Matriz RF01–RF12 (trazabilidad mínima DT00)

| Requerimiento | Diagnóstico | Evidencia primaria | Bloqueo |
|---|---|---|---|
| RF01 modalidad por Evento | MISSING | `schema.prisma:Event`, DTO Event | Persistencia/invariantes, legacy |
| RF02 registro nominal sin teléfono/RSVP | CONFLICT | `contacts.dto/service`, `invitation-provisioning` | Validaciones DTO, SQL, CSV y lifecycle |
| RF03 QR por Assistant | MISSING / CONFLICT | `invitation-qr.service`, `QR_CONTRACT` | QR actual es por Invitation confirmada |
| RF04 pases anónimos | EXISTS / ADAPT | `physical-passes.service` | Gate MANAGED, servicio, Provider |
| RF05 mesas | EXISTS / ADAPT | `schema.prisma` + contratos Floorplan | capacidad/ocupación y servicio |
| RF06 Scanner nominal | CONFLICT | `scanner.service`, `CheckIn` | confirmación RSVP, token por Invitation |
| RF07 Scanner anónimo | EXISTS | `physical-passes.service.scan` | nuevo modo/service debe admitirlo |
| RF08 descarga/entrega | ADAPT | `physical-passes.controller`, QR SVG | nominal sin endpoint seguro; UI Managed |
| RF09 aforo/concurrencia | EXISTS / VALIDATE | `ContactsService.assertCapacity`, PhysicalPass locks | doble conteo y nuevos locks |
| RF10 revocación | MISSING parcial | `PhysicalPass`, controller, invitation cancel | física sin revoke; credencial individual |
| RF11 panel live | MISSING / ADAPT | `REPORTS_CONTRACT`, Client UI audit 06F | proyecciones por modalidad |
| RF12 roles/privacidad/auditoría | EXISTS / VALIDATE | `event-access.policy`, Scanner, Staff, auth | Provider/MANAGED y drift de ownership |

## 5. Hallazgos de integridad a tratar antes de migrar

### 5.1 Nominal: RSVP no equivale a derecho de acceso

`Invitation.responseStatus = CONFIRMED` y `Assistant.responseStatus = CONFIRMED` son condiciones del QR y CheckIn actuales. **No escribirlas artificialmente** para activar acceso sin RSVP. Se necesita una ruta de validación específica, autenticación de credencial y condiciones SQL limitadas al evento B01 nominal; los eventos Flyer/Flipbook siguen intactos.

### 5.2 Invariantes de CheckIn

`CheckIn` tiene FKs a `Event`, `Invitation`, `Assistant` y `StaffToken`; hay índice único parcial de check-in activo por Assistant y trigger que exige invitación/contacto/asistente confirmados. Cualquier reutilización debe conservar esas FKs, verificar un derecho de entrada nominal B01 y **evitar un CHECK-IN sin credencial**. No se aprueba SQL que simplemente suprima el trigger o marque Confirmed globalmente.

### 5.3 PhysicalPass y cancelación

El contrato impone inmutabilidad del primer uso, token/identidad y protección PostgreSQL. El campo `deletedAt` existe, pero no hay revocación pública y no se ha auditado exhaustivamente el trigger para determinar cambios pre-uso válidos. No dar por resuelto RF10 con un simple `update({deletedAt})`: la relación con ocupación, rango y lectura debe especificarse.

### 5.4 Organización Managed

Las políticas Client no autorizan al Provider a llamar una operación Planner. Las rutas Managed Provider actuales son específicas para `ClientType.PLANNER`. Por tanto B01 necesita **capacidad administrativa explícita** para Organización, creación, preparación de credenciales y activación, y preservación del gate del Wizard técnico al cliente.

### 5.5 Cambio de modalidad

No hay discriminador persistido actual. Un enum de modo exclusivo para B01 debe incorporar compatibilidad con legacy, guardas ante credenciales emitidas y blocking DB/API de coexistencia. La UI no es autoridad.

## 6. Tests existentes conocidos por contrato / evidencia pendiente

Contratos actuales describen pruebas de carreras SQL para lotes de `PhysicalPass`, doble escaneo, `CheckIn`, Staff y seating; la lectura de código verifica aislamiento/patrones de locking. **No se han ejecutado ni enumerado íntegramente los archivos `apps/api/test/**` en DT00.**

QA obligatorio antes de cerrar BUILD:

- DB: migración reversible en entorno de pruebas; trigger de titularidad; unicidad de credencial; no mezcla; seeding legacy; inmutabilidad PhysicalPass usado.
- API: roles/tenants; no expone PII/tokens; modalidad y cambio bloqueado; MANAGED Provider-only; límites/CSV.
- Carrera: scan simultáneo nominal; scan-revoke; generate-revoke; mesa-capacidad; cancelación del Evento; timeout/idempotencia.
- Regresión M01: RSVP/PUBLIC_QR por Invitation familiar, check-in seleccionable, activación Managed Planner, edición/asignación de Croquis, Finance legacy.
- Operación: smartphone/cámaras/conectividad; latencia para acceso y concurrencia de 1–3 Staff; sin prometer offline.

## 7. Riesgos priorizados

| Prioridad | Riesgo | Requisito de salida |
|---|---|---|
| CRÍTICO | Abrir nuevo check-in sin RSVP relajando triggers globales | Guard de nuevo propósito/modo **en SQL y API**, FK/credencial |
| CRÍTICO | Usar rutas Client técnicas desde Provider o relajar gate MANAGED | Superficie Admin Provider con autorización real |
| CRÍTICO | Activar Organización con ruta Managed Planner o Finance simulado | Intake/activation organización revisados, separados de Ledger |
| ALTO | Servir un QR por familia cuando RF03 exige uno por asistente | Nueva credencial individual |
| ALTO | Cancelar pases físicos usados o reutilizar folios | Modelo revoke pre-uso auditado |
| ALTO | Ocupación inconsistente tras revoke/reissue | Definición de cupo y triggers por modalidad |
| ALTO | Teléfono opcional sin controles DB/retención | Cambios condicionados a modalidad + QA |
| MEDIO | 150 contactos/3 Staff insuficientes para salones grandes | Limitar pilotos a escala certificada o abrir ticket de escala |
| MEDIO | Drift `createdBy` vs `assignedPlanner` en documentos | Reconciliar contratos + tests |
| MEDIO | UI de reportes/Organización incompleta | Tickets frontend específicos |

## 8. Dictamen y siguiente paso

**DT00 concluido como auditoría estática.** El core es reutilizable; no se autoriza código. Consultar [DT01](./M02_B01_DT01_ACCESS_ARCHITECTURE_ADR.md) para arquitectura recomendada y su status decisional. Antes de que Codex implemente se debe revisar exhaustivamente migraciones/triggers afectados, aprobar ADR y autorizar tickets pequeños. M01 continúa como scope activo de lanzamiento.
