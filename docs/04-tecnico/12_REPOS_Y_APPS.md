# 12 — Repos y apps

## Repos finales

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

No crear repos adicionales para módulos de negocio sin aprobación.

## invitacionespremium-api

Contiene:

- NestJS;
- Prisma;
- PostgreSQL schema/migraciones;
- REST API;
- Socket.IO;
- auth local temporal;
- integración Auth0 futura;
- módulos backend autorizados;
- procesos programados dentro de módulos existentes;
- seeds demo;
- tests backend;
- OpenAPI;
- SDK generado;
- storage controlado;
- auditoría, logs e idempotencia.

Responsabilidades exclusivas:

- reglas de negocio;
- ownership y permisos;
- estados/transiciones;
- ledger y efectos financieros;
- persistencia;
- generación de QR;
- autorización de archivos/reportes;
- anonimización;
- jobs automáticos.

## invitacionespremium-client

Contiene:

- dashboard Cliente;
- experiencia de Planner independiente;
- experiencia de Admin de Organización;
- experiencia de Planner de Organización;
- wizard de Eventos;
- créditos/finanzas según rol;
- demo interna conectada a seeds;
- perfil;
- reportes operativos dentro del Evento;
- Invitación pública por token de Invitación;
- Álbum público por token de Álbum separado;
- render/export de reportes PDF autorizados.

Rutas autenticadas conceptuales:

- `/dashboard`
- `/events`
- `/events/new`
- `/events/:id`
- `/credits`
- `/finance`
- `/demo`
- `/profile`

Rutas públicas:

- `/invitacion/:invitationToken`
- `/album/:albumToken`

Reglas:

- no existe `/reports` global para Planner en MVP;
- reportes se solicitan y descargan desde Resumen de `/events/:id`;
- Planner de Organización no ve `/credits` ni `/finance` cuando impliquen saldo/deuda;
- el frontend oculta navegación por rol, pero backend vuelve a autorizar cada operación;
- Flyer/Flipbook quedan congelados al activar;
- Evento activado muestra solo las vistas aprobadas: Resumen, Croquis/Mesas en modo lectura con acción autorizada de edición y Staff;
- no crear pantallas operativas adicionales fuera de `07_UI_UX_FLOW.md`.

### Reportes PDF en client

- solicita dataset/snapshot autorizado al API;
- renderiza plantilla HTML aprobada;
- exporta PDF;
- sube PDF mediante API asociado a `report_id`;
- nunca sube directo al storage;
- respeta ventana de 30 días para reportes detallados con nombres.

## invitacionespremium-admin

Solo para Platform Admin.

Contiene:

- Clientes;
- Organizaciones;
- usuarios;
- Eventos en lectura administrativa;
- finanzas;
- créditos;
- deuda;
- pagos;
- precios/promociones;
- reportes generales;
- auditoría;
- configuración.

Rutas conceptuales:

- `/dashboard`
- `/clients`
- `/events`
- `/finance`
- `/prices-promos`
- `/payments`
- `/reports`
- `/audit`
- `/users`
- `/settings`

Reglas:

- no impersona Clientes;
- `/events` usa endpoints `/admin/events/**`;
- las modificaciones globales requieren acciones administrativas explícitas documentadas;
- reportes usan `/admin/reports/**`;
- puede renderizar/exportar reportes administrativos mediante el mismo flujo autorizado de PDF;
- auditoría no se expone al client.

## invitacionespremium-scanner

Microapp pública con ruta conceptual:

- `/scanner/:staffToken`

Funciones:

- validar token Staff;
- confirmar Evento `active` o `event_day`;
- escanear QR;
- buscar Invitación exacta;
- registrar check-in por Asistente;
- ver plano/mesa;
- escanear QR pase físico;
- reaccionar a cierre/cancelación por Socket.IO.

Restricciones:

- no login de usuario;
- no teléfonos;
- no reportes;
- no finanzas;
- no reversión de check-in;
- no room `dashboard`;
- no modo offline MVP;
- token expirado no se reactiva.

## invitacionespremium-landing

Landing pública.

Contiene:

- información del producto;
- servicios/precios visibles;
- mock visual de demo sin backend;
- contenido para Planners y Organizaciones;
- preguntas frecuentes;
- botón registro;
- botón login.

Reglas:

- no crea Organización desde registro público;
- registro público solo Planner;
- no promete funciones fuera del MVP;
- demo es visual y no genera datos reales.

## shared-ui

Repo separado de componentes compartidos Material UI.

Contiene:

- tema/tokens visuales;
- componentes presentacionales reutilizables;
- patrones de layout;
- componentes accesibles comunes.

No contiene:

- reglas de negocio;
- llamadas API con ownership implícito;
- estados financieros;
- entidades Prisma;
- lógica específica de un módulo.

## Login

Login único con redirección según rol/tipo de usuario.

Destino inicial:

- Platform Admin → `invitacionespremium-admin`;
- Planner independiente → `invitacionespremium-client`;
- Admin de Organización → `invitacionespremium-client`;
- Planner de Organización → `invitacionespremium-client`.

Staff y Público usan tokens, no login.

## Demo

- Demo visual mock en landing sin backend.
- Demo interna en dashboard Cliente conectada a seeds API.
- Demo interna no consume créditos ni genera tokens reales.

## Tipos compartidos

No crear un repo adicional de tipos de dominio en MVP.

Los tipos de API se generan desde OpenAPI para cada consumidor.

`shared-ui` puede compartir props visuales, pero no convertirse en fuente paralela de contratos API.

## Contratos API

- OpenAPI se genera desde API;
- SDK se regenera cuando cambia contrato;
- CI debe detectar SDK/contrato desactualizado;
- frontends no mantienen manualmente copias divergentes de DTOs.

## Variables de entorno

Cada app debe tener `.env.example` sin secretos.

Variables separadas por ambiente para:

- URL API;
- Socket.IO;
- Auth0 cuando aplique;
- orígenes públicos;
- storage solo en API;
- observabilidad.

## CI/CD

MVP por repo:

- lint;
- typecheck;
- tests;
- build.

API además:

- validación de migraciones;
- verificación OpenAPI;
- pruebas de integración.

Frontends además:

- smoke E2E crítico;
- validación de rutas públicas;
- build con variables por ambiente.

## Testing por repo

- API: unitarias, integración, concurrencia e invariantes.
- Client: E2E de wizard, Invitación, Confirmación, QR, Álbum y reportes.
- Admin: E2E de Clientes, finanzas, Eventos administrativos, reportes y auditoría.
- Scanner: E2E de token, escaneo, check-in, cierre/cancelación.
- Landing: navegación, CTA, performance y accesibilidad básica.
- shared-ui: pruebas de componentes críticos y accesibilidad.

## Seeds

Seeds demo viven en API.

Frontends consumen desde API.

Seeds:

- solo local/staging autorizado;
- nunca mezclados con producción;
- sin datos personales reales;
- reproducibles.

## Archivos

Los archivos suben vía API.

Frontend nunca:

- guarda archivos directo;
- recibe credenciales de storage;
- decide `storage_key`;
- expone buckets públicos;
- reutiliza assets entre Clientes/Eventos.

Aplicar `FILE_ASSET_POLICY.md` en todos los repos.