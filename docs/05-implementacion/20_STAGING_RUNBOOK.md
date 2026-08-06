# Guía operativa de staging — CODEX-140

## Estado y arquitectura

Esta guía prepara API y PostgreSQL en Railway y cuatro sitios Netlify independientes. La configuración
reproducible no acredita infraestructura ni despliegues. CODEX-140 permanece `EN PROGRESO`; faltan
infraestructura, migración, seed de base y storage, smoke, backup y restauración remotos. CODEX-131
permanece `EN PROGRESO — TÉCNICAMENTE PREPARADO PARA QA FÍSICA — NO-GO PARA PILOTO`.

```text
Netlify landing ─┐
Netlify client  ─┼─ HTTPS ─ Railway API /api/v1 ─ Railway PostgreSQL
Netlify admin   ─┤              ├─ Socket.IO /realtime, path /socket.io
Netlify scanner ─┘              └─ volumen FILE_STORAGE_LOCAL_ROOT
```

Cada recurso es exclusivo de staging. No se copian datos locales, productivos ni personales reales.

## Targets, variables y secrets

El GitHub Environment `staging` debe contener estas variables:

- `RAILWAY_PROJECT_ID`, `RAILWAY_API_SERVICE_ID`;
- `NETLIFY_LANDING_SITE_ID`, `NETLIFY_CLIENT_SITE_ID`, `NETLIFY_ADMIN_SITE_ID`,
  `NETLIFY_SCANNER_SITE_ID`;
- `STAGING_API_BASE_URL`, con ruta `/api/v1`, y `STAGING_SOCKET_URL`, sin `/realtime`;
- `STAGING_LANDING_URL`, `STAGING_CLIENT_URL`, `STAGING_ADMIN_URL`, `STAGING_SCANNER_URL`;
- `STAGING_DEMO_EMAIL`, `STAGING_DEMO_EVENT_ID`.

Secrets protegidos: `RAILWAY_TOKEN`, `NETLIFY_AUTH_TOKEN`, `STAGING_DEMO_PASSWORD`,
`STAGING_INVITATION_TOKEN` y `STAGING_STAFF_TOKEN`. Ningún `VITE_*` contiene secretos.

Variables reales de API: `NODE_ENV=production`, `PORT` inyectado por Railway, `DATABASE_URL`, límites
de pool, `CORS_ORIGINS` con los cuatro orígenes exactos, cookies `Secure`/`SameSite=none`/path `/`,
`SWAGGER_ENABLED`, `LOG_LEVEL`, `FILE_STORAGE_LOCAL_ROOT`, límites de archivos,
`INVITATION_TOKEN_SIGNING_SECRET` y `PUBLIC_INVITATION_BASE_URL`. Los nombres orientativos
`TRUSTED_ORIGINS`, `AUTH_COOKIE_DOMAIN`, `FILE_STORAGE_DRIVER`, `INVITATION_TOKEN_SECRET`,
`STAFF_TOKEN_SECRET` y `QR_SIGNING_SECRET` no existen en el contrato actual.

Variables públicas consumidas:

| Sitio | Variables |
| --- | --- |
| Landing | `VITE_API_BASE_URL`, `VITE_CLIENT_APP_URL`, `VITE_APP_URL` |
| Client | `VITE_API_BASE_URL`, `VITE_ADMIN_APP_URL`, `VITE_LANDING_URL` |
| Admin | `VITE_API_BASE_URL` |
| Scanner | `VITE_API_BASE_URL`, `VITE_SOCKET_URL` |

## Creación inicial de infraestructura

Este corte no crea recursos remotos. El operador crea un proyecto Railway staging, PostgreSQL, un
servicio API y un volumen montado para `FILE_STORAGE_LOCAL_ROOT`; después crea los cuatro sitios
Netlify. Se copian sus IDs reales a GitHub, sin `.railway`, `.netlify/state.json` ni selección
interactiva. `RAILWAY_PROJECT_ID`, ambiente `staging` y `RAILWAY_API_SERVICE_ID` son obligatorios en
cada comando.

Railway no debe tener auto-deploy desde GitHub si GitHub Actions ejecuta `railway up`. Se usa un
servicio vacío o se desconecta su source automático. En Netlify se configura **Stopped builds** en
los cuatro sitios; `ignore = "exit 0"` también evita builds continuos ordinarios. Los despliegues
manuales del CLI siguen habilitados. Así un commit sólo se publica por el workflow posterior a CI.

## Bootstrap inicial, separado del deploy recurrente

Orden obligatorio:

1. Crear infraestructura y configurar Railway, dominio HTTPS, PostgreSQL y volumen.
2. Registrar inicialmente en GitHub Environment el token/target Railway y `STAGING_API_BASE_URL`.
3. Ejecutar manualmente `Staging` en `main`, modo `bootstrap-api`. El workflow verifica que `main`
   actual tenga una corrida CI `success`; no acepta SHA arbitrario.
4. La API se sube con `railway up --json` en modo adjunto, mensaje `staging:<sha>` y target explícito.
   El script exige deployment creado y estado final `SUCCESS`; `FAILED`, `CRASHED`, timeout o estado
   desconocido fallan. Health se consulta únicamente después de ese éxito.
5. Ejecutar migraciones controladas, nunca `migrate dev`:

   ```bash
   pnpm staging:migrate -- --confirm-staging
   ```

6. Desde una estación operativa segura, exportar `STAGING_ENVIRONMENT=staging`, la URL exacta de DB
   como `DATABASE_URL` y `STAGING_DATABASE_URL`, target/tokens Railway y URL API. Ejecutar:

   ```bash
   pnpm staging:seed -- --confirm-staging
   ```

   El guard corre antes de crear Nest, abrir PostgreSQL, auditar o mutar servicios/precios. Después
   siembra catálogo/precios, fixtures DB, storage remoto y verificaciones Scanner.
7. Abrir localmente el artefacto ignorado `apps/api/var/staging-seed/credentials.json`. Copiar por el
   canal seguro de la UI de GitHub los valores demo a Environment secrets; no pegarlos en terminales,
   issues, Actions outputs ni logs. Registrar email/event ID como variables.
8. Confirmar que el traspaso no quedó obsoleto:

   ```bash
   pnpm staging:verify-secrets -- --confirm-staging
   ```

   Verifica password/login, Cliente del Evento, Invitación esperada y StaffToken. Repetirlo después de
   cada seed antes de habilitar el deploy recurrente.
9. Registrar IDs/URLs Netlify, ejecutar `Staging` modo `retry` y conservar su resumen de commit/URLs.

## Seed DB, storage y fixtures

El seed conserva credenciales idempotentes en un artefacto local con permisos restringidos. Crea los
roles demo, Clientes, saldo, Eventos `ACTIVE`/`EVENT_DAY`, una Invitación individual disponible, otra
completamente ingresada, familia nominal con tres asistentes `CONFIRMED` y al menos dos pendientes,
QR extranjero, Mesas circular/rectangular y zona decorativa de capacidad cero.

El CheckIn completo se crea con `ScannerService.checkIn()`. Su replay devuelve exactamente el snapshot
contractual: `status`, `invitationId`, `checkedIn[]` con Mesa, `remainingPendingAssistants[]` y conteo.
Después, `ScannerService.scan()` verifica autoritativamente `AVAILABLE`, conteos, Mesas y ausencia de
teléfonos; no se validan sólo filas Prisma.

Storage es una fase separada. `railway service files upload` escribe el PNG en la raíz aislada por
ambiente, bajo `staging-demo/floorplan.png`; `download` lo vuelve a leer del contenedor/volumen. Se
validan PNG, bytes, tamaño y SHA-256 antes de registrar `FileAsset READY`. No se usa pre-deploy,
`railway run` ni el filesystem del runner como evidencia. Finalmente la API pública Staff descarga el
Croquis y repite las comprobaciones. Si falta el archivo remoto, no comienza la fase `READY`.

## Deploy recurrente

```bash
pnpm staging:deploy -- --confirm-staging
```

El orden es API → deployment Railway `SUCCESS` → health → builds frontend desde la raíz → Netlify →
smoke. Cada `dist` se elimina antes del build, se resuelve como ruta absoluta dentro del monorepo y
debe contener `index.html`, `_headers` y `_redirects`. Un build fallido nunca publica un `dist` viejo.

El workflow conserva `workflow_run` después de CI verde y `workflow_dispatch` para bootstrap/reintento.
Usa Environment `staging`, concurrency única y el SHA de `main` probado. El preflight nunca se omite:
modo bootstrap exige el target/API mínimos; modo retry exige además Netlify y credenciales demo.

El smoke realiza 19 comprobaciones: health/API/PostgreSQL, cuatro sitios HTTPS, rutas SPA, login,
`/auth/me`, Evento, Invitación, Staff, WebSocket, token inválido, localhost/secrets, CORS permitido y
rechazado, y descarga del Croquis con HTTP 200, `image/png`, bytes y checksum. No hace check-in.

## Backup, restore, rollback e incidencias

```bash
pnpm staging:backup -- --confirm-staging --prune
pnpm staging:restore -- --confirm-staging-restore
```

Backup exige directorio absoluto fuera del repo. Restore exige dump y una DB temporal distinta de
staging/producción y comprueba tablas/migraciones. No se declara probado hasta ejecutarlo realmente.
Rollback selecciona deployments anteriores saludables y repite health/smoke; las migraciones son
forward-only.

Un `403` requiere revisar origen exacto; cookie ausente, HTTPS/Secure/SameSite; `404` directo,
`_redirects`; health `503`, DB/migraciones; deployment desconocido, actualizar el adaptador al JSON
documentado de la CLI sin aceptar health viejo; Croquis `404/500`, volumen, root y checksum. Nunca se
imprimen respuestas completas de Railway ni valores de secrets.

## QA física CODEX-131

Siguen pendientes Android Chrome e iPhone Safari: permisos/cámara trasera/autofocus, QR real,
Invitación individual/familiar, check-in parcial y segundo check-in, Croquis/Mesa, dos teléfonos,
realtime, pérdida/recuperación de internet, cierre y cancelación. Los smoke no autorizan piloto.
