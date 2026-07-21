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

## Regla para futuras decisiones

Toda nueva contradicción que no pueda resolverse por jerarquía documental debe agregarse aquí como `OPEN` antes de que Codex implemente el alcance afectado.