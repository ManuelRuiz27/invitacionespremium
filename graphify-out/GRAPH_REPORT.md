# Graph Report - .  (2026-07-24)

## Corpus Check
- Corpus is ~48,065 words - fits in a single context window. You may not need a graph.

## Summary
- 1047 nodes · 1779 edges · 81 communities (77 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- API Service Logic
- API Package Dependencies
- Environment Build Configuration
- UI Library Dependencies
- Repository Lint Configuration
- Admin React Package
- Client React Package
- Landing React Package
- Scanner React Package
- NestJS Dependencies
- Admin Client Endpoints
- Application Configuration Services
- Public Health Routes
- Product Technical Contracts
- HTTP Error Handling
- Client Account Endpoints
- Admin User Management
- Authentication Controller API
- Client User Endpoints
- API TypeScript Configuration
- Admin TypeScript Configuration
- Soft Delete Persistence
- Client TypeScript Configuration
- Landing TypeScript Configuration
- Scanner TypeScript Configuration
- API Client Package
- Audited Mutations
- Prisma Database Integration
- UI TypeScript Configuration
- API Build Configuration
- OpenAPI Application Bootstrap
- NestJS Module Wiring
- Authentication Service
- Password Hashing
- Base TypeScript Configuration
- Monorepo Applications
- API Client TypeScript
- UI Build Configuration
- Audit Data Sanitization
- Session Cookie Handling
- API Client Build
- Lifecycle Privacy Rules
- Authentication Origin Guards
- Environment Configuration
- Audit Actor Modeling
- Client Finance Domain
- CI Database Auditing
- Authentication DTO Validation
- Role Authorization Guard
- Invitation Access Domain
- Admin UI Metadata
- Local Admin Seeding
- Session Authentication Guard
- Client UI Metadata
- Landing UI Metadata
- Scanner UI Metadata
- Shared UI Frame
- Nest CLI Configuration
- Access Ownership Policies
- Client Integration Tests
- Domain Error Model
- API Client Runtime
- Generated API Client
- Shared UI Package

## God Nodes (most connected - your core abstractions)
1. `AuthPrincipal` - 45 edges
2. `AppConfigService` - 39 edges
3. `PrismaService` - 25 edges
4. `AuthenticatedRequest` - 23 edges
5. `ClientsService` - 22 edges
6. `ClientResponseDto` - 20 edges
7. `ClientUserResponseDto` - 20 edges
8. `CurrentAuth` - 19 edges
9. `parseUuidParameter()` - 18 edges
10. `ClientUsersService` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Local PostgreSQL Service` --semantically_similar_to--> `PostgreSQL Test Service`  [INFERRED] [semantically similar]
  compose.yaml → .github/workflows/ci.yml
- `Soft Delete Repository Pattern` --semantically_similar_to--> `Borrado lÃ³gico`  [INFERRED] [semantically similar]
  apps/api/README.md → docs/01-producto/01_GLOSARIO_Y_MODELO_CONCEPTUAL.md
- `Monorepo Application and Package Boundaries` --rationale_for--> `InvitacionesPremium API Backend`  [INFERRED]
  AGENTS.md → apps/api/README.md
- `CI Quality Workflow` --conceptually_related_to--> `OpenAPI Generated API Client`  [INFERRED]
  .github/workflows/ci.yml → README.md
- `Agent and Codex Repository Rules` --references--> `InvitacionesPremium Monorepo`  [EXTRACTED]
  AGENTS.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Actors Participating in Event Operations** — docs_01_producto_01_glosario_y_modelo_conceptual_planner_independiente, docs_01_producto_01_glosario_y_modelo_conceptual_planner_de_organizacion, docs_01_producto_01_glosario_y_modelo_conceptual_staff_por_token, docs_01_producto_01_glosario_y_modelo_conceptual_evento [EXTRACTED 1.00]
- **Invitation-to-Check-in Domain Chain** — docs_01_producto_01_glosario_y_modelo_conceptual_evento, docs_01_producto_01_glosario_y_modelo_conceptual_invitacion, docs_01_producto_01_glosario_y_modelo_conceptual_asistente, docs_01_producto_01_glosario_y_modelo_conceptual_check_in [EXTRACTED 1.00]
- **Transactional Event Activation Finance** — docs_02_flujos_reglas_05_reglas_negocio_event_activation, docs_02_flujos_reglas_06_finanzas_creditos_contabilidad_credit_consumption, docs_02_flujos_reglas_06_finanzas_creditos_contabilidad_ledger_movements, docs_01_producto_01_glosario_y_modelo_conceptual_ledger [EXTRACTED 1.00]
- **Monorepo, workspaces y límites** — docs_04_tecnico_monorepo_architecture_arquitectura_monorepo, docs_04_tecnico_12_repos_y_apps_monorepo_apps_y_packages, docs_05_implementacion_18_monorepo_bootstrap_bootstrap_monorepo, packages_api_client_readme_invitaciones_api_client, packages_ui_readme_invitaciones_ui [INFERRED 0.95]
- **Gobernanza del backlog Codex** — docs_05_implementacion_13_plan_implementacion_plan_de_implementacion, docs_05_implementacion_14_codex_rules_reglas_codex, docs_05_implementacion_15_backlog_codex_backlog_codex, docs_05_implementacion_16_backlog_qa_amendments_enmiendas_qa_al_backlog_codex, docs_05_implementacion_17_qa_open_decisions_decisiones_qa [EXTRACTED 1.00]
- **Upgrade transaccional del Evento** — docs_02_flujos_reglas_event_state_machine_maquina_de_estados_del_evento, docs_02_flujos_reglas_ledger_types_tipos_de_movimientos_del_ledger, docs_02_flujos_reglas_service_upgrade_flow_upgrade_de_servicio_flyer_flipbook, docs_04_tecnico_file_asset_policy_politica_de_archivos_y_fileasset [EXTRACTED 1.00]

## Communities (81 total, 4 thin omitted)

### Community 0 - "API Service Logic"
Cohesion: 0.07
Nodes (56): auditedResult(), normalizeEmail(), AuthPrincipal, Roles(), ClientUsersService, hasPrismaCode(), mapUserMutationError(), Inject (+48 more)

### Community 1 - "API Package Dependencies"
Cohesion: 0.05
Nodes (41): devDependencies, dotenv, @nestjs/cli, @nestjs/testing, prisma, supertest, tsx, @types/express (+33 more)

### Community 2 - "Environment Build Configuration"
Cohesion: 0.06
Nodes (34): API_PORT, ^build, CORS_ORIGINS, coverage/**, DATABASE_CONNECTION_TIMEOUT_MS, DATABASE_IDLE_TIMEOUT_MS, DATABASE_POOL_MAX, DATABASE_URL (+26 more)

### Community 3 - "UI Library Dependencies"
Cohesion: 0.06
Nodes (33): @emotion/react, @emotion/styled, @mui/material, dependencies, @emotion/react, @emotion/styled, @mui/material, devDependencies (+25 more)

### Community 4 - "Repository Lint Configuration"
Cohesion: 0.06
Nodes (31): eslint, @eslint/js, globals, description, devDependencies, eslint, @eslint/js, globals (+23 more)

### Community 5 - "Admin React Package"
Cohesion: 0.07
Nodes (28): dependencies, @invitaciones/ui, react, react-dom, devDependencies, @types/react, @types/react-dom, vite (+20 more)

### Community 6 - "Client React Package"
Cohesion: 0.07
Nodes (28): dependencies, @invitaciones/ui, react, react-dom, devDependencies, @types/react, @types/react-dom, vite (+20 more)

### Community 7 - "Landing React Package"
Cohesion: 0.07
Nodes (28): dependencies, @invitaciones/ui, react, react-dom, devDependencies, @types/react, @types/react-dom, vite (+20 more)

### Community 8 - "Scanner React Package"
Cohesion: 0.07
Nodes (28): dependencies, @invitaciones/ui, react, react-dom, devDependencies, @types/react, @types/react-dom, vite (+20 more)

### Community 9 - "NestJS Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @nestjs/common, @nestjs/config, @nestjs/core, @nestjs/platform-express, @nestjs/schedule, @nestjs/swagger, pg (+19 more)

### Community 10 - "Admin Client Endpoints"
Cohesion: 0.17
Nodes (16): CurrentAuth, AdminClientsController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags, Body (+8 more)

### Community 11 - "Application Configuration Services"
Cohesion: 0.09
Nodes (5): Inject, AppConfigService, Inject, Injectable, EnvironmentVariables

### Community 12 - "Public Health Routes"
Cohesion: 0.16
Nodes (13): ApiServiceUnavailableResponse, PublicRoute(), HealthController, response, ApiOkResponse, ApiTags, Controller, Get (+5 more)

### Community 13 - "Product Technical Contracts"
Cohesion: 0.28
Nodes (20): Máquina de estados del Evento, Tipos de movimientos del ledger, Upgrade de servicio Flyer a Flipbook, UI/UX Flow, Technical Requirements Document, Modelo de datos conceptual, Guía de schema Prisma, API Contracts (+12 more)

### Community 14 - "HTTP Error Handling"
Cohesion: 0.19
Nodes (12): AllExceptionsFilter, defaultCodeForStatus(), HttpExceptionBody, NormalizedException, normalizeException(), normalizeMessage(), RequestWithOperationId, resolveOperationId() (+4 more)

### Community 15 - "Client Account Endpoints"
Cohesion: 0.15
Nodes (15): AuthenticatedRequest, ClientsController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags, Body (+7 more)

### Community 16 - "Admin User Management"
Cohesion: 0.15
Nodes (15): AdminClientUsersController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags, Body, Controller (+7 more)

### Community 17 - "Authentication Controller API"
Cohesion: 0.16
Nodes (15): ApiNoContentResponse, ApiUnauthorizedResponse, AuthController, toAuthUserDto(), ApiBody, ApiCookieAuth, ApiOkResponse, ApiTags (+7 more)

### Community 18 - "Client User Endpoints"
Cohesion: 0.15
Nodes (14): ClientUsersController, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags, Body, Controller (+6 more)

### Community 19 - "API TypeScript Configuration"
Cohesion: 0.11
Nodes (17): compilerOptions, emitDecoratorMetadata, experimentalDecorators, lib, module, moduleResolution, noEmit, types (+9 more)

### Community 20 - "Admin TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+8 more)

### Community 21 - "Soft Delete Persistence"
Cohesion: 0.17
Nodes (8): activeWhere, assertPlatformAdminRestoration(), RestorationPrincipal, SoftDeleteRepository, TestRecord, TestSoftDeleteRepository, TestWhere, TestWhereUnique

### Community 22 - "Client TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+8 more)

### Community 23 - "Landing TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+8 more)

### Community 24 - "Scanner TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, jsx, lib, module, moduleResolution, noEmit, types, extends (+8 more)

### Community 25 - "API Client Package"
Cohesion: 0.12
Nodes (15): devDependencies, vitest, exports, vitest, main, name, private, scripts (+7 more)

### Community 26 - "Audited Mutations"
Cohesion: 0.21
Nodes (10): AuditService, Injectable, AuditedMutationResult, AuditedMutationService, ExecuteAuditedMutationInput, Inject, Injectable, Inject (+2 more)

### Community 27 - "Prisma Database Integration"
Cohesion: 0.17
Nodes (6): Inject, PrismaService, Injectable, HealthService, Inject, Injectable

### Community 28 - "UI TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, jsx, lib, module, moduleResolution, noEmit, extends, include (+6 more)

### Community 29 - "API Build Configuration"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, noEmit, outDir, sourceMap, exclude, extends, dist (+5 more)

### Community 30 - "OpenAPI Application Bootstrap"
Cohesion: 0.31
Nodes (7): generateOpenApi(), GenerationStage, createApp(), logLevelsFor(), bootstrap(), createOpenApiDocument(), setupOpenApi()

### Community 31 - "NestJS Module Wiring"
Cohesion: 0.27
Nodes (9): AuditModule, Module, ClientUsersModule, Module, ClientsModule, Module, DatabaseModule, Global (+1 more)

### Community 32 - "Authentication Service"
Cohesion: 0.24
Nodes (9): Inject, AuthService, invalidCredentials(), LoginResult, Injectable, createSessionToken(), fingerprintLoginIdentifier(), hashSessionToken() (+1 more)

### Community 33 - "Password Hashing"
Cohesion: 0.26
Nodes (9): deriveKey(), DUMMY_KEY, DUMMY_PASSWORD_HASH, DUMMY_SALT, encodePasswordHash(), hashPassword(), parsePasswordHash(), SCRYPT_OPTIONS (+1 more)

### Community 34 - "Base TypeScript Configuration"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib, noUncheckedIndexedAccess, resolveJsonModule (+4 more)

### Community 35 - "Monorepo Applications"
Cohesion: 0.17
Nodes (12): Agent and Codex Repository Rules, Monorepo Application and Package Boundaries, Platform Admin Page Shell, Admin Application Shell, Client Panel Page Shell, Client Application Shell, Commercial Site Page Shell, Landing Application Shell (+4 more)

### Community 36 - "API Client TypeScript"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, extends, include, DOM (+3 more)

### Community 37 - "UI Build Configuration"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, exclude, extends (+3 more)

### Community 38 - "Audit Data Sanitization"
Cohesion: 0.35
Nodes (6): sanitizeAuditObject(), sanitizeObject(), sanitizeValue(), assertValidActor(), AuditObject, AuditRecordInput

### Community 39 - "Session Cookie Handling"
Cohesion: 0.31
Nodes (7): buildClearedSessionCookie(), buildSessionCookie(), readCookie(), SAME_SITE_ATTRIBUTE, serializeCookie(), config, LOG_LEVELS

### Community 40 - "API Client Build"
Cohesion: 0.18
Nodes (10): compilerOptions, declaration, declarationMap, noEmit, outDir, rootDir, exclude, extends (+2 more)

### Community 41 - "Lifecycle Privacy Rules"
Cohesion: 0.20
Nodes (10): Soft Delete Repository Pattern, Borrado lÃ³gico, Evento, MVP Product Scope, MVP Privacy Policy, MVP Services, Planner Event Lifecycle Flow, Event Activation Rules (+2 more)

### Community 42 - "Authentication Origin Guards"
Cohesion: 0.24
Nodes (6): AuthModule, Module, SAFE_METHODS, TrustedOriginGuard, Inject, Injectable

### Community 43 - "Environment Configuration"
Cohesion: 0.24
Nodes (7): AppConfigModule, Global, Module, booleanFromEnvironment, environmentSchema, postgresUrl, validateEnvironment()

### Community 44 - "Audit Actor Modeling"
Cohesion: 0.42
Nodes (3): AuditActorFactory, requireIdentifier(), AuditActor

### Community 45 - "Client Finance Domain"
Cohesion: 0.22
Nodes (9): Cliente, Ledger, OrganizaciÃ³n, Planner de OrganizaciÃ³n, Planner independiente, Platform Admin, Credit Accounting Model, Historical Credit Value Snapshot (+1 more)

### Community 46 - "CI Database Auditing"
Cohesion: 0.29
Nodes (8): Pull Request Change Verification, PostgreSQL Test Service, CI Quality Workflow, InvitacionesPremium API Backend, Append-only Audit Log, Temporary Local Authentication, Local PostgreSQL Service, OpenAPI Generated API Client

### Community 47 - "Authentication DTO Validation"
Cohesion: 0.46
Nodes (6): AuthUserDto, LoginRequestDto, loginRequestSchema, LoginResponseDto, parseLoginRequest(), ApiProperty

### Community 48 - "Role Authorization Guard"
Cohesion: 0.29
Nodes (3): RolesGuard, Inject, Injectable

### Community 49 - "Invitation Access Domain"
Cohesion: 0.25
Nodes (8): Ãlbum, Asistente, Check-in, InvitaciÃ³n, Purpose-separated Access Tokens, Post-event Album Flow, Public Invitation and Confirmation Flow, Check-in Invariants

### Community 50 - "Admin UI Metadata"
Cohesion: 0.43
Nodes (3): App(), appMetadata, rootElement

### Community 51 - "Local Admin Seeding"
Cohesion: 0.48
Nodes (4): seedLocalAdmin(), AppModule, Module, loadEnvironmentFiles()

### Community 52 - "Session Authentication Guard"
Cohesion: 0.29
Nodes (4): SessionAuthGuard, Inject, Injectable, unauthenticated()

### Community 53 - "Client UI Metadata"
Cohesion: 0.43
Nodes (3): App(), appMetadata, rootElement

### Community 54 - "Landing UI Metadata"
Cohesion: 0.43
Nodes (3): App(), appMetadata, rootElement

### Community 55 - "Scanner UI Metadata"
Cohesion: 0.43
Nodes (3): App(), appMetadata, rootElement

### Community 56 - "Shared UI Frame"
Cohesion: 0.57
Nodes (3): AppFrame(), AppFrameProps, appTheme

### Community 57 - "Nest CLI Configuration"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 58 - "Access Ownership Policies"
Cohesion: 0.40
Nodes (6): Staff por token, Roles, Permissions and Access Model, Client and Event Ownership Isolation, Access and Ownership Matrix, Resource Authorization Policies, Staff Scanner Flow

### Community 59 - "Client Integration Tests"
Cohesion: 0.60
Nodes (3): createPlatformAdmin(), registerPlanner(), registrationPassword()

## Knowledge Gaps
- **353 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+348 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AuthPrincipal` connect `API Service Logic` to `Authentication Service`, `Admin Client Endpoints`, `Authentication DTO Validation`, `Admin User Management`, `Authentication Controller API`, `Client User Endpoints`, `Client Account Endpoints`, `Session Authentication Guard`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `AppConfigService` connect `Application Configuration Services` to `Authentication Service`, `Session Cookie Handling`, `Authentication Origin Guards`, `Environment Configuration`, `Authentication DTO Validation`, `Local Admin Seeding`, `Session Authentication Guard`, `Audited Mutations`, `Prisma Database Integration`, `OpenAPI Application Bootstrap`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `Prisma Database Integration` to `API Service Logic`, `Authentication Service`, `Password Hashing`, `Audit Data Sanitization`, `Application Configuration Services`, `Public Health Routes`, `Audit Actor Modeling`, `Audited Mutations`, `Client Integration Tests`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AppConfigService` (e.g. with `seedLocalAdmin()` and `createApp()`) actually correct?**
  _`AppConfigService` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _353 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Service Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.06765463917525773 - nodes in this community are weakly interconnected._
- **Should `API Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._