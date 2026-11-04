# InvitacionesPremium — instrucciones generales del proyecto (V3)

Aplican a **Codex en VS Code** y **Gemini en Antigravity Desktop**. Son reglas permanentes de trabajo, no un backlog ni una orden de implementar funcionalidades. Minimizar contexto, llamadas al modelo, documentación y pasos de coordinación sin debilitar seguridad.

## 1. Producto y alcance vigente

- Producto: servicio gestionado de logística digital para eventos sociales; invitaciones Flyer/Flipbook cuando aplique, RSVP, invitados y acompañantes, mesas/croquis, pases QR y check-in. **QR/EventOps no equivale automáticamente a RSVP o invitación gráfica**.
- Lanzamiento prioritario: **M01 MANAGED para Planner independiente**. `PLATFORM_ADMIN` prepara el evento; `INDEPENDENT_PLANNER` opera invitados, confirmaciones, mesas y Staff; Staff accede con token temporal y realiza check-in.
- En Managed, Planner no recibe constructores técnicos del Provider. No inventar roles ni usar canal comercial, créditos o tarifas para decidir permisos.
- M02–M05, Self-Service, Enterprise, nuevas licencias, Partner/Venue pricing y Finance V3 **no son trabajo implícito**. No agregar checkout, WhatsApp API, CRM ni pagos por iniciativa del agente.
- Fuente de verdad de producto: `docs/00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`. Los contratos especializados gobiernan sus invariantes. `docs/00-inicio/00_START_HERE.md` es un **índice selectivo**, no una lista de lectura obligatoria.
- Respetar el gate MG00 antes de alterar dominio, roles, Finance o activación Managed, excepto autorización posterior explícita. Una corrección de configuración de agentes no autoriza esas áreas.

## 2. Arquitectura e invariantes

- Monorepo Node.js / pnpm / Turborepo / TypeScript: `apps/api` (NestJS, Prisma, PostgreSQL), `apps/client` (Planner y vistas públicas), `apps/admin` (Provider), `apps/scanner` (check-in), `apps/landing` (comercial); compartidos `packages/ui` y `packages/api-client`.
- La lógica de negocio y las autorizaciones pertenecen a `apps/api`. Ninguna app importa fuentes de otra app. `packages/ui` es presentación; el SDK de `packages/api-client` se genera desde OpenAPI.
- Preservar aislamiento tenant, ownership, idempotencia, reglas RSVP, validez/duplicidad QR, controles Staff, trazabilidad, privacidad y contratos existentes. Ocultar UI nunca sustituye autorización del servidor.
- No incorporar secretos, datos personales reales, estados, DTOs, rutas, permisos, tarifas o entidades inventadas. No eliminar pruebas/aserciones ni encubrir fallos con timeouts o retries.
- Para un cambio funcional consultar **sólo** los contratos del dominio afectado. No recorrer todo `docs/` ni reinterpretar documentación histórica como dirección activa.

## 3. Responsables y ejecución

- **Gemini / Antigravity:** diseño UI/UX, CSS, layout, responsive, accesibilidad, microcopy y cambios visuales TSX. Sin cambiar lógica de negocio, auth, integraciones, contratos ni DB.
- **Codex / VS Code:** lógica funcional React/TS, hooks con estado de negocio, backend, API, Prisma, DB, seguridad, arquitectura, integraciones y DevOps.
- Respetar el ejecutor elegido expresamente por el usuario; advertir incompatibilidades técnicas. Si un cambio mezcla dominios, dividir sólo donde exista una dependencia real y evitar que dos ejecutores editen el mismo archivo en paralelo.
- Un responsable por tarea. No crear obligatoriamente agentes separados de diagnóstico, implementación y QA. No exigir tickets, handoffs, documentos en Drive, planes adicionales o aprobaciones repetidas para un objetivo ya autorizado.
- No hacer búsquedas web generales ni leer toda la documentación en cada ejecución: **quien prepara el prompt** consulta la documentación oficial relevante del agente; el ejecutor sólo investiga incompatibilidades concretas.

## 4. Contrato de cambio, TDD y QA dirigido

Antes de editar, identificar objetivo, criterio verificable, archivos probables, riesgo **L0–L3** y comandos de prueba. Para tareas TDD, **los tests y los archivos autorizados están bloqueados**. Un riesgo o dependencia no prevista exige `BLOCKED` y revisión desde ChatGPT; el ejecutor no amplía pruebas ni código por iniciativa propia. `qa-scope` gobierna QA sin contrato y `tdd-scope` las tareas TDD.

- **L0:** documentación, copy/CSS sin lógica. Diff, formato y comprobación visual puntual cuando aplique.
- **L1:** interfaz/comportamiento local. TDD cuando se modifique lógica verificable; para CSS/copy sin lógica, QA visual sin pruebas artificiales.
- **L2:** lógica, API o contratos. TDD funcional obligatorio cuando sea automatizable; pruebas unitarias, integración, contratos y E2E pertinentes.
- **L3:** auth, permisos, aislamiento, QR/check-in, finanzas, migraciones y seguridad. TDD con regresiones negativas, QA independiente y controles completos aplicables.

Comandos disponibles: `pnpm qa:quick -- --files=<rutas>` y `pnpm qa:focused -- --files=<rutas> --risk=L1|L2|L3 [--journeys=...]`. Ejecutar `--dry-run` **una vez si es necesario** para confirmar alcance. **Los selectores por ruta son conservadores**: si no reflejan el impacto real, documentar la discrepancia; no forzar una clasificación insegura. `qa:full` sólo para certificación explícita. El CI remoto mantiene sus controles independientes.

No hacer polling conversacional repetitivo, no releer logs completos y no repetir una suite en PASS sin nuevos cambios. Guardar logs extensos como artefactos y reportar sólo resumen/error relevante. **Detener QA local al cumplir criterios.** Ante riesgos fuera del contrato, reportar `BLOCKED`, nunca ampliar trabajo sin autorización. Nunca declarar PASS sin evidencia.

## 5. Protocolo TDD-First + Scope Lock

- **ChatGPT es el autor de las pruebas y del contrato**. Para cambios funcionales, publica pruebas inicialmente RED y `tdd/contracts/<ID>.json` en un mismo commit de una rama `tdd/<ID>`. Nunca publicar RED directo a `main`.
- El prompt contiene el **SHA RED completo**, ejecutor, criterios, `testPaths` inmutables, `implementationPaths` autorizados y `qaCommands` exactos.
- El agente confirma que RED falla por comportamiento faltante (no error de entorno); implementa GREEN, refactor mínimo permitido y ejecuta únicamente el QA preaprobado. **No puede editar tests, contrato, scripts de control ni modificar fuera de los archivos autorizados**.
- Preflight: `pnpm qa:tdd -- --contract=tdd/contracts/<ID>.json --baseline=<SHA_RED>`. Lista de comandos: agregar `--dry-run`. Ejecutar GREEN: agregar `--run`. Logs en `var/tdd/`.
- Prueba incorrecta, dependencia adicional o riesgo no cubierto: `BLOCKED` y reporte breve; **sólo ChatGPT redefine el contrato y emite un nuevo commit RED**.
- El guard verifica contenido contra la baseline y cambios del diff; **no es una sandbox absoluta** contra todos los comandos del agente. CI y revisión independiente de L3 siguen siendo obligatorios.
- Cuando GREEN esté completo, abrir PR de `tdd/<ID>` a `main`; CI verificará el contrato contra el commit RED, además de los gates generales. Ésta es la excepción al workflow habitual de `main`.
- Manual específico: `docs/05-implementacion/TDD_WORKFLOW.md` y skill `tdd-scope`.

## 6. Git, aprobación y entrega

- Flujo habitual: `main`, con excepción TDD mediante ramas `tdd/<ID>` y PR. Verificar HEAD y árbol limpio; no sobrescribir cambios ajenos, no force-push; commit pequeño sólo del alcance autorizado.
- Verificar el CI del **SHA exacto** cuando haya push; diferenciar pendiente, fallido, cancelado y aprobado. No inferir calidad del código por el simple fin de una ejecución.
- No desplegar staging/producción ni iniciar pilotos, campañas o gastos por un PASS técnico: requieren autorización correspondiente.
- PM resuelve alcance y dependencias reales; COO sólo operaciones, recursos, infraestructura y finanzas. Git es la evidencia técnica; Drive conserva decisiones relevantes, no microactividades.
- Respuesta final breve: cambio, archivos, SHA, QA ejecutado y resultado, estado CI, bloqueos/riesgos. No crear reportes narrativos sin necesidad.
