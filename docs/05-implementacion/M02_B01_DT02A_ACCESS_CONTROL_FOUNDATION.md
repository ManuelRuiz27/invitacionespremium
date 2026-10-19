# M02-B01-DT02A — Foundation: ACCESS_CONTROL, Event.accessMode y Managed Organización

**Estado:** ESPECIFICACIÓN TÉCNICA CERRADA PARA REVISIÓN / **NO AUTORIZA CÓDIGO**  
**Fecha:** 2026-10-19  
**Tipo:** BUILD propuesto (DB + API + tests; sin cambios UI).  
**Dependencia aprobada a nivel de producto:** `ServiceCode.ACCESS_CONTROL`, `Event.accessMode=NOMINAL|ANONYMOUS`, mantener `PHYSICAL_QR` vigente.  
**Prerequisitos:** [RF B01](../01-producto/06B1_M02_B01_ACCESOS_QR_NOMINAL_ANONIMO.md) · [DT00](./M02_B01_DT00_RUNTIME_AUDIT.md) · [DT01 ADR](./M02_B01_DT01_ACCESS_ARCHITECTURE_ADR.md) · [SQL gate](./M02_B01_DT01_SQL_COMPATIBILITY_GATE.md).

> Este archivo es el **contrato del futuro ticket para Codex**. No se autoriza su ejecución por haber sido redactado. `AGENTS.md` exige ticket y aprobación explícitos para ampliar M02; el objetivo de release vigente sigue siendo M01 Managed.

## 1. Objetivo exacto

Sentar la base segura, multi-tenant y backward-compatible para crear/configurar eventos de **Organización MANAGED** cuya finalidad sea acceso QR (sin diseñar Flyer/Flipbook ni activar RSVP). Definir mediante dato persistido el modo NOMINAL o ANONYMOUS **único por evento**. Preparar la **ruta de activación Provider** para M02 sin ejecutarla antes de que exista readiness real de QR/cupo/mesas en tickets sucesivos.

**DT02A NO entrega un evento ACCESS_CONTROL utilizable para escanear.** La creación debe funcionar; la activación de ACCESS_CONTROL permanece cerrada con error determinista hasta que DT02B/DT03/DT05/DT06 construyan y validen las precondiciones.

## 2. Baseline verificada en código (no asumir funciones nuevas)

| Evidencia en main | Hallazgo actual | Cambio DT02A |
|---|---|---|
| `apps/api/prisma/schema.prisma` | `ServiceCode`: FLIPBOOK, FLYER, PHYSICAL_QR, DEMO; Event sin `accessMode` | Extender enum y Event de forma aditiva |
| `apps/api/scripts/seed-services-pricing.ts` | Seed hace upsert `Object.values(ServiceCode)`; Price Book V2 está definido separadamente | Con nuevo enum, semilla agrega 5.º Service; **no** crear precios nuevos |
| `apps/api/src/events/admin-client-events.controller.ts` | `POST /admin/clients/:clientId/events/managed`; `POST /admin/clients/:clientId/events/:eventId/activate`; `PATCH .../:eventId` | Reusar superficies Provider y sus roles existentes |
| `apps/api/src/events/events.dto.ts` | Managed intake valida servicio pagado, capacity 1–150, Planner UUID; no accessMode | DTO discriminado, OpenAPI y respuesta con modo |
| `apps/api/src/events/events.service.ts` | `createManagedAdminIntake` y `activateManagedAdmin` admiten sólo `ClientType.PLANNER`; `updatePreparation` es común | Permitir **sólo** MANAGED+ORGANIZATION+ACCESS_CONTROL, preservando M01 |
| `apps/api/src/events/event-access.policy.ts` | Org Planner accede a eventos con `assignedPlannerUserId` | Preservar ownership; no usar creador como assigned Planner |
| `apps/api/src/clients/client-operating-profile.policy.ts` | Cliente MANAGED tiene prohibidas mutaciones técnicas Client | No abrir ese gate; Provider usa ruta Admin |
| `apps/api/src/events/event-status.resolver.ts` | Sólo retorna DRAFT/CONFIGURED con checklist incompleto genérico | Nuevo servicio no alcanza READY prematuramente |
| `apps/api/src/events/digital-event-readiness.service.ts` | Sólo FLYER/FLIPBOOK | No invocar readiness digital para ACCESS_CONTROL |
| `apps/api/src/physical-passes/physical-pass-readiness.service.ts` | Sólo PHYSICAL_QR | No reinterpretar PHYSICAL_QR ni activar ACCESS_CONTROL a través de este resolver todavía |
| `apps/api/prisma/migrations/20260915120000_add_managed_event_activation/migration.sql` | Trigger de activación MANAGED exige Client PLANNER, Platform Admin real, sin Finance snapshot | Ampliación **acotada** del trigger para nueva combinación; preservar reglas actuales |
| `apps/api/prisma/migrations/20260824180000_add_commercial_pricing_v2/migration.sql` | Price VENUE V2 acepta únicamente PHYSICAL_QR | **Sin cambio**; ACCESS_CONTROL no es producto precio VENUE automático |
| `apps/api/src/services-pricing/services-pricing.service.ts` | `publicServiceName` hace switch por ServiceCode y existen superficies de precio/descubrimiento | Evitar crash o oferta pública inconsistente al agregarse el enum |
| `apps/api/test/*.integration-spec.ts` | Suites de Events, Managed activation y Services Pricing existentes; tests/expectations de 4 servicios | Ampliar suites sin debilitar regresiones previas |

## 3. Decisiones vinculantes para DT02A

**D02A-01 — Servicio.** Se agrega el valor `ACCESS_CONTROL` al enum `ServiceCode` persistido en PostgreSQL y Prisma. Se asegura entrada `Service` por seed idempotente. `PHYSICAL_QR` continúa activo, diferenciable, con idéntico significado y tokens; no renombrar, migrar ni deshabilitar registros anteriores. No crear precio, promoción, tarifa, crédito, factura, suscripción ni regla VENUE.

**D02A-02 — Modalidad.** Proponer enum Prisma `EventAccessMode { NOMINAL ANONYMOUS }` mapeado a `event_access_mode` y `Event.accessMode EventAccessMode? @map("access_mode")`. Es NULL para todos los eventos legacy, incluso los PHYSICAL_QR. Debe ser `NOMINAL` o `ANONYMOUS` si `Event.serviceId` apunta a un `Service.code=ACCESS_CONTROL`; para un servicio distinto, **debe ser NULL**. Event sin servicio (DRAFT) admite NULL. Persistencia, DTO y DB son autoridad; rechazar mezcla de ambos modos dentro del Evento. No deducirlo de `CommercialChannel`, `ClientOperatingProfile` ni `Client.type`.

**D02A-03 — Alcance de venta/operación inicial.** Nueva combinación permitida **sólo** `Client.type=ORGANIZATION`, `Client.operatingProfile=MANAGED`, `serviceCode=ACCESS_CONTROL` y actor Provider real `PLATFORM_ADMIN`. No convertir ACCESS_CONTROL en opción de creación/activación Self-Service ni M01 por añadir un enum. El Provider crea y configura; el Admin/Planner del salón conserva sólo permisos operativos heredados. Mantener toda capacidad M01 actual de Planner MANAGED con sus SKUs previos.

**D02A-04 — Identidad y asignación.** Nuevo Evento siempre tiene `clientId` Organización, `createdByUserId` = Platform Admin real, `assignedPlannerUserId` = usuario activo `ORGANIZATION_PLANNER` del mismo clientId. **Exigir asignación no nula** para ACCESS_CONTROL; el handler actual permite null en Organización legacy, que no debe cambiar. Cambios/reasignaciones a otro Org Planner autorizado preservan audit; null prohibido en B01. Nadie impersona al Planner.

**D02A-05 — Edición de modalidad.** Provider define acceso al crear. Puede editarlo **sólo** durante preparación, mientras no haya **identidades, invitaciones, asistentes, pases ni material de acceso emitido** (no sólo «pases activos»; impedir cambiar luego de revocar). Aun sin credenciales, impedir cambiar servicio/tenant hacia SKU incompatible con registros o historial; cambios de moda/servicio tras `activatedAt` siempre prohibidos. En DT02A no hay credenciales nominales B01 todavía, pero incorporar guard que otros tickets extiendan sin quitar la protección DB. No crear endpoint Client para editar `accessMode`.

**D02A-06 — Activación fail-closed.** Preservar `activateManagedAdmin` y sus snapshots/idempotencia/transacción; ampliar elegibilidad **sólo para Organización Managed + ACCESS_CONTROL**, sin cobro ni Finance. Sin embargo, hasta integrar readiness B01 en DT06, **toda activación de ACCESS_CONTROL debe fallar ANTES de mutar el Evento**, con error estable por ejemplo `EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` y 409. Nunca aprovechar un `READY_TO_ACTIVATE` insertado manualmente o un preflight que sólo valida datos básicos/croquis para activar ACCESS_CONTROL. No simular credenciales ni RSVP. Al terminar DT06 se sustituirá únicamente este gate temporal por readiness nominal/anónimo autoritativo.

**D02A-07 — Descubrimiento de servicios y capacidad.** Crear entrada de catálogo no equivale a publicarla como precio/compra. Garantizar serialización y manejo exhaustivo de enum en servicios/admin/SDK y evitar selección de ACCESS_CONTROL en venta pública/autoservicio hasta comercial futura. El endpoint Managed Provider puede elegirlo. Conserva `capacity` de entero positivo con tope operativo **1..150** en intake inicial, sin elevar límites nominales ni Staff; el modelo Event permite más pero NO certifica escala.

**D02A-08 — Compatibilidad.** Migración **aditiva**; no backfill ni inferencia de modo, no tocar tokens `QR`/`PHYSICAL_PASS`, historial financiero, Price Book VENUE, Cloud/Scanner ni migraciones pasadas. API/SQL impiden que se cree `ACCESS_CONTROL` para Organizaciones SELF_SERVICE o Planners sin ticket posterior. No modificar `AGENTS.md` o release M01 para declarar M02 activo.

## 4. API / DTO objetivo (extensión de rutas existentes)

### 4.1 Provider — creación de nuevo Evento M02

Ruta que se adapta **sin crear nueva API paralela**:

```http
POST /api/v1/admin/clients/:clientId/events/managed
Content-Type: application/json
```

Ejemplo de nueva variante aceptada (propuesta de contrato):

```json
{
  "name": "Recepción Evento Salón",
  "serviceCode": "ACCESS_CONTROL",
  "accessMode": "NOMINAL",
  "capacity": 120,
  "assignedPlannerUserId": "<UUID-de-ORGANIZATION_PLANNER-del-mismo-client>"
}
```

La modalidad `ANONYMOUS` se indica exactamente del mismo modo. En las variantes M01 actuales `accessMode` se omite y responde `null`. El DTO debe ser **unión discriminada** (por `serviceCode`, no por `commercialChannel`): variantes heredadas y ACCESS_CONTROL, sin campos adicionales ambiguos.

**Respuesta**: reutilizar `EventResponseDto` con `serviceCode`, `accessMode` (null en legacy), `clientId`, `createdByUserId`, `assignedPlannerUserId`, `status`; no campos ni costos ficticios. Inicialmente Evento `DRAFT` por datos básicos faltantes, o `CONFIGURED` una vez completos, **nunca READY** por esta fase.

### 4.2 Provider — configuración durante preparación

```http
PATCH /api/v1/admin/clients/:clientId/events/:eventId
```

- Permitir setear `accessMode` únicamente a Provider y con los guardas D02A-05; el modo es obligatorio para `ACCESS_CONTROL` y nulo para otro servicio, en versión final de cada mutación.
- Conservar validación actual de `serviceId`, capacity, timezone, socialType, fecha y `resetInvitationDesign` donde aplica. El guard de cambio de servicio no puede borrar evidencia de invitaciones/pases para poder efectuar un cambio de modalidad.
- `PATCH /api/v1/events/:eventId` Client con `accessMode` debe fallar por DTO/guard, incluso si se intenta saltar la UI.

### 4.3 Provider — activación preparatoria, aún no habilitada

```http
POST /api/v1/admin/clients/:clientId/events/:eventId/activate
Idempotency-Key: <8..128>
```

- Un Evento `ACCESS_CONTROL` autorizado y `MANAGED+ORGANIZATION` **todavía debe responder 409 readiness no implementada** sin efectos, tanto para NOMINAL como ANONYMOUS.
- Otra Organización / usuario Client / Platform Admin fuera del target: autorización/404 actuales.
- `PHYSICAL_QR`, FLYER y FLIPBOOK de M01 mantienen activación conforme a su contrato.
- La activación sin precio ni recibo para este flujo ya cabe en el shape Managed; actualizar trigger DB de manera restrictiva, **nunca** generalizar a todo MANAGED Organización.

### 4.4 API de catálogo y OpenAPI

- Nueva variante `ServiceCode.ACCESS_CONTROL` en serialización/contratos; nuevo `EventAccessMode` en DTO/API/OpenAPI; generar `packages/api-client` desde contrato OpenAPI (no DTO duplicados).
- Mantener `GET /services` y precios públicos estables: no devolver una tarifa `ACCESS_CONTROL` inexistente ni aceptar `ACCESS_CONTROL` en cotización `VENUE`/self-service.
- Mostrar en Admin sólo el servicio elegible; los cambios de UI Admin quedan en DT07 salvo tipo/SDK/representación mínima indispensable del request.

## 5. Migraciones y reglas SQL obligatorias

**NO editar migraciones anteriores.** Crear migración(es) nuevas en `apps/api/prisma/migrations` con orden compatible con la versión PostgreSQL real. Si `ALTER TYPE service_code ADD VALUE` no se puede usar inmediatamente en la misma transacción, separar commits/migraciones adecuadamente; documentar el despliegue reproducible.

1. Extender `service_code`, crear `event_access_mode` y `event.access_mode NULL`, mantener default implícito NULL para filas históricas.
2. Establecer invariant transaccional **Evento ↔ Service.code**: ACCESS_CONTROL requiere NOMINAL/ANONYMOUS; SKUs legacy requieren null (Event.serviceId null requiere null). Como hay FK `Service`, la validación entre tablas requiere trigger/función o mecanismo equivalente en SQL, no CHECK que hace SELECT a otra tabla. Validar INSERT/UPDATE de `event`, incluidos cambios de `service_id` y de `access_mode`; evaluar bloqueo de UPDATE a `Service.code` (es enum + registro inmutable/gestionado).
3. Imponer elegibilidad nueva `ORGANIZATION+MANAGED+ACCESS_CONTROL` sin relajar Client Planners legacy ni habilitar ACCESS_CONTROL para otros perfiles. Validar a nivel API y SQL el control de tenant y actor cuando corresponda, evitando crear un segundo papel para Provider.
4. Conservar trigger `validate_event_activation_snapshot_references()` existente y añadir rama acotada de Managed Organización+ACCESS_CONTROL, con Platform Admin activo, tenant correcto, servicio real activo, **ningún snapshot Finance/Receipt**, y coherencia de `assignedPlannerUserId`.
5. Congelar `Event.accessMode` tras primer material de acceso o estado activado. Diseñar enforcement SQL inicial sobre relaciones existentes `contact`, `invitation`, `assistant`, `physical_pass`, registro de generaciones; DT03/DT05 ampliarán a credenciales nuevas. **No** confiar sólo en comparación en Frontend.
6. Mantener restricciones de `event_activation_snapshot_check`, `event` state machine/trigger y `PHYSICAL_QR` en su significado original. Verificar funciones SQL efectivas migradas (no sólo el primer archivo que las creó).
7. Seeds idempotentes: `Service` agrega ACCESS_CONTROL, pero `service_price`, promociones, créditos y `commercial_channel` quedan intactos; tampoco se crea un precio de 0 créditos para eludir Finance.

**Gate técnico:** registrar `pg_get_functiondef`, `pg_get_triggerdef` y `pg_get_constraintdef` en test DB, ejecutar inserts/updates SQL maliciosos y conservar evidencia de que constraints no se pueden burlar.

## 6. Matriz de autorización y compatibilidad

| Escenario | Crear ACCESS_CONTROL | Preparar modo | Activar durante DT02A |
|---|---|---|---|
| Platform Admin → Organización MANAGED, Org Planner válido | **Sí** | **Sí**, antes de emitir accesos | **No** (readiness pendiente) |
| Platform Admin → Organización SELF_SERVICE | No | No | No |
| Platform Admin → PLANNER MANAGED | No para ACCESS_CONTROL; M01 normal intacto | No | Activación M01 normal intacta |
| Platform Admin → cualquier Cliente con PHYSICAL_QR legacy | Mantener sólo vías ya autorizadas | accessMode NULL | Mantener reglas vigentes |
| ORGANIZATION_ADMIN / ORGANIZATION_PLANNER en Client | No para nuevo servicio en Managed | No acceso técnico | No |
| INDEPENDENT_PLANNER en Client | No para nuevo servicio | No | Sin cambios a M01 |
| Staff Token | No | No | No |

**Permisos/ownership:** `clientId` y `assignedPlannerUserId` siguen siendo autoridad; `createdByUserId` refleja origen Provider y nunca se usa para conceder acceso al Planner. El org planner debe estar activo, pertenecer a la Organización y tener rol exacto.

## 7. Casos de aceptación (tests obligatorios)

**AC01 — Catálogo:** el seed crea un Service ACCESS_CONTROL activo **una sola vez** tras dos ejecuciones; `PHYSICAL_QR` sigue existiendo y con el mismo ID/semántica. Ningún Price V2 extra ni recibo.

**AC02 — Legacy nulo:** evento Flyer, Flipbook, PHYSICAL_QR o Demo existente conserva `accessMode=NULL`; ninguna actualización histórica agrega modo automáticamente. El nuevo enum no invalida migraciones ni datos existentes.

**AC03 — Intake Provider:** Platform Admin crea por ruta `/admin/clients/:clientId/events/managed` un Evento MANAGED ORGANIZATION ACCESS_CONTROL NOMINAL y otro ANONYMOUS; ambos persisten `serviceId` correcto, modo correcto, `clientId` tenant, `createdByUserId` real y `assignedPlannerUserId` Org Planner válido. Inicio DRAFT, y CONFIGURED cuando datos generales completos.

**AC04 — Negativas de modalidad:** sin `accessMode`, valor inválido, campo enviado para FLYER/FLIPBOOK/PHYSICAL_QR/DEMO, mutación de service/mode incompatible → error explícito sin efectos. INSERT/UPDATE SQL directo tampoco permite mismatch.

**AC05 — Políticas/tenants:** Organizaciones ajenas, Planner ajeno, role incorrecto, client suspendido, `SELF_SERVICE` y PLANNER Managed para ACCESS_CONTROL → rechazo. Client MANAGED no puede invocar `POST /events` técnico ni `PATCH` modo. No impersonación.

**AC06 — Asignación:** Org Planner debe estar activo y del mismo Cliente; null no permitido para ACCESS_CONTROL; reasignación válida auditada; `assignedPlannerUserId` controla acceso de Org Planner. Eventos Org legacy sin Planner no se alteran.

**AC07 — Inmutabilidad:** cambiar `accessMode` o service incompatible tras crear Contact/Invitation/Assistant/PhysicalPass/material o después de activar falla en API y SQL, aun si el registro se borró lógicamente; en estado preparación y sin materiales se permite cambio autorizado sólo si invariantes quedan completos.

**AC08 — Activación fail-closed:** intento real de activar ACCESS_CONTROL NOMINAL o ANONYMOUS mediante Admin responde `409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED`; no cambio a ACTIVE, `activatedAt`, `activationIdempotencyKey`, snapshot ni auditoría de activación, ni consumo de créditos. También falla si se manipula directamente el estado a READY desde un fixture: la API nunca se fía sólo del status.

**AC09 — SQL Managed restrictivo:** trigger de snapshots acepta únicamente forma futura MANAGED Organización ACCESS_CONTROL con actor Provider real y forma financiera vacía (si se ejercita fixture interno controlado para verificar trigger); rechaza actor ajeno, snapshot parcial/financiero y Servicio no concordante. No crear Evento ACTIVE para pruebas de usuario final saltando preflight: fixtures SQL aislados se revierten y nunca quedan persistidos.

**AC10 — Regresión M01:** tests de Managed Planner intake/activation, Flyer/Flipbook, QR físico, invitaciones públicas, scanner legacy y todos los prices 16 V2 continúan pasando; assertions de cuatro servicios se ajustan a **cinco servicios** sin cambiar número de reglas de precio. En `GET /services` no se inventan precios ACCESS_CONTROL.

**AC11 — Idempotencia/atomicidad:** alta auditada y rollback ante falla; reintento de activation no causa efectos; dos requests incompatibles compiten con locks y no dejan modo/servicio en estado híbrido.

**AC12 — OpenAPI/SDK:** esquema `EventResponseDto.accessMode` correctamente opcional-null como proyección `null` para legacy, variantes de creación correctas y SDK generado; lint, typecheck, test integración, build y validación de OpenAPI según repo.

## 8. Archivos de trabajo orientativos (Codex debe verificar antes de editar)

**Modelo/DB**
- `apps/api/prisma/schema.prisma`
- **nueva** migración SQL bajo `apps/api/prisma/migrations/*/migration.sql`
- `apps/api/scripts/seed-services-pricing.ts`

**API/provider**
- `apps/api/src/events/admin-client-events.controller.ts` (reutilizar rutas)
- `apps/api/src/events/events.dto.ts`
- `apps/api/src/events/events.service.ts`
- `apps/api/src/events/event-status.resolver.ts`
- `apps/api/src/events/digital-event-readiness.service.ts` sólo si necesario para asegurar aislamiento
- `apps/api/src/clients/client-operating-profile.policy.ts` **no relajar**
- `apps/api/src/events/event-access.policy.ts` **no reemplazar**
- `apps/api/src/services-pricing/services-pricing.service.ts` (manejar nuevo enum sin crear precio)

**QA y contratos al implementar**
- `apps/api/test/events.integration-spec.ts`
- `apps/api/test/event-activation.integration-spec.ts`
- `apps/api/test/services-pricing.integration-spec.ts`
- `apps/api/src/events/events.dto.spec.ts`
- `packages/api-client` generado por OpenAPI
- `docs/04-tecnico/EVENTS_CONTRACT.md`, `EVENT_ACTIVATION_CONTRACT.md`, `SERVICES_PRICING_CONTRACT.md` (actualizar únicamente con comportamiento realmente implementado; enlazar nuevo contrato de Foundation)
- `docs/05-implementacion/M02_B01_DT01_SQL_COMPATIBILITY_GATE.md` (anexar evidencia real de tests SQL cuando se ejecuten)

Rutas de prueba para ejecutar conforme a README/AGENTS: `pnpm --filter @invitaciones/api db:validate`, tests Vitest focales/API integración con PostgreSQL, generación OpenAPI, `pnpm lint`, `pnpm typecheck`, `pnpm test` o suites relevantes, `pnpm build`, y `pnpm test:e2e:managed` si entorno disponible. Registrar comandos y exit codes, sin afirmar tests no ejecutados.

## 9. Exclusiones estrictas (dejar para tickets sucesivos)

- DT02B: modificar Contactos/CSV/teléfono nullable sólo nominal; Group, Assistant, Invitation provisioning.
- DT03: `AssistantAccessCredential`, tokens nuevos, SVG nominal, revocación/reemisión.
- DT04: Scanner nominal y extensión de CheckIn/triggers.
- DT05: generación Provider de PhysicalPass para ACCESS_CONTROL ANONYMOUS, revocación y Scanner anónimo compatible.
- DT06: readiness completo de modalidades, aforo, mesas, activación **real** y cambio del gate temporal de DT02A.
- DT07: UI Admin/Client/Scanner para usuario final; no diseños Flyer/Flipbook.
- DT08: reportes, dashboard, métricas; DT09: E2E salón con accesos reales y carga.
- Commercial: cotización nueva, suscripción, tiers mensuales/anuales, checkout, créditos/ledger, factura.
- M03: preparación técnica por salón y self-service; M04: alta capacidad/offline; nuevo rol; reescritura del flujo legacy.

## 10. Orden de implementación propuesto y definition of done

1. **Schema/SQL/seed:** acceso de servicio y mode, reglas SQL de integridad, rollback/análisis de compatibilidad histórica.
2. **Managed Provider intake/prepare:** DTO discriminado, actor/tenant/assignment validado, inmutabilidad de modo, audit.
3. **Managed activation foundation:** branch restringido a Organización+ACCESS_CONTROL, trigger SQL actualizado, gate temporal de readiness; cero rutas de bypass.
4. **API/SDK/tests:** catálogo, negativos, concurrencia/idempotencia, regresión M01, evidencia de migración real.
5. **Documentar el runtime real** en contratos; NO marcar B01 completo, no abrir rollout ni cambiar release activa.

**DoD:** AC01–AC12 verdes con evidencia verificable; migraciones PostgreSQL aplicadas sobre DB limpia y DB legacy representativa; ningún cambio indebido en Finance/Pricing; API fail-closed para ACCESS_CONTROL hasta DT06; commit pequeño y push a main por Codex **sólo tras autorización explícita**.

## 11. Prompt operativo para Codex (NO ejecutar hasta aprobación de BUILD)

> Implementa exclusivamente `docs/05-implementacion/M02_B01_DT02A_ACCESS_CONTROL_FOUNDATION.md`, respetando `AGENTS.md` y el alcance de M01. Lee DT00, DT01 y el gate SQL. Añade `ServiceCode.ACCESS_CONTROL`, `Event.accessMode=NOMINAL|ANONYMOUS`, Managed Provider intake para ORGANIZATION con Org Planner asignado, y base de activación **fail-closed** con error 409 hasta DT06. No implementes QR nominal, pases anónimos nuevos, cambios de Phone/CSV, activación de eventos ACCESS_CONTROL reales, Price Book, Finance ni UI. Incluye constraints/triggers PostgreSQL, seed idempotente, OpenAPI/SDK generado y pruebas AC01–AC12. Preserva `PHYSICAL_QR` y todos los flujos M01. Ejecuta tests SQL/API/lint/typecheck/build, registra evidencia y actualiza sólo contratos afectados. Trabaja en `main` conforme a `AGENTS.md`. Si una regla SQL o un trigger vigente imposibilita el ticket sin ampliar dominio a DT03/DT05/DT06, no debilites el constraint: reporta bloqueo específico y limita el cambio a foundation segura.

