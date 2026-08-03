# @invitaciones/api-client

SDK tipado compartido para la API de InvitacionesPremium.

Los tipos de `src/generated/schema.ts` se producen con `openapi-typescript` desde
`apps/api/openapi/openapi.json`. Los wrappers de runtime solo resuelven transporte, cookies, abortos,
validación defensiva y el error uniforme `ApiError`; no mantienen DTOs manuales paralelos.

```bash
pnpm --filter @invitaciones/api openapi:generate
pnpm --filter @invitaciones/api-client generate
pnpm --filter @invitaciones/api-client generate:check
pnpm --filter @invitaciones/api-client test
pnpm --filter @invitaciones/api-client build
```

`createApiClient({ baseUrl, fetchImpl?, onUnauthorized? })` expone `auth`, `adminClients`, `adminEvents`, `adminFinance`, `events`, `finance`, `services`, `contacts`,
`invitations`, `fileAssets`, `design`, `floorplan`, `physicalPasses`, `publicInvitation` y `publicAlbum`.
El runtime admite JSON, multipart,
texto, `Blob`, `ArrayBuffer`, respuestas `204`, abortos y llaves idempotentes. Toda solicitud usa
`credentials: 'include'` por defecto; los wrappers públicos fuerzan `credentials: 'omit'`. El SDK no lee
ni escribe localStorage, sessionStorage o IndexedDB.

Cuando un request con credenciales recibe `401`, el requester construye el `ApiError`, invoca una vez
`onUnauthorized` y lanza ese mismo error al caller. No notifica para `403`, `429`, `5xx`, errores de red,
`AbortError` o `UNEXPECTED_API_RESPONSE`. Los wrappers publicos conservan `credentials: 'omit'` y nunca
participan en la expiracion de una sesion privada.

Los wrappers públicos cubren resolución, Confirmación, rechazo, acompañantes, assets, QR SVG, Álbum y
fotos con los DTO generados. Codifican segmentos, propagan `AbortSignal` y no activan manejo de sesión.
Sus validadores discriminan `AVAILABLE`, `CANCELLED` y `CLOSED`, verifican las formas mínimas de
Invitación/Álbum/mutaciones y convierten cualquier `200` mal formado en `UNEXPECTED_API_RESPONSE`.

El wizard consume estos wrappers sin DTOs paralelos. Las llaves de CSV, pases y activación se entregan por
request; el SDK no decide su ciclo de vida ni las persiste.

`API_CLIENT_STATUS` identifica al cliente generado como operativo. CI regenera los tipos y rechaza drift.

Los wrappers administrativos derivan todos sus DTO de `generated/schema.ts`, codifican segmentos,
propagan `AbortSignal` y agregan `Idempotency-Key` solo en las cuatro mutaciones financieras que lo
exigen. No exponen rutas operativas de Cliente ni rutas de auditoria, refund o reversal inexistentes.
