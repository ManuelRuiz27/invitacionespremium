# 02 — PRD

## Visión

InvitacionesPremium bt Soft-Monky es una plataforma SaaS para Planners y Organizaciones que permite crear, administrar y operar eventos privados mediante invitaciones digitales premium, confirmación de asistencia, acomodo de mesas, QR de acceso, monitoreo operativo y álbum post-evento.

## Idea principal

No es solo una herramienta para crear invitaciones digitales. Es una plataforma de operación digital para eventos privados.

## Usuarios objetivo

### Planner

Cliente independiente que se registra desde landing, compra créditos, crea eventos y gestiona su operación.

### Organización

Cliente creado por Platform Admin. Puede representar agencia, salón, jardín, empresa u otro cliente comercial.

### Admin de Organización

Usuario interno que contrata, paga, compra créditos, ve deuda/línea, activa eventos y puede crear un Planner interno.

### Planner de Organización

Usuario interno que opera eventos dentro de la Organización.

### Staff por token

Acceso temporal sin login para operación del evento.

### Contacto/Asistente público

Usuario público sin cuenta. Recibe invitación por WhatsApp, confirma asistencia y muestra QR el día del evento.

## Servicios MVP

1. Flipbook
2. Flyer
3. QR pase físico
4. Demo

## Alcance MVP

Incluye:

- registro de Planner;
- creación de Organización por Platform Admin;
- auth local temporal;
- Auth0 futuro en producción;
- eventos;
- servicios contratados;
- créditos;
- línea de crédito;
- deuda;
- promociones;
- Flyer;
- Flipbook;
- QR pase físico;
- contactos;
- invitaciones;
- asistentes nominales;
- plus/acompañantes;
- confirmación de asistencia;
- croquis opcional;
- mesas y zonas;
- staff por token;
- scanner;
- check-in;
- reportes PDF bajo demanda;
- álbum post-evento;
- landing pública;
- dashboard cliente;
- app Platform Admin;
- microapp scanner;
- auditoría Platform Admin.

## Fuera de alcance MVP

- envío automático por WhatsApp API;
- modo offline;
- export CSV/Excel;
- conversión PDF a imagen en MVP temprano;
- facturación CFDI automática;
- Mercado Pago en MVP temprano;
- revocación manual de tokens staff;
- extra anónimo;
- roles no definidos;
- app móvil nativa.

## Límites MVP

- Máximo 150 contactos/invitaciones por evento.
- Máximo 3 tokens staff por evento activado.
- Álbum: 35 fotos para Flipbook y Flyer.
- QR pase físico no incluye álbum.
- Internet obligatorio.

## Servicios y precios iniciales

### Planner

- Flipbook: 30 créditos
- Flyer: 20 créditos
- QR pase físico: 15 créditos

### Organización

- Flipbook: 27 créditos
- Flyer: 17 créditos
- QR pase físico: 10 créditos

Platform Admin puede editar precios desde panel de precios/promociones.

## Demo

El demo:

- no consume créditos;
- no activa evento real;
- no genera tokens staff;
- no envía invitaciones reales;
- usa datos mock/seed.

## Criterios de aceptación principales

- Un Planner puede registrarse, crear evento, comprar/asignar créditos y activar evento.
- Una Organización puede ser creada por Platform Admin.
- Un Admin de Organización puede comprar créditos y activar eventos.
- Un Planner de Organización puede crear y operar eventos, pero no comprar créditos ni ver deuda.
- Una Invitación puede contener uno o varios Asistentes nominales.
- El QR pertenece a la Invitación, pero el check-in es por Asistente.
- El Staff no ve teléfonos.
- No se puede activar evento sin saldo o línea de crédito suficiente.
- Todo movimiento financiero genera ledger.
- Todo check-in queda auditado.
