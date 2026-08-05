# Reporte QA — CODEX-131 Microapp Scanner

## Estado del corte

- Commit técnico probado: `af23b81`.
- Rama: `fix/codex-131-audit-remediation`.
- Ambiente automatizado: workspace local Windows, Node.js y pnpm definidos por el monorepo, API y
  PostgreSQL locales para las pruebas de integración.
- Estado: `EN PROGRESO`.

## Gates ejecutados

- `pnpm install --frozen-lockfile`: OK.
- `pnpm --filter @invitaciones/api db:validate`: OK.
- `pnpm --filter @invitaciones/api openapi:generate`: OK.
- `pnpm --filter @invitaciones/api-client generate`: OK.
- `pnpm --filter @invitaciones/api-client generate:check`: OK.
- `git diff --exit-code -- packages/api-client/src/generated/schema.ts`: OK, sin drift.
- `pnpm --filter @invitaciones/scanner lint`: OK.
- `pnpm --filter @invitaciones/scanner typecheck`: OK.
- `pnpm --filter @invitaciones/scanner test`: OK, 28 pruebas.
- `pnpm --filter @invitaciones/scanner build`: OK, con advertencia no bloqueante por tamaño de chunk.
- `pnpm lint`: ERROR en Landing, fuera del alcance autorizado;
  `apps/landing/src/theme/landing-theme.ts:1` importa `designTokens` sin usarlo.
- `pnpm typecheck`: ERROR en Landing por incompatibilidades MUI y tokens de diseño, entre ellas
  `TabIndicatorProps`, `PaperProps`, `maxWidth`, `surfaces`, `shadows` y `divider`.
- `pnpm test`: ERROR en Landing;
  `LandingComponents.test.tsx:513` obtiene contraste `1.6343253794631336`, menor que `3`.
- `pnpm --filter @invitaciones/api test:integration`: el primer intento terminó en ERROR porque el
  proceso no heredó `DATABASE_URL`; repetido con la variable local de `.env`, terminó OK.
- `pnpm build`: OK, 7 paquetes.
- `pnpm format:check`: ERROR por 22 archivos preexistentes fuera del alcance, dentro de
  `.agents/skills/**` y `apps/landing/**`.
- `pnpm ci`: OK, pero pnpm 11 lo interpreta como alias de instalación limpia y no como el script raíz.
- `pnpm run ci`: ERROR en `pnpm format:check` por los mismos 22 archivos; no alcanza los gates
  posteriores del script.

Scanner, SDK, OpenAPI, integración API y build quedan verdes. La línea base global no queda verde por
fallos preexistentes en Landing y scripts de skills que este corte no está autorizado a modificar.

## Casos automatizados

La suite usa `createApiClient()` real, respuestas compatibles con los DTO generados y dobles de red
tipados. Cubre:

- token inválido, expirado y revocado;
- sesiones `ACTIVE` y `EVENT_DAY`;
- bloqueo completo de Evento cerrado, cancelado y archivado;
- cámara disponible, permiso denegado, cámara ausente, API inexistente y error inesperado;
- limpieza de tracks, `requestAnimationFrame` y Socket.IO al desmontar;
- QR válido, inválido y lectura duplicada;
- selección parcial y vacía de Asistentes;
- check-in exitoso, error inline y replay con la misma llave idempotente;
- búsqueda con y sin coincidencias, y selección sin convertir `invitationId` en `qrToken`;
- Croquis disponible, ausente y con error;
- ausencia de teléfonos en la UI;
- cierre recibido por realtime con bloqueo inmediato y recuperación autoritativa por REST.

## Defectos encontrados y correcciones

- Scanner dependía transitivamente del SDK y conservaba tipos obsoletos de React Router: se declararon
  y limpiaron las dependencias y el lockfile.
- El cliente Scanner se inyectaba mediante casts, no validaba respuestas y omitía `Idempotency-Key`:
  `createApiClient().scanner` ahora es completo, obligatorio, validado y tipado.
- La búsqueda enviaba un UUID de Invitación a `/scan`: ahora consume directamente
  `ScannerSearchResponseDto` y su proyección autorizada.
- La cámara reiniciaba el stream por renders, ignoraba `play()` y repetía lecturas: se estabilizaron
  callbacks, stream, pausa, throttling, deduplicación y cleanup.
- La UI montaba operación sin una barrera defensiva completa y realtime usaba un handshake incorrecto:
  sólo se montan cámara, búsqueda, Croquis, mutaciones y Socket.IO con sesión operativa.
- Check-in usaba `alert`, perdía respuestas inciertas y no enviaba idempotencia: ahora conserva resultado,
  error inline y llave estable hasta reconciliar.
- Croquis contenía placeholder, colores hardcodeados y rutas sin resolver: ahora usa el DTO y
  `contentPath` documentados, estados explícitos y tokens MUI.

## Casos manuales pendientes

- Android o iPhone físico mediante HTTPS;
- permiso real de cámara y selección de cámara trasera;
- lectura de QR real y check-in contra ambiente desplegado;
- reintento real ante pérdida y recuperación de conectividad;
- cierre y cancelación durante una sesión conectada;
- pase físico real; el contrato no define detección automática entre tokens y no se inventó una UX
  adicional para este corte;
- registro de dispositivo, sistema operativo, navegador y resultado.

## Riesgos residuales

- No existe evidencia de rendimiento, autofocus, permisos o reproducción de video en hardware móvil.
- El bundle de Vite emite una advertencia no bloqueante por un chunk mayor a 500 kB.
- La aceptación depende de QA física HTTPS y de conectividad real.

## Decisión

**NO-GO.**

El Scanner queda técnicamente preparado para un GO condicionado de QA física, pero el corte no puede
pasar a revisión ni piloto mientras `lint`, `typecheck`, `test`, `format:check` y `pnpm run ci` globales
continúen rojos. Después de recuperar esa línea base, seguirá siendo **NO-GO PARA PILOTO** hasta completar
y adjuntar la evidencia manual pendiente.
