# M02-B01-UX01 — Onboarding y preparación operativa

Base: DT09 `816f2bd48e785b2c39bb27eaccd2ccb2ddd92bd1`, conservando la actualización de Landing
`3dd7f5f6e4f035fefe58483b94796bc351454e6d`. Alcance autorizado: presentación, navegación y alta
administrativa aditiva del perfil operativo existente. No hay migraciones, nuevos roles, entidades,
servicios, límites ni reglas financieras. M01 conserva su dirección de lanzamiento.

## Cambios por pantalla

| Pantalla | Comportamiento UX01 |
| --- | --- |
| Admin · Crear Organización | Selector Gestionado/Autoservicio, Gestionado preseleccionado, explicación B01, lock contra doble envío, errores conservados y navegación al Cliente creado. |
| Admin · Detalle del salón | Pasos basados en Cliente, usuarios y Eventos reales; Planner pendiente/disponible, reintentos y acceso al intake actual con Cliente contextual. Finance se omite sólo para ORGANIZATION + MANAGED. |
| Admin · Nuevo Evento | `/eventos?clientId=...` valida el Cliente contra la lista administrativa activa. Organización Managed ofrece ACCESS_CONTROL, modalidad, Planner y capacidad 1–150; no solicita quote ni aceptación financiera. Conserva M01 y Self-Service. |
| Admin · Lista y detalle de Evento | Servicio y modalidad por nombre, Cliente y estado; correo autorizado del Planner en detalle mediante la consulta de usuarios existente. Lista sin consultas por Evento ni UUID como identidad primaria. Referencias técnicas permanecen en el detalle para soporte. ACCESS_CONTROL omite RSVP. |
| Admin · Preparación/Accesos | Blockers originales agrupados entre InvitacionesPremium y salón; enlaces a Datos/Croquis sólo para acciones aplicables. Diferencia readiness completo de activación ya realizada. No incorpora registro o emisión nominal Provider. |
| Client · Resumen B01 | Guía nominal o anónima antes de activar; material, Staff, Scanner e Ingresos y aforo después de activar. Usa las secciones y permisos existentes. Estados terminales conservan consulta. |
| Client · Material | Seleccionar todos los descargables y Limpiar selección; exclusión de revocados, usados, CheckIn activo o sujetos retirados. Actualizar retira selecciones no elegibles. PDF conserva relectura autoritativa y validación individual de SVG. Un error no conserva una confirmación anterior de descarga. |
| Client · Invitados NOMINAL | Distingue invitados registrados y espacios para registrar; remite a Ingresos y aforo para derechos vigentes/capacidad de emisión. No modifica fórmulas. |

## Contrato API

`POST /api/v1/admin/clients/organizations` agrega exclusivamente
`operatingProfile?: MANAGED | SELF_SERVICE` al DTO existente. Omitirlo conserva `SELF_SERVICE`.
La misma transacción crea Organización y Organization Admin; metadata y snapshot auditado conservan
el perfil efectivo. La autorización Platform Admin, normalización de correo, validaciones y errores
existentes permanecen. El registro público no admite este campo.

OpenAPI y SDK se regeneraron con los scripts oficiales. La propiedad permanece opcional también en
`packages/api-client/src/generated/schema.ts`; no se añadió un DTO manual ni una ruta nueva.

Contratos afectados: `CLIENTS_CONTRACT.md`, `ADMIN_APP_CONTRACT.md` y
`ACTIVE_EVENT_WORKSPACE_CONTRACT.md`.

## Evidencia reproducible

Los dos journeys originales de `e2e/access-control.spec.ts` ahora comienzan desde el alta real del
salón y Planner en Admin, con viewport móvil de 390 px, y continúan por intake contextual,
preparación, activación, guía Client, seleccionar/limpiar material, SVG/PDF, Staff, cámara Scanner y
contadores autoritativos. Comprueban ausencia de peticiones Finance/quote/RSVP y privacidad Provider.
El tercer journey DT09 conserva CSV/SEAT nominal, TABLE anónimo, concurrencia, reversión, reemisión,
reasignación y estados terminales. Resultado: **3/3** y conciliación SQL del harness aprobados.

`test:e2e:managed -- --port-offset=1000`: **4/4**. Incluye M01 Managed completo, FLYER y FLIPBOOK con
RSVP/QR real, Scanner idempotente y PHYSICAL_QR Self-Service con consumo financiero y replay legacy.
El harness confirma aislamiento financiero del Cliente Managed. No se cambian Scanner ni sus límites.

Las ejecuciones usan bases PostgreSQL efímeras y limpian sólo recursos propios. No se generaron
capturas, traces ni vídeos con credenciales operativas. El QA Linux usa una copia de `main` más los
archivos UX01, separada de los cambios locales concurrentes de catálogo/precios.

## Validación

`pnpm run ci` final: **aprobado**, sobre la copia aislada del alcance UX01.

| Gate | Resultado |
| --- | --- |
| Formato | Aprobado. |
| Lint global | 8/8 tareas. |
| Typecheck global | 11/11 tareas. |
| Unidades Admin | 253/253, 16 archivos. |
| Unidades Client | 466/466, 29 archivos. |
| Unidades API | 390/390, 62 archivos. |
| SDK | 150/150 Vitest + 9/9 Node; generación sin drift; 181 rutas contra 205 operaciones OpenAPI. |
| Otros workspaces | Landing 67/67, Scanner 62/62, Floorplan 100/100, UI 6/6. |
| Total de unidades | 1,503 comprobaciones: 1,494 Vitest y 9 Node; 11/11 tareas globales. |
| Build global | 8/8 tareas; warnings existentes de tamaño de bundle. |
| Integración de Clientes posterior a la corrección | 8/8. |
| E2E M01 / PHYSICAL_QR legacy | 4/4 y aislamiento financiero SQL aprobado. |
| E2E M02 NOMINAL / ANONYMOUS | 3/3 y conciliación SQL del harness aprobada. |

El primer gate global se detuvo en tres assertions de apertura de diálogo de Landing bajo carga.
La suite Landing final pasó 67/67 sin cambios en su código, assertions ni timeouts. Los logs locales
conservan ambos resultados. El CI remoto de la entrega se consulta después del push; el fallo
preexistente de carga de la base se detalla más abajo.

Comandos del alcance:

```powershell
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate
pnpm --filter @invitaciones/api-client generate:check
pnpm --filter @invitaciones/api-client verify:openapi-routes
pnpm run ci
pnpm test:e2e:access-control -- --integration-only
pnpm test:e2e:access-control -- --integration-only --integration-files=clients
pnpm test:e2e:managed -- --port-offset=1000
pnpm test:e2e:access-control
```

La primera integración global terminó **456 aprobadas / 1 fallida** (35 archivos); incluía tres casos
de catálogo del trabajo concurrente. Falló el nuevo fixture de permisos por usar un correo con el enum
de rol en mayúsculas. Se corrigió el fixture con `role.toLowerCase()`; integración de Clientes posterior:
**8/8**. No se cambió runtime para resolverlo.

También se corrigieron selectores de tests UX01: etiquetas requeridas de MUI incluyen asterisco y la
pantalla de material puede tener más de una alerta. Se mantuvieron las assertions funcionales,
timeouts y cero retries. Los resultados iniciales se conservan en los logs locales de QA.

El CI de la base `3dd7f5f` ya estaba fallido antes de UX01:
[run 40236829965](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/40236829965),
449/450 integraciones. El caso de carga NOMINAL midió dashboard p95 de 3320.58 ms frente al límite
vigente de 1500 ms. Se registra separado de una regresión UX01; no se relajan límites ni se modifica
el Scanner en este ticket.

## Conservación del workspace

Los cambios ajenos de catálogo/precios, su harness y documentación PR01 quedan fuera del commit UX01.
El trabajo previo guardado temporalmente se restauró y se retiró sólo el stash creado para UX01.
Por esa conservación, un árbol local con cambios ajenos no debe presentarse como limpio.
