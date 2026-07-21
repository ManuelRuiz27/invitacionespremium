# 05 — Reglas de negocio

## Activación de Evento

Un Evento se cobra al activar.

No puede activarse si no hay:

- datos mínimos;
- servicio contratado;
- configuración de Invitación, si aplica;
- Contactos, si aplica;
- Confirmación de asistencia configurada, si aplica;
- saldo suficiente o línea de crédito disponible.

## Croquis/Mesas

El módulo Croquis/Mesas se activa por Evento.

Si está activo:

- los confirmados deben tener Mesa antes del día del Evento;
- no se permite exceder capacidad de Mesa;
- las Mesas se bloquean al activar el Evento;
- Owner/Admin correspondiente puede desbloquear con auditoría según permisos definidos.

## Cambio de servicio contratado

Se han planteado estas transformaciones:

- Flyer → Flipbook pagando diferencia;
- QR pase físico → Flyer/Flipbook pagando diferencia;
- Flipbook → Flyer sin devolución.

Sin embargo, su aplicación después de activar contradice el congelamiento confirmado de Flyer/Flipbook y exige reglas de migración aún no definidas.

**Estado QA:** bloqueado conforme a `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`.

Hasta cerrar QA-OPEN-001:

- antes de activar, el wizard puede cambiar el servicio seleccionado y se cobra únicamente el servicio final al activar;
- después de activar, `POST /events/:eventId/change-service` no debe implementarse ni exponerse en UI;
- no cobrar diferencia, devolver créditos ni migrar datos entre servicios por una regla inferida;
- Codex debe detener cualquier tarea que requiera este comportamiento.

## Confirmación de asistencia

- El Contacto puede confirmar o rechazar.
- Si rechaza, puede cambiar mientras esté abierta.
- Si confirma, puede reducir Asistentes mientras esté abierta.
- Si confirma, puede aumentar Asistentes si:
  - la Confirmación está abierta;
  - su Invitación lo permite;
  - hay cupo.
- Si está cerrada, solo Planner/Admin autorizado puede modificar.

## QR e Invitación cancelada

- QR no aparece antes de confirmar.
- Invitación rechazada no tiene QR.
- La cancelación específica de una Invitación no elimina ni vuelve inaccesible su link público.
- El link de una Invitación cancelada abre únicamente la vista `Invitación cancelada por el organizador`.
- Una Invitación cancelada no permite Confirmación, modificación de Asistentes ni acceso al QR.
- QR de Invitación pertenece a Invitación.
- Check-in es por Asistente.

## Link reenviado

Si alguien reenvía el link, se permite abrir, pero solo puede confirmar con datos del Contacto original.

MVP usa token largo no adivinable.

## Límite de Contactos

Máximo 150 Contactos/Invitaciones por Evento.

CSV con más de 150 se bloquea.

## Contacto y Asistente

No mezclar.

- Contacto = receptor del WhatsApp/link.
- Asistente = persona nominal que puede entrar.

## Plus y familiar nominal

- Planner define límite por Invitación: sin plus, plus 1, plus 2, plus 3, etc.
- Familiar nominal requiere nombres individuales.
- Contacto principal siempre genera Asistente principal.

## Staff

Staff:

- no ve teléfonos;
- no registra extra anónimo;
- no revierte check-in;
- no ve asistencia en tiempo real global;
- no ve reportes finales;
- solo puede operar con Evento `active` o `event_day`;
- usa máximo tres StaffTokens activos por Evento;
- conserva expirados solo para trazabilidad, sin reactivarlos automáticamente.

## Check-in

- Un Asistente solo puede tener un check-in válido.
- Reversión no elimina el registro; lo marca como revertido y audita.
- No requiere motivo obligatorio.
- Cambio de Mesa posterior al ingreso queda auditado; no requiere motivo obligatorio.

## Evento cerrado

- Bloquea check-in.
- Expira los StaffTokens activos.
- Planner/Admin puede reabrir antes de archivado.
- Reabrir no reactiva automáticamente StaffTokens expirados.
- Puede cerrarse sin Álbum.

## Archivado

- Estado final.
- Oculta links públicos de Invitación y Álbum.
- Expira tokens públicos de Álbum y StaffTokens vigentes.
- Ya no puede reabrirse.

## Cancelado

- Mantiene accesible una vista pública mínima con el mensaje de cancelación.
- Bloquea Confirmación.
- Bloquea QR y check-in.
- Expira StaffTokens y tokens de Álbum.
- El token de Invitación solo sirve para mostrar el mensaje de cancelación.
- No elimina datos.

## Borrado lógico

Planner puede eliminar Evento con borrado lógico conforme a estado y permisos.

Efecto:

- se oculta completamente para Planner;
- conserva auditoría;
- conserva movimientos financieros;
- solo Platform Admin puede restaurar.

## Borrador vencido

Si Evento queda en borrador y pasa la fecha sin activarse:

- borrado lógico automático;
- no eliminación definitiva.

## Álbum

- Flyer: 35 fotos.
- Flipbook: 35 fotos.
- QR pase físico: sin Álbum.
- Se crea antes del cierre y se publica manualmente después del cierre.
- Usa token de Álbum distinto del token de Invitación.
- Al publicar se genera un token de Álbum para cada Invitación elegible.
- Es elegible una Invitación con al menos un Asistente ingresado.
- Una Invitación sin ingreso muestra: `Álbum disponible solo para asistentes`.
- Vigencia pública: 30 días desde la publicación.
- Al vencer los 30 días, el Evento pasa a `archived` y los accesos públicos se ocultan.
- Si se archiva antes de 30 días, se oculta inmediatamente.

## Privacidad

Después de 30 días post-Evento:

- anonimizar nombres;
- anonimizar teléfonos;
- conservar métricas.

## Regla de contradicción

Si aparece una contradicción:

1. prevalece la corrección explícita más reciente del usuario;
2. después el contrato especializado aplicable;
3. la implementación se detiene si no puede resolverse con esa jerarquía.

No usar esta regla para inventar una decisión faltante.