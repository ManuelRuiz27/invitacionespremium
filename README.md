# InvitacionesPremium bt Soft-Monky

Monorepo del SaaS InvitacionesPremium. La documentación de `/docs` es la fuente de verdad del producto y el código se organiza en `/apps` y `/packages`.

## Estructura

```txt
apps/
  api/       NestJS + Prisma + PostgreSQL + Socket.IO
  client/    Panel de Planner/Organización e interfaces públicas
  admin/     Platform Admin
  scanner/   Microapp de check-in
  landing/   Sitio comercial

packages/
  ui/          Tema y componentes Material UI compartidos
  api-client/  Base del SDK generado desde OpenAPI

docs/         Producto, reglas, arquitectura y backlog
```

## Requisitos

- Node.js 22.13 o superior;
- Corepack;
- pnpm 11.15.1;
- Docker Compose para PostgreSQL local.

## Inicio local

```bash
corepack enable
corepack prepare pnpm@11.15.1 --activate
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm --filter @invitaciones/api db:migrate:deploy
pnpm --filter @invitaciones/api auth:seed-local-admin
pnpm dev
```

Servicios locales:

| Workspace | Puerto |
| --------- | -----: |
| API       |   3000 |
| Client    |   5173 |
| Admin     |   5174 |
| Scanner   |   5175 |
| Landing   |   5176 |

API disponible:

- `GET http://localhost:3000/api/v1/health` valida API y PostgreSQL;
- `POST http://localhost:3000/api/v1/auth/login` crea una sesión local temporal;
- `POST http://localhost:3000/api/v1/auth/logout` revoca la sesión actual;
- `GET http://localhost:3000/api/v1/auth/me` devuelve usuario, rol y contexto del Cliente;
- `POST http://localhost:3000/api/v1/clients/register-planner` registra un Planner independiente;
- `/api/v1/admin/clients/**` concentra las acciones globales de Platform Admin;
- `/api/v1/clients/:clientId/**` concentra las acciones del Cliente autenticado;
- `http://localhost:3000/docs` expone Swagger cuando está habilitado;
- `http://localhost:3000/docs-json` expone OpenAPI cuando está habilitado.

## Comandos principales

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm ci
```

Comandos de API:

```bash
pnpm --filter @invitaciones/api dev
pnpm --filter @invitaciones/api db:validate
pnpm --filter @invitaciones/api db:migrate:deploy
pnpm --filter @invitaciones/api auth:seed-local-admin
pnpm --filter @invitaciones/api test:integration
pnpm --filter @invitaciones/api openapi:generate
```

Filtrar una app:

```bash
pnpm turbo build --filter=@invitaciones/api
pnpm turbo dev --filter=@invitaciones/client
```

## Estado de implementación

`CODEX-000` completó:

- workspace pnpm y Turborepo;
- TypeScript estricto;
- ESLint, Prettier y Vitest;
- CI reproducible con lockfile congelado;
- cinco apps base;
- paquetes `ui` y `api-client`;
- `.env.example` por app.

`CODEX-010` agregó la base operativa de API:

- configuración validada por ambiente;
- Prisma 7 conectado a PostgreSQL;
- health API + DB;
- logging JSON y `operationId`;
- errores HTTP uniformes;
- OpenAPI reproducible;
- PostgreSQL local y pruebas de integración;
- soporte base para procesos programados idempotentes.

`CODEX-011` agregó auditoría y borrado lógico:

- tabla `audit_log` append-only;
- actores `USER`, `STAFF_TOKEN`, `PUBLIC_TOKEN` y `SYSTEM`;
- redacción de secretos y datos de contacto;
- mutaciones auditadas dentro de transacciones `Serializable`;
- triggers PostgreSQL contra modificación o eliminación de auditoría;
- repositorio base que excluye `deletedAt` por defecto;
- restauración exclusiva de Platform Admin sin reactivar tokens expirados.

`CODEX-020` agregó autenticación local temporal:

- usuarios y sesiones persistidas;
- contraseñas derivadas con `scrypt` y sal aleatoria;
- tokens de sesión opacos almacenados únicamente como SHA-256;
- cookie `HttpOnly`, `SameSite` y `Secure` según ambiente;
- login, logout y `me`;
- guard global con rutas públicas explícitas;
- protección de origen para métodos inseguros;
- auditoría de login/logout y no enumeración de usuarios;
- seed local de Platform Admin.

`CODEX-021` agregó Clientes Planner y Organización:

- entidad `Client`, tipo y estado operativo;
- FK formal de Usuario a Cliente;
- compatibilidad rol/tipo reforzada en PostgreSQL;
- registro público de Planner independiente;
- creación administrativa de Organización;
- usuarios Planner internos;
- suspensión/restauración auditada;
- roles y ownership sin impersonación.

`CODEX-030` agregó servicios, precios y promociones:

- catálogo cerrado de Flipbook, Flyer, QR físico y Demo;
- precios vigentes e historial por tipo de Cliente;
- intervalos de vigencia `[validFrom, validUntil)`;
- constraints PostgreSQL contra solapamientos y precios no válidos de Demo;
- promociones base con elegibilidad, vigencia y acumulación controlada;
- administración exclusiva de Platform Admin;
- seed idempotente de cuatro servicios y ocho precios iniciales.

`CODEX-031` agregó el núcleo financiero:

- ledger append-only e inmutable;
- balance cache reconstruible;
- línea de crédito y deuda por lotes históricos;
- pagos manuales aprobados, asignaciones gratuitas y comprobantes;
- folio global, idempotencia y auditoría transaccional;
- cortes diarios y mensuales derivados del ledger;
- constraints PostgreSQL para balances, pagos y asignaciones de deuda.

`CODEX-040` agregó el modelo y CRUD de Evento:

- borradores con datos básicos progresivos;
- estados `DRAFT` y `CONFIGURED` calculados por backend;
- ownership por Cliente, Organización y usuario creador;
- servicio activo, zona horaria IANA y capacidad validada;
- borrado lógico, restauración administrativa y limpieza idempotente de borradores vencidos;
- auditoría transaccional y consulta global de Platform Admin.

`CODEX-041` agregó la activación transaccional de Evento:

- consumo ordenado de saldo comprado y línea de crédito;
- ledger, comprobante, balance, snapshots y estado `ACTIVE` atómicos;
- precio vigente según tipo real de Cliente;
- valor histórico MXN para deuda financiada;
- ownership, idempotencia y concurrencia sin doble cobro;
- rechazo de Demo y rollback completo ante cualquier error;
- hardening PostgreSQL cerrado para inmutabilidad, estados y consistencia referencial de snapshots.

`CODEX-042` agregó el ciclo de vida posterior del Evento:

- entrada automática e idempotente a `EVENT_DAY` según la zona IANA;
- cierre y reapertura con resolución por fecha local;
- cancelación sin refund y con conservación de datos y snapshots;
- archivado desde cierre o publicación de Álbum;
- estados terminales y transiciones reforzados mediante PostgreSQL;
- ownership, idempotencia, concurrencia y auditoría transaccional;
- replay seguro después de borrado lógico y protección append-only contra `UPDATE`, `DELETE` y `TRUNCATE`.

`CODEX-042` quedó completamente cerrado.

`CODEX-050` agregó Contactos, grupos e importación CSV:

- CRUD con ownership exacto y mutaciones limitadas a la preparación del Evento;
- teléfonos WhatsApp normalizados a E.164 sin unicidad artificial;
- grupos únicos por nombre normalizado dentro de cada Evento;
- límite concurrente de 150 Contactos activos;
- preview CSV temporal y commit transaccional idempotente;
- descarte transaccional de filas normalizadas al confirmar;
- auditoría sin PII y anonimización agregada de Contactos y snapshots después de 30 días;
- replay redactado después de la retención y protección PostgreSQL contra reintroducir PII;
- limpieza irreversible de previews vencidos.

`CODEX-050` quedó completamente cerrado.

`CODEX-051` agregó Invitaciones y Asistentes nominales:

- aprovisionamiento transaccional desde altas manuales y CSV de Contactos;
- una Invitación y un Asistente principal por Contacto, con modos individual y familiar nominal;
- límites de Asistentes protegidos frente a concurrencia y pertenencia cruzada;
- tokens de Invitación y QR separados por propósito, firmados y no intercambiables;
- cancelación irreversible, idempotente y auditada;
- lectura pública mínima según estado del Evento, cancelación y borrado lógico;
- ownership operativo exacto y auditoría sin PII ni secretos;
- migración idempotente de Contactos existentes y anonimización de Asistentes a 30 días;
- constraints y triggers PostgreSQL para pertenencia, cardinalidad, principal e inmutabilidad.

`CODEX-051` quedó completamente cerrado.

El hardening final de `CODEX-051` agregó:

- configuración obligatoria, explícita y segura de tokens en producción;
- respuesta mínima e inmutable para cancelaciones, sin PII ni tokens;
- replay idempotente con ownership después de cambios de estado y soft delete;
- validación PostgreSQL del Cliente, rol, estado y ownership del actor de cancelación.

`CODEX-060` agregó FileAssets y storage local:

- modelo común con staging técnico, estados y compatibilidad owner/file cerrada;
- subida autenticada JPEG/PNG con firma, decodificación, dimensiones, límites, checksum y eliminación de metadata;
- storage local privado detrás de `FileStorage`, claves criptográficas y escritura atómica;
- consulta, contenido autenticado y borrado lógico sin exponer rutas ni claves internas;
- asociación transaccional mediante resolvers, con adapter inicial de Invitación;
- limpieza idempotente de huérfanos y constraints/triggers PostgreSQL.

El hardening final de `CODEX-060` agregó:

- reclamación lógica atómica antes de eliminar bytes huérfanos;
- exclusión segura entre cleanup, asociación y borrado genérico;
- reintento de eliminación física sin restaurar assets `DELETED`;
- deduplicación de schedulers concurrentes;
- descarga autenticada `private, no-store` y `nosniff`.

`CODEX-060` quedó completamente cerrado.

`CODEX-061` agregó Flyer, Flipbook y Hotspots:

- un diseño digital activo y compatible con el servicio configurado por Evento;
- Flyer con imagen inicial y QR, claim y sustitución segura de FileAssets;
- Flipbook relacional de una a diez páginas, orden continuo, reordenamiento y compactación;
- Hotspots persistentes con cinco acciones, coordenadas relativas y enlaces HTTPS controlados;
- readiness estable integrado al preflight antes de cualquier efecto financiero;
- ownership, congelamiento post-activación, auditoría y constraints PostgreSQL contra concurrencia.

El hardening final de `CODEX-061` agregó:

- readiness por acción: cuatro Hotspots requeridos en Flyer y portada/página QR derivadas en Flipbook;
- recálculo transaccional al editar, eliminar o reordenar, con baja inmediata a `CONFIGURED`;
- PATCH estricto que no descarta URLs incompatibles;
- URLs HTTPS reforzadas también mediante constraint PostgreSQL;
- una sola página QR y owners visuales activos, incluso frente a concurrencia y SQL directo.

`CODEX-061` quedó completamente cerrado.

`CODEX-070` agregó la vista pública completa de Flyer/Flipbook, entrega privada de sus assets y Hotspots,
Confirmación nominal, rechazo, reconciliación de acompañantes, cierre/reapertura y override operativo.
Capacidad, ownership, auditoría sin PII y consistencia Invitación/Asistentes se serializan y se refuerzan
con triggers diferibles PostgreSQL.

El cierre definitivo de `CODEX-070` añadió rutas `contentPath` directamente consumibles para todos los
assets públicos autorizados; destinos HTTPS que rechazan controles ASCII porcentuales tras hasta cuatro
rondas de decodificación tanto en aplicación como en PostgreSQL; y once carreras deterministas. Cada
carrera señala que la operación competidora alcanzó el método que ejecuta el lock real antes de liberar
la primera operación, sin `nextTick`, sleeps ni temporizadores arbitrarios. También prueba rollback ante
fallos de auditoría o storage y restaura todos los spies incluso cuando una aserción falla.

El cierre de paridad del parser exige sintaxis porcentual completa y UTF-8 válido, procesa todo el query
posterior al primer `?` y verifica filas heredadas antes de instalar la política nueva. Un corpus de 54
casos se ejecuta para `locationUrl` y `giftRegistryUrl` contra normalizador, DTO/API, `INSERT` y `UPDATE`.
La aplicación normaliza mediante `URL.href`; PostgreSQL solo valida y conserva el texto recibido.

`CODEX-070` quedó completamente cerrado.

`CODEX-071` agregó la generación y entrega controlada del QR SVG:

- un QR determinista por Invitación confirmada, generado bajo demanda y sin persistencia;
- token técnico con propósito `QR`, separado y no intercambiable con el token de Invitación;
- proyección pública `qr.available`/`contentPath` y endpoint privado por token
  `GET /api/v1/public/invitations/:invitationToken/qr.svg`;
- SVG vectorial validado defensivamente, sin PII, token visible, scripts, metadata ni referencias externas;
- resolución interna reutilizable por el scanner futuro, sin endpoint público de validación;
- locks Evento → Invitación, estados/cancelación/borrado lógico y carreras serializadas;
- headers privados, CSP restrictiva, ETag determinista y decodificación independiente probada.

`CODEX-071` quedó completamente cerrado.

`CODEX-080` agregó StaffTokens seguros y acotados por Evento:

- secreto `st1` de una sola entrega y almacenamiento exclusivo por digest SHA-256;
- máximo de tres tokens activos, protegido ante concurrencia y SQL directo;
- gestión con ownership de los tres roles operativos y listado sin secretos;
- sesión pública mínima, sin datos personales, finanzas ni recursos del Evento;
- expiración transaccional al cerrar/cancelar y no reactivación al reabrir;
- reloj de expiración obtenido con `clock_timestamp()` después del lock del Evento, único para todo el
  lote y nunca anterior a `createdAt`, incluso si una creación gana el lock mientras la transición
  espera;
- historial inmutable, auditoría sin secretos y resolución interna para el scanner futuro.

`CODEX-080` quedó completamente cerrado.

`CODEX-081` agregó Scanner y check-in por Asistente:

- scan de QR y búsqueda exacta acotados al Evento del StaffToken;
- proyección privada exclusiva de Asistentes confirmados pendientes;
- check-in parcial atómico, idempotente y con un único registro activo por Asistente;
- historial y reversión exclusiva de usuarios operativos autorizados;
- locks deterministas, auditoría transaccional y constraints PostgreSQL de pertenencia e inmutabilidad;
- cinco claves foráneas físicas `RESTRICT` y revalidación bajo locks de Evento, StaffToken, Invitación,
  Contacto y Asistente;
- replay idempotente estable desde snapshot, aun después de cambios operativos posteriores;
- pruebas deterministas de carreras entre check-in, estados del Evento, expiración, cancelación,
  lectura y reversión.

El hardening de integridad quedó cerrado con la migración PostgreSQL 26. `CODEX-081` quedó
completamente cerrado.

`CODEX-082 — Tiempo real operativo` quedó completado con Socket.IO v1 en `/realtime`, rooms autorizados
por Evento, sesión Auth o StaffToken revalidada en cada conexión, publicación post-commit, deduplicación
por `eventName + operationId`, invalidación Staff al cerrar/cancelar y recuperación de estado por REST.
La integración vertical prueba desde login y creación del Evento hasta RSVP, QR SVG, check-in realtime
y cierre. El hardening final fija la cookie Auth `HttpOnly` en `Path=/` para que el navegador la envíe al
path `/socket.io`; el token de sesión nunca se copia a JavaScript ni viaja en `auth` o query. La resolución
Staff bloquea Evento → StaffToken y coordina handshakes pendientes contra cierre/cancelación.

`CODEX-090 — Croquis, mesas, zonas y asignación de Asistentes` quedó completado:

- un Croquis activo por Evento con imagen JPG/PNG reclamada mediante FileAsset;
- Mesas y zonas relacionales, geometría validada, lock de layout y capacidad protegida por PostgreSQL;
- asignación individual, familiar y por Grupo, transaccional e idempotente;
- readiness de activación y cierre de Confirmación condicionado por Asistentes pendientes;
- proyección privada de Mesa y Croquis para Scanner;
- cancelación y RSVP liberan Mesas en la misma transacción, con auditoría adicional y un solo
  `seating.updated` post-commit;
- Scanner rechaza con `409 SCANNER_TABLE_ASSIGNMENT_REQUIRED` todo check-in sin Mesa operativa cuando
  el Evento usa Croquis;
- migraciones PostgreSQL 27 y 28, matriz determinista de concurrencia, integración real y vertical
  slice Socket.IO.

`CODEX-100 — Generación y uso de pases físicos` quedó completado:

- lotes consecutivos idempotentes para Eventos `PHYSICAL_QR`;
- QR/SVG privado derivado bajo demanda, sin FileAsset;
- primer uso Scanner único, auditable y protegido ante concurrencia;
- readiness propio sin Contactos, Invitaciones, Asistentes, Confirmación ni Álbum;
- capacidad combinada de Mesas y constraints PostgreSQL en la migración 29;
- hardening final en la migración 30: estados de generación, primer uso operativo, StaffToken no
  expirado e identidad inmutable desde la creación;
- recomputación transaccional de readiness al editar el Evento y E2E HTTP con QR rasterizado y
  decodificado, con y sin Croquis.

`CODEX-110 — Álbum postevento` quedó completado:

- `AlbumsModule` para Eventos `FLYER` y `FLIPBOOK`, con configuración visual estricta y hasta 35 fotos;
- FileAssets JPG/PNG privados, asociación transaccional, soft delete y posiciones continuas;
- publicación y despublicación idempotentes mediante `EventStateOperation`;
- token de Álbum separado por Invitación elegible, sin PII ni rutas internas;
- archivo anticipado y expiración automática a 30 días con invalidación inmediata;
- constraints y triggers diferidos PostgreSQL en la migración 31;
- E2E HTTP digital y matriz de concurrencia determinista.

El cierre final de `CODEX-110` agregó:

- resolver compartido de readiness para Flyer y Flipbook;
- recomputación transaccional desde Evento, Contactos, Invitaciones, diseño y Croquis;
- activación como última barrera antes de cualquier efecto financiero;
- E2E digital sin modificación manual de estado o snapshots de activación;
- ocultamiento inmediato de Invitación, Álbum y fotos públicas al alcanzar la expiración, incluso antes
  de que el scheduler persista el archivo.

Contrato normativo: `docs/04-tecnico/ALBUMS_CONTRACT.md`.

`CODEX-111 — Reportes PDF` quedó completado:

- `ReportsModule` con snapshots autoritativos de asistencia y pases físicos;
- privacidad nominal de 30 días y retención agregada de seis meses;
- PDF privado vinculado criptográficamente al reporte y almacenado como FileAsset;
- idempotencia, locks PostgreSQL, auditoría y scheduler de retención;
- endpoints Cliente y listados administrativos sin dataset ni descarga;
- migración PostgreSQL 32, pruebas unitarias, integración real y OpenAPI.

El hardening final de `CODEX-111` agregó:

- aislamiento total de `GENERATED_REPORT_PDF` respecto de listados, metadata, contenido y borrado
  genéricos de FileAssets;
- proyección temporal única aplicada antes del scheduler a autorización, replay, listados, carga y
  descarga;
- recuperación de reservas tras fallos de storage, transacción o auditoría, sin owner residual que
  bloquee el siguiente intento;
- binding PDF mediante tokens exactos y auditoría sin hashes completos ni nombres internos;
- integridad bidireccional Reporte–FileAsset mediante la migración PostgreSQL 33 y pruebas de carreras
  con barreras deterministas;
- serialización distribuida de cargas mediante advisory lock PostgreSQL de sesión, comprobada con dos
  instancias Nest independientes;
- recuperación de reservas `UPLOADING` después de una caída de proceso, sin transacción abierta durante
  la escritura de storage y sin mutex en memoria.

Contrato normativo: `docs/04-tecnico/REPORTS_CONTRACT.md`.

`CODEX-120 — Shell, login único y dashboard cliente` quedó completado:

- SDK tipado reproducible generado desde OpenAPI, con control de drift en CI;
- sesión exclusiva mediante cookie HttpOnly, login, logout y restauración con `/auth/me`;
- guards, retorno interno seguro y redirección de Platform Admin a la app administrativa;
- shell responsive y navegación autorizada para los tres roles Cliente;
- dashboard de Eventos con estados visibles, filtros, búsqueda y resumen de solo lectura;
- vista financiera exclusiva de Planner independiente y Admin de Organización;
- estados de carga, vacío, error, sesión expirada y conectividad;
- shared UI accesible y pruebas de SDK/componentes.

Contrato normativo: `docs/04-tecnico/CLIENT_APP_CONTRACT.md`.

`CODEX-121 — Wizard de Evento` quedó completado:

- creación diferida coordinada por una única promesa y reanudación por URL;
- pasos digitales completos y `PHYSICAL_QR` sin Contactos ni requests digitales;
- autosave serial con guardado manual y protección al salir;
- contactos/CSV por preview, editores Flyer/Flipbook, Hotspots, Croquis y lotes de pases;
- wall-clock por zona IANA, Revisión global y activación mediante diálogo accesible;
- llaves por intento incierto, sin llaves resueltas en Web Storage;
- hardening de zona horaria atómica, geometrías normalizadas y reintento de pases sin atribución por rangos globales;
- SDK ampliado y pruebas de runtime, modelo y flujos integrados.

Contrato normativo: `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`.

`CODEX-122 — Invitación y álbum públicos` quedó completado:

- rutas públicas fuera de sesión para Invitación y Álbum;
- Flyer/Flipbook responsivos, Hotspots seguros y assets mediante Object URLs revocados;
- Confirmación individual y familiar nominal, rechazo y reconciliación de resultados inciertos;
- QR bajo demanda con diálogo accesible y pantalla completa;
- Álbum elegible por token separado, tema validado y galería progresiva;
- requester público sin cookies, tokens no persistidos y errores no enumerantes.

Contrato normativo: `docs/04-tecnico/PUBLIC_CLIENT_CONTRACT.md`. `CODEX-130` no fue iniciado.

## Fuente de verdad

Orden inicial obligatorio:

1. `docs/01-producto/01_GLOSARIO_Y_MODELO_CONCEPTUAL.md`
2. `docs/01-producto/02_PRD.md`
3. `docs/01-producto/03_ROLES_PERMISOS_ACCESO.md`
4. `docs/04-tecnico/MONOREPO_ARCHITECTURE.md`
5. `docs/05-implementacion/14_CODEX_RULES.md`
6. tarea aplicable de `docs/05-implementacion/15_BACKLOG_CODEX.md`
7. enmiendas y contratos especializados del módulo

No se deben inventar entidades, roles, módulos, estados, permisos ni flujos.
