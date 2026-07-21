# 05 — Reglas de negocio

## Activación de evento

Un evento se cobra al activar.

No puede activarse si no hay:

- datos mínimos;
- servicio contratado;
- configuración de invitación, si aplica;
- contactos, si aplica;
- confirmación de asistencia configurada, si aplica;
- saldo suficiente o línea de crédito disponible.

## Croquis/mesas

El módulo croquis/mesas se activa por evento.

Si está activo:

- los confirmados deben tener mesa antes del día del evento;
- no se permite exceder capacidad de mesa;
- las mesas se bloquean al activar el evento;
- Owner/Admin correspondiente puede desbloquear con auditoría según permisos definidos.

## Cambio de servicio contratado

- Flyer → Flipbook: permitido pagando diferencia antes del cambio.
- QR pase físico → Flyer/Flipbook: permitido pagando diferencia antes del cambio.
- Flipbook → Flyer: permitido sin devolución.
- Si no hay saldo, puede comprar créditos o usar línea activa.

## Confirmación de asistencia

- El Contacto puede confirmar o rechazar.
- Si rechaza, puede cambiar mientras esté abierta.
- Si confirma, puede reducir asistentes mientras esté abierta.
- Si confirma, puede aumentar asistentes si:
  - la Confirmación está abierta;
  - su Invitación lo permite;
  - hay cupo.
- Si está cerrada, solo Planner puede modificar.

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

## Límite de contactos

Máximo 150 contactos/invitaciones por evento.

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
- no ve asistencia en tiempo real;
- no ve reportes finales;
- solo puede operar con Evento `active` o `event_day`;
- usa máximo tres tokens activos por Evento;
- conserva expirados solo para trazabilidad, sin reactivarlos automáticamente.

## Check-in

- Un Asistente solo puede tener un check-in válido.
- Reversión no elimina el registro; lo marca como revertido y audita.
- No requiere motivo obligatorio.
- Cambio de mesa posterior al ingreso queda auditado; no requiere motivo obligatorio.

## Evento cerrado

- Bloquea check-in.
- Expira los tokens Staff activos.
- Planner/Admin puede reabrir antes de archivado.
- Reabrir no reactiva automáticamente tokens Staff expirados.
- Puede cerrarse sin álbum.

## Archivado

- Estado final.
- Oculta links públicos de Invitación y Álbum.
- Expira tokens públicos de Álbum y tokens Staff vigentes.
- Ya no puede reabrirse.

## Cancelado

- Mantiene accesible una vista pública mínima con el mensaje de cancelación.
- Bloquea Confirmación.
- Bloquea QR y check-in.
- Expira tokens Staff y de Álbum.
- El token de Invitación solo sirve para mostrar el mensaje de cancelación.
- No elimina datos.

## Borrado lógico

Planner puede eliminar evento con borrado lógico.

Efecto:

- se oculta completamente para Planner;
- conserva auditoría;
- conserva movimientos financieros;
- solo Platform Admin puede restaurar.

## Borrador vencido

Si evento queda en borrador y pasa la fecha sin activarse:

- borrado lógico automático;
- no eliminación definitiva.

## Álbum

- Flyer: 35 fotos.
- Flipbook: 35 fotos.
- QR pase físico: sin álbum.
- Se crea antes del cierre y se publica manualmente después del cierre.
- Usa token de Álbum distinto del token de Invitación.
- Al publicar se genera un token de Álbum para cada Invitación elegible.
- Es elegible una Invitación con al menos un Asistente ingresado.
- Una Invitación sin ingreso muestra: `Álbum disponible solo para asistentes`.
- Vigencia pública: 30 días desde la publicación.
- Al vencer los 30 días, el Evento pasa a `archived` y los accesos públicos se ocultan.
- Si se archiva antes de 30 días, se oculta inmediatamente.

## Privacidad

Después de 30 días post-evento:

- anonimizar nombres;
- anonimizar teléfonos;
- conservar métricas.

## Regla de contradicción

Si en documentación futura aparece contradicción, prevalece la primera regla confirmada, salvo corrección explícita del usuario.