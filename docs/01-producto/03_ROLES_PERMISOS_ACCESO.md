# 03 — Roles, permisos y acceso

## Tipos de cliente

- Planner
- Organización

## Registro público

Solo el Planner puede registrarse desde la landing.

## Organización

La Organización solo la crea Platform Admin.

## Auth

### Desarrollo temprano

- email/password
- sesión/cookie local

### Producción

- Auth0
- email/password
- Google
- sin WhatsApp/SMS en MVP

## Datos obligatorios post-registro

Para registro con Google o email/password:

- correo electrónico;
- tipo de cuenta;
- nombre comercial;
- teléfono WhatsApp;
- ciudad;
- estado;
- aceptar términos.

## Platform Admin

Puede:

- crear Organización;
- editar datos de Cliente;
- suspender Cliente;
- restaurar Cliente;
- ver saldo;
- ver deuda;
- asignar línea de crédito;
- registrar pago manual;
- asignar promoción;
- ver eventos del Cliente;
- gestionar precios;
- gestionar promociones;
- ver auditoría;
- ver reportes generales;
- crear usuarios para Organización.

No puede impersonar/ver cuenta del cliente.

## Planner independiente

Puede:

- crear eventos;
- editar eventos propios;
- comprar créditos;
- activar eventos;
- gestionar contactos;
- crear invitación;
- gestionar croquis/mesas;
- crear tokens staff;
- ver reportes de eventos propios;
- usar demo.

No puede crear usuarios internos permanentes.

## Admin de Organización

Puede:

- contratar;
- pagar;
- comprar créditos;
- ver deuda/línea de crédito;
- activar eventos;
- crear usuario Planner de Organización si lo necesita;
- ver todos los eventos de la Organización;
- editar todos los eventos de la Organización;
- ver reportes;
- ver historial de movimientos.

## Planner de Organización

Puede:

- crear eventos;
- editar eventos que creó;
- gestionar contactos;
- crear invitación;
- gestionar croquis/mesas;
- crear tokens staff;
- activar eventos;
- ver reportes operativos solo de eventos que creó.

No puede:

- comprar créditos;
- ver deuda;
- ver reportes financieros;
- ver eventos de toda la Organización.

## Staff por token

Puede:

- entrar con token sin login;
- escanear QR;
- buscar invitación exacta;
- registrar check-in;
- ver plano.

No puede:

- registrar extra anónimo;
- ver asistencia en tiempo real;
- ver teléfonos;
- revertir check-in;
- ver reportes finales;
- comprar créditos;
- activar eventos;
- editar eventos.

## Suspensión

Cliente suspendido puede iniciar sesión, pero no activar eventos.

## Deuda vencida

Cliente con deuda vencida solo se bloquea si Platform Admin lo decide.

## Auditoría de acceso

Auditar:

- login;
- registro;
- creación de usuario;
- cambio de rol;
- suspensión;
- creación de tokens;
- expiración de tokens.

No auditar impersonación porque no existirá.
