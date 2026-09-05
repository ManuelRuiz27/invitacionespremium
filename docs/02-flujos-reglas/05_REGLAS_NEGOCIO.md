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

- el Croquis usa exactamente un modo de acomodo: **por mesa** o **por lugar exacto**;
- los confirmados deben quedar acomodados antes del cierre operativo de la Confirmación;
- no se permite exceder capacidad de Mesa;
- las Mesas se bloquean al activar el Evento conforme al contrato vigente;
- Owner/Admin correspondiente puede desbloquear con auditoría según permisos definidos.

### Acomodo por mesa

- la unidad asignable es la Mesa;
- cada Mesa mantiene capacidad positiva configurada;
- una persona confirmada pendiente de Mesa bloquea el cierre de Confirmación cuando Croquis es obligatorio.

### Acomodo por lugar exacto

Contrato normativo: `../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`.

- cada lugar persistente pertenece exactamente a una Mesa activa;
- la posición del lugar es libre sobre el plano y no depende de que la Mesa sea simétrica ni de que el punto quede dentro de su geometría aproximada;
- un lugar asignable solo puede tener un Asistente activo;
- un Asistente solo puede ocupar un lugar;
- un lugar bloqueado permanece visible pero no cuenta como capacidad ni acepta Asistente;
- la capacidad asignable de la Mesa se deriva de sus lugares activos no bloqueados;
- una persona con Mesa pero sin lugar exacto sigue pendiente en este modo;
- no se puede bloquear o eliminar un lugar ocupado;
- mover de lugar actualiza de forma atómica lugar y Mesa cuando cambia la Mesa padre;
- desasignar limpia lugar y Mesa;
- el modo detallado no habilita edición de geometría a Planner durante el perfil operator-led;
- el modo detallado aplica en esta iteración a `FLYER`, `FLIPBOOK` y `DEMO`; `PHYSICAL_QR` conserva acomodo por Mesa.

El modo no cambia después de activar el Evento.

## Cambio de servicio contratado

La decisión aprobada para el MVP es:

### Antes de activar

En `draft`, `configured` o `ready_to_activate`:

- el servicio puede cambiarse libremente dentro del wizard;
- no se cobra diferencia;
- al activar se cobra únicamente el servicio final configurado.

### Después de activar

Solo se permite:

- Flyer → Flipbook;
- Evento en `active`;
- fecha local anterior a `event_day`;
- cobro de diferencia antes del cambio público;
- preparación privada del Flipbook;
- publicación atómica cuando el Flipbook está completo y el cargo queda confirmado;
- conservación de Contactos, Invitaciones, Asistentes, Confirmaciones, QR y tokens.

No se permite en MVP:

- QR pase físico → Flyer/Flipbook;
- Flipbook → Flyer;
- downgrade o devolución automática;
- cambio en `event_day`, `closed`, `album_published`, `archived` o `cancelled`;
- cambio que regenere Contactos, Invitaciones, Asistentes o QR.

El contrato completo está en `SERVICE_UPGRADE_FLOW.md` y prevalece para este workflow.

## Confirmación de asistencia

- El Contacto puede confirmar o rechazar.
- Si rechaza, puede cambiar mientras esté abierta.
- Si confirma, puede reducir Asistentes mientras esté abierta.
- Si confirma, puede aumentar Asistentes si:
  - la Confirmación está abierta;
  - su Invitación lo permite;
  - hay cupo.
- Si está cerrada, solo Planner/Admin autorizado puede modificar.
- Con Croquis por Mesa, cerrar requiere que cada confirmado tenga Mesa.
- Con Croquis por lugar exacto, cerrar requiere que cada confirmado tenga lugar exacto válido; conservar solo Mesa no resuelve el pendiente.

## QR e Invitación cancelada

- QR no aparece antes de confirmar.
- Invitación rechazada no tiene QR.
- La cancelación específica de una Invitación no elimina ni vuelve inaccesible su link público.
- El link de una Invitación cancelada abre únicamente la vista `Invitación cancelada por el organizador`.
- Una Invitación cancelada no permite Confirmación, modificación de Asistentes ni acceso al QR.
- QR de Invitación pertenece a Invitación.
- Check-in es por Asistente.
- El SVG se genera bajo demanda en backend y no se persiste como FileAsset.
- Su payload es únicamente el token técnico de propósito `QR`; no contiene PII ni el token de Invitación.
- Cerrar la Confirmación no oculta el QR de una Invitación ya confirmada.
- Solo `active` y `event_day` permiten entregar y validar el QR; cierre, cancelación, archivado o borrado
  lógico lo bloquean.
- Rechazar no rota el nonce. Si la Confirmación sigue abierta, reconfirmar restaura exactamente el mismo
  QR.

## Link reenviado

Si alguien reenvía el link, se permite abrir, pero solo puede confirmar con datos del Contacto original.

MVP usa token largo no adivinable.

## Distribución de Invitaciones digitales

- Contacto es el receptor del WhatsApp/link y conserva su `invitationLink` individual.
- La configuración de Flyer/Flipbook ocurre antes de activar; la distribución real ocurre después de activar desde el workspace operativo.
- `active` y `event_day` permiten compartir Invitaciones digitales. `event_day` conserva las reglas operativas de un Evento activo.
- `closed`, `album_published`, `archived` y `cancelled` no ofrecen nuevos envíos desde el workspace; pueden conservar consulta histórica conforme a privacidad y disponibilidad pública del estado.
- `PHYSICAL_QR` no usa esta distribución porque no crea Contactos ni Invitaciones digitales.
- Demo no distribuye Invitaciones reales.
- El MVP abre WhatsApp con el número normalizado del Contacto y un mensaje preparado que contiene el link individual; el usuario confirma el envío dentro de WhatsApp.
- Copiar el enlace individual es una alternativa explícita.
- Envío automático mediante WhatsApp API, webhooks de entrega/lectura y métricas de mensajería permanecen fuera del MVP.
- El sistema no persiste `sent`, `delivered` o `read` ni presenta esos estados como hechos si WhatsApp no los confirmó mediante una integración futura autorizada.
- Una Invitación cancelada no ofrece acciones para compartirla nuevamente.
- La distribución no edita el diseño, no regenera tokens, no modifica RSVP y no crea auditoría de “envío” porque abrir WhatsApp no demuestra que el mensaje haya sido enviado.

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

- Pertenece a Asistente y conserva historial.
- Solo Evento `active` o `event_day` admite una nueva entrada.
- La selección parcial se confirma completa o no crea ningún registro.
- Un índice parcial impide más de un CheckIn activo por Asistente.
- StaffToken crea; únicamente un usuario operativo autorizado puede revertir.
- Una reversión no elimina la fila ni modifica al Asistente.
- Scan y búsqueda devuelven solo confirmados pendientes, nunca teléfono.
- Con Croquis por Mesa, el Asistente requiere una Mesa válida conforme al contrato vigente.
- Con Croquis por lugar exacto, requiere además un lugar activo/no bloqueado coherente con esa Mesa; Scanner puede mostrar y resaltar Mesa + lugar exacto.

- Un Asistente solo puede tener un check-in válido.
- Reversión no elimina el registro; lo marca como revertido y audita.
- No requiere motivo obligatorio.
- Cambio de Mesa posterior al ingreso queda auditado; no requiere motivo obligatorio.
- En modo detallado, cambio de lugar posterior al ingreso también queda auditado y debe mantener coherencia con la Mesa padre.

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

Las posiciones/etiquetas de lugares pueden conservarse como geometría operativa; no deben conservar una relación nominal identificable después de aplicar la anonimización del Asistente.

## Regla de contradicción

Si aparece una contradicción:

1. prevalece la corrección explícita más reciente del usuario;
2. después el contrato especializado aplicable;
3. la implementación se detiene si no puede resolverse con esa jerarquía.

Para asignación persistente por lugar exacto, `../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md` es el contrato especializado aplicable y sustituye los `Not now` anteriores sobre asientos individuales.

No usar esta regla para inventar una decisión faltante.

## StaffTokens

- pertenecen exactamente a un Evento y no representan usuarios permanentes;
- usan secretos `st1` aleatorios de 32 bytes, almacenados solo como digest SHA-256;
- existen como máximo tres activos por Evento; expirados no cuentan;
- solo se crean y resuelven en `active` o `event_day`;
- cierre/cancelación expiran todos; reapertura no reactiva;
- no hay subtipos, permisos configurables, edición, rotación o revocación manual en MVP;
- la sesión pública es mínima y no expone datos personales ni financieros.
