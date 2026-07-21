# 14 — Codex Rules

## Regla principal

Esta documentación es la fuente de verdad.

Codex no debe inventar entidades, roles, módulos, rutas, estados ni reglas.

## Prohibiciones

No crear:

- roles no definidos;
- entidades no definidas;
- módulos fuera del mapa;
- pantallas fuera del flujo;
- archivos sin responsabilidad clara;
- flujos alternos no aprobados.

## Reglas duras

1. No mezclar Contacto y Asistente.
2. No usar "Invitado" como entidad técnica.
3. No hacer check-in por Invitación.
4. El check-in se registra por Asistente.
5. El QR pertenece a Invitación.
6. Staff no ve teléfonos.
7. Staff no registra extra anónimo.
8. Staff no revierte check-in.
9. Staff no ve reportes finales.
10. No activar evento sin cobro o línea disponible.
11. No descontar créditos sin ledger.
12. Ledger es fuente de verdad financiera.
13. No borrar datos financieros.
14. No borrar auditoría.
15. No hacer hard delete en entidades principales.
16. No exponer auditoría a clientes.
17. No generar reportes CSV/Excel en MVP.
18. No implementar WhatsApp API en MVP.
19. No implementar modo offline en MVP.
20. No aceptar PDF en MVP temprano.
21. No crear microservicios no aprobados.
22. No crear app móvil nativa.
23. No implementar impersonación.
24. No separar salón/jardín/agencia como entidades distintas.
25. Organización cubre salón, jardín, agencia, empresa u otro cliente comercial.

## Naming obligatorio

Usar:

- Cliente
- Planner
- Organización
- Admin de Organización
- Planner de Organización
- Staff por token
- Contacto
- Invitación
- Asistente
- Servicio contratado
- Tipo social
- Crédito
- Línea de crédito

No usar "Invitado" como entidad técnica.

## Repos autorizados

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

## Módulos backend autorizados

- AuthModule
- ClientsModule
- ClientUsersModule
- ServicesPricingModule
- FinanceModule
- EventsModule
- ContactsModule
- InvitationsModule
- InvitationDesignModule
- PublicRsvpModule
- FloorplanModule
- StaffAccessModule
- ScannerModule
- PhysicalPassesModule
- AlbumsModule
- ReportsModule
- AuditModule
- FileAssetsModule
- RealtimeModule
- DemoModule

## Validaciones obligatorias

- máximo 150 contactos;
- máximo 3 staff tokens MVP;
- no exceder capacidad de mesa;
- no exceder capacidad de evento;
- QR no visible antes de confirmar;
- Invitación rechazada sin QR;
- Pase físico usado una sola vez;
- tokens staff expiran al cerrar evento.

## Criterio de aceptación para cambios

Todo cambio debe poder responder:

1. ¿Qué requerimiento lo respalda?
2. ¿En qué documento está?
3. ¿Qué módulo lo contiene?
4. ¿Qué entidad afecta?
5. ¿Qué regla de negocio valida?
