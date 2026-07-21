# Decisiones abiertas de QA documental

## Objetivo

Registrar contradicciones que no pueden resolverse técnicamente sin modificar una decisión de producto confirmada.

Mientras una decisión esté `OPEN`, Codex no debe implementar el comportamiento afectado.

## QA-OPEN-001 — Cambio de servicio después de activar

**Estado:** `OPEN`

**Prioridad:** Bloqueante antes de implementar `POST /events/:eventId/change-service`.

## Reglas actualmente en conflicto

### Regla A — Cambios de servicio permitidos

`05_REGLAS_NEGOCIO.md` define:

- Flyer → Flipbook pagando diferencia;
- QR pase físico → Flyer/Flipbook pagando diferencia;
- Flipbook → Flyer sin devolución.

El hecho de cobrar diferencia/no devolver implica que el Evento ya fue activado y cobrado.

### Regla B — Diseño congelado al activar

La documentación UI/UX, FileAsset y Codex Rules define:

- Flyer/Flipbook solo se editan antes de activar;
- al activar, diseño y orden quedan congelados;
- no se reemplazan assets en `active`, `event_day`, `closed`, `album_published`, `archived` o `cancelled`.

### Complejidad adicional

Cambiar QR pase físico a Flyer/Flipbook después de activar exigiría definir:

- creación/importación de Contactos;
- generación de Invitaciones/Asistentes;
- Confirmación de asistencia;
- tratamiento de pases físicos ya generados/usados;
- conservación o cancelación de Staff/check-ins;
- creación privada del nuevo diseño;
- momento del cambio público;
- links/tokens que se conservan o regeneran;
- precio/promoción aplicable;
- auditoría y reversión ante fallo.

Estas reglas no están definidas y no deben inventarse.

## Opciones para decisión

### Opción A — Cambios solo antes de activar

- El Cliente puede cambiar servicio mientras Evento está `draft`, `configured` o `ready_to_activate`.
- No hay cargo por diferencia porque aún no existe activación/cobro.
- Al activar se cobra el servicio final.
- Se eliminan del MVP las reglas de diferencia/no devolución.

**Ventaja:** mínima complejidad y compatible con diseño congelado.

**Costo:** elimina una capacidad comercial previamente planteada.

### Opción B — Upgrade limitado después de activar

- Antes de activar: cambios libres.
- Después de activar y antes de `event_day`: solo Flyer → Flipbook.
- Se cobra diferencia con operación financiera idempotente.
- El nuevo Flipbook se configura de forma privada.
- El cambio público ocurre de forma atómica cuando está completo.
- Se conservan Invitaciones, Contactos, Asistentes y tokens.
- No se permiten QR pase físico → digital ni Flipbook → Flyer en MVP.

**Ventaja:** conserva el upgrade comercial más razonable.

**Costo:** requiere excepción documentada al congelamiento, workflow privado y pruebas adicionales.

### Opción C — Cambios post-activación completos

Permite las tres transformaciones originales.

Requiere diseñar formalmente:

- matriz por servicio/estado;
- migración de datos operativos;
- cargo/devolución;
- continuidad de tokens;
- tratamiento de pases/check-ins;
- UX de configuración y switch;
- rollback transaccional.

**Ventaja:** mayor flexibilidad comercial.

**Costo:** alcance y riesgo altos; no recomendable para MVP sin una especificación adicional completa.

## Recomendación QA

**Opción B**: mantener cambios libres antes de activar y permitir únicamente Flyer → Flipbook como upgrade post-activación antes de `event_day`.

Motivos:

- conserva una oportunidad clara de upsell;
- no exige convertir pases físicos en Invitaciones nominales;
- mantiene Contactos/Asistentes/tokens existentes;
- acota el impacto técnico;
- evita downgrade con comportamiento visual ambiguo.

Esta recomendación no está aprobada hasta decisión explícita del usuario.

## Bloqueo temporal

Hasta resolver QA-OPEN-001:

- `POST /events/:eventId/change-service` permanece documentado pero no implementable;
- Codex no crea DTO, controller, service, migración, UI ni ledger para cambio de servicio;
- la creación normal de Evento puede elegir/cambiar servicio antes de activar como parte del wizard, pero no usa el endpoint post-activación;
- ninguna tarea puede asumir que la diferencia o downgrade están aprobados técnicamente.

## Cierre requerido

Para cerrar esta decisión debe registrarse:

- opción elegida;
- estados permitidos;
- transformaciones permitidas;
- regla de cargo/devolución;
- assets y datos que se conservan;
- tratamiento de links/tokens;
- criterios de aceptación y pruebas;
- documentos actualizados.

Después de cerrar, eliminar el bloqueo y actualizar:

- `05_REGLAS_NEGOCIO.md`;
- `EVENT_STATE_MACHINE.md` si aplica;
- `LEDGER_TYPES.md` si existe cargo/devolución;
- `FILE_ASSET_POLICY.md`;
- `11_API_CONTRACTS.md`;
- `07_UI_UX_FLOW.md`;
- `13_PLAN_IMPLEMENTACION.md`;
- `15_BACKLOG_CODEX.md` o su enmienda.