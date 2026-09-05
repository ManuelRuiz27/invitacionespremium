# Registro de decisiones QA documental

## Objetivo

Registrar contradicciones que requirieron una decisión explícita de producto y conservar su resolución como fuente de verdad.

Una decisión con estado `OPEN` bloquea la implementación del alcance afectado. Una decisión `RESOLVED` debe implementarse conforme al contrato especializado indicado.

## Estado general

No existen decisiones QA abiertas bloqueantes.

## QA-OPEN-001 — Cambio de servicio después de activar

**Estado:** `RESOLVED`

**Decisión:** Opción B — upgrade limitado después de activar.

**Aprobación:** decisión explícita del usuario en el proyecto InvitacionesPremium.

### Regla aprobada

Antes de activar:

- el servicio puede cambiarse libremente en `draft`, `configured` o `ready_to_activate`;
- no existe cargo por diferencia;
- al activar se cobra el servicio final configurado.

Después de activar:

- solo se permite Flyer → Flipbook;
- únicamente con Evento `active` y antes de `event_day` según la zona horaria del Evento;
- el Flipbook se prepara de forma privada;
- el Flyer continúa público hasta confirmar;
- se cobra la diferencia con operación financiera idempotente;
- el cambio de servicio y diseño público ocurre atómicamente;
- se conservan Contactos, Invitaciones, Asistentes, Confirmaciones, QR y tokens.

Quedan fuera del MVP:

- QR pase físico → Flyer/Flipbook;
- Flipbook → Flyer;
- downgrades;
- devoluciones automáticas;
- cambio en `event_day` o estados posteriores;
- migraciones que regeneren Contactos, Invitaciones, Asistentes o QR.

### Contrato especializado

La implementación obligatoria se define en:

`docs/02-flujos-reglas/SERVICE_UPGRADE_FLOW.md`

Ese documento prevalece para:

- endpoints del workflow;
- estados internos de preparación;
- cotización y diferencia;
- ledger;
- FileAssets pendientes;
- publicación atómica;
- expiración al llegar `event_day`;
- permisos, errores y pruebas.

### Efecto sobre el bloqueo anterior

Se elimina el bloqueo general de `POST /events/:eventId/change-service`.

La ruta conceptual original queda sustituida por el workflow explícito:

- `POST /events/:eventId/change-service/prepare`;
- `GET /events/:eventId/change-service`;
- `POST /events/:eventId/change-service/cancel`;
- `POST /events/:eventId/change-service/commit`.

Codex no debe implementar un endpoint único ambiguo ni transformaciones adicionales.

### Documentos actualizados o subordinados

- `05_REGLAS_NEGOCIO.md`;
- `SERVICE_UPGRADE_FLOW.md`;
- `EVENT_STATE_MACHINE.md`, que mantiene el Evento en `active` durante el workflow;
- `LEDGER_TYPES.md`, cuyos tipos existentes se reutilizan con metadata obligatoria;
- `FILE_ASSET_POLICY.md`, con excepción especializada para assets pendientes;
- `11_API_CONTRACTS.md`, subordinado al contrato especializado para estas rutas;
- `07_UI_UX_FLOW.md`, subordinado al flujo del CTA y editor privado;
- `13_PLAN_IMPLEMENTACION.md` y backlog, subordinados a esta resolución.

## QA-OPEN-002 — Croquis con asignación persistente por lugar exacto

**Estado:** `RESOLVED`

**Decisión:** incorporar un modo opcional de **Acomodo por lugar exacto** además del acomodo vigente por Mesa.

**Aprobación:** decisión explícita del usuario a partir de casos reales de bodas boutique y Croquis con Mesas curvas, en U, compuestas o asimétricas donde las sillas/lugares están claramente representados y deben poder corresponder con personas concretas.

### Regla aprobada

- cada Croquis usa `Acomodo por mesa` o `Acomodo por lugar exacto`;
- el modo detallado tiene lugares persistentes, posicionables libremente sobre el plano;
- cada lugar pertenece a una Mesa, pero su posición no está limitada por la geometría visual de esa Mesa;
- el proveedor construye Mesas/lugares durante operator-led;
- la Planner asigna personas a lugares exactos sin editar geometría;
- se autoriza la entidad técnica `FloorplanSeat` y la relación `Assistant.floorplanSeatId`;
- en modo detallado la capacidad asignable de una Mesa se deriva de lugares activos no bloqueados;
- Scanner/check-in puede mostrar y exigir Mesa + lugar exacto;
- Croquis existentes migran a modo por Mesa;
- `FLYER`, `FLIPBOOK` y `DEMO` pueden usar modo detallado;
- `PHYSICAL_QR` permanece por Mesa en esta iteración;
- OCR, CAD y detección automática de sillas quedan fuera de alcance.

### Contrato especializado

La implementación obligatoria se define en:

`docs/04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`

Ese contrato prevalece para:

- modelo `FloorplanSeat`;
- persistencia e integridad;
- modo de acomodo;
- capacidad derivada;
- APIs de lugares;
- asignación exacta;
- interacción Builder;
- Seating Workspace;
- readiness/cierre de Confirmación;
- scanner/check-in;
- compatibilidad y migración;
- QA.

### Efecto sobre prohibiciones anteriores

Quedan expresamente sustituidos los textos anteriores que marcaban asignación persistente por silla/asiento como `Not now` o fuera del MVP.

Esto **no** autoriza:

- self-service de geometría para Planner durante operator-led;
- un nuevo rol;
- `FloorplanV2` paralelo;
- un segundo motor canvas;
- OCR/CAD;
- asignación exacta de PaseFisicoQR;
- cambios de pricing.

### Documentos actualizados o subordinados

- `02_PRD.md`;
- `05_REGLAS_NEGOCIO.md`;
- `FLOORPLAN_UX_TARGET.md`;
- `FLOORPLAN_STICKER_SEATING_CONTRACT.md`, cuya sección previa de asientos queda subordinada;
- `EVENT_WIZARD_CONTRACT.md`, subordinado únicamente en los cambios de Croquis detallado;
- `09_MODELO_DATOS_CONCEPTUAL.md`, `10_SCHEMA_PRISMA_GUIDE.md` y `11_API_CONTRACTS.md`, subordinados al contrato especializado para esta nueva capability;
- `FP06_DETAILED_SEATING.md` como ticket de ejecución.

## Regla para futuras decisiones

Toda nueva contradicción que no pueda resolverse por jerarquía documental debe agregarse aquí como `OPEN` antes de que Codex implemente el alcance afectado.