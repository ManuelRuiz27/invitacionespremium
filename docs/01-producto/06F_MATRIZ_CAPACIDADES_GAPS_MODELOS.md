# 06F — Matriz transversal de capacidades y gaps M01–M05

Estado: **AUDITORÍA FUNCIONAL CONTRA RUNTIME — NO AUTORIZA CODE**  
Baseline auditado: `main` posterior a la definición de M01–M05  
Objetivo: identificar qué ya existe, qué sólo requiere adaptación de superficie, qué falta realmente y qué pertenece a Finance/Commercial antes de abrir tickets de implementación.

## 1. Alcance

Esta auditoría compara los modelos:

- M01 — Planner independiente, servicio gestionado;
- M02 — salón/jardín como Organización, servicio gestionado;
- M03 — Organización con licencia/autoservicio;
- M04 — cliente de gran escala / servicio dedicado;
- M05 — Partner/Reseller como capa comercial.

No redefine contratos especializados ni autoriza cambios de dominio, permisos, pricing o infraestructura.

## 2. Clasificación

- `EXISTS` — la capacidad está implementada y el runtime observado coincide sustancialmente con el modelo.
- `ADAPT` — existe la capacidad base, pero la exposición, UX, policy, escala o reparto de responsabilidades no coincide todavía con el modelo.
- `MISSING` — no existe una superficie/capacidad necesaria para cumplir el modelo.
- `FINANCE-ONLY` — la diferencia pertenece a pricing, cobro, margen, volumen, licencia o condiciones comerciales; no debe generar funcionalidad operativa nueva.
- `OUT-OF-SCOPE` — no forma parte del modelo aprobado o requiere una decisión posterior independiente.

Una misma capability puede tener dos clasificaciones cuando existe backend pero falta superficie de cliente; en ese caso se documenta por separado.

## 3. Hallazgos ejecutivos

### 3.1 M01 está cerca del runtime, pero la superficie Client expone demasiado autoservicio

El backend, Admin, Planner workspace, Staff y Scanner ya cubren la mayor parte del modelo gestionado.

Sin embargo, `apps/client` conserva rutas y herramientas de creación/configuración completas, incluido el editor de Invitación y `FloorplanStep`. Para M01, el problema principal no es construir funcionalidades nuevas, sino **diferenciar la superficie gestionada de la superficie autoservicio**.

### 3.2 M02 reutiliza correctamente los roles actuales

El runtime ya resuelve:

- `ORGANIZATION_ADMIN` con acceso a todos los Eventos del tenant;
- `ORGANIZATION_PLANNER` únicamente sobre Eventos asignados;
- `assignedPlannerUserId` como ownership operativo;
- gestión de usuarios Planner en API;
- Staff Event-scoped.

Los gaps reales están principalmente en la **UI organizacional**: administración de Planner internos, asignación/reasignación desde la Organización y una vista de cartera que muestre responsable/pendientes.

### 3.3 M03 está más cerca de existir técnicamente de lo esperado

El Client actual ya contiene:

- creación de Evento;
- Wizard de configuración;
- carga/gestión de invitados;
- edición de Flyer/Flipbook y hotspots;
- Confirmaciones;
- `FloorplanStep`;
- pases físicos;
- revisión/activación;
- distribución;
- Seating;
- Staff.

Por tanto, M03 no requiere reconstruir el producto. Requiere **formalizar un perfil/capability de autoservicio** y completar superficies de Organización que hoy no están en Client.

### 3.4 M04 es principalmente un problema de escala certificada, no de nuevo dominio

`Event.capacity` acepta técnicamente valores mayores a 150. El límite de 150 está actualmente en el flujo comercial `Admin Event Intake / Pricing V2`, no en el campo base de capacidad del Evento.

Esto refina cualquier lectura anterior de M04: **150 es hoy el límite del perfil comercial/intake pagado certificado, no una prueba de que el dominio Event sea incapaz de representar 500–2,000 personas.**

M04 sigue requiriendo validación real de importación, RSVP, Seating, Scanner concurrente, Staff, reportes y rendimiento end-to-end.

### 3.5 Reportes y Álbum tienen backend, pero faltan superficies operativas claras en Client

El API contiene módulos/controllers de `reports` y `albums`; Client contiene el visor público del Álbum. Sin embargo, el árbol completo de `apps/client/src` no contiene una pantalla operativa de Reportes ni una superficie de gestión/publicación de Álbum para Planner/Organization.

Esto es un gap transversal de producto, no un problema comercial.

### 3.6 M05 no genera gaps funcionales

Partner/Reseller continúa siendo una condición comercial sobre M01–M04. No requiere un rol nuevo ni cambios de permisos por sí mismo.

## 4. Evidencia estructural del runtime

### Roles y ownership

El runtime conserva los roles:

- `PLATFORM_ADMIN`;
- `INDEPENDENT_PLANNER`;
- `ORGANIZATION_ADMIN`;
- `ORGANIZATION_PLANNER`.

`EventAccessPolicy` aplica `clientId` para tenant isolation y agrega `assignedPlannerUserId = principal.userId` únicamente para `ORGANIZATION_PLANNER`.

Resultado:

- Planner independiente → Eventos de su Client;
- Admin Organización → todos los Eventos de su Organización;
- Planner Organización → únicamente Eventos asignados.

### Client actual

Las rutas principales son:

- `/eventos`;
- `/eventos/nuevo`;
- `/eventos/:eventId/configuracion/:step`;
- `/eventos/:eventId`;
- `/finanzas` para roles autorizados.

La navegación global de Client sólo expone actualmente:

- Eventos;
- Finanzas cuando el rol corresponde.

No existe navegación Client para:

- Equipo/usuarios de Organización;
- asignación de Planner;
- Reportes;
- gestión de Álbum.

### Admin actual

Admin contiene superficies para:

- lista/detalle global de Eventos;
- intake de Evento;
- asignación de Planner;
- preparación operator-led;
- Croquis/preparación;
- observaciones/unit economics y capacidades administrativas asociadas.

### API actual

El backend contiene módulos separados para:

- auth;
- clients/client-users;
- events;
- contacts;
- invitations/invitation-design;
- public-rsvp;
- floorplan;
- staff-access;
- scanner;
- realtime;
- physical-passes;
- reports;
- albums;
- finance;
- services-pricing;
- audit;
- unit-economics.

La base funcional no está fragmentada por modelo comercial.

## 5. Matriz transversal principal

| Capacidad | Evidencia/runtime actual | M01 | M02 | M03 | M04 | Acción posterior |
|---|---|---|---|---|---|---|
| Roles persistidos | 4 roles actuales + Staff token | EXISTS | EXISTS | EXISTS | EXISTS | No crear roles por modelo comercial |
| Tenant isolation | `clientId` en policy | EXISTS | EXISTS | EXISTS | EXISTS | Mantener |
| Planner Org sólo Eventos asignados | `assignedPlannerUserId` en `EventAccessPolicy` | N/A | EXISTS | EXISTS | EXISTS | Mantener/regresión QA |
| Admin Org ve todos sus Eventos | policy por `clientId` | N/A | EXISTS | EXISTS | EXISTS | Adaptar UX organizacional |
| Provider crea Evento para Client | Admin intake existe | EXISTS | EXISTS | SUPPORT | SUPPORT | Mantener como capacidad Admin |
| Provider asigna/reasigna Planner | Admin assignment existe | N/A | EXISTS | SUPPORT | SUPPORT | Mantener |
| Cliente crea Evento | `/eventos/nuevo` + API `POST /events` | ADAPT | ADAPT | EXISTS | EXISTS* | Gating por modelo/perfil, no reimplementar |
| Cliente configura Evento | Wizard completo | ADAPT | ADAPT | EXISTS | EXISTS* | Gating por modelo/perfil |
| Lifecycle Evento | activate/close/reopen/cancel/archive | EXISTS | EXISTS | EXISTS | EXISTS* | QA de escala en M04 |
| Invitados/contactos | API + Wizard | EXISTS | EXISTS | EXISTS | ADAPT | Certificar volumen M04 |
| Importación/listas grandes | Existe funcionalidad base | EXISTS | EXISTS | EXISTS | ADAPT | Pruebas y UX de gran volumen |
| Diseño Flyer/Flipbook | `DesignStep` + hotspots | ADAPT | ADAPT | EXISTS | EXISTS* | Gestionado: review/inputs; self-service: builder |
| Invitación pública | renderers Flyer/Flipbook | EXISTS | EXISTS | EXISTS | EXISTS* | QA de carga M04 |
| RSVP público | API + UI pública según SKU | EXISTS | EXISTS | EXISTS | ADAPT | Pruebas de volumen/concurrencia M04 |
| Distribución de Invitaciones | `InvitationDistribution` | EXISTS | EXISTS | EXISTS | ADAPT | Validar escala M04 |
| Builder Croquis | `FloorplanStep` existe en Client | ADAPT | ADAPT | EXISTS/ADAPT | ADAPT | Separar perfil gestionado vs autoservicio |
| Seating Planner | `SeatingWorkspace` | EXISTS | EXISTS | EXISTS | ADAPT | Certificar listas/mesas masivas |
| Pases físicos | módulo + Wizard | EXISTS cuando aplica | EXISTS cuando aplica | EXISTS cuando aplica | ADAPT | Validar generación masiva |
| Staff token baseline | API + `StaffAccessPanel`, max 3 | EXISTS | EXISTS | EXISTS | ADAPT | M04 requiere estudiar nº accesos/concurrencia |
| Scanner/check-in | API + app Scanner | EXISTS | EXISTS | EXISTS | ADAPT | Load/throughput/contingencia M04 |
| Realtime operativo | módulo + workspace hook | EXISTS | EXISTS | EXISTS | ADAPT | Pruebas concurrentes M04 |
| Reportes backend | controllers/services API | EXISTS | EXISTS | EXISTS | ADAPT | Validar grandes datasets M04 |
| Reportes Client UI | no ruta/componente en Client | MISSING | MISSING | MISSING | MISSING | Ticket transversal posterior |
| Álbum backend | módulo albums + lifecycle | EXISTS cuando aplica | EXISTS cuando aplica | EXISTS cuando aplica | ADAPT | Validar escala/storage M04 |
| Álbum público | `/album/:albumToken` + visor | EXISTS | EXISTS | EXISTS | EXISTS* | QA escala M04 |
| Gestión de Álbum Client | no superficie Client encontrada | MISSING | MISSING | MISSING | MISSING | Ticket transversal posterior |
| Finanzas cuenta | Client Finance para Independent/Admin Org | EXISTS | EXISTS | EXISTS | ADAPT | Finance V3 después del funcional |
| Auditoría | módulo Audit + acciones admin/domain | EXISTS | EXISTS | EXISTS | ADAPT | Revisar volumen/retención M04 |
| Unit economics piloto | módulo + Admin | EXISTS | EXISTS | EXISTS | ADAPT | No mezclar con Ledger |
| Pricing/price lock ≤150 | Pricing V2 + intake comercial | EXISTS | EXISTS | FINANCE-ONLY | FINANCE-ONLY | Revisar sólo al reabrir Finance |
| Pricing >150 | no Price Book/intake vigente | N/A | N/A | N/A | FINANCE-ONLY | Diseñar Finance para M04 después |
| Event.capacity >150 | DTO base permite valores positivos grandes | N/A | N/A | EXISTS técnicamente | EXISTS técnicamente | No confundir capacidad con pricing |
| Deployment dedicado | no baseline necesario para M01–M03 | OUT | OUT | OUT | MISSING/DEFER | Sólo tras sizing/requisito contractual |
| White-label | no forma parte de modelos base | OUT | OUT | OUT | OUT | Decisión comercial separada |
| SSO enterprise | no requerido | OUT | OUT | OUT | OUT | Decisión posterior |

`EXISTS*` en M04 significa que la capacidad funcional existe, pero no está certificada para la escala del escenario.

## 6. Gap analysis M01 — Planner independiente gestionado

### EXISTS

- roles/auth base;
- tenant isolation;
- Event lifecycle;
- Provider Admin intake;
- Provider preparation surface;
- Planner workspace;
- Contactos/Invitados;
- Confirmaciones;
- distribución;
- Seating;
- Staff;
- Scanner/check-in;
- Invitación pública;
- finanzas de Planner;
- audit/unit economics backend.

### ADAPT

#### A. Creación de Evento en Client

M01 define que InvitacionesPremium registra/prepara ordinariamente el Evento. El Client actual expone `/eventos/nuevo` y permite `POST /events`.

No eliminar la capacidad: M03 la necesita.

El gap es de **exposición por perfil operativo**, no de dominio.

#### B. Diseño de Invitación

Client contiene editor completo de Flyer/Flipbook y hotspots. En M01, el Planner debe aportar/revisar información mientras InvitacionesPremium ejecuta la preparación técnica.

Se requiere decidir qué acciones quedan visibles en perfil gestionado sin destruir el editor self-service de M03.

#### C. Builder de Croquis

Client monta `FloorplanStep` dentro del Wizard. Esto contradice la superficie gestionada de M01, donde Provider construye geometría y Planner opera Seating.

El builder debe preservarse para M03 y ocultarse/restringirse en M01 mediante una capacidad explícita, no mediante un fork.

### MISSING

- superficie de Reportes para Planner en Client;
- superficie de gestión/publicación de Álbum en Client cuando el SKU lo permite.

### Conclusión M01

M01 no requiere un rediseño de roles. Su principal trabajo futuro es **cerrar el perfil gestionado de UI/capabilities** y completar Reportes/Álbum.

## 7. Gap analysis M02 — Salón/jardín gestionado

M02 hereda los gaps de M01 y añade necesidades organizacionales.

### EXISTS

- Organización como tenant;
- `ORGANIZATION_ADMIN`;
- `ORGANIZATION_PLANNER`;
- Admin Org ve todo el tenant;
- Planner Org ve sólo Eventos asignados;
- API de usuarios internos (`GET/POST/PATCH /clients/:clientId/users...`);
- Provider Admin puede asignar/reasignar Planner;
- mismo core de invitados, RSVP, Seating, Staff y Scanner.

### ADAPT

#### A. Dashboard de Admin Organización

La lista actual de Eventos funciona, pero es genérica. M02 necesita una vista que priorice:

- qué Eventos existen;
- quién está asignado;
- qué requiere atención;
- próximos/activos;
- resultado/cierre.

Esto es adaptación UX, no nuevo dominio.

#### B. Exposición de herramientas técnicas

Igual que M01, el cliente gestionado no debería recibir por defecto todo el Wizard self-service de diseño/Croquis.

### MISSING

#### A. Gestión de equipo en Client

El backend existe, pero Client no tiene una ruta/pantalla para que `ORGANIZATION_ADMIN` liste, cree o actualice Planner internos.

#### B. Asignación/reasignación por Admin Organización

El endpoint de assignment vigente es administrativo de Platform Admin. `EventsController` Client-owned no expone una operación de assignment.

M02 define que el Admin de Organización debe poder distribuir responsabilidad operativa. Para cumplirlo completamente se necesita:

- contrato de assignment Organization-owned;
- autorización sólo mismo tenant;
- candidatos `ORGANIZATION_PLANNER` activos;
- auditoría;
- UI dentro de Client.

Esto no requiere un rol nuevo.

#### C. Reportes/Álbum Client

Mismos gaps transversales de M01.

### Conclusión M02

El backend de ownership ya está correctamente orientado. El bloque funcional específico pendiente es **Organization Management Surface**: equipo + assignment + overview organizacional.

## 8. Gap analysis M03 — Licencia/autoservicio

### EXISTS

- Organización/roles;
- creación de Evento desde Client;
- Wizard;
- configuración de datos;
- Contactos;
- Invitación/Hotspots;
- Confirmaciones;
- Builder Croquis disponible físicamente en Client;
- Seating;
- Staff;
- Scanner;
- lifecycle/activación;
- finanzas de Admin Org;
- aislamiento tenant.

### ADAPT

#### A. Perfil explícito de autoservicio

Hoy estas capacidades existen porque el Client conserva funcionalidades históricas. No existe todavía una decisión runtime clara que exprese:

> esta Organización opera M03 y por eso recibe builder/configuración completa.

Antes de usar M03 comercialmente debe existir una forma explícita, auditable y no basada únicamente en esconder botones para distinguir M01/M02 de M03.

La forma técnica concreta se decide en ticket/ADR posterior; este documento no inventa un enum nuevo.

#### B. Readiness y onboarding

El Wizard existe, pero M03 requiere que una Organización pueda completar el proceso sin depender de conocimiento interno del Provider. Se necesita QA específico de comprensión, errores, recuperación y guidance.

### MISSING

- gestión de Planner internos en Client;
- assignment/reassignment Organization-owned;
- Reportes Client;
- gestión de Álbum Client.

### FINANCE-ONLY

- mensualidad/anualidad;
- licencia;
- usuarios incluidos;
- Eventos incluidos;
- sobreconsumo;
- implementación/onboarding pagado.

Ninguno de esos conceptos debe añadirse al dominio funcional durante esta fase.

### Conclusión M03

No es una reconstrucción futura. Es principalmente una **promoción controlada de capacidades ya existentes a un perfil autoservicio**, más las superficies organizacionales que también necesita M02.

## 9. Gap analysis M04 — Gran escala / dedicado

M04 hereda M03 funcionalmente y agrega escala.

### Corrección de baseline

El schema/DTO de Evento no limita `capacity` a 150; acepta valores positivos muy superiores.

Los límites `1..150` observados están en:

- `AdminEventIntakeRequest`;
- `AdminEventIntakeQuote`;
- Pricing V2/cobertura comercial vigente.

Por tanto:

```text
Representar capacity 2,000
≠
Poder vender/activar/operar 2,000 de forma certificada
```

### EXISTS

- modelo Event capaz de representar capacidad >150;
- core operativo reutilizable;
- aislamiento lógico de Organización;
- mismo ownership/roles;
- harness de performance de Croquis que ya prueba escenarios sintéticos de 10, 60, 180 y 200 mesas y mide mount/zoom/pan/drag.

### ADAPT / CERTIFY

#### Invitados/importación

Debe probarse con datasets reales/sintéticos de 500, 1,000 y 2,000 personas.

#### RSVP

Debe probarse concurrencia, tiempos y consistencia.

#### Croquis/Seating

El harness de 180/200 mesas es evidencia útil pero usa datos/API sintéticos. Falta certificación end-to-end con persistencia, invitados, búsquedas y asignaciones reales.

#### Staff

El backend limita actualmente a **3 StaffTokens activos por Evento**. No se debe cambiar el número a ciegas. Hay que medir cantidad de accesos, throughput y operación requerida.

#### Scanner/check-in

Existe funcionalmente, pero requiere pruebas concurrentes, escenarios de múltiples accesos, reintentos y contingencia.

#### Reportes/Álbum

Deben probarse datasets grandes, tiempos de generación, storage y descarga.

#### Observabilidad/backups

Requieren sizing según infraestructura elegida.

### FINANCE-ONLY

- precio por bandas 500/1000/1500/2000;
- setup fee;
- anualidad;
- SLA comercial;
- costo de infraestructura dedicada;
- soporte de día de Evento.

### MISSING/DEFER

- pipeline/provisión de deployment dedicado, si finalmente se justifica;
- configuración enterprise específica si un contrato real la exige.

### OUT-OF-SCOPE hasta decisión explícita

- fork por cliente;
- white-label automático;
- SSO;
- API privada;
- nuevas integraciones;
- roles enterprise.

### Conclusión M04

La primera tarea futura de M04 debe ser **Scale Certification**, no “Enterprise Features”.

## 10. M05 — Partner / Reseller

### EXISTS conceptualmente

Los roles actuales permiten operar cualquiera de M01–M04 sin rol Partner.

### FINANCE-ONLY

- calificación Partner;
- precio mayorista;
- PVP sugerido;
- margen;
- tarifa Venue;
- tiers de volumen;
- vigencia comercial;
- descuentos;
- facturación;
- método de pago.

### OUT-OF-SCOPE

- split payments;
- wallet de comisiones;
- marketplace;
- afiliados;
- multi-level reseller;
- portal del anfitrión;
- white-label por defecto.

### Conclusión M05

No abrir ticket funcional derivado de M05 mientras el Partner simplemente compra a una tarifa y revende por su cuenta.

## 11. Gaps transversales consolidados

Después de eliminar duplicados, los gaps funcionales reales son pocos y claros.

### G01 — Managed vs Self-Service Capability Profile

Necesidad:

- M01/M02 → Provider prepara; cliente no recibe builder técnico completo por defecto.
- M03/M04 → cliente prepara mediante autoservicio.

Debe resolverse sin nuevos roles por modelo comercial y sin duplicar aplicaciones.

Afecta principalmente:

- creación de Evento;
- DesignStep/hotspots;
- Floorplan builder;
- preparación/review.

### G02 — Organization Management Surface

Necesidad:

- Admin Organización administra Planner internos;
- asigna/reasigna Eventos;
- ve responsable y pendientes a nivel cartera.

Backend de usuarios existe; assignment Organization-owned no está expuesto actualmente.

### G03 — Client Reports Surface

Backend de reportes existe, pero falta una superficie Client clara para Planner/Admin Org conforme a ownership.

### G04 — Client Album Management Surface

Backend y experiencia pública existen, pero falta superficie Client para crear/cargar/publicar/gestionar Álbum según contrato.

### G05 — Scale Certification

Sólo para M04:

- 500/1000/2000 invitados;
- importación;
- RSVP;
- invitaciones;
- 100–200+ mesas;
- Seating;
- QR;
- Staff;
- Scanner concurrente;
- realtime;
- reportes;
- storage;
- performance DB/API/UI.

No es un único cambio de límite.

## 12. Lo que NO es un gap funcional

No deben convertirse en tickets del core todavía:

- precio Standard;
- precio Partner;
- precio Venue;
- descuento por volumen;
- margen del reseller;
- mensualidad/anualidad;
- setup fee;
- PVP sugerido;
- créditos;
- nuevas bandas de pricing;
- cold sales en SLP;
- commission split;
- adquisición B2B.

Eso pertenece a Finance/Commercial.

## 13. Priorización recomendada antes de Finance V3

Si Product decide avanzar a código después de esta auditoría, el orden recomendado es:

```text
P0  G01 — Managed vs Self-Service Capability Profile
        ↓
P0  G02 — Organization Management Surface
        ↓
P1  G03 — Client Reports Surface
        ↓
P1  G04 — Client Album Management Surface
        ↓
Certificar M01/M02 en runtime real
        ↓
Sólo si existe cliente/lead real M03:
QA de autoservicio completo
        ↓
Sólo si existe oportunidad real M04:
G05 Scale Certification
        ↓
Finance / Commercial V3
```

La prioridad de M01/M02 permanece por encima de M03/M04 porque permite lanzar con menor complejidad y validar operación real.

## 14. Regla de promoción a código

Un gap de esta matriz sólo puede pasar a implementación cuando tenga:

1. modelo operativo que lo exige;
2. contratos especializados identificados;
3. scope explícito;
4. invariantes de seguridad/ownership;
5. UX esperada;
6. DoD y QA;
7. confirmación de que no pertenece sólo a Finance/Commercial.

No usar esta matriz como autorización implícita para implementar todos los gaps.

## 15. Resultado

La familia de modelos no exige cuatro productos diferentes.

El runtime puede evolucionar alrededor de un único core con dos modos operativos principales:

```text
GESTIONADO
M01 / M02
InvitacionesPremium prepara
Cliente opera invitados y Evento

AUTOSERVICIO
M03 / M04
Cliente prepara y opera
InvitacionesPremium mantiene/soporta
```

M04 añade escala/aislamiento cuando se justifique.
M05 añade condiciones comerciales sin alterar permisos.

La siguiente decisión de Product debe ser qué gaps G01–G04 se autorizan para cerrar completamente M01/M02 antes de retomar Finance V3 o escalar hacia M03/M04.
