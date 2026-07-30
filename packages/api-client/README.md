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

`createApiClient({ baseUrl, fetchImpl? })` expone `auth`, `events` y `finance`. Toda solicitud usa
`credentials: 'include'`; el SDK no lee ni escribe localStorage, sessionStorage o IndexedDB.

`API_CLIENT_STATUS` identifica al cliente generado como operativo. CI regenera los tipos y rechaza drift.
