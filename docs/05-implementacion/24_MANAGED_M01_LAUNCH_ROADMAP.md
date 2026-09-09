# 24 — Managed M01 Launch Roadmap

Estado: **ACTIVE — ROADMAP TÉCNICO DEL SIGUIENTE LANZAMIENTO**

Dirección de producto: `docs/00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`.

Este roadmap sustituye como orden activo a los roadmaps Commercial/Pilot/UI/Floorplan anteriores. Esos documentos permanecen como historial o contratos de capacidades ya construidas.

## 1. Objetivo

Certificar para octubre un único producto:

> **InvitacionesPremium prepara el Evento; el Planner administra invitados, confirmaciones, mesas y Staff; Staff opera el acceso.**

El lanzamiento sólo certifica **M01 — Managed para Planner independiente**.

No intentar cerrar M02–M05, Self-Service, Partner/Venue pricing, checkout, créditos visibles ni Finance V3 durante este roadmap.

## 2. Evidencia de entrada

La auditoría Astra sobre `main@9cfde0152004448db1f4fc86b45a500873b935bc` encontró:

- 192 operaciones HTTP implementadas y presentes en OpenAPI;
- paridad Controller ↔ OpenAPI en método/ruta;
- 7 llamadas SDK/Client a rutas de Croquis que ya no existen;
- 39 operaciones sin consumidor de aplicación localizado, muchas de ellas capacidades reservadas o flujos no prioritarios;
- wrappers de transporte manuales que pueden compilar aunque la ruta haya desaparecido;
- contradicción histórica entre superficies Planner y Provider;
- gaps de lifecycle, Invitaciones/RSVP, reversión de check-in, Reports y Album;
- ausencia de evidencia versionada suficiente para rate limiting/Auth0 de producción;
- Realtime local a proceso, aceptable sólo mientras la topología objetivo sea una instancia API.

La auditoría **no autoriza implementar todos sus R-01…R-11**. Este roadmap reclasifica esos hallazgos para M01.

## 3. Principios

1. `REUSE > ADAPT > BUILD > REWRITE`.
2. Backend existente no se conecta a UI sólo porque existe.
3. Managed se decide por capability/profile operativo, nunca por `ClientType`, `CommercialChannel`, pricing o créditos.
4. Ocultar una acción en UI no sustituye un gate API.
5. No restaurar rutas Planner retiradas para Croquis técnico.
6. Provider conserva preparación técnica; Planner conserva operación de invitados/mesas/Staff.
7. Finance/Pricing existentes se preservan, pero M01 no obliga al Planner a utilizarlos.
8. No ampliar producto para “hacer coincidir” documentos o endpoints históricos.
9. Todo ticket P0 debe dejar pruebas negativas de permisos/cross-tenant además del happy path.
10. No declarar lanzamiento listo con CI rojo o recorrido E2E incompleto.

---

# CAMINO CRÍTICO

```text
MG-00  Implementation Audit + capability map
   ↓
MG-01  Managed Profile Foundation
   ↓
MG-01A SDK/OpenAPI Transport Guard
   ↓
MG-02  Managed Planner Surface
   ↓
MG-02A Planner Operations Completeness
   ↓
MG-03  Managed Activation
   ↓
MG-04  Elena & Mateo Demo Fixture
   ↓
MG-05  Managed E2E / Release UAT
```

Trabajo posterior que no bloquea el primer demo:

```text
MG-06 Reports Lite
MG-07 Album Management
```

Release gates transversales:

```text
RG-01 Security / anti-abuse / production auth evidence
RG-02 Deployment topology / realtime single-instance declaration
```

---

# MG-00 — Managed Profile Implementation Audit

Prioridad: **P0**  
Tipo: **documental / archaeology**  
Código: **NO**

## Objetivo

Convertir el runtime y la auditoría Astra en una matriz de implementación M01, archivo por archivo y endpoint por endpoint.

## Clasificaciones obligatorias

- `EXISTS`
- `ADAPT`
- `MISSING`
- `HIDE_FOR_MANAGED`
- `FINANCE_COUPLED`
- `BROKEN_REPAIR`
- `FUTURE_PRESERVE`
- `OUT_OF_SCOPE`

## Debe cubrir

- creación/configuración de Client y Event;
- selección de SKU;
- Invitation Design / assets / hotspots;
- Croquis / shapes / seats / tables;
- Invitados / Invitations / Assistants / Groups;
- RSVP / confirmation operations;
- Seating Planner;
- Staff / Scanner / check-in / revert;
- lifecycle requerido para M01;
- Finance UI y activation coupling;
- Reports;
- Album;
- Landing/Lead sólo para confirmar que no auto-provisiona;
- Demo fixture;
- SDK/OpenAPI transport drift.

## Hallazgos Astra que deben resolverse aquí

- AUD-01: 7 llamadas Croquis Client a rutas inexistentes → `BROKEN_REPAIR` + `HIDE_FOR_MANAGED`; no restaurar rutas Planner.
- AUD-02: mutaciones Planner de Design/Assets/Hotspots → decidir por capability Managed, no por historial.
- AUD-03: wrappers manuales pueden apuntar a rutas inexistentes → convertir en MG-01A.
- AUD-04/05/06/09: clasificar sólo las operaciones necesarias para el recorrido M01.
- AUD-07/08: mover a MG-07/MG-06 salvo dependencia real del demo.
- AUD-10: Organization → `FUTURE_PRESERVE`.
- AUD-12/13: no bloquear M01 salvo necesidad operativa demostrada.
- AUD-16/17: convertir en release gates RG-01/RG-02.

## Salida

Crear:

`docs/05-implementacion/MG00_MANAGED_PROFILE_IMPLEMENTATION_AUDIT.md`

Debe terminar con tickets concretos para MG-01, MG-01A, MG-02, MG-02A y MG-03.

## Cierre

No quedan decisiones ambiguas sobre quién puede crear/modificar:

- Event técnico;
- SKU;
- Invitation Design;
- FileAssets técnicos;
- Hotspots;
- Croquis geometry;
- tables/seats structure;
- invitados/acompañantes;
- RSVP;
- seating assignment;
- Staff.

---

# MG-01 — Managed Profile Foundation

Prioridad: **P0**

## Objetivo

Dar al runtime una forma explícita de saber si un Client/Event opera como `MANAGED`, sin reutilizar pricing o canal comercial.

## Alcance esperado

- capability/profile persistido o mecanismo equivalente aprobado por MG-00;
- M01 certifica sólo `MANAGED`;
- futuras capacidades `SELF_SERVICE` quedan preservadas pero no activas;
- policy central reutilizable por API y frontend;
- Admin puede identificar el profile;
- Planner no puede autoelevar su profile;
- migración/backfill sin falsificar comportamiento histórico.

## Debe bloquear en Managed

Mutaciones Planner de preparación técnica identificadas por MG-00, incluyendo como mínimo si siguen presentes:

- creación técnica/self-service de Event;
- cambio de SKU/configuración técnica;
- Invitation Design estructural;
- technical FileAssets;
- Hotspots;
- Croquis geometry y structural tables/seats.

## No hacer

- borrar APIs Self-Service;
- usar `CommercialChannel` como profile;
- crear roles nuevos;
- tocar Finance todavía.

---

# MG-01A — SDK/OpenAPI Transport Guard

Prioridad: **P0 técnico**

## Motivo

Astra demostró que `generate:check` y typecheck podían estar verdes con 7 wrappers que llamaban rutas inexistentes.

## Objetivo

Hacer imposible que un wrapper versionado apunte silenciosamente a una operación método+ruta inexistente en OpenAPI.

## Alcance

- inventario machine-checkable de wrappers → operation;
- cubrir método, path y parámetros;
- soportar `PUT` real;
- CI debe fallar si se elimina/renombra una operación usada por SDK;
- resolver específicamente las 7 rutas Floorplan históricas;
- no generar DTOs paralelos.

## Cierre

- cero wrappers hacia rutas inexistentes;
- test negativo demuestra que un path o método inválido rompe CI;
- OpenAPI/API-client drift sigue verde.

---

# MG-02 — Managed Planner Surface

Prioridad: **P0**

## Objetivo

Convertir `apps/client` en una experiencia operativa para Planner Managed, no en un builder técnico Self-Service.

## HIDE_FOR_MANAGED

Según MG-00/MG-01, esconder y bloquear navegación ordinaria a:

- `Nuevo evento` Self-Service;
- Wizard técnico de producto;
- selección/cambio técnico de SKU;
- editor Flyer/Flipbook;
- assets/hotspots técnicos;
- builder Croquis;
- creación estructural de mesas/seats Provider;
- Finance/wallet para M01.

## Mantener/fortalecer

- lista de Eventos asignados;
- resumen;
- invitados;
- acompañantes;
- distribución;
- RSVP operativo;
- seating sobre Croquis Provider;
- Staff;
- operación/event activity.

## Importante

No basta UI gating. URL directa y API deben respetar Managed.

Las siete llamadas rotas de Croquis deben desaparecer del recorrido Managed; no se redirigen a Admin.

---

# MG-02A — Planner Operations Completeness

Prioridad: **P0/P1 según MG-00**

## Objetivo

Conectar exclusivamente capacidades backend ya existentes que el Planner Managed realmente necesita para operar un Evento de principio a fin.

## Candidatos P0 a validar en MG-00

### Invitaciones / acompañantes

Evaluar y conectar lo necesario de:

- detalle/update/cancel de Invitation;
- create/update/delete Assistant.

No conectar endpoints redundantes si la pantalla agregada existente resuelve el caso.

### RSVP operativo

Evaluar y conectar:

- confirmation summary;
- close/reopen confirmation;
- override nominal autorizado.

### Lifecycle

Para primer lanzamiento priorizar sólo transiciones necesarias para el recorrido real, probablemente:

- ACTIVE/EVENT_DAY → CLOSED;
- recuperación/lectura posterior.

Cancel/reopen/archive/delete sólo entran si MG-00 demuestra dependencia P0.

### Check-in recovery

`revert` no se conecta hasta que exista una forma durable y autorizada de localizar el `checkInId` tras reload. Si falta contrato de lectura, queda P1 y no se inventa endpoint sin decisión Technical Owner.

## No hacer

- Organization team UI;
- Album;
- Reports completos;
- upgrade service;
- refunds;
- nuevos workflows de mensajería.

---

# MG-03 — Managed Activation

Prioridad: **P0 / mayor riesgo técnico**

## Objetivo

Permitir activar un Evento Managed preparado por Provider sin pago ficticio, wallet visible ni carga manual de créditos.

Objetivo conceptual:

```text
PRODUCT READINESS
+
PLATFORM ADMIN AUTHORIZATION
=
ACTIVE
```

## Preservar

- readiness;
- tenant isolation;
- assignment;
- actor real;
- idempotencia;
- AuditLog;
- lifecycle invariants;
- históricos financieros existentes.

## Prohibido

- borrar Finance/Ledger/Pricing;
- generar Ledger/Receipt falsos;
- otorgar créditos silenciosamente;
- crear Payment ficticio;
- reinterpretar Managed como `STANDARD/PARTNER/VENUE`.

## Trabajo previo obligatorio

MG-00 debe mapear:

- `EventsService.activate`;
- `EventCommercialService.assertActivationLock`;
- `FinanceService.consumeEventActivation`;
- Event activation snapshots;
- triggers/migrations de activation references.

El contrato final se define antes de code.

---

# MG-04 — Commercial Demo Fixture

Prioridad: **P0**

## Objetivo

Crear un fixture reproducible exclusivamente de desarrollo/demo:

**Boda de Elena & Mateo**

Debe cubrir:

- Client/Planner M01 Managed;
- Event preparado;
- Flyer o Flipbook;
- invitados y acompañantes ficticios;
- RSVP;
- Croquis real;
- Mesas/seating;
- Staff;
- QR;
- check-in;
- estado de operación adecuado para demo.

## Reglas

- idempotente;
- sin PII real;
- sin endpoint productivo de seed;
- no bypass de seguridad productiva mediante código compartido;
- no depender de pagos/créditos para preparar el demo M01.

---

# MG-05 — Managed E2E / Release UAT

Prioridad: **P0 / gate final**

## Journey obligatorio

```text
Platform Admin prepara Event
→ Planner recibe Event listo
→ Planner carga/gestiona invitados
→ Invitado abre Invitación
→ RSVP
→ Planner ve confirmación
→ Planner asigna Mesa
→ Planner crea Staff
→ Staff abre Scanner
→ QR check-in
→ Planner/Admin observan operación
→ Evento cierra
```

## Stop conditions

No cerrar si existe:

- CI rojo;
- ruta SDK rota;
- bypass Managed por URL/API;
- cross-tenant;
- Planner no asignado con acceso;
- preparación técnica requerida desde Client;
- pago/crédito ficticio necesario;
- Staff dependiente de endpoint manual fuera de UI;
- check-in no recuperable para el flujo ofrecido;
- decisión de producto no documentada.

## Cierre

El sistema permite demostrar M01 completamente contra runtime real, sin mocks de dominio y sin workarounds P0/P1.

---

# MG-06 — Reports Lite

Prioridad: **P1 posterior al primer recorrido demostrable**

Astra AUD-08 confirma backend sin productor frontend completo.

Implementar sólo el reporte mínimo que Producto decida ofrecer. No conectar los cinco endpoints sólo para elevar cobertura de consumo.

No bloquear MG-05 salvo que ventas requiera explícitamente reportes en la primera demo.

---

# MG-07 — Album Management

Prioridad: **P1 posterior**

Astra AUD-07 confirma backend/público parcialmente existente y gestión autenticada no conectada.

No bloquear M01 base. No habilitar Album en `PHYSICAL_QR`.

---

# RG-01 — Production Security / Anti-Abuse Gate

Prioridad: **P0 antes del primer piloto externo real**, no necesariamente antes de demos locales/presenciales.

Debe acreditar en el entorno objetivo:

- estrategia de autenticación autorizada;
- cookies/HTTPS/origin;
- login brute-force/rate limit;
- register-planner antiabuse si permanece público;
- commercial-leads antiabuse;
- token endpoints;
- secretos/config;
- backups/restore operativo cuando aplique.

La auditoría Astra no demostró una vulnerabilidad; demostró ausencia de evidencia completa para producción.

---

# RG-02 — Deployment / Realtime Topology Gate

Para M01 inicial se autoriza como supuesto operativo:

```text
API replicas = 1
```

mientras Socket.IO mantenga rooms/dedupe/conexiones en memoria de proceso.

Antes de escalar a múltiples réplicas debe existir coordinación realtime distribuida o decisión arquitectónica equivalente.

No introducir Redis sólo para cerrar el roadmap M01.

---

# Trabajo congelado

Durante MG-00…MG-05 NO iniciar:

- M02 Organization completo;
- M03 Self-Service;
- M04 Enterprise/dedicated;
- M05 Reseller;
- Partner pricing nuevo;
- Venue pricing nuevo;
- Finance V3;
- checkout/pagos/suscripciones;
- service upgrade;
- refunds/reversals nuevos;
- marketplace;
- WhatsApp/SMS;
- CRM;
- multi-replica realtime;
- refactor masivo de Floorplan/EventsService por tamaño.

---

# Mapeo de auditoría Astra → roadmap M01

| Astra | Disposición M01 |
|---|---|
| AUD-01 Croquis Client roto | MG-00 → MG-01/MG-02, P0 |
| AUD-02 Planner vs Provider contradictorio | MG-00 → MG-01/MG-02, P0 |
| AUD-03 SDK drift | MG-01A, P0 técnico |
| AUD-04 Lifecycle sin UI | MG-02A, sólo subset necesario |
| AUD-05 Invitations nominal | MG-02A |
| AUD-06 Confirmation | MG-02A |
| AUD-07 Album | MG-07 |
| AUD-08 Reports | MG-06 |
| AUD-09 Check-in revert | MG-02A P1 salvo bloqueo demo |
| AUD-10 Organization account/team | FUTURE / M02 |
| AUD-11 Edit group | P2 / sólo si operación lo requiere |
| AUD-12 FileAsset utilities | Preserve / no action |
| AUD-13 Admin catalog | P2 interno |
| AUD-14 docs mixed | Governance/docs; no runtime feature |
| AUD-15 boundaries | P2/P3 engineering guard |
| AUD-16 auth/antiabuse evidence | RG-01 |
| AUD-17 realtime single-process | RG-02 |

---

# Orden de ejecución autorizado

A partir de este documento:

1. ejecutar únicamente **MG-00**;
2. Technical Owner revisa y aprueba la auditoría;
3. convertir MG-01/MG-01A/MG-02/MG-02A/MG-03 en tickets pequeños;
4. no delegar todo el roadmap a un único agente;
5. MG-04 y MG-05 sólo después de cerrar las dependencias P0.

Este roadmap define orden y alcance; no sustituye contratos técnicos especializados ni autoriza por sí solo una mutación de dominio.
