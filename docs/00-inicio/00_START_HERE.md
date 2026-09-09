# START HERE — InvitacionesPremium

Estado: **FUENTE DE ENTRADA OBLIGATORIA PARA DEV / AGENTES**

Este archivo existe para evitar que documentación histórica, futura o comercial se interprete como alcance vigente de implementación.

## 1. Dirección activa de lanzamiento

El único objetivo de implementación y demostración del siguiente lanzamiento es:

**M01 — Perfil Gestionado para Planner independiente.**

Tesis operativa:

```text
PLATFORM_ADMIN / INVITACIONESP​REMIUM
            │ prepara
            ▼
          EVENTO
            │ opera
            ▼
   INDEPENDENT_PLANNER
            │ habilita
            ▼
       STAFF TEMPORAL
```

Leer inmediatamente después:

1. `docs/00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`
2. `docs/01-producto/04_OPERATOR_LED_MVP.md`
3. `docs/01-producto/06A_MODELO_01_PLANNER_INDEPENDIENTE.md`
4. `docs/01-producto/03_ROLES_PERMISOS_ACCESO.md`
5. contrato técnico especializado de la tarea.

## 2. Regla de autoridad documental

Cuando dos documentos parezcan apuntar en direcciones distintas, usar este orden:

1. `AGENTS.md` — workflow y reglas de ejecución.
2. `docs/00-inicio/00_START_HERE.md` — navegación y precedencia.
3. `docs/00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md` — objetivo activo de lanzamiento.
4. documentos de producto M01/operator-led.
5. contratos técnicos especializados.
6. implementación real del repo.
7. roadmaps/tickets históricos únicamente como contexto.

Un documento de pricing, modelo futuro o roadmap antiguo **no puede ampliar por sí solo el alcance vigente**.

## 3. Qué está ACTIVO ahora

### Producto

- M01 Managed / Planner independiente.
- Provider prepara técnicamente el Evento.
- Planner opera invitados, confirmaciones, distribución, mesas y Staff.
- Staff opera acceso/check-in.
- No crear roles nuevos.

### Trabajo técnico autorizado por la dirección actual

- `MG-00` Audit Managed Profile.
- `MG-01` Managed Profile Foundation.
- `MG-02` Managed Client Experience.
- `MG-03` Managed Activation.
- `MG-04` Commercial Demo Fixture.
- `MG-05` Managed E2E / UAT.
- `MG-06` Reports Lite — P1.
- `MG-07` Album Management — P1.

No implementar MG-01+ hasta que MG-00 haya sido revisado y aprobado.

## 4. Qué se conserva pero NO dirige el lanzamiento

El runtime ya contiene capacidades útiles que deben preservarse:

- Finance / Ledger / Pricing V2 / price locks;
- Partner y Venue pricing;
- Client Wizard de autoservicio;
- Organización y Planner de Organización;
- Croquis avanzado, seating detallado y SVG;
- Flipbook/Flyer y hotspots;
- Lead intake B2B;
- Unit Economics;
- Reportes y Álbum backend.

Estas capacidades pueden ser reutilizadas, ocultadas o desacopladas para Managed. **No borrarlas ni reescribirlas destructivamente** salvo ticket explícito.

## 5. Qué está CONGELADO / FUTURO

Durante esta fase no implementar comportamiento nuevo para:

- M02 — Organización/salón gestionado;
- M03 — Self-Service/licencia;
- M04 — Enterprise/gran escala;
- M05 — Partner/Reseller;
- pricing Partner/Venue nuevo;
- checkout, compra de créditos, suscripciones o facturación;
- white-label, marketplace, WhatsApp API, SMS, CRM;
- capacidad 2,000 como objetivo de lanzamiento.

Los documentos M02–M05 son **referencia futura**, no backlog implícito.

## 6. Regla crítica: operación ≠ comercial ≠ permisos

No usar como capability profile:

- `CommercialChannel`;
- Partner/Venue;
- tarifa;
- créditos;
- pricing.

El perfil operativo Managed/Self-Service debe permanecer desacoplado de Finance/Commercial.

Tampoco inferir roles nuevos desde un modelo comercial.

## 7. Cómo leer documentación según la tarea

### Roles / ownership / permisos

Leer:

1. `03_ROLES_PERMISOS_ACCESO.md`
2. `ACCESS_MATRIX.md`
3. modelo M01 si afecta reparto Provider/Planner
4. contrato técnico del dominio.

### Eventos / activación

Leer:

1. dirección Managed actual;
2. `EVENTS_CONTRACT.md`;
3. `EVENT_ACTIVATION_CONTRACT.md`;
4. `EVENT_LIFECYCLE_CONTRACT.md`;
5. `FINANCE_CONTRACT.md` sólo para entender el acoplamiento existente.

No inventar Managed Activation sin archaeology.

### Client / experiencia Planner

Leer:

1. dirección Managed actual;
2. `CLIENT_APP_CONTRACT.md`;
3. `ACTIVE_EVENT_WORKSPACE_CONTRACT.md`;
4. contrato del dominio concreto.

Para Managed, el Planner no debe recibir ordinariamente builders Provider/self-service.

### Admin / Provider

Leer:

1. dirección Managed actual;
2. `ADMIN_APP_CONTRACT.md`;
3. ADR operator-led;
4. contrato especializado.

Platform Admin usa superficies Admin explícitas; no impersona Planner.

### Croquis / Seating / SVG

Leer:

1. dirección Managed actual;
2. `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`;
3. `FLOORPLAN_SVG_MAPPING_CONTRACT.md`;
4. `FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
5. `FLOORPLAN_UX_TARGET.md`.

En M01 el builder pertenece al Provider; Planner consume Croquis y opera Seating.

### Invitación / Flyer / Flipbook

Leer contratos de Invitation Design, File Assets e Invitations. En M01 Provider prepara el diseño; Planner lo consulta y distribuye.

### Staff / Scanner

Leer `STAFF_ACCESS_CONTRACT.md` y `SCANNER_CHECKIN_CONTRACT.md`. Planner crea Staff; Staff queda Event-scoped.

### Finance / Pricing

La infraestructura existente se conserva, pero **Commercial / Finance V3 está diferido**. No expandir pricing o cobro durante Managed Profile V1 salvo ticket explícito.

## 8. Clasificación documental

Usar estas etiquetas mentalmente:

- **ACTIVE** — gobierna el lanzamiento actual.
- **CONTRACT** — contrato técnico vigente del runtime.
- **REFERENCE FUTURE** — diseño aprobado/estudiado para una fase posterior; no autoriza code.
- **HISTORICAL / SUPERSEDED** — explica cómo llegamos aquí; no dirige trabajo nuevo.

`docs/INDEX.md` organiza los archivos con esta clasificación.

## 9. Regla para agentes

Antes de proponer código, responder internamente:

1. ¿Esto pertenece a M01 Managed?
2. ¿El runtime ya lo tiene?
3. ¿Es REUSE, ADAPT, HIDE_FOR_MANAGED, FINANCE_COUPLED o MISSING?
4. ¿Qué contrato técnico gobierna la modificación?
5. ¿Estoy preservando Self-Service futuro sin exponerlo en Managed?
6. ¿Estoy cambiando reglas de negocio sólo porque una UI/documento histórico lo sugiere?

Si la respuesta requiere una decisión de producto no documentada, detener implementación y marcar `PRODUCT DECISION REQUIRED`.
