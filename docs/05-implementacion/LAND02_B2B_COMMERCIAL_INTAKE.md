# LAND-02 — Intake comercial B2B desde Landing

Estado: **READY FOR CODE**  
Issue: **#41**  
Dependencia: **#40 LAND-01 — COMPLETED**

## 1. Objetivo

Dar una salida comercial real a las rutas **Planner/agencia** y **Venue** de la Landing sin confundir una oportunidad comercial con una cuenta, un Cliente, un Evento o una clasificación de pricing.

LAND-02 implementa únicamente:

1. captura pública de una oportunidad B2B;
2. persistencia mínima y segura del lead;
3. protección básica contra duplicados/spam;
4. consulta read-only por Platform Admin;
5. integración de los CTA de Landing.

No implementa CRM, pipeline comercial, conversión automática, WhatsApp API, email automation ni pricing automático.

## 2. Fuentes y precedencia

Leer y respetar:

1. `AGENTS.md`;
2. `docs/INDEX.md`;
3. `docs/01-producto/05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`;
4. `docs/01-producto/05A_PRICING_RESOLUTION_CLARIFICATION.md`;
5. `docs/01-producto/05B_LANDING_COMMERCIAL_SALES_CONTRACT.md`;
6. `docs/01-producto/04_OPERATOR_LED_MVP.md`;
7. este contrato;
8. `docs/05-implementacion/20_COMMERCIAL_PILOT_ROADMAP.md`;
9. issue #41.

## 3. Regla de dominio

Una oportunidad comercial NO es:

- `Client`;
- `User`;
- `Event`;
- `CommercialChannel` asignado;
- tarifa Partner;
- tier Venue;
- cotización;
- crédito/deuda;
- CRM entity con workflow.

Debe existir como entidad independiente `CommercialLead` sin FK a `Client`, `User` o `Event`.

La conversión posterior a Cliente queda fuera de LAND-02 y deberá usar los flujos administrativos autorizados existentes/futuros.

## 4. Modelo de datos

Agregar enum Prisma:

```prisma
enum CommercialOpportunityType {
  PLANNER_AGENCY
  VENUE

  @@map("commercial_opportunity_type")
}
```

Agregar modelo:

```prisma
model CommercialLead {
  id                       String                    @id @default(uuid()) @db.Uuid
  submissionId             String                    @unique @map("submission_id") @db.Uuid
  opportunityType          CommercialOpportunityType @map("opportunity_type")
  contactName              String                    @map("contact_name") @db.VarChar(160)
  businessName             String                    @map("business_name") @db.VarChar(160)
  email                    String                    @db.VarChar(320)
  phone                    String?                   @db.VarChar(32)
  estimatedEventsPerMonth  Int?                      @map("estimated_events_per_month")
  notes                    String?                   @db.VarChar(1000)
  privacyAcceptedAt        DateTime                  @map("privacy_accepted_at") @db.Timestamptz(6)
  createdAt                DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([createdAt, id])
  @@index([opportunityType, createdAt])
  @@index([email, createdAt])
  @@map("commercial_lead")
}
```

No agregar `status`, `assignedTo`, `clientId`, `convertedAt`, tags, activity log ni campos de CRM en este ticket.

No agregar `updatedAt` porque LAND-02 es append-only.

## 5. Normalización y validación

### Campos públicos

- `submissionId`: UUID requerido;
- `opportunityType`: `PLANNER_AGENCY | VENUE`;
- `contactName`: trim, 2..160;
- `businessName`: trim, 2..160;
- `email`: trim + lowercase, email válido, max 320;
- `phone`: opcional; si viene, reutilizar `apps/api/src/contacts/phone-normalizer.ts`; almacenar E.164; vacío => null;
- `estimatedEventsPerMonth`: opcional, entero 1..10000;
- `notes`: opcional, trim, max 1000; vacío => null;
- `privacyAccepted`: debe ser exactamente `true`;
- `website`: honeypot técnico opcional, string max 200; NUNCA persistir.

DTO estricto: propiedades desconocidas => 400.

No aceptar HTML enriquecido ni archivos.

## 6. API pública

Crear módulo dedicado, preferentemente:

`apps/api/src/commercial-leads/`

Endpoint:

```http
POST /api/v1/public/commercial-leads
```

Debe usar `@PublicRoute()`.

Request:

```json
{
  "submissionId": "uuid",
  "opportunityType": "PLANNER_AGENCY",
  "contactName": "...",
  "businessName": "...",
  "email": "...",
  "phone": "+52...",
  "estimatedEventsPerMonth": 4,
  "notes": "...",
  "privacyAccepted": true,
  "website": ""
}
```

Respuesta pública deliberadamente mínima:

```json
{
  "accepted": true
}
```

No devolver email, teléfono, notas, leadId ni información sobre existencia previa.

## 7. Idempotencia y deduplicación

### 7.1 Transport retry

`submissionId` es idempotency key del formulario.

Si ya existe un lead con el mismo `submissionId`:

- si el payload normalizado coincide: responder `{ accepted: true }`, sin nueva fila ni nueva auditoría;
- si el payload difiere: `409 COMMERCIAL_LEAD_IDEMPOTENCY_CONFLICT`.

### 7.2 Reload / submit accidental

Antes de insertar, buscar un lead creado en los últimos **10 minutos** con:

- mismo `opportunityType`;
- mismo email normalizado;
- mismo `businessName` normalizado;
- mismo `contactName` normalizado;
- mismos valores normalizados de phone / estimatedEventsPerMonth / notes.

Si existe, responder `{ accepted: true }` sin crear otra fila.

Esto evita duplicación por reload incluso si el navegador generó un `submissionId` nuevo.

## 8. Rate limit y anti-spam

No agregar Redis ni dependencia de rate-limit externa para este corte.

No almacenar IP.

### 8.1 Lock DB

Antes de dedupe/rate-limit/inserción adquirir un PostgreSQL transaction advisory lock derivado del **email normalizado**. El objetivo es serializar solicitudes concurrentes del mismo email sin crear una tabla de locks.

Puede usarse `pg_advisory_xact_lock(hashtextextended(...))` o equivalente PostgreSQL seguro dentro de la transacción.

### 8.2 Rate limit

Después de deduplicación exacta y antes de insertar un lead nuevo:

- máximo **3 leads nuevos por email normalizado en una ventana móvil de 60 minutos**;
- exceder => HTTP 429 con código `COMMERCIAL_LEAD_RATE_LIMITED`;
- los retries/deduplicados que no crean fila no consumen cupo adicional.

### 8.3 Honeypot

Si `website` contiene texto no vacío:

- responder `{ accepted: true }`;
- no persistir lead;
- no crear Client/User/Event;
- no escribir PII en logs/audit.

No revelar al caller que fue filtrado.

## 9. Atomicidad

La evaluación de:

1. `submissionId`;
2. advisory lock;
3. deduplicación reciente;
4. rate limit;
5. inserción;
6. auditoría sanitizada

debe ejecutarse de forma coherente en una transacción crítica.

No dejar una fila sin su rastro de auditoría cuando la creación fue nueva.

## 10. Auditoría

Reutilizar `AuditService`.

Sólo para una fila NUEVA:

- actor: `AuditActorFactory.system()`;
- `resourceType = COMMERCIAL_LEAD`;
- `resourceId = commercialLead.id`;
- `action = COMMERCIAL_LEAD_CREATE`;
- `operationId` del request cuando esté disponible;
- metadata/afterData permitida únicamente con:
  - `opportunityType`;
  - `createdAt`;
  - `source: LANDING`.

PROHIBIDO en AuditLog:

- contactName;
- businessName;
- email;
- phone;
- notes;
- submissionId.

La PII vive sólo en `CommercialLead`.

## 11. API Admin

Sólo `PLATFORM_ADMIN`.

Endpoints:

```http
GET /api/v1/admin/commercial-leads
GET /api/v1/admin/commercial-leads/{leadId}
```

No crear POST/PATCH/DELETE Admin para leads en LAND-02.

### List query

- `opportunityType?`;
- `cursor?`;
- `limit?` default 25, max 100.

Orden:

`createdAt desc`, `id desc`.

Response page:

```ts
{
  items: CommercialLeadResponseDto[];
  nextCursor: string | null;
}
```

Admin response sí incluye los campos del lead necesarios para seguimiento manual.

No incluir metadata técnica de anti-spam.

## 12. OpenAPI / api-client

Generar contratos y runtime validators.

En `packages/api-client`:

- tipo `CommercialOpportunityType`;
- tipo `CommercialLeadInput`;
- tipo `CommercialLead` Admin;
- factory pública dedicada, por ejemplo `createPublicCommercialLeadsApiClient`;
- client Admin `adminCommercialLeads` dentro de `createApiClient`.

Las requests públicas deben conservar `credentials: 'omit'` mediante el patrón existente en `public.ts`.

No usar `fetch` directo desde Landing.

## 13. Landing

Crear un único formulario/modal reutilizable, preferentemente:

`CommercialLeadModal.tsx`

El formulario recibe el `opportunityType` preseleccionado por el CTA y NO permite convertirlo en registro de usuario.

### Planner/agencia

CTA comercial de `LandingPlanners`:

`Conocer condiciones para Planners`

Debe abrir el modal con:

`PLANNER_AGENCY`.

El CTA secundario:

`Crear cuenta de Planner`

sigue abriendo `RegisterPlannerModal`.

Son acciones y componentes distintos.

### Venue

`LandingVenue` deja de mostrar un CTA inerte y abre el mismo modal con:

`VENUE`.

Nunca abre `RegisterPlannerModal`.

### Form fields

- Nombre de contacto;
- Empresa / venue / agencia;
- Email;
- Teléfono / WhatsApp opcional;
- Eventos estimados por mes opcional;
- Mensaje opcional;
- checkbox obligatorio de uso de datos para seguimiento comercial;
- honeypot invisible para usuario/asistencia.

No persistir PII en localStorage/sessionStorage.

`submissionId` se genera al iniciar una intención de envío y se conserva para retries mientras el modal siga en esa solicitud.

No auto-retry.

Bloquear doble submit mientras una request está pendiente.

### Estados UX

- idle;
- submitting;
- success;
- error;
- rate-limited.

Success copy natural, sin prometer tiempo de respuesta ni aprobación Partner/Venue.

Ejemplo:

`Recibimos tu solicitud. La revisaremos para continuar el proceso comercial.`

No decir:

- "ya eres Partner";
- "tu tarifa está aprobada";
- "tu cuenta fue creada";
- "tu venue fue registrado".

## 14. Admin UI

Agregar navegación:

`Oportunidades`

Ruta:

```text
/oportunidades
/oportunidades/:leadId
```

Pantalla lista read-only:

- canal: Planner/agencia o Venue;
- contacto;
- empresa;
- email;
- teléfono si existe;
- eventos estimados/mes si existe;
- fecha de recepción.

Detalle read-only:

- todos los campos anteriores;
- notas;
- aceptación/fecha de privacidad.

No agregar:

- estados de CRM;
- editar;
- borrar;
- asignar vendedor;
- convertir a Client;
- aprobar tarifa;
- enviar email/WhatsApp;
- comentarios internos.

Usar React Query y patrones Admin existentes.

## 15. Seguridad / privacidad

- endpoint público no requiere sesión;
- endpoint Admin sólo Platform Admin;
- Planner/Organization/Staff/Public no pueden listar/ver leads;
- no exponer PII en AuditLog;
- no exponer leads por endpoint público;
- no persistir honeypot;
- no registrar body completo de requests;
- no guardar IP;
- no crear recursos de negocio adicionales.

## 16. Tests obligatorios

### PostgreSQL integration

Cubrir al menos:

1. submit `PLANNER_AGENCY` válido => 1 CommercialLead;
2. submit `VENUE` válido => 1 CommercialLead;
3. email lowercased/trimmed;
4. phone reutiliza normalizador E.164;
5. privacy false/missing => 400;
6. unknown field => 400;
7. honeypot => 201/accepted y 0 rows;
8. mismo submissionId + mismo payload => 1 row;
9. mismo submissionId + payload diferente => 409;
10. exact duplicate reciente con submissionId nuevo => 1 row;
11. cuarto lead nuevo del mismo email en 60 min => 429;
12. solicitudes concurrentes no exceden invariantes;
13. alta nueva escribe exactamente un audit sanitizado;
14. audit no contiene email/phone/name/notes/submissionId;
15. no crea Client/User/Event/ServicePrice/Ledger/Receipt;
16. Admin Platform puede listar/ver;
17. Planner recibe 403 en Admin;
18. anónimo no puede usar Admin;
19. lead inexistente => 404;
20. PATCH/DELETE Admin => 404.

### API client

- public submit path/credentials;
- Admin list/detail;
- runtime validation;
- generated drift verde.

### Landing

- CTA Planner comercial abre lead modal `PLANNER_AGENCY`;
- CTA crear cuenta sigue abriendo RegisterPlannerModal;
- CTA Venue abre lead modal `VENUE`;
- validación required/privacy;
- doble click => un POST;
- network error no auto-retry;
- retry conserva intención/submissionId;
- success no implica account/Partner/tarifa;
- 429 tiene copy natural;
- modal mobile/desktop + keyboard/focus.

### Admin

- ruta/nav `Oportunidades`;
- lista;
- filtro por opportunity type;
- detalle;
- no acciones de CRM;
- loading/error/empty states.

## 17. No objetivos

Fuera de alcance:

- CRM;
- lead status;
- salesperson assignment;
- lead conversion workflow;
- automatic Client/User creation;
- automatic commercialChannel;
- Partner/Venue price resolution;
- cotización;
- email automation;
- WhatsApp API;
- webhook;
- file attachments;
- analytics/marketing pixels;
- CAPTCHA externo;
- Redis.

## 18. DoD

LAND-02 se considera completo cuando un Planner/agencia o Venue puede enviar una oportunidad accionable desde Landing, el sistema evita duplicados accidentales y abuso básico, el Platform Admin puede verla de forma read-only y no existe ninguna ruta implícita desde Lead hacia Client/User/Event/pricing.
