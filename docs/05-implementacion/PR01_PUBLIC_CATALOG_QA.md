# PR01 — Catálogo público administrable

Inicio: 2026-10-25. Cierre: 2026-10-26. Base de implementación: `3dd7f5f`.

## Diagnóstico del entorno local

La API en `localhost:3000` utiliza el contenedor workspace y PostgreSQL local
`invitacionespremium-docs-postgres-1`, base `invitacionespremium`. La conexión de
la API apunta al host Docker `postgres:5432`; la conexión desde Windows utiliza
`localhost:5432`. No se consultó ni modificó producción.

El catálogo tenía 16 registros de precios V2: nueve STANDARD, tres PARTNER y
cuatro VENUE. Los nueve STANDARD tenían vigencia desde
`2026-08-24T00:00:00.000Z`, sin cierre, sin duplicados ni reemplazos futuros.
No faltaba ninguna tarifa en la base. El servicio FLYER estaba inactivo; la
auditoría registraba su desactivación mediante `SERVICE_UPDATE` el
`2026-09-23T00:25:31.527Z`.

`GET /public/pricing` selecciona servicios activos, canal STANDARD, versión 2 e
intervalos vigentes `[validFrom, validUntil)`. Por eso devolvía únicamente seis
precios. El seed contiene las nueve tarifas y conserva deliberadamente el estado
de servicios existentes y las dimensiones de precios ya configuradas. Repetirlo
no reactiva FLYER ni completa vigencias cerradas; cambiar ese comportamiento
sobrescribiría decisiones administrativas.

Se reactivó FLYER exclusivamente en el entorno local mediante la operación
administrativa existente `PATCH /admin/services/:id`, con sesión PLATFORM_ADMIN.
La API pasó a devolver nueve tarifas. Los 16 precios permanecieron intactos; no
se ejecutó un seed sobre esa base ni se creó un precio adicional. La equivalencia
del entorno es `CREDIT_UNIT_VALUE_MXN_CENTS=2000`.

## Tarifas realmente existentes y vigentes

| Servicio | 1–50 | 51–100 | 101–150 |
| --- | --- | --- | --- |
| PHYSICAL_QR | 125 créditos / $2,500 MXN | 150 / $3,000 MXN | 175 / $3,500 MXN |
| FLYER | 225 créditos / $4,500 MXN | 275 / $5,500 MXN | 325 / $6,500 MXN |
| FLIPBOOK | 300 créditos / $6,000 MXN | 350 / $7,000 MXN | 400 / $8,000 MXN |

Después de la intervención local no hay tarifas STANDARD faltantes ni pendientes
de configuración. Producción no fue verificada; no se infiere que comparta este
estado y no se autoriza ninguna modificación allí.

## Implementación

- Admin muestra la matriz de nueve posiciones STANDARD desde el historial
  administrativo y contrasta su publicación con `GET /public/pricing`. Distingue
  vigentes, futuras, faltantes, conflictos y tarifas existentes no publicadas.
  PARTNER, VENUE y legado conservan su historial separado de la matriz pública.
- Las acciones de cada posición abren el formulario existente con servicio,
  canal y rango seleccionados. El precio se introduce explícitamente.
- Se retiró el bloqueo de solapamiento calculado en el formulario que impedía
  reemplazos futuros válidos. La API y las restricciones de PostgreSQL siguen
  siendo la autoridad para aceptar o rechazar intervalos. Un reemplazo permitido
  cierra la tarifa abierta anterior en el inicio de la nueva, sin cambiar su
  importe, fecha inicial ni los snapshots aplicados a eventos.
- Tras crear precios se consulta nuevamente el historial y la publicación para
  reflejar también el cierre automático anterior. Se mantienen la reconciliación
  de resultados inciertos y la prevención de envíos concurrentes; el formulario
  permanece bloqueado mientras se resuelve la operación.
- La landing existente continúa consumiendo exclusivamente el endpoint público.
  Un catálogo incompleto oculta la tabla completa y muestra indisponibilidad;
  no utiliza precios constantes ni completa huecos con importes inventados.
- No hay cambios en runtime de la API, esquema, migraciones, OpenAPI, ledger,
  capacidades funcionales, promociones, snapshots, facturación o planes mensuales.

## Validación

Las pruebas de integración se ejecutaron sobre una base temporal creada por el
harness existente. Lint y typecheck se verificaron inicialmente en una copia
aislada de `3dd7f5f` más PR01, mientras otras tareas modificaban el workspace.
Las comprobaciones finales de Admin, navegador y builds se repitieron en `main`
sobre `8ac1015` más PR01, conservando el cambio concurrente ya integrado. La copia
de QA no es una rama ni modifica el flujo de trabajo sobre `main`.

El modo `--public-catalog` reutiliza el harness de QA y sólo admite PostgreSQL
local. Crea y elimina su propia base con nombre aleatorio, usa credenciales
temporales y no modifica la base local compartida. El precio de 250 créditos del
escenario de cambio futuro existe exclusivamente en esa fixture temporal.

Comprobaciones completadas:

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Lint y typecheck de Admin, API y landing y dependencias | `pnpm exec turbo run lint typecheck --concurrency=1 --filter=@invitaciones/admin --filter=@invitaciones/api --filter=@invitaciones/landing` | 12 tareas correctas |
| Catálogo Admin, matriz, errores y reconciliación | `pnpm --filter @invitaciones/admin exec vitest run src/catalog/admin-catalog.test.tsx src/catalog/public-pricing-matrix.test.tsx --reporter=verbose` | 31/31 |
| Landing: precios públicos y recorridos comerciales | `pnpm --filter @invitaciones/landing exec vitest run --maxWorkers=1` | 67/67, nueve suites |
| Integración pricing, Finance, activación y comercial | `pnpm run test:e2e:access-control -- --integration-only --integration-files=services-pricing,finance,event-activation,event-commercial,commercial-pilot` | 64/64, cinco suites |
| Navegador real y comprobaciones SQL posteriores | `pnpm run test:e2e:public-catalog` | 1/1; nueve tarifas finales; invariantes Finance/RSVP/CheckIn/Staff correctas |
| Builds Admin y landing y dependencias | `pnpm exec turbo run build --concurrency=1 --filter=@invitaciones/admin --filter=@invitaciones/landing` | Cinco tareas correctas |
| Lint del harness y Playwright | `pnpm exec eslint scripts/run-access-control-e2e.mjs e2e/public-catalog.spec.ts playwright.public-catalog.config.ts` | Correcto |
| Tipado adicional Playwright | `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --skipLibCheck --typeRoots apps/api/node_modules/@types --types node e2e/public-catalog.spec.ts playwright.public-catalog.config.ts` | Correcto |

El recorrido de navegador comprueba catálogo incompleto sin tabla parcial,
reactivación del servicio desde Admin, creación de la tarifa faltante, nueve
publicadas, reemplazo futuro y cambio visible de $4,500 a $5,000 exclusivamente
en la base temporal. Revisa el cierre anterior, la persistencia de su importe y
fecha inicial, y el rechazo 409 del duplicado sin aumentar el historial.

Las primeras corridas simultáneas tuvieron timeouts de importación y de jsdom;
la repetición de catálogo Admin pasó completa. En la prueba de recorridos de
landing se amplió a diez segundos la espera de apertura del modal importado
con carga diferida, conservando todas las aserciones y sin cambiar su runtime.
La suite completa de landing pasó después de ese ajuste. El build mantiene el aviso de
chunks de Admin mayores a 500 kB y la integración emite una advertencia de
deprecación de consultas concurrentes en `pg`; ninguno impide las comprobaciones.

## Archivos del cambio

- `apps/admin/src/catalog/PublicPricingMatrix.tsx`: matriz y verificación pública.
- `apps/admin/src/catalog/AdminCatalogPage.tsx`: formulario, acciones y refresco.
- `apps/admin/src/app/query-client.ts`: clave de consulta de publicación.
- `apps/admin/src/shared/admin-error.ts`: mensaje de solapamiento de la API.
- `apps/admin/src/catalog/admin-catalog.test.tsx`: reemplazos futuros y errores.
- `apps/admin/src/catalog/public-pricing-matrix.test.tsx`: estados de la matriz.
- `apps/api/test/services-pricing.integration-spec.ts`: regresiones con PostgreSQL.
- `apps/landing/src/components/__tests__/LandingCommercialFlow.test.tsx`: espera de carga diferida en QA.
- `scripts/run-access-control-e2e.mjs`: modo de QA público sobre base temporal.
- `e2e/public-catalog.spec.ts`: recorrido real Admin → API → landing.
- `playwright.public-catalog.config.ts`: configuración del recorrido.
- `package.json`: comando `test:e2e:public-catalog`.
- Este reporte técnico de diagnóstico y QA.
