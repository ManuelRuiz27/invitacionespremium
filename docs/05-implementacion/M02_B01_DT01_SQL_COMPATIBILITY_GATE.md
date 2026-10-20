# M02-B01 / DT01 — Gate de compatibilidad PostgreSQL para ACCESS_CONTROL

Estado: **REVISIÓN ESTÁTICA DE MIGRACIONES COMPLETADA — PRUEBAS SQL RUNTIME PENDIENTES**  
Fecha: **2026-10-19**  
Decisión de producto: **APROBADO** `ServiceCode.ACCESS_CONTROL` + `Event.accessMode=NOMINAL|ANONYMOUS`; `PHYSICAL_QR` legacy conservado.  
Fuentes: [DT00](./M02_B01_DT00_RUNTIME_AUDIT.md) · [DT01 ADR](./M02_B01_DT01_ACCESS_ARCHITECTURE_ADR.md) · [B01 RF](../01-producto/06B1_M02_B01_ACCESOS_QR_NOMINAL_ANONIMO.md).

## 1. Alcance de la verificación

Inspección **estática** de SQL de migraciones versionadas en `apps/api/prisma/migrations` en `main`. Se inspeccionaron los cuerpos relevantes de triggers y constraints de activación, Contact, Invitation/Assistant, CheckIn, PhysicalPass, pricing y asiento. **No** se aplicaron migraciones ni ejecutaron tests con PostgreSQL. Una prueba runtime SQL aún es gate obligatorio, no se declara realizada.

La decisión sobre `ACCESS_CONTROL` **no** autoriza nuevo Price Book, cobros, suscripción ni alterar CommercialChannel o Managed/Profile como permisos. El alcance de implementación M02 continúa supeditado al ticket explícito.

## 2. Restricciones SQL concretas a actualizar por migración aditiva

| Objeto SQL | Evidencia actual | Evolución exigida para B01 | Regresión prohibida |
|---|---|---|---|
| `service_code` enum | `20260724120000_add_services_pricing/migration.sql`: FLIPBOOK/FLYER/PHYSICAL_QR/DEMO | Agregar `ACCESS_CONTROL` en migración nueva y catálogo/seed idempotente, sin alterar códigos históricos | No renombrar ni reinterpretar `PHYSICAL_QR` |
| `event` / modo | `Event` carece de `accessMode` | Columna nullable para legacy; modo obligatorio **para ACCESS_CONTROL**; modo no aplicable a otros SKU; bloqueo tras primera emisión | No inferir modo del canal VENUE ni backfill de eventos |
| `validate_event_activation_snapshot_references()` | `20260915120000_add_managed_event_activation/migration.sql` exige `ClientType.PLANNER` cuando operatingProfile MANAGED | Permitir de forma acotada `ORGANIZATION+MANAGED+ACCESS_CONTROL`, activado por Platform Admin real y sin snapshots financieros | No permitir Organización Managed con otros SKU por accidente; conservar Planner/M01 |
| `event_activation_snapshot_check` | Misma migración permite snapshot de activación Managed sin precios/recibo | Reutilizar shape actual para nueva combinación si cumple preflight | No crear ledger/recibo ficticio |
| `enforce_commercial_price_service_shape()` | `20260824180000_add_commercial_pricing_v2/migration.sql`: Price V2 canal VENUE **sólo** `PHYSICAL_QR` | Mantener regla vigente; `ACCESS_CONTROL` no obtiene precio VENUE automático | No cambiar Price Book/Finance por esta decisión |
| `contact_anonymization_check` | `20260728050000_add_contacts_import/migration.sql`: Contact no anonimizado exige `name` **y teléfono** | Permitir teléfono NULL **sólo** para `ACCESS_CONTROL+NOMINAL` y seguir exigiendo para otros, validado también en SQL mediante trigger que consulte Evento/Servicio bajo transacción; privacidad/anonimización intacta | No quitar validación E.164 ni permitir teléfonos vacíos en M01 |
| `validate_invitation_assistant_invariants()` y FK | `20260728070000_add_invitations_assistants/migration.sql`: una Invitation por Contact, Assistant principal obligatorio, nonces inmutables | Preservar agregado interno en B01 nominal y conservar estructura sin RSVP ficticio | No crear Assistant sin Invitation ni romper principal |
| `validate_check_in_insert()` | `20260729203000_harden_floorplan_seating/migration.sql`: evento operativo, Staff activo, Invitation **CONFIRMED**, Contact activo, Assistant **CONFIRMED**, Mesa válida si Croquis | Ramificar sólo para `ACCESS_CONTROL+NOMINAL` con credencial por Assistant real, vigente/no revocada y FK; conservar locks, invalidez de Mesa y rama legacy íntegra | No permitir CheckIn B01 sin credencial ni levantar exigencia de confirmación para Flyer/Flipbook |
| `check_in_one_active_per_assistant` | `20260729120000_add_scanner_check_ins/migration.sql`: único activo por Assistant | Conservar índice y reversión; asociar credencial B01 mediante FK opcional compuesta | No crear un segundo CheckIn nominal |
| `validate_physical_pass()` | `20260729233000_harden_physical_passes/migration.sql`: sólo servicio `PHYSICAL_QR`; cupo, Mesa y uso | Añadir condición **OR** `ACCESS_CONTROL+ANONYMOUS`; rechazar NOMINAL; validar revocación pre-uso con cupos | No permitir usar físico bajo Flyer/Flipbook o B01 NOMINAL |
| `protect_physical_pass()` | Inmutabilidad de identidad y primer uso, `deletedAt` bloqueado si ya usado | Agregar revocación auditada/irreversible únicamente pre-uso, sin tocar datos de utilización, numeración o nonce | No liberar cupo consumido/reusar folio |
| `assert_floorplan_shape_capacity()` / seating triggers | `20260729220000_add_physical_passes/migration.sql` cuenta Assistant + PhysicalPass no eliminados; `20260904120000_add_detailed_floorplan_seating` soporta Seat nominal | Cupo y ocupación distinguen derecho vigente, pase cancelado e ingreso histórico; no habilitar Seat exacto para PhysicalPass | No sobrecupo/doble reserva ni posición de pase anónimo en SEAT |

## 3. Requisitos de diseño SQL antes de abrir Codex

1. Hacer inventario de funciones **efectivas más recientes**, porque migraciones posteriores pueden redefinir funciones previas. Confirmar `validate_check_in_insert`, `validate_physical_pass`, `protect_physical_pass`, trigger de seating detallado y guardas de activación contra base migrada, con `pg_get_functiondef` y `pg_get_triggerdef` en entorno de pruebas.
2. La validación condicional de teléfono no se puede lograr con un simple `CHECK` que consulte otra tabla; definir `CHECK` de forma + trigger de elegibilidad que preserve locking e invariantes ante cambio de modo/servicio. Debe quedar prohibido cambiar servicio/modo de un evento que ya tiene registros incompatibles.
3. No inferir autorización del nuevo `ServiceCode`: `ClientOperatingProfile` define preparación Provider vs autoservicio, `Event.accessMode` define dominio B01, y `CommercialChannel` sólo condiciones comerciales.
4. Generación de pases en MANAGED: `PhysicalPassesService.generate()` hoy rechaza MANAGED mediante policy. Proponer **ruta Provider/Admin explícita**, no impersonación ni bypass global del gate.
5. Activación Organization Managed: probar dualidad de guardas en `EventsService.createManagedAdminIntake/activateManagedAdmin` **y SQL**; ambas necesitan habilitación acotada. La nueva rama no puede activar Flyer/Flipbook o PHYSICAL_QR de Organización sin autorización adicional.
6. Revisión de constraints/temporalidad para revocación y reemisión: tokens no se reciclan, unique active credential por Assistant, no modificación de `CheckIn` histórico, idempotencia compatible con replay.
7. Conservación de legacy: `PHYSICAL_QR` continúa siendo un `ServiceCode` válido y mantiene rutas y contratos existentes (no deshabilitar su uso actual); `ACCESS_CONTROL` es exclusivo de nuevos Eventos B01 según autorización expresa. No crear precio `VENUE+ACCESS_CONTROL` todavía.
8. Poner migraciones aditivas bajo revisión de orden, backfill nulo, reversibilidad lógica, datos históricos y pruebas PostgreSQL con SQL directo que fuerce intentos inválidos.

## 4. Matriz de pruebas SQL mínimas para autorizar Build

- [ ] Aplicar migraciones desde baseline limpio y sobre base con datos legacy; verificar `PHYSICAL_QR`, Flyer/Flipbook y M01 intactos.
- [ ] Crear `ACCESS_CONTROL+NOMINAL` de una Organización Managed; rechazar modalidad nula, `ACCESS_CONTROL` de modalidad incorrecta y mezcla de credentials.
- [ ] Probar rechazo de `ACCESS_CONTROL+ANONYMOUS` con AssistantAccessCredential y de `ACCESS_CONTROL+NOMINAL` con PhysicalPass.
- [ ] Crear Contact nominal sin teléfono válido; rechazar Contact sin teléfono en los flujos legacy; validar E.164 al informar.
- [ ] Registrar CheckIn B01 NOMINAL sólo con credencial vigente y Assistant activo; negar INSERT SQL directo sin credencial, revocada, cruzada de Evento o para Staff inválido.
- [ ] Registrar CheckIn M01 sólo tras RSVP confirmado; rechazar PENDING/REJECTED, preservar QR por invitación y reversión.
- [ ] Dos Staff escaneando el mismo QR B01 simultáneamente: un ingreso activo, el otro rechazo/replay, una auditoría.
- [ ] Revocar pase físico sin uso frente a scanner concurrente; confirmar que o revoca o usa, nunca ambos; pase usado es inmutable.
- [ ] Verificar cupo de Evento y Mesa al emitir/revocar/reemitir, con croquis/SEAT y sin croquis.
- [ ] Verificar que el trigger de activación permite `MANAGED+ORGANIZATION+ACCESS_CONTROL` sin créditos, pero rechaza uso de Platform Admin ajeno y otras combinaciones no autorizadas.
- [ ] Verificar que el Price Book VENUE sigue limitado a `PHYSICAL_QR`, que `ACCESS_CONTROL` no cobra automáticamente y que `SELF_SERVICE` no obtiene bypass.
- [ ] Ejecutar `pnpm lint`, `pnpm typecheck`, tests relevantes e integración/e2e/build al iniciar implementación, según AGENTS.

**Condición de cierre:** este documento acredita revisión estática de migraciones, **NO ejecución exitosa de PostgreSQL**. Codex únicamente puede modificar código cuando Product/Technical Owner apruebe el ticket técnico delimitado correspondiente.

## 5. Evidencia runtime limitada a DT02A — 2026-10-19

La autorización explícita de BUILD DT02A permite ejecutar su Foundation. Esta evidencia complementa
la revisión estática anterior; no cierra DT02B–DT09 ni certifica credenciales, Scanner B01 o readiness.

- PostgreSQL local **16.14**, bases efímeras aisladas; sin modificar la base de trabajo del usuario.
- `db:migrate:deploy`: **47 migraciones** aplicadas desde base limpia, incluidas
  `20261019120000_add_access_control_service` y `20261019121000_add_access_control_foundation`.
  El enum se confirma en la primera migración antes de utilizarlo en la segunda.
- `events.integration-spec.ts` reconstruye el baseline previo en otra base temporal, conserva cuatro
  Eventos legacy (Flyer/Flipbook/PHYSICAL_QR/Demo), sus servicios y todo el historial de precios
  (ocho filas V1 y 16 V2), aplica las nuevas migraciones y compara filas. `access_mode` queda NULL;
  no hay backfill ni repricing. Los `ALTER TYPE ... ADD VALUE` históricos se confirman separadamente
  en el harness SQL, conforme a su despliegue por Prisma. La base auxiliar se elimina en `finally`.
- SQL directo verifica INSERT/UPDATE incompatibles, actor, tenant/perfil, asignación obligatoria,
  identidad de Service y cambio de perfil de Client. API y SQL rechazan cambios tras material,
  incluyendo borrado lógico de Contact/Invitation/Assistant y PhysicalPass, y generaciones previas.
- Las escrituras de material se serializan con la edición del Evento mediante el lock de la fila
  padre. Los handlers de preparación reintentan conflictos serializables; no dejan servicio/modo
  híbridos ni snapshots de auditoría anteriores al lock.
- `event-activation.integration-spec.ts` verifica la forma futura Managed Organización dentro de una
  transacción **revertida**, rechaza actor/servicio/snapshot financiero/asignación inválidos y conserva
  checks de estado e inmutabilidad. La API devuelve el 409 temporal sin efectos en ambos modos,
  incluso al forzar READY y al reintentar. No queda ningún Evento B01 activado por el fixture SQL.
- Seed real ejecutado dos veces: cinco servicios con IDs estables, ninguna tarifa ACCESS_CONTROL y
  las mismas 16 reglas V2. `GET /services`, pricing público, cotización y Self-Service no lo ofrecen.

Se consultaron `pg_get_functiondef`, `pg_get_triggerdef` y `pg_get_constraintdef` sobre la base final:
**9 funciones, 28 triggers** de Evento/material y **26 constraints** de Evento. La suite también
inspecciona las definiciones efectivas durante el test de activación. Huellas SHA-256 de las funciones
(devueltas por PostgreSQL, incluyendo formato de `pg_get_functiondef`):

| Función efectiva | SHA-256 |
|---|---|
| `validate_event_access_configuration` | `ffbae9971e1afab57df496a3a0f48a5f53cf6fe450a10d86d272dc543f454920` |
| `validate_event_activation_snapshot_references` | `ebabbbc831120bb78ac42d224f34faa80068dc1d0636f56776163bb865ac5a8a` |
| `validate_check_in_insert` (legacy conservada) | `f73ce6a2f085a1983b719ab7d98252879928eac59fd665913633c8be206552a2` |
| `validate_physical_pass` (legacy conservada) | `588285fd3cb9f90c69cc158b44a6a2de0ec90c0e4b8f8632725abf4895d41a06` |
| `protect_physical_pass` (legacy conservada) | `f50dfcb896d22b68f0bf76e7649807672cf513950f2d10e48929affa65b51703` |

Las pruebas de credenciales nominales, teléfono opcional, revocación B01, aforo por derechos y
activación real de la matriz de §4 continúan diferidas a sus tickets. El gate fail-closed de DT02A
permanece activo hasta DT06. El E2E M01 no pudo iniciarse porque los puertos 3000/5173/5174/5175
estaban ocupados; el harness terminó antes de seeding o mutaciones y no detuvo procesos ajenos.

### Verificación de entrega DT02A

- `pnpm --filter @invitaciones/api db:validate`: exit 0.
- `pnpm lint`, `pnpm typecheck` y `pnpm build`: exit 0.
- `pnpm test`: exit 0; 1,266 casos Vitest en 135 archivos, más los checks Node del SDK.
- Integración: 131 casos de diez suites validados, con reejecuciones completas de Events: 17/17 (exit 0);
  Public RSVP con `--testTimeout=60000`: 10/10 (exit 0). Las otras ocho suites pasaron sin cambios.
  El corpus RSVP superó inicialmente el timeout de 15 segundos del entorno.
  Incluye events, event-activation, services-pricing, operator-intake, contacts, invitations,
  invitation-qr, public-rsvp, scanner y physical-passes.
- `openapi:generate`, SDK `generate`, `generate:check` y `verify:openapi-routes`: exit 0;
  170 rutas verificadas contra 194 operaciones OpenAPI. Los tipos de request de los adapters
  derivan de operaciones/esquemas generados, sin DTOs manuales paralelos.
- Prettier sobre todos los archivos de código modificados y `git diff --check`: exit 0.
  `pnpm format:check` global: exit 2 por artefactos previos sin cambios en `var/`, incluido
  `var/qa/binding/baseline.css` con codificación incompatible. No se modificaron esos artefactos.
- `pnpm test:e2e:managed`: exit 1 antes de mutaciones por los puertos ocupados indicados arriba.
