# 13 — Plan de implementación

## Principio

Primero documentación. Después estructura de repos. Después implementación incremental por módulos.

## Fase 0 — Preparación

Objetivo: dejar repos base, herramientas y convenciones.

Entregables:

- repos creados;
- README por repo;
- `.env.example`;
- lint;
- format;
- testing base;
- CI/CD básico;
- estructura modular vacía.

## Fase 1 — API base

Módulos:

- AuthModule local;
- ClientsModule;
- ClientUsersModule;
- FileAssetsModule base;
- AuditModule base.

Criterios:

- login local;
- sesión/cookie;
- Planner registrado;
- Organización creada por Platform Admin;
- usuarios internos Organización.

## Fase 2 — Finanzas

Módulos:

- ServicesPricingModule;
- FinanceModule;
- Promotions;
- Ledger;
- Balance cache;
- Comprobantes.

Criterios:

- asignar créditos manualmente;
- crear línea de crédito;
- consumir créditos al activar evento;
- registrar deuda;
- comprobante interno;
- cortes básicos.

## Fase 3 — Eventos

Módulos:

- EventsModule;
- servicio contratado;
- tipo social;
- estados;
- activación;
- cierre;
- cancelación;
- archivado;
- borrado lógico.

Criterios:

- crear evento;
- editar;
- activar cobrando créditos;
- cambiar servicio pagando diferencia.

## Fase 4 — Contactos e invitaciones

Módulos:

- ContactsModule;
- InvitationsModule;
- Grupos;
- Asistentes;
- CSV import;
- límite 150.

Criterios:

- alta manual;
- import CSV con preview;
- Contacto crea Invitación;
- Contacto principal genera Asistente principal;
- plus/acompañantes.

## Fase 5 — Diseño de invitaciones

Módulos:

- InvitationDesignModule;
- Flyer;
- Flipbook;
- Hotspots;
- preview.

Criterios:

- subir imágenes;
- configurar hotspots;
- QR area;
- hasta 3 links extra.

## Fase 6 — Confirmación pública

Módulos:

- PublicRsvpModule;
- QR de invitación;
- link público.

Criterios:

- abrir invitación por token;
- confirmar;
- rechazar;
- editar mientras abierta;
- QR después de confirmar.

## Fase 7 — Croquis y mesas

Módulos:

- FloorplanModule;
- Croquis;
- Mesa/Zona;
- seating.

Criterios:

- subir croquis;
- dibujar mesas/zonas;
- asignar asistente/familia/grupo;
- validar capacidad.

## Fase 8 — Staff y scanner

Módulos:

- StaffAccessModule;
- ScannerModule;
- RealtimeModule.

Criterios:

- crear hasta 3 tokens;
- abrir scanner token;
- escanear QR;
- buscar exacto;
- registrar check-in;
- Socket.IO operativo.

## Fase 9 — QR pase físico

Módulo:

- PhysicalPassesModule.

Criterios:

- generar pases QR SVG;
- mesa visible si aplica;
- segundo uso bloqueado;
- reporte PDF.

## Fase 10 — Álbum

Módulo:

- AlbumsModule.

Criterios:

- crear antes del cierre;
- publicar manual;
- 35 fotos;
- token distinto;
- acceso solo si Invitación tuvo asistencia.

## Fase 11 — Reportes

Módulo:

- ReportsModule.

Criterios:

- PDF bajo demanda;
- asistencia;
- QR pase físico;
- historial 6 meses.

## Fase 12 — Apps frontend

Repos:

- client;
- admin;
- scanner;
- landing;
- shared-ui.

Criterios:

- dashboards;
- wizard;
- scanner;
- landing mock;
- UI responsive;
- Material UI.

## Fase 13 — Staging

Objetivo:

- pruebas con datos reales simulados;
- 150 contactos;
- 3 tokens staff;
- check-in concurrente;
- Socket.IO estable;
- reportes PDF.

## Fase 14 — Producción previa

Integraciones:

- Auth0;
- Mercado Pago Checkout Bricks;
- S3 compatible;
- email transaccional;
- logs técnicos;
- hardening seguridad.

## Criterios de bloqueo

No avanzar si:

- hay entidad no documentada;
- se mezclan Contacto y Asistente;
- se descuenta saldo sin ledger;
- se activa evento sin saldo/línea;
- Staff ve teléfonos;
- check-in se hace por Invitación y no por Asistente;
- se genera archivo sin FileAsset;
- módulo nuevo no aprobado.
