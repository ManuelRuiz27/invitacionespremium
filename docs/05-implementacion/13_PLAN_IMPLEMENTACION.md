# 13 — Plan de implementación

## Principio

Primero documentación. Después estructura de repos. Después implementación incremental por módulos.

Este documento describe el orden interno de construcción del producto. No sustituye `15_BACKLOG_CODEX.md` ni los contratos especializados.

## Fase 0 — Preparación

Objetivo: dejar repos base, herramientas y convenciones.

Entregables:

- repos autorizados creados;
- README por repo;
- `.env.example` sin secretos;
- TypeScript estricto;
- lint;
- format;
- testing base;
- CI/CD básico;
- estructura modular vacía;
- OpenAPI base en API;
- estrategia de ramas/PR;
- ambientes local/staging/producción diferenciados.

Criterios:

- todos los repos construyen;
- CI ejecuta lint, typecheck, tests y build;
- no existe lógica de negocio todavía;
- no se crean repos, módulos ni entidades no autorizados.

## Fase 1 — API base

Módulos:

- AuthModule local;
- ClientsModule;
- ClientUsersModule;
- FileAssetsModule base;
- AuditModule base.

Criterios:

- login local email/password;
- sesión/cookie segura por ambiente;
- Planner independiente registrado públicamente;
- Organización creada solo por Platform Admin;
- usuarios internos de Organización;
- ownership por Cliente/usuario;
- Platform Admin sin impersonación;
- soft delete base;
- auditoría before/after;
- FileAsset con `owner_type` y `file_type` separados;
- errores de dominio y autorización uniformes;
- health check y logging sin secretos.

## Fase 2 — Finanzas

Módulos:

- ServicesPricingModule;
- FinanceModule;
- Promotions;
- Ledger;
- Balance cache;
- Comprobantes;
- Pagos.

Criterios:

- servicios y precios con historial;
- asignar créditos manualmente solo por Platform Admin;
- distinguir compra pagada de asignación gratuita;
- crear/suspender línea de crédito;
- consumir saldo comprado antes de línea;
- soportar activación mixta;
- ledger inmutable como fuente de verdad;
- movimientos limitados a `LEDGER_TYPES.md`;
- créditos enteros y MXN en centavos;
- deuda por lotes con valor unitario histórico;
- cambio futuro del valor del crédito no recalcula deuda previa;
- Pago `approved` como único origen de compra/pago de deuda confirmado;
- idempotencia en compras, pagos, devoluciones y reversos;
- comprobante interno con folio global;
- cortes diarios/mensuales reconstruibles desde ledger;
- balance cache verificable/reconstruible.

## Fase 3 — Eventos

Módulos:

- EventsModule;
- servicio contratado;
- tipo social;
- estados;
- activación;
- cierre;
- reapertura;
- cancelación;
- archivado;
- borrado lógico;
- procesos automáticos asociados al Evento dentro de módulos existentes.

Criterios:

- crear/editar Evento según ownership;
- guardar fecha y zona horaria IANA;
- implementar estados exactamente conforme a `EVENT_STATE_MACHINE.md`;
- recalcular `configured` y `ready_to_activate` en backend;
- activar cobrando créditos dentro de una transacción;
- conservar snapshot de precio/promoción;
- `active` → `event_day` según fecha local del Evento;
- cierre bloquea check-in y expira StaffTokens activos;
- reapertura no reactiva tokens expirados;
- cancelación conserva vista pública de mensaje y no devuelve créditos automáticamente;
- archivado es terminal y oculta links públicos;
- borrador vencido recibe borrado lógico automático idempotente;
- cambiar servicio conforme a reglas y diferencia de créditos;
- toda transición queda auditada.

## Fase 4 — Contactos e Invitaciones

Módulos:

- ContactsModule;
- InvitationsModule;
- Grupos;
- Asistentes;
- CSV import;
- límite 150.

Criterios:

- alta manual;
- plantilla/import CSV con preview;
- bloqueo completo si excede 150;
- errores por fila antes de confirmar;
- Contacto e Asistente separados;
- Contacto crea Invitación;
- Contacto principal genera Asistente principal;
- familiar nominal y plus/acompañantes;
- token público largo/no adivinable;
- token de Invitación separado de QR, Álbum y Staff;
- cancelación específica conserva link para mostrar mensaje;
- Invitación cancelada bloquea Confirmación y QR;
- no exponer teléfono a Staff.

## Fase 5 — Diseño de Invitaciones

Módulos:

- InvitationDesignModule;
- Flyer;
- Flipbook;
- Hotspots;
- preview;
- FileAssets del diseño.

Criterios:

- Flyer con imagen inicial e imagen QR;
- Flipbook de 1 a 10 páginas;
- subir solo JPG/PNG en MVP temprano;
- configurar Hotspots como entidades separadas;
- coordenadas relativas;
- área QR;
- hasta 3 links extra;
- preview mobile/tablet/desktop;
- diseño incompleto no queda listo para activar;
- Flyer/Flipbook solo editables antes de activar;
- diseño y orden quedan congelados al activar;
- sustitución de archivos conforme a `FILE_ASSET_POLICY.md`.

## Fase 6 — Confirmación pública

Módulos:

- PublicRsvpModule;
- QR de Invitación;
- link público.

Criterios:

- abrir Invitación por token sin filtrar otros recursos;
- confirmar/rechazar con Evento `active` o `event_day`;
- editar mientras Confirmación esté abierta;
- respetar límite de Invitación y capacidad del Evento;
- nombres nominales para familiar/acompañantes;
- QR después de confirmar;
- QR no contiene nombre/teléfono directo;
- Invitación rechazada sin QR;
- Invitación/Eventos cancelados muestran mensaje y bloquean acciones;
- Evento cerrado bloquea Confirmación y QR operativo;
- Evento archivado oculta contenido público;
- token reenviado mantiene identidad del Contacto original.

## Fase 7 — Croquis y Mesas

Módulos:

- FloorplanModule;
- Croquis;
- Mesa/Zona;
- seating.

Criterios:

- subir Croquis JPG/PNG vía API;
- un Croquis activo por Evento;
- dibujar Mesas/Zonas con coordenadas relativas;
- Mesa asignable con capacidad mayor a cero;
- zona decorativa con capacidad cero;
- asignar Asistente/familia/Grupo;
- validar capacidad en frontend y backend;
- confirmado puede quedar pendiente de Mesa mientras Confirmación siga abierta;
- cambio posterior a check-in queda auditado;
- Staff ve plano/mesa sin teléfonos;
- lock/unlock conforme a permisos y auditoría.

## Fase 8 — Staff y Scanner

Módulos:

- StaffAccessModule;
- ScannerModule;
- RealtimeModule.

Criterios:

- crear máximo 3 StaffTokens activos por Evento;
- crear tokens solo en `active` o `event_day`;
- expirados no cuentan como activos;
- cerrar/cancelar expira activos;
- reabrir no reactiva expirados;
- abrir scanner por token sin login;
- validar Evento operativo;
- escanear QR del mismo Evento;
- búsqueda exacta;
- mostrar solo Asistentes pendientes;
- registrar check-in por Asistente;
- impedir doble check-in concurrente;
- Staff no ve teléfonos, reportes, finanzas ni dashboard;
- Staff no revierte check-in;
- Socket.IO conforme a `REALTIME_PAYLOADS.md`;
- Staff solo entra a rooms `scanner` y `floorplan`;
- cierre/cancelación invalida UI y conexión.

## Fase 9 — QR pase físico

Módulo:

- PhysicalPassesModule.

Criterios:

- generar pases individuales;
- número de pase;
- QR SVG backend;
- mesa visible/resaltada si aplica;
- primer uso auditado;
- segundo uso y concurrencia bloqueados;
- scanner requiere Evento operativo;
- reporte PDF bajo demanda;
- sin Contacto, Confirmación nominal ni Álbum.

## Fase 10 — Álbum

Módulo:

- AlbumsModule.

Criterios:

- crear antes del cierre;
- publicar manualmente después del cierre;
- máximo 35 fotos JPG/PNG;
- título, mensaje, colores y link externo;
- QR pase físico sin Álbum;
- token de Álbum distinto al token de Invitación;
- generar token por Invitación elegible;
- elegible = al menos un Asistente ingresado;
- Invitación no elegible muestra `Álbum disponible solo para asistentes`;
- acceso solo con Evento `album_published`;
- vigencia 30 días desde publicación;
- despublicar expira tokens y vuelve a `closed`;
- archivado anticipado oculta inmediatamente;
- al vencer 30 días, Evento se archiva y accesos expiran;
- no exponer datos de otras Invitaciones.

## Fase 11 — Reportes

Módulo:

- ReportsModule.

Criterios:

- PDF bajo demanda;
- asistencia;
- QR pase físico;
- incidencias/auditoría operativa aplicable;
- solicitar `report_id` y dataset autorizado al API;
- frontend renderiza plantilla HTML y exporta PDF;
- PDF vuelve al API asociado al `report_id`;
- API valida y almacena como FileAsset;
- no aceptar PDF sin solicitud/autorización previa;
- no incluir teléfonos;
- detalle con nombres disponible máximo 30 días post-Evento;
- anonimización oculta/reemplaza reportes detallados;
- historial 6 meses conserva metadata y reportes agregados/anónimos;
- reportes del Cliente se consultan desde Resumen del Evento;
- Platform Admin usa rutas administrativas;
- no CSV/Excel en MVP.

## Fase 12 — Apps frontend

Repos:

- client;
- admin;
- scanner;
- landing;
- shared-ui.

Criterios:

- dashboards por rol;
- wizard responsive;
- cards/tabla de Eventos;
- navegación por estado del Evento;
- Invitación pública `/invitacion/:invitationToken`;
- Álbum público `/album/:albumToken`;
- scanner `/scanner/:staffToken`;
- reportes dentro del Resumen del Evento;
- Platform Admin sin impersonación y usando `/admin/**`;
- ocultar saldo/deuda a Planner de Organización;
- diseño congelado después de activar;
- estados de carga/error/vacío;
- Material UI/shared-ui sin reglas de negocio;
- landing mock sin backend ni datos reales;
- UI responsive y accesibilidad básica;
- backend manda en permisos y validaciones.

## Fase 13 — Staging

Objetivo:

- pruebas con datos reales simulados;
- despliegue reproducible Railway/Netlify;
- PostgreSQL y storage separados;
- variables de entorno y CORS/cookies correctos;
- migraciones/seeds controlados;
- 150 Contactos;
- 3 StaffTokens activos;
- check-in concurrente;
- uso único de PaseFisicoQR;
- activación con saldo/línea/mixto e idempotencia;
- Socket.IO estable, rooms autorizados y recuperación REST;
- reportes PDF por flujo autorizado;
- estados/cancelación/archivo correctos;
- jobs de `event_day`, borrador vencido, Álbum y anonimización;
- bloqueo/anonimización de reportes detallados;
- smoke tests y observabilidad;
- backups básicos y prueba de restauración.

No usar datos personales reales de producción.

## Fase 14 — Producción previa

Integraciones y hardening:

- Auth0;
- Mercado Pago Checkout Bricks;
- webhooks idempotentes;
- S3 compatible privado;
- URLs firmadas;
- email transaccional;
- logs/alertas técnicos;
- rate limiting;
- headers de seguridad;
- CSRF/CORS/cookies;
- secretos y rotación;
- backups/restauración;
- monitoreo de jobs;
- política de privacidad y términos;
- hardening de endpoints públicos/scanner/archivos;
- checklist de despliegue y rollback.

## Criterios de bloqueo

No avanzar si:

- hay entidad, rol, módulo, repo o ruta no documentada;
- se mezclan Contacto y Asistente;
- check-in se hace por Invitación y no por Asistente;
- existe doble check-in o doble uso de PaseFisicoQR posible;
- se descuenta saldo/deuda sin ledger;
- se edita/elimina ledger confirmado;
- se activa Evento sin saldo/línea o sin transacción completa;
- deuda histórica depende del valor actual del crédito;
- Staff ve teléfonos, reportes, finanzas o dashboard;
- Staff opera fuera de `active`/`event_day`;
- se reactivan StaffTokens expirados automáticamente;
- Invitación cancelada no muestra su mensaje público;
- token de Invitación se reutiliza como token de Álbum/Staff/QR;
- se edita Flyer/Flipbook después de activar;
- se genera/publica archivo sin FileAsset/ownership;
- frontend sube directo al storage;
- Socket.IO emite payload no documentado o datos sensibles;
- reporte conserva teléfonos o nombres después de la ventana de privacidad;
- Platform Admin impersona Cliente;
- proceso automático no es idempotente;
- contrato especializado y backlog no están alineados;
- módulo nuevo no aprobado.