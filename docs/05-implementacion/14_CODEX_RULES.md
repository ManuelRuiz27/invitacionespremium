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
26. No implementar una transición de Evento fuera de `EVENT_STATE_MACHINE.md`.
27. No conceder acceso fuera de `ACCESS_MATRIX.md`.
28. No crear tipos de movimiento financiero fuera de `LEDGER_TYPES.md`.
29. No subir, publicar ni eliminar archivos fuera de `FILE_ASSET_POLICY.md`.
30. No emitir eventos Socket.IO o payloads fuera de `REALTIME_PAYLOADS.md`.
31. No iniciar una tarea Codex que no cumpla las dependencias y criterios de `15_BACKLOG_CODEX.md`.

## Contratos especializados obligatorios

Cuando una tarea afecte el área indicada, Codex debe leer y citar en su PR el documento correspondiente:

| Área | Documento obligatorio |
|---|---|
| Estados y ciclo del Evento | `docs/02-flujos-reglas/EVENT_STATE_MACHINE.md` |
| Roles, permisos y ownership | `docs/01-producto/ACCESS_MATRIX.md` |
| Créditos, deuda, pagos y activación | `docs/02-flujos-reglas/LEDGER_TYPES.md` |
| Archivos, imágenes, QR y reportes | `docs/04-tecnico/FILE_ASSET_POLICY.md` |
| Socket.IO | `docs/04-tecnico/REALTIME_PAYLOADS.md` |
| Orden de implementación | `docs/05-implementacion/15_BACKLOG_CODEX.md` |

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
6. ¿Qué contrato especializado aplica?
7. ¿Qué tarea de `15_BACKLOG_CODEX.md` está ejecutando?