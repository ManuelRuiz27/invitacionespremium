# M02-B01-DT02B — Revisión de implementación

**Estado:** **IMPLEMENTACIÓN VERIFICADA EN GIT; CI EN EJECUCIÓN AL MOMENTO DE LA REVISIÓN**  
**Commit de código:** [`65bcb9dab16bb2cd7a16ad080bb7944334e5eef6`](https://github.com/ManuelRuiz27/invitacionespremium/commit/65bcb9dab16bb2cd7a16ad080bb7944334e5eef6).  
**Fecha:** 2026-10-20. **Alcance:** M02-B01 DT02B; no habilita activación de ACCESS_CONTROL ni emisión de credenciales.  
**Base contrastada:** primer padre según historial GitHub `33ce2be6a12f5ccc01d02dabefc6efc836274b26`.  
**Método:** inspección independiente de commit y código de `main`; **no se reejecutaron pruebas locales en esta revisión**.

## Resultado

DT02B muestra implementación coherente con el alcance de **registro NOMINAL manual/CSV sin teléfono obligatorio**, preservando servicio legacy y bloqueando el flujo de Invitations públicas. La aprobación final del CI debe actualizarse cuando GitHub Actions termine; no inferir «CI aprobado» a partir de las pruebas declaradas por Codex.

## Cambios comprobados

- **Migración PostgreSQL:** `apps/api/prisma/migrations/20261020120000_add_nominal_contact_registration/migration.sql` (96 líneas) instala `validate_contact_event_context()` para teléfono opcional sólo con `ACCESS_CONTROL+NOMINAL`, rechaza Contact en `ANONYMOUS`, mantiene E.164, ajusta `contact_anonymization_check` y agrega `validate_nominal_invitation_material()` sobre Invitation y Assistant (`PENDING`, individual, principal único). Bloqueo de tablas y Evento preserva serialización con DT02A.
- **DTO y API:** `apps/api/src/contacts/contacts.dto.ts` acepta `whatsappPhone?: string|null` sintácticamente y remite su obligatoriedad contextual al Service/DB. `ContactsController` conserva rutas. SDK OpenAPI generado se modificó.
- **Contactos:** `ContactsService.createContact()`, `updateContact()`, `normalizePhone()`, `allowsMissingPhone()` evalúan modalidad desde el Evento bloqueado. `getCsvTemplate()`, `previewImport()`, `normalizeImportRow()` y `commitImport()` conservan columnas `name,whatsapp_phone,group`, admiten celdas vacías sólo NOMINAL y revalidan datos al commit después de un cambio de modalidad. Se preservan límite 150, grupos, idempotencia y privacidad.
- **Agregado nominal interno:** `InvitationProvisioningService.provisionForContact()` crea una Invitation `INDIVIDUAL` con `additionalAssistantLimit=0` y un Assistant principal, ambos `PENDING`; conserva sincronización, borrado lógico y anonimización. `InvitationsService` niega rutas normales a eventos B01 (`INVITATION_INTERNAL_ONLY`) para no exponer `invitationLink`.
- **Público/QR legacy:** `PublicRsvpService.resolveVerifiedInvitation()` exige `event.accessMode=null`; `InvitationQrService.findInvitation()` y `isInvitationQrAvailable()` excluyen Access Control. No se creó un token/QR nominal (reservado a DT03).
- **Tests añadidos:** `apps/api/test/contacts.integration-spec.ts`, `invitations.integration-spec.ts`, `public-rsvp.integration-spec.ts`, `invitation-qr.integration-spec.ts`, `contacts.dto.spec.ts`; hay fixtures nominales dedicados. Incluyen modo/telefonía, privacidad, idempotencia, preview obsoleto, SQL directo, PENDING, bloqueos públicos y regresión legacy.

## QA — distinguir evidencia por procedencia

**Declarado por Codex:** 344 tests unitarios API; 97 de integración; 9 SDK; migraciones PostgreSQL, lint, typecheck, build y generación/verificación OpenAPI/SDK correctos; árbol limpio y push.

**Consultado en GitHub:** commit HEAD en `main` confirmado. [CI DT02B](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39451631591) tenía los jobs `quality` y `flipbook-browser-qa` **in progress** durante esta revisión, sin conclusión entonces. No se atribuye éxito o fracaso hasta consultar su estado final.

**Contexto M01:** en DT02A el `quality` fue verde y `flipbook-browser-qa` falló en Playwright; ese mismo job había fallado en el commit anterior a DT02A. El hecho de que un job ya fuese rojo **no exime comprobar si un nuevo commit introduce regresiones**.

## Gate al siguiente ticket

- **DT03:** credencial nominal individual por Assistant; QR opaco, nonce/version y firma de propósito exclusivos; emisión segura sólo para sujetos/roles autorizados, revocación/rotación e idempotencia; proteger ante SQL directo y concurrencia. **No** reutilizar `Invitation.qrTokenNonce` ni activar ruta legacy; extender `event_has_access_material()` de DT02A al historial nuevo.
- **DT04:** Scanner nominal y CheckIn (RSVP `PENDING` no significa confirmado). **DT03 no debe habilitar Scanner antes del ticket correspondiente**.
- **DT06:** reemplazar el `409 EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED` **sólo** al completar readiness + pruebas por ambos modos.
- Mantener `PHYSICAL_QR` / M01 sin cambios, Price Book intacto, sin licencias, UI, Finance ni nuevas capacidades no autorizadas.

**Siguiente acción de QA:** consultar el estado final de [CI DT02B](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/39451631591) y registrar su conclusión; si CI `quality` falla, no dar DT02B por cerrado aunque la revisión estructural sea favorable.
