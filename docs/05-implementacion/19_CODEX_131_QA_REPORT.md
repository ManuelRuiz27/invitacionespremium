# Reporte QA — CODEX-131 Microapp Scanner

## Estado del corte

- URL de staging preparada: pendiente; existe configuración reproducible, no una URL creada.
- Commit desplegado: pendiente; no se ejecutó despliegue remoto en este corte.
- Smoke tests de staging: preparados, no ejecutados contra infraestructura remota.
- Storage de Croquis remoto: mecanismo y verificación preparados; no ejecutados contra volumen Railway.
- Bootstrap/sincronización de secrets: procedimiento preparado; no ejecutado.
- Casos físicos: todos continúan pendientes.

- Rama técnica probada: `main`.
- Base: `549145491dca49126f70ca22e713dc455181d0ae` más las correcciones preventivas CODEX-140 del corte.
- Ambiente automatizado: workspace local Windows, Node.js y pnpm definidos por el monorepo, API y
  PostgreSQL locales para integración.
- Estado de CODEX-131: `EN PROGRESO`.
- Decisión máxima del corte: **TÉCNICAMENTE PREPARADO PARA QA FÍSICA — NO-GO PARA PILOTO**.

No se realizó QA en Android o iPhone físico y no existe evidencia para marcar CODEX-131 como
`ACEPTADO` o `COMPLETADO`.

## Gates ejecutados

- `pnpm install --frozen-lockfile`: OK.
- `pnpm --filter @invitaciones/api db:validate`: OK.
- `pnpm --filter @invitaciones/api db:migrate:deploy`: OK; 33 migraciones, ninguna pendiente.
- `pnpm --filter @invitaciones/api openapi:generate`: OK.
- `pnpm --filter @invitaciones/api-client generate`: OK.
- `pnpm --filter @invitaciones/api-client generate:check`: OK.
- `git diff --exit-code -- packages/api-client/src/generated/schema.ts`: OK, sin drift.
- Scanner `lint`, `typecheck`, `test` y `build`: OK; 40 pruebas.
- Landing `lint`, `typecheck`, `test` y `build`: OK; 67 pruebas.
- `pnpm --filter @invitaciones/api test:integration`: OK al exportar al proceso la `DATABASE_URL`
  local sin imprimirla; la primera ejecución evidenció que Prisma cargaba `.env`, pero una spec que crea
  una base aislada requería la variable en `process.env`.
- `pnpm format:check`: OK.
- `pnpm lint`: OK, 7 paquetes.
- `pnpm typecheck`: OK, 7 paquetes.
- `pnpm test`: OK, 7 paquetes.
- `pnpm build`: OK, 7 paquetes.
- `pnpm run ci`: OK.

Los builds de Scanner, Client y Admin conservan una advertencia no bloqueante por tamaño de chunk.
GitHub Actions quedó verde en el PR #16: el run por `push` concluyó `success` en 6m01s y el run por
`pull_request` concluyó `success` en 6m25s. Ambos ejecutaron el job `quality` completo.

## Correcciones verificadas

- Socket.IO recibe configuración tipada desde `App → router → ScannerSessionPage → useScannerRealtime`
  y conecta explícitamente a `/realtime` con `path: /socket.io`.
- El handshake Staff contiene únicamente `protocolVersion`, `actorMode`, `roomType` y `staffToken`; no
  incluye `eventId`, query string, credenciales de usuario ni datos personales.
- `connect`, `connect_error`, `disconnect`, reconexión y cleanup tienen manejo explícito. Una falla de
  realtime se informa sin bloquear operaciones REST que todavía sean válidas.
- `event.closed` y `event.cancelled` bloquean inmediatamente la operación, desmontan controles,
  invalidan la sesión y desconectan el socket.
- `checkin.created` y `seating.updated` descartan resultados locales potencialmente obsoletos y exigen
  escanear o buscar nuevamente; REST permanece como fuente autoritativa.
- El Croquis dibuja el DTO real de Mesa con coordenadas relativas, dimensiones, rotación y geometrías
  `RECTANGLE`, `SQUARE`, `CIRCLE` y `POLYGON`. Varias Mesas seleccionadas producen un estado explícito y
  ningún resaltado arbitrario.
- Los validadores runtime del SDK cubren todos los campos obligatorios usados por sesión, Invitación,
  check-in, Croquis, geometría y pase físico, además de conteos, rangos y coherencia.
- Landing vuelve a usar explícitamente `designTokens`, corrige tokens propios, contraste, props MUI y
  formato sin cambiar precios, servicios, textos comerciales, rutas, registro ni límites.
- Fixtures globales de Admin/Client implementan el SDK completo, y las pruebas Client esperan la
  instalación efectiva de observadores y toleran carga concurrente sin alterar sus aserciones.

## Cobertura automatizada agregada

- URL exacta del namespace, path, handshake exacto, ausencia de `eventId`, query y secretos;
- `connect_error`, reconexión con recuperación REST y cleanup;
- cierre, cancelación, `checkin.created`, `seating.updated` y dos Scanners representados por eventos;
- descarte de pendientes y Mesas obsoletas;
- overlay responsive, rotación, cuatro geometrías, varias Mesas y zona decorativa no resaltable;
- respuestas SDK incompletas, conteos negativos/incoherentes, ocupación, coordenadas y polígonos
  inválidos;
- ausencia de teléfonos en la UI.

## Casos manuales pendientes

- Android o iPhone físico mediante HTTPS;
- permiso real de cámara, selección de cámara trasera, autofocus y reproducción de video;
- lectura de QR real y check-in contra un ambiente desplegado;
- pérdida/recuperación de conectividad y eventos realtime en dos teléfonos;
- cierre, cancelación y cambio de Mesa durante una sesión real;
- registro de dispositivo, sistema operativo, navegador y resultado.

La UX para detectar automáticamente si un token corresponde a QR de Invitación o a pase físico queda
como tarea separada. El backend y `scanPhysicalPass` se conservan, pero el contrato actual no define ese
mecanismo de distinción y este corte no lo inventa.

## Riesgos residuales

- No existe evidencia de hardware móvil, permisos, autofocus o conectividad real.
- La prueba local no sustituye HTTPS ni observación concurrente en dispositivos físicos.
- Persiste la advertencia no bloqueante de chunks mayores a 500 kB.

## Decisión

**TÉCNICAMENTE PREPARADO PARA QA FÍSICA — NO-GO PARA PILOTO.**

CODEX-131 continúa `EN PROGRESO`. La línea base técnica y CI local están verdes, pero la aceptación y
cualquier piloto siguen bloqueados hasta completar y adjuntar la QA física HTTPS pendiente.
