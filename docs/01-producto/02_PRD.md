# 02 — PRD

## Visión

InvitacionesPremium bt Soft-Monky es una plataforma SaaS para Planners y Organizaciones que permite crear, administrar y operar Eventos privados mediante invitaciones digitales premium, Confirmación de asistencia, acomodo de mesas, QR de acceso, operación de entrada, reportes y Álbum post-Evento.

## Idea principal

No es solo una herramienta para crear invitaciones digitales. Es una plataforma de operación digital para Eventos privados.

## Usuarios objetivo

### Planner independiente

Cliente que se registra desde landing, compra créditos, crea Eventos y gestiona su operación.

### Organización

Cliente creado por Platform Admin. Puede representar agencia, salón, jardín, empresa u otro cliente comercial.

No existen entidades comerciales separadas para esas variantes.

### Admin de Organización

Usuario interno que contrata, paga, compra créditos, ve deuda/línea, activa Eventos y puede crear un Planner interno.

### Planner de Organización

Usuario interno que crea y opera únicamente los Eventos que le corresponden dentro de la Organización.

No compra créditos ni ve deuda.

### Staff por token

Acceso temporal sin login para scanner, búsqueda exacta, plano y check-in del Evento asociado.

### Contacto/Asistente público

Persona sin cuenta. Recibe Invitación por WhatsApp, confirma asistencia, registra Asistentes nominales y muestra QR el día del Evento.

## Servicios MVP

1. Flipbook
2. Flyer
3. QR pase físico
4. Demo

## Alcance MVP

Incluye:

- registro público de Planner independiente;
- creación de Organización por Platform Admin;
- auth local temporal para desarrollo;
- Auth0 para producción;
- Eventos y estados controlados;
- servicios contratados;
- créditos comprados;
- asignación manual de créditos por Platform Admin;
- línea de crédito y deuda;
- promociones;
- Flyer;
- Flipbook;
- QR pase físico;
- Contactos;
- Invitaciones;
- Asistentes nominales;
- plus/acompañantes;
- Confirmación de asistencia;
- Croquis opcional;
- Mesas y zonas;
- Staff por token;
- scanner;
- check-in individual;
- reportes PDF bajo demanda;
- Álbum post-Evento;
- landing pública;
- dashboard Cliente;
- app Platform Admin;
- microapp scanner;
- auditoría Platform Admin;
- anonimización de datos personales.

## Fuera de alcance MVP

- envío automático por WhatsApp API;
- modo offline;
- export CSV/Excel de reportes;
- conversión PDF a imagen en MVP temprano;
- facturación CFDI automática;
- Mercado Pago en MVP temprano;
- revocación manual de tokens Staff;
- extra anónimo;
- roles no definidos;
- app móvil nativa;
- impersonación de Clientes;
- edición de Flyer/Flipbook después de activar;
- reembolso monetario al Cliente.

## Límites MVP

- Máximo 150 Contactos/Invitaciones por Evento.
- Máximo 3 tokens Staff activos por Evento.
- Tokens Staff expirados no cuentan como activos ni se reactivan automáticamente.
- Flipbook: máximo 10 páginas.
- Álbum: máximo 35 fotos para Flipbook y Flyer.
- QR pase físico no incluye Álbum.
- Internet obligatorio.
- Créditos enteros; no existen fracciones de crédito.
- Reportes detallados con nombres disponibles máximo 30 días post-Evento.

## Reglas de experiencia principales

- Flyer/Flipbook se configuran antes de activar y quedan congelados al activar.
- QR pertenece a Invitación, pero el check-in pertenece a Asistente.
- QR solo aparece después de confirmar.
- Invitación rechazada no muestra QR.
- Invitación o Evento cancelado conserva una vista pública de cancelación, sin Confirmación ni QR.
- Evento cerrado bloquea check-in y expira StaffTokens activos.
- Álbum usa token distinto del token de Invitación.
- Álbum solo es accesible para Invitaciones con al menos un Asistente ingresado.
- Álbum público expira a los 30 días y el Evento se archiva.
- Archivado oculta links públicos y no permite reapertura.

## Servicios y precios iniciales

### Planner independiente

- Flipbook: 30 créditos
- Flyer: 20 créditos
- QR pase físico: 15 créditos

### Organización

- Flipbook: 27 créditos
- Flyer: 17 créditos
- QR pase físico: 10 créditos

Platform Admin puede editar precios desde panel de precios/promociones.

La activación conserva snapshot del precio y promoción aplicados.

## Demo

El demo:

- no consume créditos;
- no activa Evento real;
- no genera tokens Staff;
- no envía Invitaciones reales;
- usa datos mock/seed;
- no mezcla datos demo con producción.

## Privacidad MVP

Después de 30 días post-Evento:

- anonimizar nombres de Contactos y Asistentes;
- anonimizar teléfonos;
- conservar métricas agregadas, check-ins y elegibilidad de Álbum;
- ocultar o reemplazar reportes detallados con versión anónima;
- no conservar teléfonos dentro de PDFs operativos.

## Criterios de aceptación principales

- Un Planner puede registrarse, crear Evento, comprar créditos o recibir una asignación manual de Platform Admin y activar Evento.
- Solo Platform Admin puede asignar créditos manualmente y crear Organizaciones.
- Un Admin de Organización puede comprar créditos, ver deuda/línea y activar Eventos.
- Un Planner de Organización puede crear y operar Eventos propios, pero no comprar créditos ni ver deuda.
- Una Invitación puede contener uno o varios Asistentes nominales.
- Contacto y Asistente permanecen como conceptos separados.
- El QR pertenece a Invitación, pero el check-in es por Asistente.
- Staff no ve teléfonos, no revierte check-in y no ve reportes.
- Staff solo opera en Eventos `active` o `event_day`.
- No se puede activar Evento sin saldo o línea de crédito suficiente.
- Todo movimiento financiero genera ledger inmutable o movimiento compensatorio.
- Todo check-in queda auditado y no puede duplicarse.
- Cancelación pública muestra mensaje correcto sin habilitar acciones.
- Álbum público requiere token separado, elegibilidad y vigencia.
- Platform Admin consulta Eventos mediante contexto administrativo sin impersonación.
- La anonimización impide conservar nombres/teléfonos en reportes descargables después de la ventana permitida.