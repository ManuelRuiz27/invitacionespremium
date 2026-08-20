# PILOT-01 — Readiness end-to-end del primer Evento real

Estado: **Contrato técnico listo para implementación/QA**  
Prerequisito: FP-05 aprobado y cerrado.  
Objetivo: determinar y corregir únicamente los blockers que impiden operar un Evento pagado real de punta a punta bajo el modelo operator-led.

## 1. Resultado esperado

PILOT-01 no busca completar todo el SaaS. Debe demostrar un camino operable y auditable:

```text
PROVIDER / ADMIN
Cliente
  ↓
Evento
  ↓
Preparación técnica
  ├── Datos
  ├── Invitación
  ├── RSVP
  └── Croquis

PLANNER
Evento preparado
  ↓
Invitados
  ↓
Activación
  ↓
Distribución de invitaciones
  ↓
RSVP
  ↓
Mesas
  ↓
Staff
  ↓
Día del Evento / Scanner
  ↓
Cierre
  ↓
Reporte / auditoría disponible
```

Las superficies pueden pertenecer a Admin o Client según los contratos actuales. No crear impersonación ni mover capacidades entre roles para simplificar el piloto.

## 2. Regla de implementación

Primero ejecutar el flujo real contra contratos actuales y clasificar cada hallazgo:

- PASS: ya funciona y queda cubierto por evidencia.
- TEST DRIFT: producto correcto, test histórico obsoleto; corregir sólo el test.
- PRODUCT DEFECT: flujo o comportamiento rompe un contrato vigente; aplicar fix mínimo.
- PRODUCT DECISION REQUIRED: el comportamiento necesario no está definido por fuente de verdad; no inventarlo.
- OUT OF SCOPE: no bloquea el primer Evento real.

No hacer refactors oportunistas.

## 3. Baseline obligatorio a resolver

Hasta FP-05 se toleraron seis fallos Client preexistentes:

- 4 en `apps/client/src/workspace/InvitationDistribution.test.tsx`;
- 2 en `apps/client/src/wizard/review/ReviewStepDistributionHandoff.test.tsx`.

En PILOT-01 dejan de ser baseline tolerado porque activación/distribución forman parte del camino crítico.

Primera tarea:

1. reproducir los seis fallos en aislamiento;
2. capturar error/assertion real de cada uno;
3. clasificarlos como TEST DRIFT o PRODUCT DEFECT;
4. corregir únicamente la causa;
5. dejar ambos archivos verdes;
6. no modificar contratos de distribución/activación para hacer pasar tests.

El fallo de formato histórico en `apps/landing/src/components/primitives/LandingEyebrow.tsx` sigue fuera del camino operativo del Evento; no mezclarlo con PILOT-01 salvo que el archivo sea tocado por otra razón válida.

## 4. Perfil de piloto

Certificar como mínimo un Evento digital `FLYER` con Croquis habilitado.

Ese perfil cubre simultáneamente:

- material de invitación;
- Contactos/Invitaciones;
- RSVP;
- Croquis;
- Seating;
- Staff/Scanner;
- cierre.

También ejecutar regresión mínima `PHYSICAL_QR` para comprobar que los cambios del piloto digital no rompen ese servicio, pero no hace falta duplicar todo el recorrido si ya existe cobertura contractual suficiente.

No introducir un nuevo tipo de Evento de prueba en dominio.

## 5. Preparación Provider / Admin

Usar las superficies operator-led ya construidas.

Ruta base:

`/eventos/:eventId/preparar`

Validar:

1. Admin obtiene el Evento real y deriva `clientId` de la respuesta.
2. Datos se preparan sin impersonación.
3. Invitación usa exclusivamente endpoints Admin OP-02C.
4. FileAssets privados de Invitación cargan/leen/eliminan por rutas Admin.
5. Croquis usa OP-02B y el Builder compartido.
6. Floorplan puede terminar locked/listo para Seating.
7. Provider no usa endpoints Planner como shortcut.
8. Planner no recibe Builder en launch flow.

No ampliar Admin hacia operaciones cotidianas de Planner.

## 6. Datos del Evento y readiness

Usar el contrato actual de Event/activation.

Comprobar que el Evento puede alcanzar `READY_TO_ACTIVATE` sólo cuando cumple los requisitos vigentes.

Para el perfil FLYER con Croquis habilitado, la evidencia debe cubrir:

- datos básicos requeridos;
- servicio contratado;
- contactos/invitaciones existentes;
- diseño de invitación listo;
- confirmación/RSVP configurada;
- ubicación/regalos cuando el contrato vigente los exija;
- Floorplan existente y locked cuando aplique;
- saldo/línea de crédito conforme al actor.

No inferir readiness sólo desde UI. Mantener API/backend como autoridad.

## 7. Contactos e Invitaciones

Certificar el flujo operativo Planner vigente para:

- lista de contactos;
- creación/generación de invitaciones conforme al contrato existente;
- invitación individual y familiar nominal en las variantes ya cubiertas;
- links individuales existentes;
- invitación cancelada específica sin acciones de compartir.

No añadir WhatsApp API.

No marcar una invitación como “enviada” porque se abrió WhatsApp o se copió un link.

## 8. Activación

Certificar el handoff real `READY_TO_ACTIVATE → ACTIVE`.

Debe cubrir:

- botón/acción disponible sólo conforme al estado vigente;
- costo y saldo/línea según rol;
- una activación por intento/idempotency contract vigente;
- incertidumbre de red sin double-charge ni replay inseguro;
- respuesta autoritativa actualiza Event;
- Evento digital activo ofrece handoff a `Enviar invitaciones`;
- `PHYSICAL_QR` activo ofrece handoff al workspace operativo sin acciones digitales.

Los dos tests históricos `ReviewStepDistributionHandoff` forman parte explícita de este gate.

## 9. Distribución de invitaciones

Certificar `InvitationDistribution` en Evento `ACTIVE` y `EVENT_DAY`.

Requisitos:

- cargar Contactos + Invitaciones una vez por lectura normal;
- mostrar estados naturales vigentes;
- no inventar delivery state;
- construir WhatsApp URL correcto desde teléfono + link individual;
- copiar exactamente `invitationLink`;
- fallback de clipboard recuperable;
- invitaciones canceladas sin compartir/copiar/abrir;
- fuera de ACTIVE/EVENT_DAY: historial consultable sin nuevas acciones de distribución;
- `PHYSICAL_QR`: no mostrar distribución digital;
- filtros locales no agregan requests innecesarios.

Los cuatro fallos históricos `InvitationDistribution.test.tsx` deben quedar resueltos y explicados.

## 10. RSVP público

Usar contratos/tests existentes y añadir sólo la cobertura de integración que falte para demostrar el recorrido del piloto.

Validar:

- link público abre la invitación correcta;
- PENDING puede confirmar/rechazar conforme al contrato;
- familiar nominal conserva nombres/asistentes permitidos;
- QR aparece sólo bajo las condiciones contractuales vigentes;
- RSVP cerrado bloquea cambios del invitado;
- invitación cancelada no permite RSVP;
- Evento cancelado bloquea experiencia operativa pública correspondiente.

No cambiar reglas de RSVP en este ticket salvo bug demostrado.

## 11. Seating

Reutilizar FP-04/FP-05.

Para el mismo Evento piloto demostrar:

- Floorplan read-only en Planner;
- Sin mesa / En esta mesa;
- asignación individual/múltiple;
- familia/grupo;
- mover/desasignar;
- capacidad;
- no sobrecupo;
- retry incierto con misma idempotency key;
- 409 recuperable;
- realtime/terminal;
- ninguna mutación de geometría desde Planner.

No rehacer QA 50/100/200 si FP-05 ya lo certificó; usar un fixture representativo de piloto.

## 12. Staff access

Certificar las capacidades ya contratadas de Staff necesarias para día del Evento.

Validar:

- generar accesos sólo en estado/servicio permitido;
- límites vigentes de scanner/hostess;
- revocación cuando corresponda;
- token temporal sin ampliar privilegios;
- mínima exposición de información.

No crear nuevo rol persistente.

## 13. Scanner / check-in

Certificar al menos:

- Scanner puede resolver QR válido;
- segundo check-in queda bloqueado conforme al contrato;
- asistente/Invitación correctos;
- si Croquis aplica, Mesa asignada se muestra conforme a la superficie vigente;
- Scanner no ve teléfonos si el contrato los excluye;
- Evento cerrado/cancelado bloquea nuevas entradas;
- idempotencia y red incierta no duplican check-in;
- concurrencia existente sigue verde.

Usar integration tests existentes antes de añadir nueva infraestructura.

## 14. Cierre del Evento

Certificar flujo contractual vigente:

- Evento puede cerrarse desde estado permitido;
- cierre bloquea check-in;
- workspace queda en consulta donde corresponda;
- tokens/acciones operativas reaccionan según contratos existentes;
- reapertura sólo si el contrato vigente lo permite y con actor permitido.

No rediseñar lifecycle.

## 15. Reporte / auditoría

Para el piloto no se exige una nueva plataforma de reporting.

Debe demostrarse que existe evidencia accesible suficiente de las acciones críticas ya contratadas:

- activación;
- cambios relevantes de Seating;
- check-in;
- cierre;
- reporte PDF/summary si el contrato actual ya lo genera.

Si el supuesto “reporte necesario” del roadmap no existe o no es accesible mediante una superficie vigente, clasificar `PRODUCT DECISION REQUIRED` en vez de inventar un formato.

## 16. E2E strategy

No introducir Playwright/Cypress u otro framework pesado sólo por PILOT-01 si el repo no lo usa.

Preferir:

1. integration tests backend existentes;
2. React integration tests existentes;
3. una prueba/harness de journey coordinado sólo si aporta cobertura que no puede expresarse limpiamente con las suites actuales.

El objetivo es evidencia de camino, no herramienta E2E nueva.

## 17. Matriz de evidencia obligatoria

Entregar una matriz con columnas:

| Etapa | Actor/surface | Estado inicial | Acción | Estado/resultante | Evidencia | Resultado |
| --- | --- | --- | --- | --- | --- | --- |

Incluir al menos:

1. Provider abre preparación Admin.
2. Provider deja Invitación lista.
3. Provider deja Croquis locked.
4. Planner tiene contactos/invitaciones.
5. Evento llega a READY_TO_ACTIVATE.
6. Activación.
7. Handoff a distribución.
8. WhatsApp/copy link sin fake delivery.
9. RSVP confirmado.
10. QR disponible bajo regla vigente.
11. Seating.
12. Staff token.
13. Scanner/check-in.
14. Duplicate scan bloqueado.
15. Event close.
16. Post-close read-only/blocking.
17. Auditoría/reporte disponible.

## 18. Blocker policy

Un blocker de PILOT-01 es algo que impide operar el primer Evento real con el flujo aprobado o puede producir pérdida/corrupción/doble cobro/acceso indebido.

Ejemplos bloqueantes:

- activación no confiable;
- link equivocado o no compartible;
- RSVP inconsistente;
- Seating pierde asignaciones;
- QR/check-in duplicable;
- cierre no bloquea entrada;
- provider requiere impersonar Planner;
- los seis fallos históricos resultan ser defectos reales.

No son bloqueantes por sí mismos:

- perfección visual fuera del camino principal;
- features “nice to have”;
- analytics avanzada;
- automatización de pasos manuales tolerables para usuario 0;
- full self-service.

## 19. Production change rule

Cada cambio de producción necesita:

1. blocker reproducible;
2. contrato que defina la conducta correcta;
3. fix mínimo;
4. test que falla antes y pasa después;
5. regresiones pertinentes.

Si falta el punto 2: `PRODUCT DECISION REQUIRED`.

## 20. Gates técnicos

Ejecutar como mínimo:

- tests focales Admin preparation/Invitation/Floorplan;
- Client Wizard/Review/Distribution/Active Workspace/Seating;
- Public RSVP;
- Staff access;
- Scanner/check-in;
- Event lifecycle/activation;
- Audit/report relevante;
- API Client si se toca;
- PostgreSQL integration relevante;
- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`;
- `git diff --check`.

En PILOT-01 los seis fallos Client históricos de distribución/activation handoff ya NO son aceptables como baseline.

El único fallo de `format:check` de Landing puede seguir reportándose separado si permanece exactamente preexistente y el archivo no fue tocado.

## 21. Fuera de alcance

No añadir durante PILOT-01 salvo decisión explícita posterior:

- WhatsApp API;
- Seat/SeatAssignment;
- Planner Builder;
- nuevo rol;
- impersonación;
- nuevo sistema de pagos;
- nueva plataforma analytics;
- nuevo framework E2E;
- offline completo;
- nuevo reporte no contratado;
- automatización operator-led no demostrada como blocker;
- PILOT-02 instrumentation.

## 22. Criterio de salida

PILOT-01 queda aprobado únicamente cuando:

1. existe un recorrido FLYER + Croquis end-to-end demostrable;
2. los seis fallos históricos Distribution/Handoff están resueltos;
3. activación/distribución/RSVP/Seating/Staff/Scanner/cierre conservan invariantes;
4. no hay blocker P0/P1 conocido dentro del recorrido;
5. todo hallazgo fuera del contrato está clasificado, no escondido;
6. se entrega la matriz de evidencia completa;
7. `PILOT-02` no se inicia antes de revisión.
