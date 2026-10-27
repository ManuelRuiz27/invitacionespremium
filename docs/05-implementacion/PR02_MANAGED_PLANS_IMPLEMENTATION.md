# PR02 — Planes comerciales y Licencia Privada Gestionada

Base: `main` después de UX01 y PR01, SHA `3934f7e6aaae0aa0e35c10ce7b1bf9e77c88a6ad`.
Implementación autorizada por el ticket PR02 adjunto. Contrato técnico:
[MANAGED_PLANS_CONTRACT.md](../04-tecnico/MANAGED_PLANS_CONTRACT.md).

## Operativo

- Catálogo de seis combinaciones Estándar/Privada y Esencial/Frecuente/Intensivo, con la configuración
  inicial solicitada, importes en centavos MXN, disponibilidad y auditoría SYSTEM del bootstrap.
- Admin permite nuevas versiones inmediatas o programadas, importes con centavos, historial de
  vigencias y activación/desactivación para nuevas contrataciones. No sobrescribe precios contratados.
- El detalle de Organización Managed permite aceptar una versión vigente y registrar inicio
  contractual. Conserva una fotografía inmutable de los términos, historial y exclusión de contratos
  solapados. No asigna planes automáticamente a Planners ni Self-Service.
- Consumo administrativo actual e histórico derivado de activaciones reales ACCESS_CONTROL del
  Cliente. Identidad única, períodos contractuales, límites mensuales y pool anual Frecuente; no usa
  Finance. Las cancelaciones se señalan para revisión y no devuelven cupo automáticamente.
- API administrativa Provider, seis operaciones, DTOs OpenAPI y wrappers SDK con claves estables,
  AbortSignal y validación de respuestas. Mutación, auditoría e idempotencia atómicas en PostgreSQL.
- Pruebas de API, SDK, Admin y navegador con bases efímeras. El pipeline conserva M01/M02 y Flipbook
  y agrega el recorrido PR01/PR02 al job de navegador, sin publicar credenciales en artefactos.

El usuario confirmó dos políticas: meses desde el inicio contractual con aniversarios mensuales en
America/Mexico_City, y precio vigente al asignar/aceptar el contrato, no en su fecha de inicio futura.
Si el mes tiene menos días, el aniversario usa su último día y conserva el ancla original para los
meses siguientes. Esto no calcula prorrateos ni ajustes de pago.

## Preservado y manual para PR03

No hay cambios en permisos, roles, `operatingProfile`, `commercialChannel`, cuotas de activación,
Scanner, RSVP, contadores Client UX01, precios por Evento ni el motor de créditos. El índice nuevo de
Evento sólo acota la consulta administrativa por Cliente y activación.

Pago mensual, firma comercial, cobro de extraordinarios, facturación/CFDI, renovaciones, cancelaciones
comerciales y frontend exclusivo continúan manuales o como proyectos independientes. `PRIVATE` no
provisiona ni despliega infraestructura. No hay checkout ni suscripción de proveedor de pagos.

Landing conserva el catálogo público por Evento de PR01. Los puntos futuros de integración de planes
son el aviso de `landing-config.ts` de cotización separada para salones y `LandingVenue`; PR02 no
publica un catálogo público de licencias ni añade precios constantes en frontend.

## Persistencia y API

Migración aditiva: `20261027120000_add_managed_commercial_plans`. Crea `managed_plan`,
`managed_plan_version`, `managed_plan_contract` y `managed_plan_operation`, enums específicos de plan,
índice de consulta de consumo y guardas de identidad, precios, snapshot y solapamientos. No modifica
tablas Finance ni reglas de activación. Cada intervalo contractual y comercial usa fin exclusivo.

| Método | Ruta administrativa |
| --- | --- |
| GET | `/admin/managed-plans` |
| POST | `/admin/managed-plans/:planId/versions` |
| POST | `/admin/managed-plans/:planId/availability` |
| GET | `/admin/clients/:clientId/managed-contracts` |
| POST | `/admin/clients/:clientId/managed-contracts` |
| GET | `/admin/clients/:clientId/managed-contracts/:contractId/consumption` |

Todas requieren sesión PLATFORM_ADMIN auténtica sin tenant. Las mutaciones exigen Idempotency-Key;
los tipos frontend derivan exclusivamente de OpenAPI. El SDK verifica 187 rutas contra 211 operaciones.

## Incidencia de base

El CI anterior de PR01 ya fallaba en carga NOMINAL:
[run 40440860938](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/40440860938),
dashboard p95 **3318.02 ms** frente al límite vigente **1500 ms**, en
`access-control-operations.integration-spec.ts`. Piloto y Flipbook estaban aprobados. PR02 no cambia
la prueba, los límites de rendimiento, backoff del Scanner ni reglas operativas para ocultarlo.

## QA y resultados

La entrega final registra los resultados exactos del gate global, integración y CI remoto. La
evidencia local queda bajo `var/qa/pr02/`, sin credenciales persistidas en documentación ni artefactos
publicados. Cada harness crea y elimina su base y storage propios, sin modificar producción ni la
base local compartida.

Comprobaciones focalizadas ya completadas:

| Prueba | Resultado |
| --- | --- |
| Prisma validate/generate | Aprobado. |
| Formato, lint, typecheck y builds finales | Aprobados; build 8/8 tareas. |
| DTO catálogo | 14/14. |
| Fechas, DTO contrato y proyección de consumo | 17/17. |
| SDK Managed | 13/13. |
| Admin Managed | 11/11, incluyendo retry con la misma clave tras conflicto concurrente. |
| Unitarias globales completadas por paquete | API 421/421; SDK 163/163 y 9 tests Node; Scanner 62/62; Landing 67/67; Floorplan 100/100; UI 6/6. |
| Integración catálogo y contratos | 14/14 en PostgreSQL efímero. |
| Integración global API | 471/471 en 37 archivos, PostgreSQL efímero; incluye carga NOMINAL con límites originales. |
| Navegador PR02 y regresión PR01 | 2/2; nueve tarifas STANDARD finales e invariantes SQL del harness aprobadas. |
| Navegador M01 | 4/4, incluyendo FLYER, FLIPBOOK y PHYSICAL_QR legacy; aislamiento financiero aprobado. |
| Navegador M02/UX01/Scanner | 3/3, NOMINAL y ANONYMOUS; invariantes Finance/RSVP, CheckIn único y Staff terminal aprobadas. |

El recorrido PR02 usa Admin móvil de 390 px y API real: descubre los seis planes, registra un contrato
Esencial a $7,900, publica una nueva versión de $8,100.25, comprueba el precio anterior y su historial,
y registra otra Organización con la nueva versión. Las tarifas ServicePrice permanecen idénticas.

La integración verifica snapshot inmutable, rechazo de roles y Clientes incompatibles, idempotencia
concurrente sin auditoría duplicada, renovación adyacente sin solapamiento, precio de aceptación actual,
rollback completo ante fallo de auditoría y lectura de activaciones sin efectos financieros.

Durante QA se corrigieron dos defectos del helper nuevo: el bloqueo advisory debe devolver una columna
escalar para Prisma y los contendientes con snapshot Serializable anterior requieren transacción nueva
para descubrir el replay después de un conflicto de exclusión. También se corrigió un fixture sin
Idempotency-Key y la espera de salida del diálogo de navegación en un test Admin. Los resultados
iniciales fallidos se conservan; no se añadieron retries artificiales ni se aumentaron timeouts.

El gate unitario local registró seis esperas agotadas de pruebas existentes de Croquis; se detuvo el
resto de esa ejecución para diagnosticarlo sin concurrencia de suites de interfaz. Una repetición
acotada mantuvo tres fallos de carga inicial (`Cargando plano...`). La comparación de los mismos seis
casos con los archivos Admin/SDK de la base `3934f7e` también falló: uno de seis, cinco aprobados. Los
siete archivos de PR02 se restauraron byte por byte. Esta evidencia confirma sensibilidad de carga
en la estación Windows; no demuestra que cada fallo de la primera ejecución tenga la misma causa.
No se cambiaron Croquis ni sus pruebas, ni se aumentaron sus esperas. El resultado global completo
debe contrastarse con el CI remoto de la entrega.

En el [primer CI remoto de PR02](https://github.com/ManuelRuiz27/invitacionespremium/actions/runs/40543691179)
pasó el job Quality completo: unitarias Client **466/466**, Admin **269/269**, integración API
**471/471** y builds **8/8**, además de los otros paquetes indicados arriba. También pasaron Flipbook
**74/74** y el recorrido PR02. El job piloto detectó un defecto previo del test PR01: Chromium normaliza
`datetime-local` omitiendo segundos `00`, mientras Playwright exige que el valor escrito coincida con
esa representación. Se reprodujo el rechazo exacto de `2026-10-27T16:48:00`; la corrección normaliza
los dos valores de fecha del test y verifica tanto segundos cero como no cero. No cambia vigencias,
precios, aplicación, límites ni timeouts.

El formato global excluye únicamente la carpeta `var/pr01-recovery/`, ignorada por Git y con una copia
local de archivos generados anterior a PR02. No contiene código fuente versionado; no se alteró su
contenido ni se ocultaron archivos de la entrega.

Comandos reproducibles:

```powershell
pnpm --filter @invitaciones/api db:validate
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate
pnpm --filter @invitaciones/api-client generate:check
pnpm --filter @invitaciones/api-client verify:openapi-routes
pnpm run ci
pnpm run test:e2e:access-control -- --integration-only
pnpm run test:e2e:access-control -- --integration-only '--integration-files=managed-plans,managed-contracts'
pnpm run test:e2e:public-catalog
pnpm run test:e2e:managed -- --port-offset=1000
pnpm run test:e2e:access-control
```
