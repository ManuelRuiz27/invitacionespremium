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

## 4. Contrato de cambio y QA dirigido

Antes de editar, identificar objetivo, criterio verificable, archivos probables, riesgo **L0–L3** y comandos de prueba. Al finalizar, revisar el diff real; ampliar pruebas **sólo** cuando cambien dependencias o criticidad. Puede usarse la skill `qa-scope` cuando el alcance de pruebas sea ambiguo.

- **L0:** documentación, copy/CSS sin lógica. Diff, formato y comprobación visual puntual cuando aplique.
- **L1:** interfaz/comportamiento local. Tests relacionados, lint/typecheck del workspace, build si corresponde y revisión visual afectada.
- **L2:** lógica, APIs o contratos. Tests de unidades/integración afectados, validación de contratos y E2E pertinentes.
- **L3:** auth, permisos, aislamiento, QR/check-in, finanzas, migraciones y seguridad. Regresiones críticas, negativos, QA independiente y gates completos aplicables.

Comandos disponibles: `pnpm qa:quick -- --files=<rutas>` y `pnpm qa:focused -- --files=<rutas> --risk=L1|L2|L3 [--journeys=...]`. Ejecutar `--dry-run` **una vez si es necesario** para confirmar alcance. **Los selectores por ruta son conservadores**: si no reflejan el impacto real, documentar la discrepancia; no forzar una clasificación insegura. `qa:full` sólo para certificación explícita. El CI remoto mantiene sus controles independientes.

No hacer polling conversacional repetitivo, no releer logs completos y no repetir una suite en PASS sin nuevos cambios. Guardar logs extensos como artefactos y reportar sólo resumen/error relevante. **Detener QA local al cumplir criterios.** Nunca declarar PASS sin evidencia.

## 5. Git, aprobación y entrega

- Flujo autorizado actual: `main`. Verificar HEAD y árbol limpio antes de editar; no sobrescribir cambios ajenos, no force-push ni introducir ramas/PR por rutina. Commit pequeño sólo del alcance autorizado.
- Verificar el CI del **SHA exacto** cuando haya push; diferenciar pendiente, fallido, cancelado y aprobado. No inferir calidad del código por el simple fin de una ejecución.
- No desplegar staging/producción ni iniciar pilotos, campañas o gastos por un PASS técnico: requieren autorización correspondiente.
- PM resuelve alcance y dependencias reales; COO sólo operaciones, recursos, infraestructura y finanzas. Git es la evidencia técnica; Drive conserva decisiones relevantes, no microactividades.
- Respuesta final breve: cambio, archivos, SHA, QA ejecutado y resultado, estado CI, bloqueos/riesgos. No crear reportes narrativos sin necesidad.
