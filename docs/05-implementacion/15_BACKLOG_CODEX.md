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

---

## EPIC 7 — Confirmación pública y QR

### CODEX-070 — Vista pública y Confirmación de asistencia API

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

### CODEX-071 — Generación de QR SVG

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

---

## EPIC 8 — Staff, Scanner y Check-in

### CODEX-080 — Tokens staff

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

### CODEX-081 — Scanner y check-in por Asistente

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

### CODEX-082 — Tiempo real operativo

**Repo:** `invitacionespremium-api`

**Módulo:** `RealtimeModule`

**Dependencias:** CODEX-081

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

---

## EPIC 9 — Croquis y mesas

### CODEX-090 — Croquis, mesas y zonas

**Repo:** `invitacionespremium-api`

**Módulo:** `FloorplanModule`

**Dependencias:** CODEX-060, CODEX-051

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

### CODEX-121 — Wizard de Evento

**Repo:** `invitacionespremium-client`

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

### CODEX-122 — Invitación y álbum públicos

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

---

## EPIC 13 — Frontend Admin, Scanner y Landing

### CODEX-130 — Platform Admin

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

### CODEX-132 — Landing pública

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

---

## EPIC 14 — Staging y hardening

### CODEX-140 — Ambiente staging

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