# OP-01 — Technical baseline and surface map

Status: `TECHNICAL DISCOVERY`  
Scope: runtime archaeology only; no product behavior changes  
Canonical repository: `ManuelRuiz27/invitacionespremium`  
Baseline inspected: `main` at `c9314fff0f4bca9d257ed8104bcb8ad3506bf66b`  
Date: 2026-08-13

## Method and evidence rule

The mandatory contracts for OP-01 were read before code, in the order required by the ticket. Runtime conclusions below are based on canonical-repository paths, controllers, services, API-client functions and tests. The legacy repository was not consulted.

A capability is classified only as:

- **REUSE**: exists and its domain/behavior can remain essentially unchanged.
- **ADAPT**: exists but the operator-led boundary needs a bounded change.
- **BUILD**: required capability does not currently exist.
- **NOT NOW**: useful or historical capability that is outside the launch scope.

The dominant finding is that the product already has substantial Event, Invitation, Floorplan, Seating, Staff, audit and concurrency behavior. The missing launch capability is not a new domain model; it is an explicit, audited provider administrative command boundary that targets a Client/Event without impersonating the Planner.

---

# 1. Estado actual

## 1.1 Runtime shape

The monorepo contains three relevant surfaces:

- `apps/client`: Planner/Organization application. Event creation/configuration, invitation setup, guest operations and active-event workspace live here.
- `apps/admin`: internal administrative application. It already has authenticated Platform Admin navigation for Clients, Events, finance/reporting and audit.
- `apps/api`: NestJS API containing the authoritative domain/application behavior.

Shared HTTP clients live primarily in `packages/api-client`.

## 1.2 Current access boundary

The normal client-side operational controllers inspected for Events, Invitation Design, File Assets, Floorplan and Staff are explicitly restricted to:

- `INDEPENDENT_PLANNER`
- `ORGANIZATION_ADMIN`
- `ORGANIZATION_PLANNER`

Examples:

- `apps/api/src/events/events.controller.ts` — class-level `@Roles(...)`.
- `apps/api/src/invitation-design/invitation-design.controller.ts` — class-level `@Roles(...)`.
- `apps/api/src/file-assets/file-assets.controller.ts` — class-level `@Roles(...)`.
- `apps/api/src/floorplan/floorplan.controller.ts` — class-level `@Roles(...)`.
- `apps/api/src/staff-access/staff-access.controller.ts` — Planner/Organization roles for StaffToken management.

Ownership is not UI-only. `apps/api/src/events/event-access.policy.ts` and `apps/api/src/floorplan/floorplan-access.service.ts` derive database predicates from the authenticated principal. In particular, Organization Planner access is narrowed to Events created by that user.

Platform Admin currently has a distinct administrative surface. Examples:

- `apps/api/src/events/admin-events.controller.ts`
- `apps/api/src/audit/admin-audit.controller.ts`
- `apps/admin/src/auth/AdminRoleGuard.tsx`
- `apps/admin/src/app/router.tsx`

However, the administrative Events controller is currently a read/administration surface, not a provider-led technical preparation command surface.

## 1.3 Event state/lifecycle implementation

`apps/api/src/events/events.controller.ts` exposes:

- `POST /events`
- `GET /events`
- `GET /events/:eventId`
- `PATCH /events/:eventId`
- `DELETE /events/:eventId`
- `POST /events/:eventId/activate`
- `POST /events/:eventId/close`
- `POST /events/:eventId/reopen`
- `POST /events/:eventId/cancel`
- `POST /events/:eventId/archive`

`apps/api/src/events/event-lifecycle.service.ts` implements close/reopen/cancel/archive as explicit idempotent state commands. It:

- obtains ownership through `EventAccessPolicy`;
- row-locks the Event;
- executes under `CRITICAL_TRANSACTION_OPTIONS`;
- persists `eventStateOperation` idempotency records;
- writes audit records;
- expires StaffTokens on close/cancel;
- publishes realtime close/cancel events;
- rejects incompatible state transitions.

**Classification: REUSE.** These lifecycle invariants must not be reimplemented for provider access.

## 1.4 Main discrepancy against operator-led launch

The runtime still authorizes Planner roles to mutate Floorplan geometry through the API, while the operator-led contract says the Planner launch surface must keep geometry read-only and the provider must mutate it through an explicit administrative capability.

This is a real backend authorization discrepancy, not merely a hidden-button issue.

---

# 2. Mapa frontend

## 2.1 Routing

`apps/client/src/app/router.tsx` contains the real client routes:

- `/eventos` → Event dashboard.
- `/eventos/nuevo` → `WizardPage`.
- `/eventos/:eventId/configuracion/:step` → `WizardPage`.
- `/eventos/:eventId` → `ActiveEventWorkspacePage`.
- `/invitacion/:invitationToken` → public invitation.
- `/album/:albumToken` → public album.

There is no independent Floorplan Builder route in the current client. Floorplan editing is embedded in the configuration wizard.

## 2.2 Event Setup

Primary files:

- `apps/client/src/wizard/WizardPage.tsx`
- `apps/client/src/wizard/wizard-model.ts`
- `apps/client/src/wizard/review/ReviewStep.tsx`
- step components under `apps/client/src/wizard/*`
- `packages/api-client/src/events.ts`

Observed behavior:

- `WizardPage` loads/creates/updates the Event and composes setup steps.
- Event state and editability are consumed from API state, not maintained as a separate frontend-only lifecycle.
- Review/readiness culminates in the existing activation command.

Classification:

- Event setup UI composition: **ADAPT** for provider surface later; do not duplicate domain behavior.
- Existing client wizard for Planner launch exposure: **NOT NOW** to redesign under OP-01/OP-02.
- API client/domain behavior: **REUSE** where actor-independent; authorization entry must be adapted.

## 2.3 Invitation Setup

Primary frontend/API-client surface:

- `apps/client/src/wizard/design/*`
- `apps/client/src/wizard/confirmation/ConfirmationStep.tsx`
- `packages/api-client/src/wizard.ts`

Invitation design already supports Flyer/Flipbook assets and hotspots/actions. RSVP configuration is not a separate new domain; the wizard persists the Event-level confirmation configuration through Event update data (`confirmationEnabled`).

Classification:

- Design editor/components: **REUSE** as implementation assets when provider UI is introduced.
- Existing Planner route exposure: **ADAPT** later according to operator-led surface.
- RSVP domain/config persistence: **REUSE**.

## 2.4 Floorplan / Croquis Builder

Real implementation exists under:

- `apps/client/src/wizard/floorplan/FloorplanStep.tsx`
- `apps/client/src/wizard/floorplan/FloorplanKonvaRenderer.tsx`
- `apps/client/src/wizard/floorplan/FloorplanSurface.tsx`
- `apps/client/src/wizard/floorplan/FloorplanToolbar.tsx`
- `apps/client/src/wizard/floorplan/FloorplanTray.tsx`
- `apps/client/src/wizard/floorplan/FloorplanInventory.tsx`
- `apps/client/src/wizard/floorplan/floorplan-geometry.ts`
- `apps/client/src/wizard/floorplan/floorplan-history.ts`
- `apps/client/src/wizard/floorplan/floorplan-inventory.ts`
- `apps/client/src/wizard/floorplan/floorplan-scene.ts`
- `apps/client/src/wizard/floorplan/floorplan-sticker-style.ts`
- `apps/client/src/wizard/floorplan/floorplan-visual-seats.ts`

`FloorplanStep` already coordinates scene loading, history, floorplan locks, create/replace, shape add/update/delete and version-aware persistence. Konva rendering, normalized geometry helpers and interaction primitives already exist.

**Classification: REUSE** for engine/components/domain helpers; **ADAPT** for route/capability ownership in OP-03/FP tickets. Do not create a parallel Croquis domain.

## 2.5 Seating Workspace

Real files:

- `apps/client/src/workspace/ActiveEventWorkspacePage.tsx`
- `apps/client/src/workspace/SeatingWorkspace.tsx`
- `apps/client/src/workspace/useWorkspaceRealtime.ts`

Observed `SeatingWorkspace` capabilities:

- Floorplan read rendering through `FloorplanSurface`;
- table selection;
- debounced search;
- filtering/pagination;
- individual assignment;
- family assignment;
- group assignment;
- move/reassign;
- unassign;
- capacity/occupancy feedback;
- idempotency keys;
- `409` conflict recovery;
- uncertain-network reread/reconciliation;
- realtime reconciliation;
- terminal/read-only handling;
- responsive workspace behavior.

**Classification: REUSE.** The operator-led launch specifically needs this surface preserved for Planner. Rebuilding it would duplicate mature behavior without changing the underlying requirement.

---

# 3. Mapa backend

## 3.1 Events

Controller:

- `apps/api/src/events/events.controller.ts` → `EventsController`.

Services/policies:

- `apps/api/src/events/events.service.ts` → create/update/list/get/soft delete/activation and event mapping.
- `apps/api/src/events/event-access.policy.ts` → ownership predicate and non-leaking Event-not-found behavior.
- `apps/api/src/events/event-lifecycle.service.ts` → close/reopen/cancel/archive and automatic Event Day transition behavior.
- `apps/api/src/events/digital-event-readiness.service.ts` → digital-event readiness checks.

Critical reusable invariants:

- ownership;
- valid Event states;
- activation readiness;
- credit/ledger transaction behavior;
- idempotency;
- lifecycle transaction serialization;
- audit;
- StaffToken expiration on terminal lifecycle commands.

## 3.2 Invitation Design and Assets

Controller:

`apps/api/src/invitation-design/invitation-design.controller.ts`, prefix `events/:eventId`:

- `GET /events/:eventId/design`
- `GET /events/:eventId/design/readiness`
- `POST /events/:eventId/design/flyer`
- `POST /events/:eventId/design/flipbook`
- `PATCH /events/:eventId/design/flyer/initial-image`
- `PATCH /events/:eventId/design/flyer/qr-image`
- `POST /events/:eventId/design/flipbook/pages`
- `PATCH /events/:eventId/design/flipbook/pages/reorder`
- `PATCH /events/:eventId/design/flipbook/pages/:pageId/asset`
- `DELETE /events/:eventId/design/flipbook/pages/:pageId`
- `GET /events/:eventId/hotspots`
- `POST /events/:eventId/hotspots`
- `PATCH /events/:eventId/hotspots/:hotspotId`
- `DELETE /events/:eventId/hotspots/:hotspotId`

Service:

- `apps/api/src/invitation-design/invitation-design.service.ts`.

Assets:

`apps/api/src/file-assets/file-assets.controller.ts`, prefix `events/:eventId/file-assets`:

- upload;
- list/get;
- authorized binary content;
- soft delete.

All of these inspected controllers are currently Planner/Organization-role routes.

**Classification: REUSE domain/services; ADAPT entry authorization for provider.**

## 3.3 Floorplan and Seating

Controller:

- `apps/api/src/floorplan/floorplan.controller.ts`.

Access:

- `apps/api/src/floorplan/floorplan-access.service.ts`.
- `apps/api/src/events/event-access.policy.ts`.

Domain/application service:

- `apps/api/src/floorplan/floorplan.service.ts`.

API client evidence in `packages/api-client/src/wizard.ts` maps the current HTTP surface:

Floorplan read:

- `GET /events/:eventId/floorplan`
- `GET /events/:eventId/seating`

Geometry/persistence:

- `POST /events/:eventId/floorplan`
- `PATCH /events/:eventId/floorplan`
- `POST /events/:eventId/floorplan/shapes`
- `PATCH /events/:eventId/floorplan/shapes/:shapeId`
- `DELETE /events/:eventId/floorplan/shapes/:shapeId`
- `POST /events/:eventId/floorplan/lock`
- `POST /events/:eventId/floorplan/unlock`

Seating:

- `POST /events/:eventId/seating/assign`
- `POST /events/:eventId/seating/assign-family`
- `POST /events/:eventId/seating/assign-group`
- `PATCH /events/:eventId/seating/:assistantId`

Scanner floorplan read:

- `GET /scanner/:staffToken/floorplan`
- `GET /scanner/:staffToken/floorplan/content`

`floorplan.service.ts` already implements normalized coordinates, version checks, floorplan locks, table/capacity checks, seating assignment, idempotency, row locking/serializable critical transactions, audit and realtime publishing.

**Classification:**

- Floorplan data model/persistence/concurrency: **REUSE**.
- Geometry mutation authorization/surface: **ADAPT**.
- Seating domain/API: **REUSE**.
- New Sticker/Seat domain: **NOT NOW**.

## 3.4 Staff

`apps/api/src/staff-access/staff-access.controller.ts`:

- `GET /events/:eventId/staff-tokens`
- `POST /events/:eventId/staff-tokens`
- public `GET /scanner/:staffToken/session`

StaffToken management is Planner/Organization-role protected. Scanner session resolves by scoped token rather than a permanent Staff user.

Lifecycle closes/cancels already expire StaffTokens through `StaffTokenExpirationService`.

**Classification: REUSE token model/scanner semantics; ADAPT provider preparation command if provider must create Staff access.**

## 3.5 Administrative infrastructure

Frontend:

- `apps/admin/src/app/router.tsx`
- `apps/admin/src/auth/AdminRoleGuard.tsx`

Backend examples:

- `apps/api/src/events/admin-events.controller.ts`
- `apps/api/src/audit/admin-audit.controller.ts`

API client examples:

- `packages/api-client/src/admin/events.ts`
- `packages/api-client/src/admin/clients.ts`

`AdminAuditController` is protected by `@Roles(UserRole.PLATFORM_ADMIN)` and exposes `GET /admin/audit-logs` with Client, Event, actor, resource, action, operation and date filters.

The current administrative Events surface can locate/read Events, but no inspected administrative controller exposes the technical preparation mutations required by `ADR_OPERATOR_LED_ACCESS`.

**Classification:** administrative authentication/session/target discovery/audit query = **REUSE**; explicit provider mutation capability = **BUILD/ADAPT thin slice**.

---

# 4. Matriz de autorización

| Operation | Current implementation | Current actor/role | Endpoint | Needed operator-led | Gap | Minimum change |
| --- | --- | --- | --- | --- | --- | --- |
| Preparación del Evento | Client wizard + `EventsService` | Independent Planner / Org Admin / Org Planner | `POST /events`, `PATCH /events/:eventId` | Internal provider prepares selected Client/Event | No admin technical command boundary | Add explicit Platform Admin provider command(s) requiring `clientId` + `eventId`, Event→Client verification, capability check, audit; reuse Event service/invariants |
| Event setup | `WizardPage`, `EventsController`, `EventsService` | Planner roles | `GET/PATCH /events/:eventId` | Provider can configure pre-activation fields | Current admin Event routes are not equivalent to client mutation | ADAPT entry point; do not bypass `EventAccessPolicy` by impersonation |
| Invitation design | `InvitationDesignController/Service` + design UI | Planner roles | `/events/:eventId/design*`, `/hotspots*` | Provider configures assets/design/actions | Controller is role-bound to Planner roles | Administrative provider facade/command reusing design service invariants |
| RSVP configuration | `ConfirmationStep`; Event update field `confirmationEnabled` | Planner roles | `PATCH /events/:eventId` | Provider prepares RSVP infrastructure/settings | No provider mutation entry | Reuse Event update validation through explicit provider command |
| Lectura de croquis | `FloorplanController`, API client, `FloorplanSurface` | Planner roles; scanner via scoped token | `GET /events/:eventId/floorplan`; scanner read routes | Provider needs read for selected Client/Event; Planner keeps read | No explicit admin floorplan read capability found | Add provider read authorization with Client/Event targeting; preserve Planner read |
| Mutación de geometría | `FloorplanStep` + `FloorplanController/Service` | Planner roles today | `POST/PATCH /floorplan`; shape CRUD; lock/unlock | Provider only for launch | Runtime contradicts operator-led target: Planner API can mutate geometry | Add provider capability first; OP-03 later removes Planner mutation authorization at backend + UI capability gating |
| Administración de Mesas | Shapes/table data in Floorplan service | Planner roles today | floorplan shape CRUD | Provider defines tables/capacity/geometry | Same geometry authorization gap | Reuse Floorplan service/table invariants through provider boundary |
| Seating | `SeatingWorkspace` + Floorplan seating service | Planner roles | `/events/:eventId/seating*` | Planner retains assignment/move/unassign | No operator-led domain gap; must survive auth split | REUSE; avoid rewrite. OP-03 capability split must preserve these endpoints for Planner |
| Staff | `StaffTokensController`, management service | Planner roles | `GET/POST /events/:eventId/staff-tokens` | Provider may prepare Staff access | No explicit provider Staff command | ADAPT through provider capability while preserving token limits/state/audit |
| Activación | `EventsController.activate` + `EventsService.activate` | Planner roles | `POST /events/:eventId/activate` | Provider may prepare/perform authorized launch action per contract without bypassing readiness/credits | No provider activation entry | Explicit provider command must invoke existing readiness/credit/ledger/idempotency logic; no direct status update |

### Critical evidence — current Planner geometry mutation

Planner can currently mutate Floorplan geometry.

Frontend:

- `apps/client/src/wizard/floorplan/FloorplanStep.tsx`
- mutation handlers call create/replace/add/update/remove and lock/unlock API functions.

API client:

- `packages/api-client/src/wizard.ts`
- floorplan create/replace/shape mutation/lock functions target `/events/:eventId/floorplan*`.

Endpoint/backend:

- `apps/api/src/floorplan/floorplan.controller.ts`
- class-level roles include Independent Planner, Organization Admin and Organization Planner.

Authorization:

- `apps/api/src/floorplan/floorplan-access.service.ts`
- `apps/api/src/events/event-access.policy.ts`
- ownership is enforced by database predicates.

Domain protection:

- `apps/api/src/floorplan/floorplan.service.ts`
- version/concurrency, locking, state/capacity, audit and realtime behavior.

Tests:

- `apps/api/test/floorplan.integration-spec.ts`
- `apps/api/src/floorplan/floorplan.controller.spec.ts`
- `apps/api/src/floorplan/floorplan.workspace.spec.ts`
- client floorplan tests listed in section 9.

---

# 5. Gap contra `ADR_OPERATOR_LED_ACCESS`

| ADR requirement | Runtime status | Classification |
| --- | --- | --- |
| Real internal authenticated actor | Platform Admin authentication/surface exists | REUSE |
| No impersonation | Current admin and Planner surfaces are separate | REUSE principle; preserve |
| Explicit `clientId` | Admin Client/Event discovery exists; technical command does not | BUILD bounded command contract |
| Explicit `eventId` | Admin Event read exists; technical command does not | BUILD bounded command contract |
| Verify Event → Client | Planner ownership policies exist, but no provider targeting policy was found | ADAPT shared access/target validation or BUILD small provider policy |
| Explicit capability allowlist | No provider technical capability layer found | BUILD |
| Tenant isolation / no leakage | Existing Planner policies use scoped DB predicates and not-found semantics | REUSE pattern; add provider equivalent |
| Reuse business invariants | Services already contain strong invariants | REUSE |
| Audit actor + Client + Event + action | Audit infrastructure exists and lifecycle/Floorplan already record operations | REUSE/ADAPT wiring |
| Provider Floorplan mutation | No administrative Floorplan mutation route found | BUILD administrative entry; REUSE Floorplan service |
| Planner geometry read-only launch surface | Backend currently permits Planner geometry mutation | ADAPT in OP-03 after provider capability exists |

The principal architectural risk for OP-02 is therefore **not** whether Platform Admin can be given a route. The risk is accidentally creating a route that bypasses the mature Planner ownership/business invariants instead of reusing them through a new provider targeting policy.

---

# 6. Código reutilizable

## REUSE

### Events

- `EventsService` validation, event mapping, readiness and activation/credit/ledger behavior.
- `EventLifecycleService` close/reopen/cancel/archive, idempotency, transactions, audit, realtime and StaffToken expiry.
- `EventAccessPolicy` as the pattern/source for scoped ownership and non-leaking lookup semantics. Its Planner semantics should remain intact.

### Invitation

- `InvitationDesignService` and existing Flyer/Flipbook/hotspot rules.
- `FileAssetsService` upload/content/delete invariants.
- existing design UI components for future provider surface where useful.

### Floorplan

- Floorplan normalized domain/persistence.
- `FloorplanService` geometry/version/locks/concurrency/audit/realtime.
- current Konva renderer/surface/geometry/history/scene/inventory helpers.
- current table/capacity model.

### Seating

- `SeatingWorkspace`.
- seating API and transactional assignment logic.
- individual/family/group assignment and move/unassign semantics.
- realtime and network reconciliation.

### Admin

- Platform Admin authenticated application/shell.
- Client/Event lookup/list/read infrastructure.
- Audit infrastructure and filtered audit view.

### Staff/scanner

- StaffToken model and limits.
- scoped public scanner session.
- lifecycle token expiration.
- scanner floorplan read semantics.

---

# 7. Código que explícitamente NO debe tocarse

For OP-01: all runtime code.

For the immediate operator-led sequence, avoid changing unless an exact later ticket proves it necessary:

- `SeatingWorkspace` domain behavior or rebuilding its UI from scratch.
- Event activation readiness, credit ledger and idempotency semantics.
- Event lifecycle state machine and StaffToken expiry semantics.
- QR/check-in/scanner token scope.
- Floorplan normalized coordinate/domain model.
- Floorplan concurrency/version/locking semantics.
- seating capacity and transactional assignment semantics.
- realtime contracts.
- Prisma schema/migrations merely to invent an Operator role.
- OpenAPI merely to expose existing Planner endpoints to Platform Admin.
- legacy repository or visual code as runtime source.

A new `AuthRole.OPERATOR`, impersonation, shared Planner credentials or ownership reassignment are explicitly excluded.

---

# 8. Cambios mínimos propuestos para OP-02

This is a proposal boundary only; OP-02 is **not implemented** by this ticket.

1. Use the existing authenticated `PLATFORM_ADMIN` actor. Do not add a persisted Operator role.
2. Introduce a narrowly scoped provider administrative command boundary under the existing admin/API architecture.
3. Require explicit `clientId` and `eventId` for Event-scoped provider commands.
4. Resolve target using a database predicate that proves `Event.id == eventId`, `Event.clientId == clientId`, and `deletedAt == null`; return a non-leaking failure for mismatch/nonexistence.
5. Add an explicit allowlist/capability mapping for only the technical preparation commands approved by the final OP-02 ticket.
6. Reuse existing application/domain services and invariants. If a service is inseparably coupled to a Planner `AuthPrincipal`, extract the smallest actor-independent command/invariant layer rather than copying the implementation.
7. Audit every provider mutation with real admin actor ID, Client, Event, resource/action and operation ID.
8. For activation, call the existing readiness/credit/ledger/idempotency path; never write Event status directly.
9. Add integration tests for happy path, Client/Event mismatch, cross-tenant denial, nonexistent target without leakage, invalid state, audit actor/Event, Planner regression and tenant regression.
10. Do not build provider frontend until the backend thin slice proves this contract.

### Expected implementation strategy

- **REUSE:** Event/Invitation/Floorplan/Staff domain services and audit infrastructure.
- **ADAPT:** expose actor-neutral internals only where current service signatures force Planner ownership into domain logic.
- **BUILD:** provider targeting/capability authorization boundary and explicit admin commands.
- **NOT NOW:** large backoffice, new roles, Croquis V2 shell, Planner capability removal, Seating rewrite.

---

# 9. Tests existentes

## Backend unit/domain tests located

Relevant examples include:

- `apps/api/src/events/event-lifecycle.service.spec.ts`
- `apps/api/src/events/event-status.resolver.spec.ts`
- `apps/api/src/events/events.dto.spec.ts`
- `apps/api/src/floorplan/floorplan.controller.spec.ts`
- `apps/api/src/floorplan/floorplan-readiness.service.spec.ts`
- `apps/api/src/floorplan/floorplan.workspace.spec.ts`
- audit unit tests under `apps/api/src/audit/*.spec.ts`
- auth unit tests under `apps/api/src/auth/*.spec.ts`

## API integration suites located

- `apps/api/test/auth.integration-spec.ts`
- `apps/api/test/events.integration-spec.ts`
- `apps/api/test/event-activation.integration-spec.ts`
- `apps/api/test/invitations.integration-spec.ts`
- `apps/api/test/public-rsvp.integration-spec.ts`
- `apps/api/test/file-assets.integration-spec.ts`
- `apps/api/test/floorplan.integration-spec.ts`
- `apps/api/test/realtime.integration-spec.ts`
- `apps/api/test/staff-access.integration-spec.ts`
- `apps/api/test/scanner.integration-spec.ts`
- `apps/api/test/audit.integration-spec.ts`
- `apps/api/test/admin-events.integration-spec.ts`
- `apps/api/test/admin-clients.integration-spec.ts`

## Frontend tests located

Floorplan examples:

- `apps/client/src/wizard/floorplan/FloorplanInventory.test.tsx`
- `apps/client/src/wizard/floorplan/FloorplanKonvaRenderer.test.tsx`
- `apps/client/src/wizard/floorplan/FloorplanStep.test.tsx`
- `apps/client/src/wizard/floorplan/FloorplanStep.konva.test.tsx`
- `apps/client/src/wizard/floorplan/FloorplanSurface.test.tsx`
- `apps/client/src/wizard/floorplan/FloorplanTray.test.tsx`
- tests for floorplan geometry/history/inventory/performance/scene/visual-seat helpers.

Workspace/realtime examples:

- `apps/client/src/workspace/ActiveEventWorkspacePage.test.tsx`
- `apps/client/src/workspace/InvitationDistribution.test.tsx`
- `apps/client/src/workspace/useWorkspaceRealtime.test.ts`

Invitation UI tests exist under `apps/client/src/wizard/design/`, including `HotspotEditor`/design-step coverage.

### Test coverage observation

No dedicated `SeatingWorkspace.test.tsx` was identified in the inspected runtime tree. Seating behavior has strong API integration coverage and workspace/realtime surrounding tests, but the central frontend workspace itself is a coverage risk worth addressing in a later authorized QA ticket, not OP-01.

---

# 10. Tests ejecutados y resultados

## Execution mechanism

This OP-01 environment has GitHub repository access but no local checkout and no GitHub CLI (`gh`). Therefore no local command result is claimed. Test execution evidence is restricted to GitHub Actions runs that actually executed repository commands.

Repository scripts establish:

- root `pnpm test` → Turbo test suites (`package.json`).
- API `pnpm --filter @invitaciones/api test` → `vitest run --config vitest.config.ts`.
- API integration `pnpm --filter @invitaciones/api test:integration` → `vitest run --config vitest.integration.config.ts`.
- client `pnpm --filter @invitaciones/client test` → `vitest run`.

The repository CI workflow `.github/workflows/ci.yml` also executes Prisma/OpenAPI drift gates, format, lint, typecheck, unit tests, API integration and build against PostgreSQL.

## Pre-ticket baseline evidence

The latest inspected pull-request CI immediately preceding OP-01 was workflow run `#435` for commit `839d48b993401c7292d8d1dca89f341db3168ae7`.

Observed status:

- PASS — setup/install.
- PASS — Prisma validation/generation/migration/database baseline checks.
- PASS — OpenAPI drift.
- PASS — format check.
- PASS — lint.
- PASS — typecheck.
- PRE-EXISTING FAILURE — `Unit tests` job step.
- NOT EXECUTED — API integration, because the workflow stopped after unit-test failure.
- NOT EXECUTED — build, because the workflow stopped after unit-test failure.

The exact failing unit assertion could not be recovered from the available connector log response, so it is intentionally not guessed.

The merge commit used as OP-01 source (`c9314fff...`) has no pull-request workflow run directly associated with that merge SHA in the connector.

## Ticket regression expectation

OP-01 modifies documentation only. It cannot legitimately introduce a runtime test regression. PR CI must still be reviewed because a red result may expose the pre-existing unit failure or another repository baseline issue.

---

# 11. Riesgos técnicos

1. **Authorization split is not implemented yet.** Planner can directly call Floorplan geometry mutation endpoints today. Hiding the builder would not satisfy the operator-led contract.
2. **Platform Admin visibility is not provider authorization.** Reusing a Planner endpoint with a broader role decorator would weaken tenant/ownership semantics and violate the ADR.
3. **High duplication risk in OP-02.** Event activation, lifecycle and Floorplan already contain transactions, idempotency, audit and concurrency logic. Copying them into an admin controller would create divergent invariants.
4. **Client/Event targeting must be non-leaking.** A provider command must validate both IDs and their relation before the domain command; mismatch and unknown target must not disclose another tenant's Event.
5. **Planner ownership policy and provider targeting are different concerns.** `EventAccessPolicy` should not be weakened to make Platform Admin globally pass Planner ownership checks.
6. **Current CI baseline is red in unit tests.** OP-02 should not begin under the false assumption that all pre-existing tests are green; the exact baseline failure needs to be carried forward until resolved/triaged.
7. **Seating frontend coverage gap.** The central reusable `SeatingWorkspace` does not have an identified dedicated component test, increasing regression risk when OP-03 changes route/capability gating around it.
8. **RSVP setup is coupled to Event configuration.** Treating it as a new standalone provider subsystem would be unnecessary duplication.
9. **Staff creation is currently a client operation.** Provider enablement must preserve token limits, Event state checks, audit and expiration semantics.
10. **Floorplan locks/versioning are part of correctness.** Any provider builder must participate in existing version/lock/concurrency behavior instead of introducing an administrative bypass.

---

# 12. Preguntas genuinamente bloqueantes

For OP-01 itself: **none**. The required runtime boundary can be mapped without a product decision.

Before finalizing OP-02 implementation scope, the PM must select the exact provider capability slice to expose first. The baseline supports multiple technical-preparation operations, but OP-02 should not silently infer whether its first thin slice is Event setup only, Floorplan mutation only, Invitation setup, Staff preparation, activation, or a deliberately bounded combination.

This is a scope-selection question, not an architecture ambiguity. The architecture recommendation remains the same: explicit Platform Admin provider command → Client/Event target validation → capability allowlist → existing domain/application invariant → audit.

---

## Final OP-01 classification

### REUSE

- Event ownership patterns and non-leaking lookup semantics.
- Event lifecycle and activation business invariants.
- Invitation Design/File Asset domain behavior.
- Floorplan model, persistence, versioning, locks, concurrency, audit and realtime.
- Seating domain/API and `SeatingWorkspace`.
- StaffToken/scanner semantics.
- Platform Admin authentication, admin shell, Client/Event discovery and audit infrastructure.

### ADAPT

- Provider access to Event setup/configuration.
- Provider access to Invitation/RSVP configuration.
- Provider access to Floorplan read/write/table preparation.
- Provider Staff preparation.
- Provider activation entry if included in final OP-02.
- Later OP-03 removal of Planner geometry mutation authorization while preserving Floorplan read + Seating.

### BUILD

- Explicit provider administrative command/capability boundary compliant with `ADR_OPERATOR_LED_ACCESS`.
- Explicit Client/Event target validation for provider mutations where no such admin mutation policy currently exists.

### NOT NOW

- New `AuthRole.OPERATOR`.
- impersonation.
- large generic backoffice.
- Croquis V2 visual shell.
- new Sticker/Seat persistence domain.
- Seating rewrite.
- opportunistic refactors.
- dependency upgrades.

## OP-01 diff constraint

Expected ticket diff: exactly this document. No application code, schema, migration, OpenAPI, dependency or business-rule change is authorized.