# M02-B01 — Handoff técnico para el equipo de desarrollo

Estado: **PLAN TÉCNICO / DESGLOSE PROPUESTO — NO AUTORIZA IMPLEMENTACIÓN**

**DT02A ESPECIFICADO (2026-10-19):** [Ticket ejecutable propuesto — Foundation ACCESS_CONTROL](./M02_B01_DT02A_ACCESS_CONTROL_FOUNDATION.md). Alcance: ServiceCode/accessMode, Managed Provider intake Organización, preparación y activación **fail-closed hasta DT06**, sin QR ni precios. **Pendiente de autorización expresa para Codex; ningún código ejecutado.**  

**DT00/DT01 realizados (2026-10-19):** [DT00 auditoría estática](./M02_B01_DT00_RUNTIME_AUDIT.md) y [DT01 ADR](./M02_B01_DT01_ACCESS_ARCHITECTURE_ADR.md). **Product aprobó `ServiceCode.ACCESS_CONTROL` y un único `Event.accessMode=NOMINAL|ANONYMOUS` por Evento, conservando `PHYSICAL_QR`.** Las decisiones técnicas de credencial individual y Managed Organization paths siguen propuestas; el [gate SQL](./M02_B01_DT01_SQL_COMPATIBILITY_GATE.md) se revisó estáticamente pero **no se ejecutó contra PostgreSQL**. No hay autorización para code. La investigación previa DT00/DT01 no debe delegarse otra vez ni ejecutarse como tickets de implementación.  
Fecha: **2026-10-19**  
Requisito funcional autorizado: [M02-B01 QR nominal/anónimo](../01-producto/06B1_M02_B01_ACCESOS_QR_NOMINAL_ANONIMO.md)  
Modelo base: [M02](../01-producto/06B_MODELO_02_SALON_JARDIN_ORGANIZACION.md)  
Alcance de release: **M01 sigue siendo lanzamiento activo; M02-B01 aprobado para especificación, aún NO para código.**

**Alcance comercial:** no crear automáticamente regla Pricing V2 VENUE para `ACCESS_CONTROL`. La activación MANAGED para Organización se diseñará por separado del Ledger, manteniendo intacta la cotización VENUE de `PHYSICAL_QR`. El nuevo servicio no se deduce de la licencia.

## 1. Instrucciones obligatorias para el equipo

1. Antes de programar, leer AGENTS.md, START_HERE, dirección M01, M02 base, B01 requisitos y contratos técnicos afectados.
2. No implementar B01 como cambio en M01 ni promoverlo a backlog activo sin autorización explícita de Product/Technical Owner.
3. Mantener un único core multi-tenant; no fork, rol comercial, entidad Salón separada o API Scanner paralela por conveniencia.
4. Mantener separados **operación** (MANAGED/SELF_SERVICE), **servicio/credencial** (nominal/anónimo) y **comercial** (STANDARD/PARTNER/VENUE, anualidad/mes). No inferir uno a partir de otro.
5. Los contratos técnicos hoy describen la implementación ACTUAL; ningún requerimiento nuevo puede tratarse como endpoint/modelo existente hasta su ticket de código y migración aprobados.
6. Usar API/backend/constraints como autoridad, OpenAPI para SDK y pruebas multi-tenant + transacciones; UI no aplica autorización por sí sola.
7. Crear tickets pequeños con DoD/QA y compatibilidad M01. No delegar «implementar todo M02-B01» en un único prompt.

## 2. Evidencia técnica y huecos prioritarios

| Área | Existente | Falta / conflicto B01 | Archivos/contratos a inspeccionar |
|---|---|---|---|
| Event + tenants | Client tipo ORGANIZATION, Event/clientId, assignedPlannerUserId, operatingProfile MANAGED/SELF_SERVICE | Modo por evento sin permitir mezcla; respetar Provider preparation | apps/api/prisma/schema.prisma; events; event-access.policy; EVENTS_CONTRACT; M02 |
| Service / Pricing | ServiceCode PHYSICAL_QR único para pases, VENUE solo lo admite | Modo nominal sin Flyer/Flipbook y pricing/activación coherentes | SERVICES_PRICING_CONTRACT; EVENT_ACTIVATION_CONTRACT |
| Contacts/CSV | Requiere teléfono E.164, 150 Contactos, importa CSV; genera Invitation + Assistant | Nominal sin teléfono y sin RSVP; clasificación histórica y privacidad | CONTACTS_CONTRACT; contacts DTO/service; INVITATIONS_CONTRACT |
| Invitation/QR | Un QR por Invitation, válido tras CONFIRMED | B01 pide **uno por asistente** sin Confirmación pública | QR_CONTRACT; INVITATIONS_CONTRACT; PUBLIC_RSVP_CONTRACT |
| Physical passes | Folios, lotes, QR SVG, uso único, mesa TABLE, locking/retención | Revocar pase no usado; no romper inmutabilidad de usado ni nonces | PHYSICAL_PASSES_CONTRACT; physical-passes.controller/service |
| Scanner | CheckIn nominal por Assistant y scan físico separado | Resolver token individual B01 sin duplicar entrada ni simular RSVP | SCANNER_CHECKIN_CONTRACT; scanner; physical-passes |
| Floorplan | Assistant/table/seat y PhysicalPass/table, capacidad conjunta | Reconciliar aforo si se cancelan/reemiten accesos; no asignar SEAT a pase físico | FLOORPLAN_DETAILED_SEATING_CONTRACT; floorplan |
| Staff | 3 tokens activos/evento, Event-scoped | Soporte de ambos modos en UI sin ampliar privilegios | STAFF_ACCESS_CONTRACT; scanner app |
| Reports / Client UI | Backend Attendance y Physical Passes, Frontend Client sin reportes completos en audit | Contadores live básicos separados de PDF | REPORTS_CONTRACT; Client app; workspace |
| Seguridad/permisos | M02 indica assignedPlannerUserId; algunos contratos anteriores usan createdByUserId | Auditoría de ownership real sin generalizar acceso | CLIENTS_CONTRACT; EventAccessPolicy; controllers y tests |

## 3. Secuencia propuesta de tickets (no ejecutables hasta aprobación técnica)

> **Interpretación tras DT00/DT01:** las secciones DT00 y DT01 que siguen son el plan original, hoy completado como documentos vinculados arriba. DT02–DT09 siguen **no autorizados**. ADR-02 (`ACCESS_CONTROL`) ya está ratificada por Product; antes de DT02 faltan gates DB/SQL, decisiones técnicas del resto de ADR y autorización expresa de implementación. DT02 se divide en **DT02A (Foundation: Event/service/Managed Organización Provider, activación cerrada hasta DT06)** y **DT02B (Contacts nominales sin teléfono y CSV)** según DT01, porque el circuito Managed de Organización hoy no existe. `PHYSICAL_QR` MANAGED necesita igualmente nueva capacidad Provider; no eliminar `ClientOperatingProfilePolicy`.

### M02-B01-DT00 — Archaeology y matriz de compatibilidad (P0, PLAN)

**Entregables:** estado real por operación y servicio (EXISTS/ADAPT/MISSING/CONFLICT), flujos actualizados de API y DB, pruebas vigentes, riesgos de migración y decisión de qué preservar.

**Investigar:** modo de asignación por eventId, validación real de activa/READY, enforcement DB de Invitations/Contacts/QR, permisos createdBy/assignedPlanner, reglas de borrado físico, capacity/pricing. No escribir código ni migraciones.

**DoD:** evidencia con ruta/método/modelo/prueba por cada RF01–RF12. Reconocer dónde los documentos anteriores han quedado desactualizados respecto al runtime.

### M02-B01-DT01 — ADR dominio de modalidades y credencial nominal (P0, PLAN / DECISIÓN)

**Entregables:** ADR aprobado con:
- ubicación y tipo del discriminador por Evento, migración backward-compatible y regla de bloqueo de cambio;
- representación de un QR por Assistant, firmado y revocable, **sin cambiar** QR de Invitation existente salvo migración explícita;
- si se reutiliza Invitation como agregado interno o se diseña otra asociación; no crear usuarios/contactos ficticios;
- compatibilidad con ServiceCode, PHYSICAL_QR y canal VENUE sin acoplar capacidad con precio;
- transición operacional, cupos e idempotencia por modalidad;
- integridad PostgreSQL (mismo Evento y Organización, pertenencia, unicidad, no doble ingreso, sin pérdida histórica);
- plan de regresión M01 y migración/despliegue seguro.

**Bloqueo:** Product/Technical Owner debe aprobar ADR antes de mutar schema, emisión QR o Scanner.

### M02-B01-DT02 — Registro nominal sin RSVP/teléfono (P0, BUILD tras ADR)

**Scope previsto:** DTO, service, constraints y CSV que admitan teléfono opcional **sólo donde aplique**, nombre obligatorio, grupos, nombres repetidos, operaciones idempotentes y coherencia de Assistant principal si se preserva Invitation interna.

**Evitar:** relajar globalmente el contrato de Contactos de M01, fabricar teléfonos, confirmar RSVP falsos.

**QA:** import preview/commit, duplicados, E.164 cuando se proporciona, cross-tenant, carreras por límite de contactos, retención/anonimización y rollback.

### M02-B01-DT03 — Emisión y revocación de QR nominal individual (P0, BUILD tras ADR)

**Scope previsto:** credenciales por Assistant, recuperación/descarga autenticada, token de propósito separado, cancelación/reemisión de no utilizado, no PII dentro del QR, auditoría/idempotencia.

**Evitar:** usar directamente el QR de Invitation compartido por una familia, usar vista pública de RSVP para esquivar autorizaciones, almacenar tokens en logs.

**QA:** una credencial por Assistant, cancelaciones, expiración, emisión concurrente, replay, cross-event y M01 QR existente intacto.

### M02-B01-DT04 — Scanner nominal individual B01 (P0, BUILD tras DT03)

**Scope previsto:** resolución segura de nuevo token individual y check-in por Assistant, datos mínimos Staff, mesa/lugar cuando aplique, operaciones atómicas y mismas políticas de autorización/estado que Scanner actual.

**Evitar:** nuevo módulo paralelo de CheckIn, doble registro si un Assistant tenía antes un QR de Invitation, desbloquear estado por ser canal VENUE.

**QA:** dos Staff concurrentes, QR duplicado, reintento idempotente, invalid/foreign/cancelled, cierre/cancelación del Evento, mesa inválida, resultados mínimos.

### M02-B01-DT05 — Compatibilidad y revocación de pases físicos (P0, BUILD tras DT01)

**Scope previsto:** conservar PHYSICAL_QR generación/lista/SVG/scan, añadir si se aprueba revocación de pase no usado con registro/auditoría/aforo consistentes; bloqueo de reversión de pase ya usado.

**QA:** folios monotónicos sin reutilización, pase usado inmutable, tokens previamente emitidos invalidados, carreras de revocar versus scan, generation idempotent, mesa y capacidad bajo concurrencia.

### M02-B01-DT06 — Acomodo, capacity y readiness por modalidad (P0, BUILD tras DT02/DT05)

**Scope previsto:** utilizar reglas de mesas actuales, calcular cupos desde credenciales válidas y asignaciones correctas por modalidad, no falsear RSVP, validar readiness antes de activar.

**Límite:** PHYSICAL_QR = TABLE; lugar SEAT exacto físico fuera de B01. Modo nominal puede conservar seating nominal autorizado, sujeto a diseño/validación.

**QA:** mesa desactivada, croquis ausente, capacidad llena, reasignación, cancelación y carreras con check-in/activación.

### M02-B01-DT07 — Client/Provider/Scanner: flujo de operaciones (P0, BUILD tras API)

**Scope previsto:** selección de modo Provider, lista nominal CSV, pases físicos, distribución (descarga/impresión), permisos/gating MANAGED, escaneo sin salto a Wizard de diseño.

**QA:** role matrix/tenant isolation, UX móvil de Scanner, estados vacíos/errores, imposibilidad de invocar por API builders Provider desde Planner.

### M02-B01-DT08 — Vista operativa de entradas (P0, BUILD tras API)

**Scope previsto:** totales emitidos/ingresados/pendientes y por Mesa, con detalle nominal mínimo o anónimo por folio. Reusar datos fuente; no extender PDF/BI sin ticket propio.

**QA:** conciliación contra CheckIn y PhysicalPass.usedAt, cancelación y hora del Evento, múltiples escáneres, aislamiento de información.

### M02-B01-DT09 — Integración y certificación de piloto (P0, QA tras BUILD)

**E2E reales:** un Evento NOMINAL sin Flyer/Flipbook ni RSVP; otro ANÓNIMO PHYSICAL_QR; Organización con ambos, Planner asignado y Staff temporal; import, impresión, mesas, escaneo concurrente, reintento, cierre y métricas.

**Regresión obligatoria:** M01 Planner independiente (Invitación, RSVP, QR por Invitation, check-in familiar, Design, Finance/activation gestionada) y pases físicos preexistentes. Ejecutar lint, typecheck, tests relevantes, E2E y build conforme a AGENTS; medir throughput/latencia/dispositivos reales antes de cualquier compromiso comercial.

## 4. Matriz de trazabilidad

| RF producto | Tickets propuestos |
|---|---|
| RF01 modalidad por Evento | DT00, DT01, DT07, DT09 |
| RF02 invitados nominales | DT01, DT02, DT09 |
| RF03 QR nominal | DT01, DT03, DT04, DT09 |
| RF04 QR anónimo | DT05, DT09 |
| RF05 mesas / Croquis | DT01, DT06, DT09 |
| RF06 Scanner nominal | DT03, DT04, DT09 |
| RF07 Scanner anónimo | DT05, DT09 |
| RF08 distribución | DT03, DT05, DT07, DT09 |
| RF09 capacidad / concurrencia | DT01, DT02, DT05, DT06, DT09 |
| RF10 revocación | DT01, DT03, DT05, DT09 |
| RF11 métricas | DT08, DT09 |
| RF12 permisos/privacidad/auditoría | Todos (especialmente DT00, DT01, DT04, DT09) |

## 5. Decisiones de arquitectura aún no tomadas

No fijar por supuesto del equipo:
- **RESUELTO EN PRODUCTO:** nuevo `ServiceCode.ACCESS_CONTROL` con `Event.accessMode`, preservando `PHYSICAL_QR`; Price Book y comercial fuera de este bloque;
- migración de QR nominal: adaptar Invitation/Assistant o credencial separada, y cómo impedir doble entrada;
- esquema de Contact con teléfono nullable por modalidad, sin regresiones al alta M01;
- autorización de cambios durante ACTIVE/EVENT_DAY: definir política para invitados tardíos;
- cancelación anónima no usada: endpoint/DB/inmutabilidad/aforo;
- política de regeneración y entrega segura de QR;
- reglas de conteo y reportes en eventos con historial de revocación/reemisión;
- límites de aforo/Contactos/Staff y certificación productiva;
- separación de preparación Provider vs operación del salón y compatibilidad de assignedPlannerUserId;
- línea comercial/licencia futura, fuera de este bloque.

**DT02A ya cuenta con especificación cerrada pero NO tiene autorización de ejecución.** Los nuevos enums/tablas/migraciones sólo se incorporarán por Codex al aprobar explícitamente el ticket BUILD. El resto de decisiones (DT02B–DT09) se cierra por tickets.

## 6. Condiciones de release y dependencias externas

- Lanzamiento principal documentado: **M01 MANAGED**. Este B01 representa un trabajo futuro aprobado a nivel funcional, no una extensión automática del alcance de octubre.
- En M02 la preparación técnica continúa del lado Provider. Que un salón quiera pagar mensualidad no convierte por sí mismo al evento en SELF_SERVICE/M03.
- No incluir suscripciones, precios MXN, facturación, checkout, Ledger, white-label, modo offline ni nuevo rol como subproducto de implementar RF01–RF12.
- Si Product decide incluir M02-B01 en una release, actualizar primero START_HERE/dirección de release/roadmap con el cambio explícito; después aprobar ADR y tickets.
- Mantener los contratos actuales como fuente de verdad del runtime hasta que el código y sus pruebas evolucionen de forma autorizada.

## 7. Checklist de entrega del futuro equipo

- [ ] DT00 con evidencia de rutas, migraciones, ownership y tests.
- [ ] DT01 aprobado; opciones rechazadas y tradeoffs documentados.
- [ ] Contratos técnicos actualizados con endpoints, DB constraints, estados, auditoría y privacidad.
- [ ] Tickets de BUILD aprobados individualmente; sin scope extra.
- [ ] Tests unit/integration/SQL race, E2E Cliente/Admin/Scanner y regresión M01.
- [ ] QA sobre dispositivos reales y contingencia si no hay conectividad.
- [ ] Evidencia de no doble check-in, no sobrecupo, cross-tenant y reintentos.
- [ ] Actualización de OpenAPI/SDK y documentación del runtime sólo al implementar.

