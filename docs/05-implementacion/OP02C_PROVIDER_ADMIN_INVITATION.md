# OP-02C — Provider-led administrative Invitation capability

Estado: **READY FOR CODE**  
Issue: **#24**  
Ámbito: API de Invitation Design + Hotspots + FileAssets mínimos de Invitación digital.  
Base técnica: OP-02A + OP-02B.  
Workflow: `main` directo; sin branch/PR salvo instrucción expresa.

## 1. Objetivo

Cerrar el último slice técnico de OP-02 para que un `PLATFORM_ADMIN` real pueda preparar la infraestructura de Invitación de un `Client/Event` explícito sin impersonar Planner y sin ampliar su acceso a Contactos, Invitaciones generadas/distribución, RSVP operativo, Seating, Staff o Scanner.

El resultado debe conservar un único dominio de Invitation Design:

```text
Planner ownership actual
        \
         -> InvitationDesignService compartido
        /
Provider target clientId/eventId
```

No crear `InvitationDesignAdminService`, un dominio paralelo ni estrategias genéricas de autorización.

## 2. Fuentes obligatorias

Antes de código leer, en este orden:

1. `AGENTS.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/01-producto/04_OPERATOR_LED_MVP.md`
4. `docs/01-producto/ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md`
5. `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`
6. `docs/05-implementacion/OP01_TECHNICAL_BASELINE.md`
7. `docs/05-implementacion/OP02_PROVIDER_ADMIN_EVENT_SETUP.md`
8. `docs/05-implementacion/OP02B_PROVIDER_ADMIN_FLOORPLAN.md`
9. `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`
10. contratos vigentes de Invitation Design / FileAssets desde `docs/INDEX.md`
11. `docs/05-implementacion/19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`
12. `docs/05-implementacion/14_CODEX_RULES.md`
13. `docs/05-implementacion/14A_OPERATOR_LED_CODEX_RULES.md`
14. GitHub Issue #24.

En caso de contradicción histórica sobre placement de Hotspots en Flipbook, prevalecen
`EVENT_WIZARD_CONTRACT.md` e `INVITATION_DESIGN_CONTRACT.md` vigentes: las acciones pueden vivir en cualquier
página y la portada no es un owner especial.

## 3. Runtime a reutilizar

Reutilizar y adaptar mínimamente:

- `apps/api/src/invitation-design/invitation-design.controller.ts`
- `apps/api/src/invitation-design/invitation-design.service.ts`
- `apps/api/src/invitation-design/invitation-design.dto.ts`
- `apps/api/src/invitation-design/invitation-design.readiness.ts`
- `apps/api/src/invitation-design/invitation-design.module.ts`
- `apps/api/src/file-assets/file-assets.service.ts`
- `apps/api/src/file-assets/file-assets.dto.ts`
- `apps/api/src/file-assets/file-asset-compatibility.ts`
- `apps/api/src/file-assets/file-assets.module.ts`
- `apps/api/src/events/event-access.policy.ts`
- `apps/api/src/audit/**`
- `apps/api/test/invitation-design.integration-spec.ts`
- `apps/api/test/file-assets.integration-spec.ts`
- OpenAPI + `packages/api-client/src/generated/schema.ts`.

Preservar exactamente las reglas existentes de:

- `MUTABLE_EVENT_STATUSES`;
- `ServiceCode.FLYER` / `ServiceCode.FLIPBOOK`;
- un único design activo;
- `CreateFlyerRequestDto`;
- `ReplaceDesignAssetRequestDto`;
- `AddFlipbookPageRequestDto`;
- `ReorderFlipbookPagesRequestDto`;
- límites de 1..10 páginas y orden continuo;
- validación geométrica de Hotspots;
- máximo/semántica de QR Area conforme al contrato vigente;
- URLs externas normalizadas;
- staged asset ownership;
- `claimReadyAssetInTransaction()`;
- `hideOwnedAssetInTransaction()`;
- `resolveDesignReadiness()` como resolver único, adaptando sus reglas al contrato vigente;
- `recomputeDigitalEventPreparationStatus()`;
- `CRITICAL_TRANSACTION_OPTIONS` y retry serializable;
- locks actuales de Event/Design/Page/Hotspot;
- auditoría before/after y acciones actuales.

**No preservar** la restricción histórica de Hotspots en portada/página QR. OP-02C debe adaptar el runtime
compartido para que Flipbook permita acciones en cualquier página, con cardinalidad a nivel diseño y owner por
`pageId` estable.

## 4. Superficie HTTP administrativa de Design

Implementar bajo `PLATFORM_ADMIN`:

```text
GET    /api/v1/admin/clients/:clientId/events/:eventId/design
GET    /api/v1/admin/clients/:clientId/events/:eventId/design/readiness

POST   /api/v1/admin/clients/:clientId/events/:eventId/design/flyer
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/design/flyer/initial-image
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/design/flyer/qr-image

POST   /api/v1/admin/clients/:clientId/events/:eventId/design/flipbook
POST   /api/v1/admin/clients/:clientId/events/:eventId/design/flipbook/pages
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/design/flipbook/pages/reorder
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/design/flipbook/pages/:pageId/asset
DELETE /api/v1/admin/clients/:clientId/events/:eventId/design/flipbook/pages/:pageId

GET    /api/v1/admin/clients/:clientId/events/:eventId/hotspots
POST   /api/v1/admin/clients/:clientId/events/:eventId/hotspots
PATCH  /api/v1/admin/clients/:clientId/events/:eventId/hotspots/:hotspotId
DELETE /api/v1/admin/clients/:clientId/events/:eventId/hotspots/:hotspotId
```

Reutilizar los DTOs/parsers actuales. No crear DTOs V2 ni cambiar payloads de Planner salvo la adaptación
mínima necesaria para que el `PATCH` de Hotspot pueda cambiar de `pageId` dentro del mismo Flipbook si el DTO
actual todavía lo impide.

Se permite un único controlador administrativo estrecho para Design/Hotspots registrado en `InvitationDesignModule`.

## 5. Target administrativo y autorización

Toda ruta administrativa debe:

- usar `@Roles(UserRole.PLATFORM_ADMIN)`;
- usar `@CurrentAuth()` con el usuario real;
- propagar `request.operationId` en toda mutación;
- validar UUID de `clientId`, `eventId`, `pageId` y `hotspotId` según corresponda;
- resolver Event con `id = eventId`, `clientId = clientId`, `deletedAt = null`;
- mantener `service` incluido cuando la operación lo requiere;
- responder `EVENT_NOT_FOUND` ante target inexistente o mismatch sin filtrar existencia.

Prohibido:

- agregar `PLATFORM_ADMIN` al controller Planner;
- fabricar `principal.clientId`;
- fabricar un principal Planner;
- impersonación;
- crear rol `OPERATOR`;
- cambiar `eventOwnedWhere()`;
- crear bypass global de ownership.

La resolución Planner actual debe permanecer intacta.

## 6. Refactor mínimo de InvitationDesignService

Separar únicamente resolución/authorization del target y conservar el núcleo de dominio compartido.

Modelo esperado:

```text
Planner
  requireOwnedEvent(...)
       \
        -> create/replace/page/hotspot/readiness compartidos
       /
Admin
  requireAdministrativeEvent(clientId,eventId,...)
```

Una forma válida es un `InvitationDesignTarget` privado:

```text
{ kind: 'PLANNER' }
{ kind: 'ADMIN', clientId }
```

con helpers privados `requireTargetEvent()` / `lockMutableTargetEvent()`.

No es obligatorio usar exactamente esos nombres.

El principal real sigue entrando a los métodos compartidos para auditoría (`principal.userId`), no para simular ownership Admin.

## 7. FileAssets administrativos de Invitación

### 7.1 Superficie permitida

Implementar exclusivamente:

```text
POST   /api/v1/admin/clients/:clientId/events/:eventId/design/file-assets
GET    /api/v1/admin/clients/:clientId/events/:eventId/design/file-assets
GET    /api/v1/admin/clients/:clientId/events/:eventId/design/file-assets/:fileAssetId/content
DELETE /api/v1/admin/clients/:clientId/events/:eventId/design/file-assets/:fileAssetId
```

No crear `/admin/clients/:clientId/events/:eventId/file-assets` genérico.

### 7.2 Upload contract

Multipart debe aceptar:

- `file`;
- `fileType` restringido estrictamente a:
  - `FLYER_INITIAL_IMAGE`;
  - `FLYER_QR_IMAGE`;
  - `FLIPBOOK_PAGE_IMAGE`.

**No aceptar `ownerType` como autoridad del consumidor.**

El servidor debe derivar `ownerType` desde la taxonomía canónica `FILE_ASSET_COMPATIBILITY`:

- los tipos Flyer deben resolver a `FileAssetOwnerType.FLYER`;
- `FLIPBOOK_PAGE_IMAGE` debe resolver a `FileAssetOwnerType.FLIPBOOK_PAGE`.

No mantener una segunda taxonomía divergente. Si se extrae un helper de compatibilidad, debe derivar de `FILE_ASSET_COMPATIBILITY`.

Si el request intenta incluir `ownerType`, éste no debe ampliar la capability ni cambiar el owner persistido.

### 7.3 Pipeline reutilizado

Usar el pipeline actual:

- `FileImageValidator`;
- JPEG/PNG solamente;
- límite de bytes configurado;
- `storage.generateKey()`;
- staging `UPLOADING`;
- checksum/dimensiones;
- `READY` / `FAILED`;
- cleanup actual;
- auditoría actual;
- estados de preparación vigentes para upload de assets digitales.

No duplicar storage ni validación de imagen.

### 7.4 List/content/delete

Toda lectura o eliminación Admin debe resolver primero el target Event explícito y luego restringir el asset a:

- mismo `clientId`;
- mismo `eventId`;
- `deletedAt = null` para lectura/content;
- uno de los tres `fileType` autorizados;
- combinación `ownerType/fileType` válida según `FILE_ASSET_COMPATIBILITY`.

`content` debe conservar:

- sólo `READY`;
- checksum requerido;
- `Content-Type` real;
- `Content-Length`;
- `ETag`;
- `Content-Disposition: inline`;
- `Cache-Control: private, no-store`;
- `X-Content-Type-Options: nosniff`.

`DELETE` debe conservar:

- soft-delete actual;
- row lock;
- idempotencia actual sobre `DELETED`;
- `FILE_ASSET_ASSOCIATED` cuando `ownerId != null`;
- auditoría con actor Admin real;
- imposibilidad de borrar por esta superficie `FLOORPLAN_IMAGE`, álbum, SVG generados, reportes o Physical Pass.

Se permite un controlador estrecho `AdminInvitationFileAssetsController` dentro de `FileAssetsModule` o una estructura equivalente sin crear un nuevo Nest module.

## 8. Asset ownership e integridad transaccional

Crear/reemplazar Flyer o páginas Flipbook debe seguir dependiendo de:

```text
clientId correcto
+ eventId correcto
+ ownerType correcto
+ fileType correcto
+ ownerId = null
+ READY
+ deletedAt = null
```

Asset de otro Client/Event, tipo incorrecto, owner incorrecto, oculto/eliminado/no READY o ya claimed debe fallar con la semántica existente (`FILE_OWNER_MISMATCH` / equivalente actual).

No debe quedar mutación parcial si falla claim/hide:

- Flyer create fallido => no design parcial;
- Flyer replace fallido => asset anterior sigue vigente;
- add page fallido => no página parcial;
- page replace fallido => asset anterior sigue vigente;
- delete page conserva hide + soft-delete + reorder/renumber actual de páginas;
- delete page elimina lógicamente los Hotspots de esa página en la misma transacción;
- readiness se recalcula dentro de la misma semántica existente.

## 9. Hotspots

La capability Admin reutiliza el mismo dominio que Planner y debe aplicar el contrato vigente:

- `HotspotAction` vigente;
- `HotspotVisualOwnerType` vigente;
- coordenadas normalizadas y bounds;
- URL rules;
- owner compatibility Flyer/Flipbook;
- cualquier página activa de Flipbook puede contener cualquier acción;
- `RSVP`, `LOCATION`, `GIFT_REGISTRY` y `QR_AREA` tienen máximo una instancia activa por diseño Flipbook;
- `QR_AREA` nunca puede existir en más de una página;
- `EXTERNAL_LINK` permite máximo tres instancias activas, cada una con URL propia;
- una acción de Flipbook se asocia por `pageId` estable, nunca por posición;
- reorder conserva Hotspots, geometría y readiness;
- mover una acción entre páginas actualiza owner `pageId` + geometría sin crear un duplicado persistido;
- eliminar una página elimina sus Hotspots y puede degradar readiness si contenía una acción requerida;
- sustituir la imagen conserva Hotspots y coordenadas relativas.

Quedan expresamente obsoletas las reglas de portada obligatoria para `RSVP/LOCATION/GIFT_REGISTRY`, la
restricción de external links a portada/página QR y cualquier constraint de reorder basado en placement por
posición.

No agregar nuevos tipos de hotspot.

## 10. Readiness

`GET .../design/readiness` Admin debe ejecutar el mismo `resolveDesignReadiness()` que Planner.

No copiar blockers ni reglas a otro resolver.

Para Flipbook, el resolver vigente debe considerar completo el diseño cuando:

- existe diseño compatible;
- hay 1..10 páginas activas con orden continuo y assets `READY`;
- existe exactamente un `RSVP` activo válido en cualquier página;
- existe exactamente un `QR_AREA` activo válido en cualquier página.

`LOCATION`, `GIFT_REGISTRY` y `EXTERNAL_LINK` son opcionales para readiness de Flipbook. Reordenar páginas no
altera el resultado. Eliminar una página o Hotspot requerido sí lo recalcula inmediatamente.

Toda mutación actual que llama `recordReadinessChange()` debe seguir haciéndolo y conservar:

- `recomputeDigitalEventPreparationStatus()`;
- acción `INVITATION_DESIGN_READINESS_CHANGED` cuando el estado realmente cambia;
- before/after actuales;
- `operationId`.

No "mejorar" comportamiento histórico no relacionado dentro de OP-02C.

## 11. Auditoría

Para Admin:

```text
actor.type = USER
actor.id   = PLATFORM_ADMIN real userId
clientId   = target Client
 eventId   = target Event
```

Preservar las acciones actuales, incluyendo según operación:

- `INVITATION_DESIGN_FLYER_CREATE`;
- `INVITATION_DESIGN_FLIPBOOK_CREATE`;
- `INVITATION_DESIGN_FLYER_ASSET_REPLACE`;
- `FLIPBOOK_PAGE_CREATE`;
- `FLIPBOOK_PAGE_ASSET_REPLACE`;
- `FLIPBOOK_PAGES_REORDER`;
- delete page actual;
- `HOTSPOT_*` actuales;
- `INVITATION_DESIGN_READINESS_CHANGED`;
- `FILE_ASSET_UPLOAD_READY` / FAILED / HIDE / CLAIM / SOFT_DELETE.

Mover un Hotspot entre páginas usa la auditoría `HOTSPOT_*` existente con before/after que refleje `pageId` y
geometría; no crear una entidad o actor nuevos.

No crear actor `PROVIDER` u `OPERATOR`.

## 12. Frontera negativa obligatoria

OP-02C **NO** autoriza capability Admin para:

- `/contacts/**`;
- `/groups/**`;
- `/invitations/**`;
- distribución/WhatsApp/link;
- Public RSVP;
- cierre/reapertura RSVP;
- `/seating/**`;
- Staff tokens;
- Scanner;
- Álbum;
- Physical Pass;
- Finance/créditos/precios;
- activación/cancelación/cierre del Evento;
- Croquis (ya cubierto por OP-02B, no duplicarlo);
- UI Admin/Client;
- OP-03.

OpenAPI debe demostrar ausencia de nuevas rutas Admin para esas superficies.

## 13. Tests obligatorios

Como mínimo cubrir:

1. Admin GET design del target correcto.
2. Admin GET readiness usa blockers reales.
3. Cross-tenant Client A + Event B => `404 EVENT_NOT_FOUND`.
4. Client inexistente + Event real => misma semántica.
5. Event inexistente => misma semántica.
6. Platform Admin sigue `403` en rutas Planner de Design/Hotspots/FileAssets.
7. Planner actual sigue operando Design sin regresión.
8. Admin upload `FLYER_INITIAL_IMAGE` persiste `ownerType=FLYER`.
9. Admin upload `FLYER_QR_IMAGE` persiste `ownerType=FLYER`.
10. Admin upload `FLIPBOOK_PAGE_IMAGE` persiste `ownerType=FLIPBOOK_PAGE`.
11. Request no puede forzar otro ownerType.
12. Rechazar `FLOORPLAN_IMAGE`.
13. Rechazar `ALBUM_PHOTO_IMAGE`.
14. Rechazar tipos generados/Physical Pass/reportes.
15. Admin list sólo contiene las tres familias autorizadas.
16. Admin content sólo sirve READY asset del target.
17. Admin delete desacoplado funciona y audita.
18. Admin delete asociado devuelve `FILE_ASSET_ASSOCIATED`.
19. Flyer create Admin happy path + claims.
20. Flyer create con foreign asset falla y no deja design parcial.
21. Flyer replace initial conserva hide/claim.
22. Flyer replace QR conserva hide/claim.
23. Flipbook create Admin happy path.
24. Add page conserva límite 10 y claim.
25. Reorder conserva conjunto exacto, `pageId`, Hotspots, geometría y readiness aunque cambie la portada.
26. Replace page asset conserva hide/claim y Hotspots existentes.
27. Delete page elimina sus Hotspots, compacta posiciones y degrada readiness solo si elimina una acción requerida.
28. Hotspot create Admin permite `RSVP`, `LOCATION`, `GIFT_REGISTRY`, `QR_AREA` y `EXTERNAL_LINK` en cualquier página activa.
29. Hotspot update Admin puede mover una acción a otra `pageId` activa y conserva bounds/action/url rules.
30. Hotspot create/update rechaza segunda instancia activa de `RSVP`, `LOCATION`, `GIFT_REGISTRY` o `QR_AREA`; external links siguen limitados a tres.
31. Estado Event incompatible => `INVITATION_DESIGN_EVENT_STATE_LOCKED`.
32. Servicio incompatible => `INVITATION_DESIGN_SERVICE_MISMATCH`.
33. Audit actor es Platform Admin real.
34. Audit usa clientId/eventId/resource/action correctos.
35. `operationId` se conserva.
36. readiness completa/incompleta coincide con flujo Planner equivalente y no depende de portada.
37. OpenAPI contiene todas las rutas Admin autorizadas.
38. OpenAPI no contiene Admin Contacts/Invitations/RSVP/Seating/Scanner.

## 14. QA

Ejecutar primero:

- `invitation-design.integration-spec.ts`;
- `file-assets.integration-spec.ts`;
- Events/readiness afectados si corresponde.

Después:

- API unit;
- OpenAPI generate/check;
- API client generate/check;
- format;
- lint;
- typecheck;
- build;
- integración API relevante/completa donde el entorno lo permita;
- suite global disponible.

Los fallos Client conocidos de `InvitationDistribution.test.tsx` y `ReviewStepDistributionHandoff.test.tsx` deben reportarse separados si continúan existiendo y no fueron tocados.

Cualquier nueva regresión de API/Invitation Design/FileAssets/Events es bloqueante.

## 15. OpenAPI / SDK

Regenerar el contrato normal y `packages/api-client/src/generated/schema.ts`.

No construir todavía un cliente manual Admin de UI salvo que sea parte automática del pipeline existente. OP-02C es backend capability; consumo visual corresponde a OP-03 o ticket posterior.

La deuda heredada HTTP `201 runtime ↔ 200 OpenAPI` no debe ampliarse. Para los nuevos POST, usar decoradores/status coherentes con el runtime real. No reparar en este ticket todos los endpoints Planner heredados salvo necesidad directa.

## 16. Scope permitido

### REUSE

- DTOs y parsers actuales de Design/Hotspot;
- readiness;
- FileAsset pipeline;
- Audit;
- transacciones/locks;
- helpers de ownership de assets.

### ADAPT

- `InvitationDesignService` para target explícito Admin y placement libre de Hotspots en Flipbook;
- `resolveDesignReadiness()` y constraints relacionados con cardinalidad/placement de Flipbook;
- `FileAssetsService` para capability restringida de tres tipos;
- módulos existentes para registrar controllers;
- integración y OpenAPI.

### BUILD

- un controller Admin estrecho de Invitation Design/Hotspots;
- un controller Admin estrecho de Invitation FileAssets;
- parser/DTO técnico mínimo del multipart `fileType` si es necesario.

### NOT NOW

- UI;
- separación Planner/Operator de OP-03;
- Croquis V2 visual;
- Contacts/Invitations/distribution;
- RSVP operativo;
- Seating;
- Staff/Scanner;
- Álbum;
- activación Admin;
- nuevos roles/entidades.

Las migraciones/constraints existentes de Invitation Design **sí pueden adaptarse** cuando sea necesario para
retirar placement por portada y materializar las nuevas cardinalidades; no crear un modelo de datos paralelo.

## 17. Definition of Done

OP-02C queda terminado únicamente si puede demostrarse:

```text
PLATFORM_ADMIN real
+ Client/Event explícitos
+ Flyer y Flipbook realmente configurables
+ assets limitados a tres tipos
+ Hotspots en cualquier página de Flipbook
+ acciones únicas/cardinalidad vigente a nivel design
+ reorder sin pérdida de readiness
+ readiness compartida
+ audit real
+ cross-tenant denial
+ Planner sin regresión
+ ninguna capability operativa extra
```

Tras aprobación de OP-02C, OP-02 puede considerarse cerrado técnicamente y OP-03 queda desbloqueado.