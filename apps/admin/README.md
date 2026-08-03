# @invitaciones/admin

Aplicacion operativa exclusiva para `PLATFORM_ADMIN`. CODEX-130 sigue en progreso: CODEX-130A esta
aceptado y CODEX-130B esta implementado, pendiente de aceptacion. Incluye sesion por cookie HttpOnly,
shell responsive, dashboard, Clientes y usuarios, Eventos globales, finanzas por Cliente, Catalogo,
cortes financieros y metadata de reportes.

El requester administrativo notifica centralmente cada `401` autenticado. El provider limpia la cache
privada y las intenciones financieras efimeras, desmonta el shell y vuelve a `/login` con un `returnTo`
interno sin hash. Un `403`, `429`, `5xx`, error de red, aborto o respuesta inesperada no vence la sesion.

Las mutaciones de Cliente, restauracion de Evento y finanzas usan scopes abortables por entidad y
generacion, ademas de un lock sincrono anterior al request. Al cambiar de `clientId` o `eventId`, el
request anterior se aborta y sus callbacks visibles se descartan. Una operacion financiera abortada se
registra solo en memoria como resultado incierto, aislado por Cliente, para reintentar explicitamente con
la misma `Idempotency-Key` o descartarlo.

## Desarrollo

Configura `VITE_API_BASE_URL`. La app no guarda tokens, llaves idempotentes ni respuestas privadas en
Web Storage.

```bash
pnpm --filter @invitaciones/admin dev
pnpm --filter @invitaciones/admin test
pnpm --filter @invitaciones/admin typecheck
pnpm --filter @invitaciones/admin build
```

Rutas: `/login`, `/`, `/clientes`, `/clientes/:clientId`, `/eventos`, `/eventos/:eventId`, `/catalogo`,
`/reportes` y `/reportes/eventos/:eventId`.

Catalogo no consume `/services`: como no existe `GET /admin/services`, muestra solo Servicios
referenciados por precios y respuestas autoritativas de mutacion, deduplicados por UUID durante el
montaje de `/catalogo`; cambiar de pestana no los pierde. Un reload completo pierde un Servicio sin
Precio porque no existe una ruta para recuperarlo. Los precios son historicos y las fechas conservan el
instante al convertir ISO a `datetime-local` y volver a ISO. Las promociones solo definen elegibilidad,
resuelven nombres mediante endpoints Admin y los reportes Admin no ofrecen dataset ni descarga.
Auditoria y configuracion pertenecen a cortes posteriores. No hay impersonacion ni acciones operativas
de Cliente.
