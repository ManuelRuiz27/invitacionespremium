# Backlog ejecutable para Codex

## Objetivo

Convertir la documentación fuente de verdad en una secuencia de trabajo implementable por Codex.

Este backlog no reemplaza `13_PLAN_IMPLEMENTACION.md`. Lo traduce a unidades ejecutables con dependencias, alcance y criterios de aceptación.

## Regla de uso

Codex debe recibir una tarea por sesión o por rama de trabajo suficientemente pequeña.

No se debe solicitar: “implementa todo InvitacionesPremium”.

Cada tarea debe incluir:

- repo objetivo;
- módulo dueño;
- documentos obligatorios;
- alcance explícito;
- archivos/directorios esperados;
- pruebas requeridas;
- criterios de aceptación;
- prohibiciones aplicables.

## Documentos obligatorios para toda tarea

1. `README.md`
2. `docs/01-producto/01_GLOSARIO_Y_MODELO_CONCEPTUAL.md`
3. `docs/05-implementacion/14_CODEX_RULES.md`
4. Documento específico del módulo.
5. `docs/01-producto/ACCESS_MATRIX.md` cuando exista autorización.
6. `docs/02-flujos-reglas/EVENT_STATE_MACHINE.md` cuando afecte Eventos.
7. `docs/02-flujos-reglas/LEDGER_TYPES.md` cuando afecte créditos, pagos o activación.
8. `docs/04-tecnico/FILE_ASSET_POLICY.md` cuando afecte archivos.
9. `docs/04-tecnico/REALTIME_PAYLOADS.md` cuando afecte Socket.IO.

## Definition of Ready

Una tarea está lista para Codex cuando:

- no introduce entidades no documentadas;
- el repo y módulo están definidos;
- las dependencias previas están terminadas;
- existen criterios de aceptación verificables;
- están identificados permisos y ownership;
- están definidos los efectos financieros si aplica;
- están definidos los estados permitidos si aplica.

## Definition of Done

Una tarea se considera terminada cuando:

- compila;
- pasa lint;
- pasa pruebas requeridas;
- no rompe pruebas existentes;
- actualiza OpenAPI si modifica API;
- incluye `.env.example` si agrega configuración;
- incluye migración Prisma si cambia schema;
- respeta soft delete y auditoría;
- no deja TODOs críticos ni mocks ocultos;
- documenta decisiones técnicas dentro del repo correspondiente;
- demuestra los criterios de aceptación.

## Estrategia de ramas

Formato sugerido:

- `feat/<modulo>-<objetivo>`
- `fix/<modulo>-<problema>`
- `chore/<repo>-<objetivo>`

Cada PR debe referenciar:

- tarea del backlog;
- documentos usados;
- pruebas ejecutadas;
- riesgos conocidos.

# Orden de implementación

## EPIC 0 — Bootstrap de repos

### CODEX-000 — Crear estructura base de repos

**Repos**

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

**Dependencias**

- documentación QA fusionada en `main`;
- decisiones de stack cerradas.

**Alcance**

- inicializar cada repo;
- configurar TypeScript estricto;
- lint y format;
- test runner;
- `.env.example`;
- README;
- CI con lint, tests y build;
- convenciones de imports y estructura.

**Directorios esperados**

API:

```txt
src/
prisma/
test/
```

Frontends:

```txt
src/app/
src/features/
src/shared/
tests/
```

**Criterios de aceptación**

- todos los repos construyen sin errores;
- CI corre en push/PR;
- no existe lógica de negocio todavía;
- `shared-ui` exporta al menos un ThemeProvider y un componente base de prueba;
- cada repo explica cómo ejecutar localmente.

**Prompt base para Codex**

```txt
Inicializa el repo indicado conforme a 08_TRD.md, 12_REPOS_Y_APPS.md y 14_CODEX_RULES.md. No implementes lógica de negocio. Configura TypeScript estricto, lint, format, tests, build, .env.example, README y CI. Mantén estructura modular y explica cada archivo creado.
```

---

## EPIC 1 — Base API, Prisma y observabilidad

### CODEX-010 — Configurar NestJS, Prisma y PostgreSQL

**Repo:** `invitacionespremium-api`

**Módulo dueño:** infraestructura base

**Dependencias:** CODEX-000

**Alcance**

- NestJS base;
- Prisma conectado a PostgreSQL;
- configuración por ambiente;
- manejo central de errores;
- logging estructurado;
- health endpoint;
- OpenAPI base;
- timestamps y UUID conventions.

**Archivos/directorios esperados**

```txt
src/config/
src/common/errors/
src/common/logging/
src/common/database/
src/health/
prisma/schema.prisma
```

**Criterios de aceptación**

- API inicia con PostgreSQL;
- health check valida app y DB;
- Swagger/OpenAPI disponible en desarrollo;
- errores usan estructura uniforme;
- logs no exponen secretos.

### CODEX-011 — Crear base de auditoría y soft delete

**Repo:** `invitacionespremium-api`

**Módulos:** `AuditModule`, common persistence

**Dependencias:** CODEX-010

**Alcance**

- entidad Auditoría;
- helper/interceptor para actor y metadata;
- patrón de soft delete;
- filtros que excluyan `deleted_at` por defecto;
- restauración reservada a Platform Admin.

**Criterios de aceptación**

- se puede registrar before/after;
- soft delete no elimina físicamente;
- queries normales ocultan eliminados;
- pruebas cubren borrado/restauración.

---

## EPIC 2 — Auth, Clientes y usuarios

### CODEX-020 — Auth local temporal

**Repo:** `invitacionespremium-api`

**Módulo:** `AuthModule`

**Dependencias:** CODEX-010

**Documentos específicos**

- `03_ROLES_PERMISOS_ACCESO.md`
- `ACCESS_MATRIX.md`
- `11_API_CONTRACTS.md`

**Alcance**

- email/password;
- hash seguro;
- sesión/cookie local;
- login, logout, me;
- guards base;
- auditoría de login.

**Criterios de aceptación**

- credenciales inválidas no revelan existencia de usuario;
- cookie usa configuración segura por ambiente;
- logout invalida sesión;
- `GET /auth/me` devuelve rol y Cliente sin datos sensibles innecesarios.

### CODEX-021 — Clientes Planner y Organización

**Repo:** `invitacionespremium-api`

**Módulos:** `ClientsModule`, `ClientUsersModule`

**Dependencias:** CODEX-020, CODEX-011

**Alcance**

- Cliente base;
- registro público solo Planner;
- creación de Organización solo Platform Admin;
- Admin de Organización;
- Planner de Organización opcional;
- suspensión/restauración;
- ownership policies.

**Criterios de aceptación**

- no existen entidades separadas para salón/agencia/jardín;
- Planner independiente no crea usuarios internos;
- Admin Organización puede crear Planner interno;
- Planner Organización no ve otros Eventos por defecto;
- Cliente suspendido inicia sesión pero no activa Eventos.

---

## EPIC 3 — Servicios, precios y finanzas

### CODEX-030 — Catálogo de servicios y precios vigentes

**Repo:** `invitacionespremium-api`

**Módulo:** `ServicesPricingModule`

**Dependencias:** CODEX-021

**Alcance**

- servicios Flipbook, Flyer, QR pase físico y Demo;
- historial de precios;
- precios Planner/Organización;
- vigencia desde/hasta;
- promoción base y acumulación controlada.

**Criterios de aceptación**

- precios anteriores no se sobrescriben;
- activación toma snapshot del precio vigente;
- Platform Admin es el único que administra precios/promociones;
- Demo tiene costo cero.

### CODEX-031 — Ledger, balance cache y línea de crédito

**Repo:** `invitacionespremium-api`

**Módulo:** `FinanceModule`

**Dependencias:** CODEX-030

**Documentos específicos**

- `06_FINANZAS_CREDITOS_CONTABILIDAD.md`
- `LEDGER_TYPES.md`

**Alcance**

- enum de movimientos;
- ledger inmutable;
- balance cache;
- línea y deuda;
- idempotencia;
- asignación manual de créditos;
- pago manual;
- comprobante con folio global;
- cortes básicos.

**Criterios de aceptación**

- ningún saldo cambia sin ledger;
- deuda no baja de cero;
- línea usada no supera límite;
- pago de deuda no aumenta saldo comprado;
- operación duplicada no duplica movimiento;
- pruebas de pago mixto.

---

## EPIC 4 — Eventos y activación

### CODEX-040 — Modelo y CRUD de Evento

**Repo:** `invitacionespremium-api`

**Módulo:** `EventsModule`

**Dependencias:** CODEX-021, CODEX-030, CODEX-011

**Documentos específicos**

- `05_REGLAS_NEGOCIO.md`
- `EVENT_STATE_MACHINE.md`
- `ACCESS_MATRIX.md`

**Alcance**

- datos mínimos;
- servicio contratado;
- tipo social;
- zona horaria;
- capacidad;
- ownership;
- soft delete;
- estados draft/configured/ready.

**Criterios de aceptación**

- Planner independiente opera solo propios;
- Admin Organización opera todos los de Organización;
- Planner Organización solo los creados por él;
- `configured` puede ocultarse en UI;
- borrador vencido queda preparado para proceso automático futuro.

### CODEX-041 — Activación transaccional

**Repo:** `invitacionespremium-api`

**Módulos:** `EventsModule`, `FinanceModule`, `AuditModule`

**Dependencias:** CODEX-031, CODEX-040

**Alcance**

- checklist de activación;
- saldo/línea/mixto;
- promoción;
- ledger;
- comprobante;
- cambio a active;
- idempotencia.

**Criterios de aceptación**

- activar sin saldo/línea falla sin cambios parciales;
- activación exitosa crea movimientos y comprobante;
- retry no cobra dos veces;
- Demo no genera consumo;
- evento activo conserva snapshot de precio.

### CODEX-042 — Cierre, reapertura, cancelación y archivado

**Repo:** `invitacionespremium-api`

**Módulo:** `EventsModule`

**Dependencias:** CODEX-041

**Alcance**

- transiciones conforme a máquina de estados;
- bloqueo de check-in;
- expiración de tokens;
- mensaje cancelado;
- links públicos ocultos al archivar;
- auditoría.

**Criterios de aceptación**

- transiciones prohibidas responden error de dominio;
- archived/cancelled son terminales;
- cancelación no devuelve créditos automáticamente;
- reapertura antes de archivado funciona según fecha/hora.

---

## EPIC 5 — Contactos, Invitaciones y Asistentes

### CODEX-050 — Contactos, grupos e import CSV

**Repo:** `invitacionespremium-api`

**Módulo:** `ContactsModule`

**Dependencias:** CODEX-040

**Alcance**

- Contacto;
- Grupo opcional;
- alta manual;
- edición;
- borrado lógico;
- plantilla CSV;
- preview/import;
- límite 150 backend.

**Criterios de aceptación**

- archivo de más de 150 se bloquea completo;
- errores por fila se reportan antes de confirmar import;
- teléfonos se normalizan sin exponerlos a Staff;
- Grupo pertenece al Evento.

### CODEX-051 — Invitaciones y Asistentes nominales

**Repo:** `invitacionespremium-api`

**Módulo:** `InvitationsModule`

**Dependencias:** CODEX-050

**Alcance**

- Invitación por Contacto;
- Asistente principal automático;
- familiar nominal;
- plus/acompañantes;
- token público largo;
- cancelación específica;
- QR asociado a Invitación.

**Criterios de aceptación**

- Contacto y Asistente son tablas/entidades separadas;
- check-in no pertenece a Invitación;
- límite de acompañantes se respeta;
- Invitación cancelada deja de abrir y conserva datos.

---

## EPIC 6 — Diseño de invitación y archivos

### CODEX-060 — FileAssets y storage local

**Repo:** `invitacionespremium-api`

**Módulo:** `FileAssetsModule`

**Dependencias:** CODEX-010, CODEX-011

**Documentos específicos**

- `FILE_ASSET_POLICY.md`

**Alcance**

- subida vía API;
- storage local dev;
- validación MIME/tamaño/checksum;
- ownership;
- estados de archivo;
- acceso autorizado.

**Criterios de aceptación**

- frontend no decide storage key;
- JPG/PNG aceptados según módulo;
- PDF de usuario rechazado en MVP temprano;
- archivo de otro Cliente no puede vincularse;
- archived/cancelled no hacen hard delete.

### CODEX-061 — Flyer, Flipbook y Hotspots

**Estado:** COMPLETADO

**Repo:** `invitacionespremium-api`

**Módulo:** `InvitationDesignModule`

**Dependencias:** CODEX-051, CODEX-060

**Alcance**

- Flyer inicial + QR;
- Flipbook 1–10 páginas;
- orden de páginas;
- Hotspot entidad separada;
- acciones mínimas;
- hasta 3 links adicionales.

**Criterios de aceptación**

- diseño incompleto no queda listo para activar;
- coordenadas son relativas;
- Hotspot no se incrusta únicamente como JSON del diseño;
- límites se validan en backend.
- Flyer exige `RSVP`, `LOCATION`, `GIFT_REGISTRY` y `QR_AREA`;
- Flipbook exige acciones de portada y página QR derivada de `QR_AREA`;
- PostgreSQL impide URLs externas inválidas y Hotspots activos sobre páginas eliminadas;
- readiness se recalcula transaccionalmente al editar, eliminar o reordenar.

---

## EPIC 7 — Confirmación pública y QR

### CODEX-070 — Vista pública y Confirmación de asistencia API

**Estado:** completado.

**Repo:** `invitacionespremium-api`

**Módulo:** `PublicRsvpModule`

**Dependencias:** CODEX-051, CODEX-061, CODEX-041

**Alcance**

- resolver invitación por token;
- confirmar/rechazar;
- modificar mientras esté abierta;
- nombres nominales;
- cupo del Evento;
- QR solo después de confirmar.

**Criterios de aceptación**

- token inválido no filtra información;
- rechazo no genera QR visible;
- aumento respeta invitación y capacidad;
- cierre de Confirmación bloquea cambios públicos;
- link reenviado conserva identidad del Contacto original.

**Implementado**

- resolución única mediante `PublicRsvpModule` y `InvitationTokenService`;
- Flyer/Flipbook, páginas, Hotspots y assets referenciados con entrega privada;
- confirmación, rechazo y reconciliación nominal serializable;
- cierre/reapertura y override operativo con ownership;
- capacidad por Asistente, auditoría `PUBLIC_TOKEN` sin PII y constraints diferibles PostgreSQL.
- `contentPath` funcional para Flyer y páginas Flipbook, sin placeholders;
- corpus único para normalización, DTO/API, `INSERT` y `UPDATE`, con rechazo de controles ASCII tras
  hasta cuatro decodificaciones y `%20` limitado a path y valores de query;
- paridad de sintaxis porcentual y UTF-8, procesamiento completo del query desde el primer `?` y
  verificación transaccional de destinos heredados;
- 54 casos ejecutados contra `locationUrl` y `giftRegistryUrl`, conservando la fila anterior ante
  `UPDATE` rechazado; PostgreSQL valida sin normalizar;
- once carreras con señal verificable de intento del lock PostgreSQL real, sin `nextTick` ni
  temporizadores arbitrarios;
- rollback probado ante auditoría o storage fallidos y restauración de spies en `finally`.

El hardening final de controles URL, entrega privada y concurrencia quedó cerrado sin iniciar
`CODEX-071`.

### CODEX-071 — Generación de QR SVG

**Estado:** COMPLETADO

**Repo:** `invitacionespremium-api`

**Módulos:** `PublicRsvpModule`, QR service

**Dependencias:** CODEX-070

**Alcance**

- SVG backend;
- token opaco;
- endpoint autorizado;
- pantalla completa en frontend posteriormente.

**Criterios de aceptación**

- QR no contiene teléfono/nombre en texto;
- QR pertenece a una Invitación;
- no es visible antes de confirmar;
- token cancelado deja de validar.

**Implementado**

- `InvitationQrService` integrado en `PublicRsvpModule`, sin entidad, tabla, FileAsset ni persistencia;
- payload exacto emitido por `InvitationTokenService` con propósito `QR`, nonce y versión existentes;
- proyección `qr.available`/`contentPath` en la vista pública;
- `GET /public/invitations/:invitationToken/qr.svg` con SVG determinista y headers privados/CSP;
- validación defensiva contra elementos activos, metadata, referencias externas, PII y token visible;
- `resolveQrToken()` interno para CODEX-081, sin endpoint público;
- estados, cancelación, borrado lógico y coherencia nominal revalidados bajo locks Evento → Invitación;
- carreras confirm/reject/cancel/close/reconfirm/lecturas serializadas con barreras verificables;
- escaneabilidad comprobada mediante rasterización `sharp` y decodificación independiente `jsQR`;
- 22 migraciones existentes suficientes; no se persisten SVG ni tokens completos.

`CODEX-080` permanece sin iniciar.

---

## EPIC 8 — Staff, Scanner y Check-in

### CODEX-080 — Tokens staff

**Estado:** completado.

**Repo:** `invitacionespremium-api`

**Módulo:** `StaffAccessModule`

**Dependencias:** CODEX-041

**Alcance**

- crear hasta 3 tokens;
- alias;
- evento asociado;
- validación pública;
- expiración al cierre/cancelación.

**Criterios de aceptación**

- token no accede a otro Evento;
- no existe revocación manual MVP;
- cerrado/cancelado invalida operación;
- token secreto no aparece en logs/socket.

Implementado con secreto de una sola entrega, digest SHA-256, límite concurrente de tres activos,
resolución pública mínima, expiración transaccional e historial protegido por PostgreSQL. Scanner,
check-in y Socket.IO no forman parte de este cierre.

El hardening del reloj concurrente queda cerrado con una migración 24 y pruebas deterministas de
`close`/`cancel` iniciados antes de una creación que gana el lock. Aplicación y trigger obtienen un
único `clock_timestamp()` después del lock, conservando siempre `expiredAt >= createdAt`; la fecha de
resolución de reapertura permanece independiente.

### CODEX-081 — Scanner y check-in por Asistente

**Estado:** completada y endurecida.

**Repo:** `invitacionespremium-api`

**Módulo:** `ScannerModule`

**Dependencias:** CODEX-071, CODEX-080

**Alcance**

- sesión scanner;
- escaneo;
- búsqueda exacta;
- asistentes pendientes;
- check-in parcial;
- un check-in válido por Asistente;
- reversión solo usuario autorizado fuera de Staff.

**Criterios de aceptación**

- Staff nunca recibe teléfono;
- invitación sin pendientes devuelve estado claro;
- segundo check-in del mismo Asistente se bloquea;
- evento cerrado/cancelado bloquea operación;
- QR de otro Evento se rechaza.

Implementado con contrato normativo `SCANNER_CHECKIN_CONTRACT.md`; las mutaciones usan transacciones
`Serializable` y las lecturas operativas bloqueadas usan `ReadCommitted` para observar al ganador tras
esperar el lock. El orden Evento → StaffToken → Invitación → Contacto → Asistentes → CheckIns, la
auditoría sin PII y las migraciones PostgreSQL protegen pertenencia, unicidad activa, idempotencia,
reversión e inmutabilidad. El hardening final agrega cinco claves foráneas físicas `RESTRICT`, revalida
las entidades bajo locks, prohíbe insertar CheckIns nacidos revertidos y conserva el replay exacto
desde su snapshot aunque el estado operativo cambie después.

### CODEX-082 — Tiempo real operativo

**Repo:** `invitacionespremium-api`

**Módulo:** `RealtimeModule`

**Dependencias:** CODEX-081

**Estado:** completado

**Documentos específicos**

- `REALTIME_PAYLOADS.md`

**Alcance**

- rooms;
- autorización;
- envelope versión 1;
- eventos mínimos;
- deduplicación;
- invalidación scanner.

**Criterios de aceptación**

- payloads coinciden con documento;
- no contienen teléfono, deuda ni tokens;
- reconexión revalida permisos;
- tests de rooms cruzados fallan correctamente.

**Hito vertical slice**

Al terminar CODEX-082 debe funcionar localmente:

```txt
Crear Evento
→ cargar Contacto
→ generar Invitación
→ confirmar asistencia
→ mostrar QR
→ escanear
→ seleccionar Asistente
→ registrar entrada
```

Este hito debe demostrarse E2E antes de continuar con módulos secundarios.

Implementado con Socket.IO v1 sobre el servidor HTTP de NestJS, rooms estrictos por Evento, autenticación
Auth/StaffToken, envelopes Zod sin PII, publicación post-commit y deduplicación por
`eventName + operationId`. Cierre y cancelación notifican antes de desconectar Staff y toda reconexión
revalida credenciales, ownership y estado. El hardening final exige cookie Auth `Path=/`, rechaza el
session token en `auth`/query, serializa Staff bajo locks Evento → StaffToken y coordina sockets pendientes
contra cierre/cancelación. Las carreras deterministas cubren ambos órdenes y la ventana
autorización–registro. La integración E2E cubre el flujo completo hasta recuperación REST, cierre, bloqueo
Scanner y rechazo de reconexión.

---

## EPIC 9 — Croquis y mesas

### CODEX-090 — Croquis, mesas y zonas

**Repo:** `invitacionespremium-api`

**Módulo:** `FloorplanModule`

**Dependencias:** CODEX-060, CODEX-051

**Estado:** completado

**Alcance**

- croquis por Evento;
- shapes mesa/zona;
- capacidad;
- coordenadas relativas;
- lock/unlock;
- asignación individual/familia/grupo.

**Criterios de aceptación**

- capacidad 0 solo zona decorativa;
- no exceder capacidad;
- confirmado puede quedar pendiente de mesa mientras Confirmación siga abierta;
- cambio posterior a check-in se audita;
- Staff puede ver plano sin teléfonos.

Implementado con migración PostgreSQL 27: `Floorplan`, `FloorplanShape`, referencia compuesta desde
`Assistant` y `SeatingOperation` idempotente. Constraints, índices y triggers protegen ownership del
FileAsset, un Croquis activo, geometría, capacidad y pertenencia entre Evento, Mesa y Asistente.
FloorplanModule expone edición Planner, asignación individual/familiar/Grupo, readiness de activación,
pendientes al cerrar Confirmación y lectura privada Staff. La auditoría es transaccional y
`seating.updated` se publica una vez post-commit. El vertical slice cubre creación, activación, RSVP,
asignación, Scanner, realtime, check-in, cambio post-check-in y cierre.

El cierre de integridad agrega la migración 28: el trigger de CheckIn exige Mesa activa del mismo
Croquis cuando `floorplanEnabled=true` y Scanner devuelve
`409 SCANNER_TABLE_ASSIGNMENT_REQUIRED` con efecto cero ante una selección incompatible. Cancelación,
rechazo RSVP y eliminación nominal liberan realmente `floorplanShapeId`, registran
`SEATING_IMPLICIT_RELEASE` en la transacción y publican un solo `seating.updated` post-commit. La matriz
determinista cubre capacidad, lotes, RSVP/cancelación, cierre de Confirmación, lock de layout, check-in
y reversión en ambos órdenes, sin sleeps.

---

## EPIC 10 — QR pase físico

### CODEX-100 — Generación y uso de pases físicos

**Repo:** `invitacionespremium-api`

**Módulo:** `PhysicalPassesModule`

**Dependencias:** CODEX-041, CODEX-071, CODEX-090 opcional

**Alcance**

- pases individuales;
- número de pase;
- mesa opcional;
- QR SVG;
- primer uso;
- bloqueo de segundo uso;
- scanner.

**Criterios de aceptación**

- pase usado no vuelve a ingresar;
- sin croquis muestra QR, número y evento/salón;
- con mesa resalta mesa;
- no incluye Confirmación de asistencia ni álbum.

**Estado:** completado y cerrado. Las migraciones 29 y 30, `PhysicalPassesModule`, recomputación
transaccional de readiness desde Evento, SVG derivado y decodificado, Scanner, idempotencia, integridad
PostgreSQL y concurrencia con barreras verificables quedan documentados en
`PHYSICAL_PASSES_CONTRACT.md`. `CODEX-110` no se ha iniciado.

---

## EPIC 11 — Álbum y reportes

### CODEX-110 — Álbum post-evento

**Repo:** `invitacionespremium-api`

**Módulo:** `AlbumsModule`

**Dependencias:** CODEX-060, CODEX-081, CODEX-042

**Alcance**

- crear antes del cierre;
- publicar manualmente después;
- 35 fotos;
- token separado;
- título/mensaje/colores/link externo;
- expiración 30 días;
- acceso por Invitación con asistencia.

**Criterios de aceptación**

- QR pase físico no crea álbum;
- Invitación sin ingreso recibe mensaje restringido;
- archivar oculta inmediatamente;
- despublicar vuelve a closed según máquina de estados.

**Estado:** completado y cerrado. `AlbumsModule`, token separado por Invitación elegible, FileAssets
privados, publicación/despublicación idempotente, expiración automática, migración PostgreSQL 31, E2E
digital y concurrencia determinista quedan documentados en `ALBUMS_CONTRACT.md`. `CODEX-111` no se ha
iniciado.

El cierre de readiness integra un resolver compartido para Flyer/Flipbook en las mutaciones de Evento,
Contactos, Invitaciones, diseño y Croquis. La activación lo ejecuta nuevamente bajo lock antes de todo
efecto financiero. El E2E principal alcanza `READY_TO_ACTIVATE` sin bypass y la vista pública de
Invitación oculta el Álbum en el límite exacto de expiración, aun antes del scheduler. Las regresiones
de concurrencia demuestran efecto financiero cero cuando la última mutación invalida el checklist.

### CODEX-111 — Reportes PDF

**Repo:** `invitacionespremium-api` y frontend solicitante según estrategia final

**Módulo:** `ReportsModule`

**Dependencias:** CODEX-081, CODEX-100, CODEX-060

**Alcance**

- asistencia;
- pases físicos;
- incidencias;
- generación bajo demanda;
- FileAsset;
- descarga autorizada.

**Criterios de aceptación**

- reporte registra plantilla/parámetros/actor;
- Planner Organización solo reportes de Eventos creados;
- no existe export CSV/Excel MVP;
- PDF no es público por defecto.

**Estado:** completado y cerrado. `ReportsModule`, snapshots autoritativos, binding exacto de PDF,
aislamiento de FileAssets genéricos, proyección temporal previa al scheduler, recuperación de cargas,
idempotencia sin polling y advisory lock PostgreSQL de sesión quedan documentados en
`REPORTS_CONTRACT.md`. Dos instancias Nest verifican replay de bytes iguales, rechazo de bytes
distintos, recuperación tras caída y cierre de pools. Las migraciones permanecen exactamente en
32–33. `CODEX-120` no se ha iniciado.

---

## EPIC 12 — Frontend Client

### CODEX-120 — Shell, login único y dashboard cliente

**Repo:** `invitacionespremium-client`

**Dependencias:** CODEX-020, CODEX-021, CODEX-031, `shared-ui`

**Alcance**

- login;
- redirección por rol;
- navegación;
- dashboard visual;
- cards/tabla;
- alertas;
- créditos/finanzas según permiso.

**Criterios de aceptación**

- Planner Organización no ve deuda;
- saldo/deuda solo cuando aplica;
- mobile/tablet/desktop;
- componentes salen de `shared-ui` cuando sean comunes.

**Estado:** completado y cerrado. `apps/client` implementa sesión por cookie HttpOnly, login/logout,
guards, retorno interno seguro, redirección Platform Admin, shell responsive, dashboard de Eventos y
Finanzas por rol. La restauración distingue `anonymous`, `forbidden` y `unavailable`: solo `401`
confirma ausencia o expiración; red, `429`, `5xx` y respuestas inesperadas no ejecutan logout ni
redirigen a login. Roles incompatibles muestran acceso no permitido también desde `/login`.
`packages/api-client` genera tipos desde OpenAPI con control de drift y `packages/ui` aporta los
componentes presentacionales comunes. Contrato normativo: `CLIENT_APP_CONTRACT.md`. CODEX-121 no fue
iniciado.

### CODEX-121 — Wizard de Evento

**Repo:** `invitacionespremium-client`

**Estado:** completado.

**Dependencias:** APIs CODEX-040 a CODEX-070

**Alcance**

- stepper responsive;
- autosave + guardado manual;
- borrador automático al salir;
- contactos manual/CSV preview;
- editor visual;
- revisión/activación.

**Criterios de aceptación**

- no permite activar sin checklist;
- muestra cobro antes de activar;
- errores de backend se traducen a UI clara;
- no duplica reglas críticas: backend manda.

**Cierre verificado**

- módulos separados para Datos, Contactos, Diseño, Confirmación, Croquis, Pases y Revisión;
- secuencia Physical QR sin Contactos ni requests digitales;
- creación única en vuelo y llaves por intento incierto sin persistencia en Web Storage;
- editores Flyer/Flipbook/Hotspots y Croquis con canvas más alternativa numérica;
- Contactos/CSV, wall-clock IANA, lotes de pases y SVG con nombre correcto;
- Revisión por servicio, diálogo de activación accesible y cero requests financieros para Planner de Organización;
- pruebas de componentes para concurrencia, idempotencia, editores, dashboard, sesión y los tres servicios.

### CODEX-122 — Invitación y álbum públicos

**Estado:** COMPLETADO

**Repo:** `invitacionespremium-client`

**Dependencias:** CODEX-070, CODEX-110

**Alcance**

- `/invitacion/:token`;
- `/album/:token`;
- experiencia visual/animación;
- Confirmación clara;
- QR pantalla completa;
- mensajes de cancelación/expiración.

**Criterios de aceptación**

- accesible sin login;
- responsive;
- no filtra datos de otros Contactos;
- QR solo después de confirmar;
- álbum restringido correctamente.

**Implementado**

- routing público separado de sesión, shell y cache privada;
- SDK generado con requester público sin cookies para Invitación, RSVP, QR, assets, Álbum y fotos;
- Flyer/Flipbook, Hotspots HTTPS, navegación táctil/teclado y reduced motion;
- Confirmación individual/familiar nominal, rechazo, edición y reconciliación de red incierta;
- QR Blob bajo demanda con pantalla completa y Object URL revocado;
- Álbum por token separado, `contentPath` estricto, tema validado y galería progresiva hasta 35 fotos;
- tokens no persistidos, `no-referrer`, errores no enumerantes y pruebas de SDK/componentes/routing.
- coordinador por token/generación con abort, descarte de respuestas obsoletas y retries latest-wins;
- mutaciones RSVP abortables y protegidas contra doble envío;
- recuperación local de QR/assets y errores de formulario limpiados por intención;
- pool LRU de ocho fotos con reutilización en preview y revocación total;
- validadores de respuestas públicas y reduced motion efectivo probado.
- estado y árbol visual ligados al token, con loading neutro inmediato y cero render cruzado;
- pool `idle/loading/ready/error/evicted`, ocho URLs, cuatro cargas y prioridad preview/visible/cercana;
- reconciliación autoritativa de cierre, cancelación y `404` desde las tres mutaciones RSVP.

Contrato normativo: `docs/04-tecnico/PUBLIC_CLIENT_CONTRACT.md`. CODEX-130 no fue iniciado.

### CODEX-123A — Remediación UX del Client para Wedding Planners

**Estado:** COMPLETADO

**Repo:** `invitacionespremium-client`

**Dependencias:** CODEX-120, CODEX-121

**Alcance**

- lenguaje natural para Planners en wizard, dashboard y Finanzas;
- estados, tipos sociales y servicios proyectados mediante nombres visibles;
- autosave conservado con acciones de navegación `Continuar` y `Salir`;
- Datos, Invitados, importación, Confirmación y activación sin conceptos técnicos innecesarios;
- errores conocidos traducidos a acciones y `operationId` solo como referencia secundaria;
- checklist de Revisión con acceso al paso correspondiente;
- pruebas de regresión de copy, autosave, permisos financieros y doble activación.

**Fuera de alcance**

- cambios en API, schema, modelo de datos, reglas de negocio, estados, permisos o finanzas;
- rediseño estructural de Hotspots (CODEX-123B);
- rediseño de Croquis/Mesas (CODEX-123C);
- workspace operativo posterior a la activación.

Contratos normativos: `docs/04-tecnico/CLIENT_APP_CONTRACT.md` y
`docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`.

### CODEX-123B — Rediseño UX del editor de Invitación

**Estado:** COMPLETADO

**Repo:** `invitacionespremium-client`

**Dependencias:** CODEX-123A, CODEX-061, CODEX-121

**Alcance**

- reemplazar el concepto visible de Hotspot por **Acciones de la invitación**;
- flujo guiado para elegir, colocar, mover, redimensionar, guardar, editar, cancelar y eliminar acciones;
- eliminar coordenadas, dimensiones y prioridad numérica de la experiencia visible;
- alternativa accesible de teclado mediante acciones naturales;
- áreas identificables, selección visual y resumen derivado de acciones configuradas;
- contexto de portada o página activa en Flipbook;
- manipulación pointer/touch con targets suficientes y sin scroll accidental;
- traducción natural de blockers de readiness y pruebas de regresión de FileAssets/Object URLs.

**Fuera de alcance**

- cambios en API, OpenAPI, Prisma, schema, endpoints, estados o reglas de readiness;
- cambios en acciones permitidas, FileAssets o restricciones de Flyer/Flipbook;
- Croquis/Mesas (CODEX-123C), Staff, Scanner, invitación pública, Finanzas o workspace activo.

Contrato normativo: `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`, subordinado a
`docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md` y `docs/04-tecnico/FILE_ASSET_POLICY.md` para el modelo
técnico existente.

### CODEX-123B-R1 — Remediación del editor de Invitación

**Estado:** COMPLETADO

**Repo:** `invitacionespremium-client`

**Dependencias:** CODEX-123B

**Alcance**

- hacer coincidir el espacio de coordenadas del editor con los límites reales de cualquier imagen JPG/PNG;
- compartir con el renderer público la proyección porcentual sobre el owner visual;
- filtrar las acciones disponibles de Flipbook según portada, página QR y página activa;
- conservar borrador y selección, bloquear doble envío y comunicar fallos de create/update/delete;
- cubrir imágenes vertical, horizontal y cuadrada, reglas por página, cambio de página y retries.

**Contaminación histórica de `051fbe77d39329a1e1cbde415259a528526a8d3b`**

El commit que cerró CODEX-123B mezcló cambios ajenos a `apps/client`. La modificación de
`apps/api/scripts/seed-staging.ts` corresponde materialmente al alcance de seeds demo de CODEX-140 y se conserva
sin cambios en esta remediación. `Dockerfile.dev`, `README.md`, `package.json`, `apps/api/package.json`,
`apps/api/scripts/seed-local-clients.ts` y su prueba documentan o habilitan fixtures locales, pero ninguna tarea
existente del backlog les asigna procedencia específica; no se atribuyen retrospectivamente a CODEX-140 ni se
inventa una tarea para justificarlos. CODEX-123B-R1 no modifica su comportamiento, FinanceService, ledger, usuarios,
créditos ni staging.

**Fuera de alcance**

- API, OpenAPI, Prisma, schema, endpoints, restricciones backend o readiness;
- seeds, Docker, infraestructura, finanzas, Croquis/Mesas y CODEX-123C.

Contratos normativos: `docs/04-tecnico/EVENT_WIZARD_CONTRACT.md`,
`docs/04-tecnico/INVITATION_DESIGN_CONTRACT.md` y `docs/04-tecnico/FILE_ASSET_POLICY.md`.

---

## EPIC 13 — Frontend Admin, Scanner y Landing

### CODEX-130 — Platform Admin

**Estado:** EN PROGRESO

**Corte A aceptado:** shell, sesion, Clientes, Eventos y finanzas por Cliente. El
hardening centraliza la expiracion de sesion por `401`, aisla y aborta mutaciones por Cliente/Evento,
bloquea dobles envios sincronos y conserva en memoria las intenciones financieras de resultado incierto
para reintento explicito con la misma llave.

**Corte B aceptado:** Servicios referenciados, historia de precios,
promociones de elegibilidad, cortes financieros y metadata de reportes. No existe descarga Admin ni
listado administrativo completo de Servicios. El hardening conserva Servicios autoritativos entre
pestanas, habilita su primer Precio/Promocion, evita estados preseleccionados desconocidos, preserva el
instante en fechas locales y valida respuestas administrativas completas y finitas. El hardening
residual bloquea la repeticion de mutaciones no idempotentes con resultado incierto, exige reconciliacion
por lectura autoritativa y separa los estados de resolucion de Cliente sin ocultar promociones.

**Corte C implementado, pendiente de aceptacion:** consulta administrativa de auditoria, endpoint
`GET /admin/audit-logs`, SDK OpenAPI y vista responsive de solo lectura con filtros y cursor estable.

Pendiente de un corte posterior: configuracion. CODEX-130 permanece EN PROGRESO.

**Repo:** `invitacionespremium-admin`

**Dependencias:** APIs de Clientes, Finanzas, Eventos, Reportes y Auditoría

**Alcance**

- scorecards;
- Clientes;
- usuarios;
- finanzas;
- precios/promos;
- pagos;
- reportes;
- auditoría;
- configuración.

**Criterios de aceptación**

- no implementa impersonación;
- operaciones administrativas son explícitas;
- auditoría solo Platform Admin;
- acciones sensibles tienen confirmación.

### CODEX-131 — Microapp Scanner

**Estado:** EN PROGRESO

**Repo:** `invitacionespremium-scanner`

**Dependencias:** CODEX-080, CODEX-081, CODEX-082, CODEX-090

**Alcance**

- ruta pública con token;
- cámara;
- pantalla única;
- búsqueda exacta;
- selección de pendientes;
- plano;
- check-in;
- errores claros.

**Criterios de aceptación**

- no muestra teléfonos;
- no muestra ya ingresados como pendientes;
- cierre/cancelación bloquea UI;
- funciona en teléfono real con internet.

La implementación técnica fue corregida y sincronizada con OpenAPI, el SDK generado y las pruebas
automatizadas. El namespace `/realtime`, recuperación REST, descarte de resultados obsoletos, Croquis
geométrico y validadores runtime están cubiertos; integración PostgreSQL y `pnpm run ci` quedaron
verdes. El estado máximo es **TÉCNICAMENTE PREPARADO PARA QA FÍSICA — NO-GO PARA PILOTO**. Permanece
pendiente la prueba HTTPS en Android o iPhone físico; sin evidencia de permiso de cámara, QR y check-in
reales, reconexión, cierre/cancelación, cambio de Mesa y conectividad real, no puede marcarse como
ACEPTADO ni COMPLETADO.

La UX para distinguir automáticamente un QR de Invitación de un pase físico permanece como tarea
separada hasta que exista un mecanismo contractual. No se agregó detección heurística; el soporte
backend y `scanPhysicalPass` se conservan.

### CODEX-132 — Landing pública

**Estado:** ACEPTADO

**Repo:** `invitacionespremium-landing`

**Dependencias:** `shared-ui`

**Alcance**

- Hero;
- problema/solución;
- servicios;
- demo visual mock sin backend;
- precios;
- planners/organizaciones;
- FAQ;
- CTA login/registro.

**Criterios de aceptación**

- premium, elegante y sobria;
- SEO básico;
- performance web;
- enlaces correctos al login/registro;
- no promete funciones fuera del MVP.

**Implementado**

- identidad única InvitacionesPremium y contenido comercial centralizado;
- cuatro servicios, tarifas Planner/Organización, límites y alcances contractuales exactos;
- demo visual mock sin backend, Eventos, créditos ni accesos reales;
- registro público tipado desde OpenAPI, sin cookies ni persistencia;
- lock síncrono, aborto y ownership por generación contra respuestas tardías;
- errores estables traducidos y onboarding posterior al login;
- SEO condicionado a URLs HTTP/HTTPS explícitas, sin localhost en metadata productiva;
- navegación, modal y tabs accesibles con reduced motion;
- carga dinámica del demo y modal, y preview Open Graph válido.

`CODEX-130A` y `CODEX-130B` permanecen aceptados. `CODEX-130C` esta implementado y pendiente de
aceptacion. `CODEX-130` permanece en progreso porque falta Configuracion. `CODEX-132` esta aceptado.
`CODEX-131` está en progreso y pendiente de QA física. `CODEX-140` está en progreso con configuración
reproducible preparada, sin despliegue ni restauración acreditados. `CODEX-141` no se inició.

---

## EPIC 14 — Staging y hardening

### CODEX-140 — Ambiente staging

**Estado:** EN PROGRESO — configuración reproducible preparada; despliegue, smoke remoto y
restauración de prueba pendientes.

**Repos:** todos

**Dependencias:** vertical slice y frontends críticos terminados

**Alcance**

- Railway API/PostgreSQL;
- Netlify frontends;
- variables de entorno;
- CORS/cookies;
- migrations;
- seeds demo;
- logs;
- backups básicos;
- dominios de staging.

**Criterios de aceptación**

- despliegue reproducible;
- sin secretos en repo;
- health checks;
- seed demo separado de datos reales;
- smoke tests automáticos.

Artefactos preparados: `railway.toml`, `apps/*/netlify.toml`, `.github/workflows/staging.yml` y
`docs/05-implementacion/20_STAGING_RUNBOOK.md`. CODEX-140 no se completa hasta adjuntar URLs accesibles,
smoke verde, backup y restauración temporal comprobados.

Bloqueadores preventivos corregidos antes de crear infraestructura: Railway espera `SUCCESS` y apunta a
project/environment/service; Netlify publica rutas absolutas recién construidas; el guard precede toda
mutación; Scanner usa asistentes `CONFIRMED` y snapshots contractuales; el Croquis se verifica en el
filesystem remoto antes de `READY`; bootstrap, sincronización de secrets y deploy recurrente están
separados. Continúan pendientes infraestructura, migración, seed DB/storage, smoke, backup y restore
remotos, además de la QA física de CODEX-131.

### CODEX-141 — Pruebas de carga y seguridad operativa

**Dependencias:** CODEX-140

**Alcance**

- 150 contactos;
- 3 tokens staff;
- check-in concurrente;
- idempotencia financiera;
- autorización cruzada;
- upload inválido;
- socket rooms;
- links públicos.

**Criterios de aceptación**

- no hay doble check-in;
- no hay doble cobro;
- no hay acceso entre Clientes;
- scanner conserva respuesta operativa bajo concurrencia esperada;
- fallos quedan trazables en logs.

---

## Integraciones de producción posteriores al MVP temprano

Deben entrar mediante tareas nuevas y PR independientes:

- Auth0;
- Mercado Pago Checkout Bricks;
- webhooks idempotentes;
- storage S3 compatible;
- email transaccional;
- políticas de privacidad y términos;
- observabilidad y backups de producción.

No deben mezclarse prematuramente con el vertical slice local.

# Plantilla para nuevas tareas Codex

```md
## CODEX-XXX — Título

**Repo:**

**Módulo:**

**Dependencias:**

**Documentos obligatorios:**

**Alcance:**

**Fuera de alcance:**

**Directorios/archivos esperados:**

**Reglas de negocio:**

**Permisos/ownership:**

**Pruebas:**

**Criterios de aceptación:**

**Prompt para Codex:**
```

# Reglas de bloqueo

No iniciar una tarea si:

- depende de una tarea incompleta;
- requiere una entidad no documentada;
- cambia permisos sin actualizar matriz;
- cambia estados sin actualizar máquina de estados;
- mueve créditos sin tipo de ledger;
- sube archivos sin política FileAsset;
- emite Socket.IO sin contrato de payload;
- no tiene pruebas y criterios de aceptación.
