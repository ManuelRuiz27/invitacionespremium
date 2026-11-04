# InvitacionesPremium — Reglas de ejecución para agentes (V2)

Estas reglas aplican a Codex (extensión de VS Code) y Gemini (Antigravity Desktop). Prioridad: entregar cambios correctos con el menor trabajo y contexto necesarios. No son un permiso para modificar el alcance del producto.

## 1. Producto y arquitectura

- Lanzamiento activo: M01 Managed, Planner independiente. Provider prepara el evento, Planner opera invitados/RSVP/mesas/Staff y Staff registra accesos. No ampliar M02–M05, Self-Service, Enterprise ni Finance V3 sin autorización explícita.
- No inventar roles, entidades, estados, endpoints, permisos, pricing ni capacidades. Separar perfil operativo de canal comercial, créditos y tarifas.
- Respetar aislamiento entre clientes, ownership, autorización en servidor, auditoría y protección de datos. Ocultar controles en UI nunca sustituye permisos de API.
- Las reglas de negocio pertenecen a `apps/api`. No importar fuentes entre `apps/*`; el código compartido reside en `packages/*`. `packages/ui` no implementa reglas de negocio ni llamadas API. `packages/api-client` se genera desde OpenAPI; evitar DTOs duplicados.
- No agregar credenciales, desactivar controles de seguridad ni modificar contratos fuera del objetivo.

## 2. Ejecutores y alcance

- **Gemini / Antigravity:** responsable de cambios visuales: UI/UX, layout, CSS, responsive, copy de interfaz, accesibilidad y presentación de componentes. Puede editar TSX para ese fin, sin alterar lógica de dominio, permisos, API, modelos o persistencia.
- **Codex / VS Code:** responsable de backend, arquitectura, bases de datos, API, integraciones, seguridad, estado y comportamiento funcional. React/TSX con cambios de lógica, hooks, autenticación o contratos corresponde a Codex.
- Si una tarea mezcla ambos campos, dividirla por límites técnicos reales y acordar la interfaz; no convocar agentes sólo por el lenguaje de los archivos. Un solo responsable modifica cada archivo a la vez.
- Si el usuario designa explícitamente un ejecutor, seguir su elección dentro de sus capacidades y avisar si hay un riesgo técnico; no crear handoffs automáticos.
- Diagnóstico, implementación y QA son actividades, **no tres agentes obligatorios**. Una tarea ordinaria tiene un solo ejecutor; revisión independiente es obligatoria para riesgo L3 o cuando se indique expresamente.

## 3. Inicio: documentación mínima

1. Identificar objetivo aprobado, archivos probables, criterio de aceptación y riesgo.
2. Consultar `docs/00-inicio/00_START_HERE.md` **sólo cuando la tarea afecte reglas, permisos, flujo del producto o exista duda de vigencia**. Usarlo como índice, no como orden de leer todos los documentos.
3. Leer únicamente contratos técnicos asociados a las superficies y dependencias realmente afectadas. No recorrer `/docs` ni cargar conversaciones, logs o documentos completos por defecto.
4. Para croquis, seating, RSVP, Scanner, Finance y activación, aplicar los contratos especializados señalados en `START_HERE` antes de cambiar sus invariantes.
5. El preparador del prompt consulta documentación oficial vigente de Codex o Antigravity cuando corresponda; el agente ejecutor no repite esa investigación salvo que necesite resolver una incompatibilidad específica.
6. Si hay contradicción real de producto o seguridad, detener **sólo la parte afectada**, señalar archivo/contrato y solicitar la decisión mínima. No generar planes, documentos ni tickets rutinarios.

## 4. QA local proporcional (política; scripts en adaptación)

El prompt debe indicar nivel, comandos concretos y evidencia esperada. Evaluar el diff final: ampliar QA sólo si toca nuevas dependencias o aumenta el riesgo.

| Nivel | Cambios | Verificación local mínima |
| --- | --- | --- |
| L0 | Documentación, copy estático, estilos sin lógica | Revisar diff, formato de archivos tocados; comprobación visual si aplica. Sin suite general ni build por defecto. |
| L1 | UI/interacción acotada sin cambio de contrato | Tests relacionados; lint/typecheck del workspace tocado; build cuando afecte compilación o empaquetado; revisión visual en tamaños relevantes. |
| L2 | Lógica funcional, API, contratos o flujos compartidos | Tests unitarios y de integración de las rutas afectadas; validación de contratos; regresiones E2E pertinentes; lint/typecheck/build de workspaces afectados. |
| L3 | Auth, permisos, aislamiento tenant, QR/check-in, Finance, migraciones o seguridad | L2 más casos negativos y regresiones críticas, QA independiente y controles completos aplicables. Sin omitir gates de seguridad. |

- `pnpm qa:quick`, `qa:focused` y `qa:full` **ya existen**, pero `qa:focused` puede ejecutar journeys extensos. No invocarlos automáticamente sin inspeccionar la selección/comandos que realmente ejecutarán. Se optimizarán en una fase técnica posterior.
- No reducir aserciones, saltarse regresiones necesarias ni subir timeouts/retries para ocultar fallos. Un fallo preexistente se informa separado del cambio nuevo.
- Limitar la salida mostrada al modelo a resumen, error y fragmentos relevantes; dejar logs completos como artefactos. No hacer polling repetitivo con llamadas al modelo ni reiniciar una suite aprobada sin modificaciones posteriores.
- Terminado el QA establecido y sin riesgos nuevos, **detener QA local**. No encadenar revisiones adicionales por rutina.
- El CI actual sigue siendo independiente de QA local; verificar el resultado real de `quality` para el SHA entregado. No declarar PASS si no hay evidencia, ni confundir un CI pendiente con éxito.

## 5. Git, cierre y gobierno

- Flujo vigente: `main`. Antes de escribir, verificar HEAD actualizado y que no se mezclen cambios ajenos; en entorno local, `git pull --ff-only` y árbol limpio. No force-push. Crear commit pequeño y push sólo del alcance autorizado. Si el usuario dispone otra estrategia, seguirla.
- La aceptación técnica y CI verde **no** autorizan staging, producción, ventas o pilotos; requieren sus permisos específicos.
- PM coordina y resuelve dependencias reales, no intermedia cada edición. COO participa sólo por incidencia operativa, costos, recursos o despliegue. Evitar documentos, handoffs y registros por cada acción rutinaria.
- Entrega única y breve: objetivo, archivos/diff, SHA, QA ejecutado (PASS/FAIL/pendiente), CI exacto y riesgos. No inventar pruebas ni resultados.
