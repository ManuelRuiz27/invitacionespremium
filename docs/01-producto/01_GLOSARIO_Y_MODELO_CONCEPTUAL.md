# 01 — Glosario y modelo conceptual

## Nombre del sistema

**InvitacionesPremium bt Soft-Monky**

## Principio rector

Usar este glosario como lenguaje obligatorio en documentación, código, UI y contratos API. No introducir sinónimos técnicos que generen ambigüedad.

## Cliente

Entidad general para Platform Admin.

Tipos permitidos:

- **Planner**
- **Organización**

## Planner

Cliente independiente que se registra desde la landing, compra créditos propios y gestiona sus propios eventos.

## Organización

Cliente creado por Platform Admin. Puede representar agencia, salón, jardín, empresa u otro cliente comercial.

No existen entidades separadas para salón, jardín, agencia o empresa. Todas se modelan como Organización.

## Admin de Organización

Usuario interno de una Organización que:

- contrata;
- paga;
- compra créditos;
- ve deuda/línea de crédito;
- activa eventos;
- puede crear usuario Planner si lo necesita.

## Planner de Organización

Usuario interno que crea y opera eventos dentro de una Organización, pero:

- no compra créditos;
- no ve deuda;
- no ve reportes financieros.

## Staff por token

Acceso temporal sin login para:

- escanear QR;
- buscar invitación exacta;
- registrar check-in;
- ver plano si existe.

No ve teléfonos, no ve asistencia en tiempo real, no ve reportes finales, no revierte check-in y no registra extras anónimos.

## Evento

Unidad principal de trabajo que agrupa:

- datos del evento;
- contactos;
- invitaciones;
- confirmación de asistencia;
- croquis, si aplica;
- staff;
- check-in;
- reportes;
- álbum, si aplica.

## Servicio contratado

Servicio que define el tipo operativo/comercial del evento.

Servicios MVP:

- Flipbook
- Flyer
- QR pase físico
- Demo

No usar "producto" en UI. Usar "servicio contratado".

## Tipo social

Clasificación social del evento:

- Boda
- XV años
- Corporativo
- Cumpleaños
- Otro

## Contacto

Persona principal que recibe el WhatsApp y el link único de la invitación.

Campos conceptuales:

- nombre;
- teléfono WhatsApp;
- grupo opcional;
- invitación asociada.

## Invitación

Unidad enviada por link único a un Contacto principal.

Una Invitación puede contener uno o varios Asistentes nominales.

## Invitado

No usar "Invitado" como entidad técnica principal.

En modelo técnico usar:

- Contacto
- Asistente

"Invitado" puede usarse solo como lenguaje natural de UI si no genera ambigüedad.

## Asistente

Persona nominal que puede:

- confirmar;
- tener mesa asignada;
- registrar check-in individual.

## Plus / Acompañantes

- **Plus**: singular.
- **Acompañantes**: plural.

Son Asistentes adicionales dentro de la misma Invitación.

## Familiar nominal

Invitación con varios Asistentes cuyos nombres deben registrarse individualmente.

## Grupo

Etiqueta opcional para clasificar Contactos/Asistentes.

Ejemplos:

- Fam. Novio
- Fam. Novia
- Trabajo

## QR de invitación

QR único asociado a una Invitación.

Al escanearlo permite registrar check-in individual de sus Asistentes pendientes.

## QR pase físico

QR individual usado como reemplazo de pase impreso, asociado a una mesa si existe y bloqueado tras su primer uso.

## Croquis

Imagen/plano del recinto sobre el que se dibujan mesas, zonas y etiquetas.

## Mesa

Zona asignable dentro del croquis con:

- nombre/número;
- forma;
- posición;
- capacidad.

## Zona decorativa

Área no asignable del croquis, con capacidad 0, usada para señalar referencias como:

- pista;
- baños;
- entrada;
- barra.

## Hotspot

Área clicable sobre Flyer o Flipbook que ejecuta una acción:

- confirmar asistencia;
- abrir ubicación;
- abrir mesa de regalos;
- abrir link adicional;
- mostrar QR.

## Check-in

Registro de entrada de un Asistente o PaseFisicoQR al evento.

## RSVP

Solo término técnico/interno.

En UI usar: **Confirmación de asistencia**.

## Crédito

Unidad interna de pago usada para activar eventos y calcular:

- promociones;
- saldo;
- línea de crédito;
- deuda.

## Línea de crédito

Crédito prestado autorizado por Platform Admin para que el Cliente active eventos y genere deuda.

## Álbum

Vista post-evento con hasta 35 fotos y link externo opcional, visible solo para Invitaciones con al menos un Asistente ingresado.

## Borrado lógico

Ocultar el registro al usuario sin eliminar auditoría, finanzas ni datos necesarios para trazabilidad.

## Archivado

Estado final del Evento que oculta links públicos y ya no puede reabrirse.

## Cancelado

Evento que:

- muestra mensaje público de cancelación;
- bloquea confirmación;
- bloquea QR;
- revoca tokens;
- conserva datos.
