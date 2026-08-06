# Guía operativa de staging — CODEX-140

## Estado y arquitectura

Esta guía prepara un ambiente aislado de producción: API y PostgreSQL en Railway, y cuatro sitios
Netlify independientes. La configuración reproducible no constituye evidencia de despliegue.
CODEX-140 permanece `EN PROGRESO` hasta comprobar infraestructura, migración, seed, smoke, backup y
restauración. CODEX-131 permanece `EN PROGRESO` y `NO-GO PARA PILOTO` hasta la QA física.

```text
Netlify landing ─┐
Netlify client  ─┼─ HTTPS ─ Railway API /api/v1 ─ Railway PostgreSQL
Netlify admin   ─┤              └─ Socket.IO /realtime, path /socket.io
Netlify scanner ─┘
```

Cada servicio, sitio, base, volumen y credencial pertenece exclusivamente a staging. No se copian
datos locales ni productivos; el seed usa nombres demo y correos `example.invalid`.

## URLs y variables

Configurar en GitHub Environment `staging`: `STAGING_API_BASE_URL=https://<api>/api/v1`,
`STAGING_SOCKET_URL=https://<api>` y las raíces HTTPS `STAGING_LANDING_URL`, `STAGING_CLIENT_URL`,
`STAGING_ADMIN_URL` y `STAGING_SCANNER_URL`. Las rutas reales de carga directa son
`/invitacion/:token`, `/album/:token` y `/scanner/:staffToken`.

Variables reales de Railway API:

| Variable | Regla de staging |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | inyectada por Railway; omitir el alias local `API_PORT` |
| `DATABASE_URL` | referencia privada del PostgreSQL de staging |
| `DATABASE_POOL_MAX`, `DATABASE_CONNECTION_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS` | límites existentes |
| `CORS_ORIGINS` | cuatro orígenes exactos separados por coma, sin ruta, slash final ni wildcard |
| `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAME_SITE`, `AUTH_COOKIE_PATH` | `true`, `none`, `/` |
| `AUTH_COOKIE_NAME`, `AUTH_SESSION_TTL_SECONDS` | configuración contractual existente |
| `SWAGGER_ENABLED`, `LOG_LEVEL` | `false`, `log` o más restrictivo |
| `FILE_STORAGE_LOCAL_ROOT` | volumen, por ejemplo `/data/file-assets` |
| `INVITATION_TOKEN_SIGNING_SECRET` | secreto aleatorio de al menos 32 bytes |
| `PUBLIC_INVITATION_BASE_URL` | `${STAGING_CLIENT_URL}/invitacion` |
| límites restantes | `CREDIT_UNIT_VALUE_MXN_CENTS`, `PHONE_DEFAULT_REGION`, `CONTACT_IMPORT_PREVIEW_TTL_SECONDS`, `FILE_UPLOAD_MAX_BYTES`, `FILE_IMAGE_MAX_PIXELS`, `FILE_ORPHAN_RETENTION_SECONDS` |

Diferencias con los nombres orientativos: `CORS_ORIGINS` reemplaza `TRUSTED_ORIGINS`; la cookie es
host-only y no existe `AUTH_COOKIE_DOMAIN`; solo existe storage local y no hay
`FILE_STORAGE_DRIVER`; `INVITATION_TOKEN_SIGNING_SECRET` firma Invitación, QR, álbum y pases con
separación por propósito, por lo que no existen `INVITATION_TOKEN_SECRET`, `STAFF_TOKEN_SECRET` ni
`QR_SIGNING_SECRET`. StaffToken se genera aleatoriamente y la base conserva solo su SHA-256.

Variables públicas realmente consumidas, nunca secretos:

| Sitio | Variables |
| --- | --- |
| Landing | `VITE_API_BASE_URL`, `VITE_CLIENT_APP_URL`, `VITE_APP_URL` |
| Client | `VITE_API_BASE_URL`, `VITE_ADMIN_APP_URL`, `VITE_LANDING_URL` |
| Admin | `VITE_API_BASE_URL` |
| Scanner | `VITE_API_BASE_URL`, `VITE_SOCKET_URL` |

Scanner recibe la raíz API en `VITE_SOCKET_URL`; la app agrega `/realtime` y `/socket.io`. Deshabilitar
previews Netlify o separarlas de la base persistente de staging.

## Creación y enlace

1. Crear en Railway un proyecto de staging con PostgreSQL, servicio desde este repositorio y volumen
   montado en `/data`. Seleccionar `railway.toml`. Para enlazar sin comandos globales:

   ```bash
   pnpm dlx @railway/cli@5.30.4 login
   pnpm dlx @railway/cli@5.30.4 link
   pnpm dlx @railway/cli@5.30.4 service
   ```

2. Crear cuatro sitios Netlify dedicados desde el mismo repositorio. Dejar Base directory sin definir
   para usar la raíz y configurar Package directory como `apps/landing`, `apps/client`, `apps/admin` o
   `apps/scanner`; así cada sitio descubre su propio `netlify.toml`. Enlace local opcional:

   ```bash
   pnpm dlx netlify-cli@27.1.0 login
   pnpm dlx netlify-cli@27.1.0 link --id <SITE_ID>
   ```

3. En GitHub Environment `staging`, registrar como variables `RAILWAY_API_SERVICE_ID`, los cuatro
   `NETLIFY_*_SITE_ID`, las seis URLs, `STAGING_DEMO_EMAIL` y `STAGING_DEMO_EVENT_ID`. Registrar como
   secrets `RAILWAY_TOKEN`, `NETLIFY_AUTH_TOKEN`, `STAGING_DEMO_PASSWORD`,
   `STAGING_INVITATION_TOKEN` y `STAGING_STAFF_TOKEN`.

## Operación

Los scripts destructivos exigen `STAGING_ENVIRONMENT=staging`, coincidencia exacta entre
`DATABASE_URL` y `STAGING_DATABASE_URL`, rechazo de `PRODUCTION_DATABASE_URL` y bandera explícita.
Nunca usar `prisma migrate dev`.

```bash
pnpm staging:migrate -- --confirm-staging
pnpm staging:seed -- --confirm-staging
pnpm staging:smoke -- --confirm-staging
pnpm staging:deploy -- --confirm-staging
```

El seed usa IDs deterministas y crea Platform Admin, Planner, organización con Admin/Planner, saldo,
eventos `ACTIVE`/`EVENT_DAY`, invitaciones individual/familiar, dos pendientes, Croquis, Mesa circular,
Mesa rectangular, zona decorativa, StaffToken, QR válido, caso sin pendientes y QR de otro Evento.
Credenciales/tokens se escriben con permisos restringidos en
`apps/api/var/staging-seed/credentials.json` o `STAGING_SEED_ARTIFACT_PATH`, rutas ignoradas por Git.

`railway.toml` instala con lockfile, construye API, ejecuta `prisma migrate deploy` como pre-deploy,
arranca producción y valida `/api/v1/health`. El workflow `Staging` corre solo tras CI verde en `main`,
serializa despliegues, omite visiblemente si faltan credenciales y falla ante deploy, health o smoke.

El smoke automatiza 18 comprobaciones: API/PostgreSQL, cuatro frontends HTTPS, rutas SPA, login,
`/auth/me`, Evento, Invitación pública, sesión Staff, WebSocket, Staff inválido, ausencia de localhost y
secretos, CORS permitido y origen rechazado. No hace check-in. `STAGING_LOG_EXPORT_PATH` opcional permite
examinar un log absoluto sin imprimir secretos. Se preservan rate limits, guards, rooms por Evento y
`credentials: omit` del Scanner.

## Backup, restore y rollback

Con PostgreSQL client tools instaladas, y siempre fuera del repositorio:

```bash
pnpm staging:backup -- --confirm-staging --prune
pnpm staging:restore -- --confirm-staging-restore
```

Backup requiere `STAGING_BACKUP_DIR` absoluto y admite `STAGING_BACKUP_RETENTION_DAYS`. Restore requiere
`STAGING_BACKUP_FILE` y `STAGING_RESTORE_DATABASE_URL`, una base temporal distinta de staging y
producción; verifica tablas públicas y migraciones terminadas. Un backup solo se declara probado tras
esa restauración exitosa. Los snapshots nativos de Railway son una capa adicional.

Para rollback, seleccionar el deployment anterior saludable en Railway y los cuatro anteriores en
Netlify, después repetir health/smoke. Las migraciones son forward-only: no revertir esquema a mano;
usar una migración correctiva si el binario anterior no es compatible.

Incidencias: un `403` exige revisar `Origin` exacto; cookie ausente exige HTTPS, `Secure`, `SameSite=none`
y credentials en Client/Admin; Scanner exige raíz en `VITE_SOCKET_URL`; un 404 directo indica
`_redirects`/`dist` incorrecto; health 503 exige revisar PostgreSQL/migraciones; archivos ausentes
indican volumen mal montado; localhost en smoke requiere reconstruir con variables correctas.

## QA física CODEX-131

Registrar dispositivo, SO, navegador, commit y URL. En Android Chrome e iPhone Safari comprobar permiso
de cámara, cámara trasera, autofocus, QR en otra pantalla o impreso, Invitación individual/familiar,
check-in parcial y segundo check-in, Croquis/Mesa, dos teléfonos, `checkin.created`, `seating.updated`,
pérdida/recuperación de internet, cierre y cancelación. Los smoke no sustituyen esta evidencia ni
autorizan un piloto.
