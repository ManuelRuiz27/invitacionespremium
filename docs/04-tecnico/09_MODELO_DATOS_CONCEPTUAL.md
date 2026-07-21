# 09 — Modelo de datos conceptual

## Entidades conceptuales base

- Cliente
- Usuario
- Evento
- Contacto
- Invitación
- Asistente
- Grupo
- Servicio contratado
- Tipo social
- Flyer
- Flipbook
- Hotspot
- Croquis
- Mesa/Zona
- StaffToken
- CheckIn
- PaseFisicoQR
- Álbum
- FotoÁlbum
- Crédito/Ledger
- Línea de crédito
- Pago
- Promoción
- Comprobante interno
- Auditoría
- FileAsset

## Cliente

Entidad base para:

- Planner
- Organización

## Planner

Es Cliente con:

- saldo propio;
- eventos propios;
- capacidad de comprar créditos;
- capacidad de activar eventos.

## Organización

Es Cliente con:

- saldo propio;
- usuarios internos;
- eventos propios;
- posible línea de crédito.

## Usuario interno

Pertenece únicamente a Organización.

Roles:

- Admin de Organización
- Planner de Organización

## Evento

Pertenece a:

- Cliente;
- usuario creador.

Tiene:

- servicio contratado;
- tipo social.

## Servicio contratado

Catálogo editable:

- Flipbook
- Flyer
- QR pase físico
- Demo

## Tipo social

Catálogo:

- Boda
- XV años
- Corporativo
- Cumpleaños
- Otro

## Contacto

Representa persona principal que recibe WhatsApp.

Tiene:

- nombre;
- teléfono WhatsApp;
- grupo opcional;
- invitación asociada.

## Invitación

Pertenece a:

- Evento;
- Contacto.

Tiene:

- token público;
- QR de invitación;
- uno o varios Asistentes;
- estado general de confirmación.

## Asistente

Pertenece a Invitación.

El Contacto principal siempre genera Asistente principal.

Plus/acompañantes son Asistentes adicionales.

## Grupo

Pertenece a Evento.

Contacto puede no tener Grupo.

Asistentes heredan Grupo del Contacto.

## Confirmación

Pertenece a:

- Invitación;
- Asistente.

Invitación tiene estado general.

Cada Asistente tiene estado individual.

## QR de invitación

Pertenece a Invitación.

## Check-in

Para evento con invitación pertenece a Asistente.

## Croquis

Pertenece a Evento.

## Mesa/Zona

Pertenece a Croquis.

Puede ser:

- mesa asignable;
- zona decorativa.

## Asignación de mesa

Pertenece a Asistente.

## StaffToken

Pertenece a Evento.

## QR pase físico

Pertenece a Evento.

Puede tener mesa si existe.

Tiene:

- token QR único;
- estado usado/no usado.

Si no hay croquis/mesa, muestra:

- QR;
- número de pase;
- nombre evento/salón.

## Álbum

Pertenece a Evento.

## Fotos

Pertenecen a Álbum.

## Acceso a álbum

Se determina por Invitación con al menos un Asistente ingresado.

## Créditos

Saldo pertenece a Cliente.

## Línea de crédito

Pertenece a Cliente.

## Movimiento financiero

Asociado a:

- Cliente;
- usuario actor si aplica;
- Evento si aplica;
- monto en créditos;
- monto en MXN si aplica;
- tipo de movimiento;
- fecha.

## Promoción

Puede aplicar a:

- Cliente específico;
- servicio contratado específico;
- compra de créditos;
- activación de evento;
- rango de fechas.

## Pago

Pertenece a:

- Cliente;
- movimiento financiero;
- comprobante interno.

## Comprobante interno

Pertenece a:

- Cliente;
- movimiento financiero;
- folio consecutivo.

## Auditoría

Relaciona:

- usuario actor si existe;
- staff token actor si aplica;
- Cliente afectado;
- Evento afectado si aplica;
- acción realizada;
- fecha/hora;
- metadata del cambio.

## Borrado lógico

Entidades importantes deben soportar borrado lógico:

- Cliente
- Evento
- Invitación
- Contacto
- Asistente
- Croquis
- Álbum

## Anonimización

Después de 30 días post-evento se anonimizan:

- nombres;
- teléfonos.

Se conservan:

- totales;
- asistencias;
- ingresos;
- uso de créditos;
- reportes agregados.
