# QA — Distribución manual de Invitaciones digitales

Estado: **PENDIENTE DE EJECUCIÓN CI / QA MANUAL**

Este documento registra el gate de aceptación de `CODEX_124D_INVITATION_DISTRIBUTION.md`. No sustituye los tests del
Client ni permite afirmar entrega de WhatsApp.

## Automatizado

- [ ] Flyer activo muestra `Invitaciones` y `Enviar invitaciones`.
- [ ] Flipbook activo muestra la misma superficie.
- [ ] `EVENT_DAY` conserva las acciones de compartir.
- [ ] `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y `CANCELLED` muestran consulta sin acciones de distribución.
- [ ] `PHYSICAL_QR` no muestra la sección y no consulta Contactos/Invitaciones.
- [ ] Invitación cancelada no ofrece WhatsApp, copiar ni abrir desde la superficie de distribución.
- [ ] WhatsApp usa el número E.164 convertido a dígitos internacionales sin `+`.
- [ ] El texto preparado incluye exactamente el `invitationLink` individual.
- [ ] Copiar enlace usa exactamente `invitationLink`.
- [ ] Fallo de Clipboard presenta recuperación natural sin marcar éxito falso.
- [ ] La UI no muestra estados `Enviada`, `Entregada` o `Leída`.
- [ ] Búsqueda por nombre/WhatsApp es local.
- [ ] Filtro por respuesta es local.
- [ ] Buscar/filtrar no agrega requests de red.
- [ ] Una falla de lectura no se interpreta como lista vacía.
- [ ] Targets críticos mantienen al menos 44 px.
- [ ] Navegación local puede desplazarse horizontalmente en viewport estrecho sin comprimir artificialmente labels.

## Manual antes de piloto

- [ ] Desktop Chrome/Edge + WhatsApp Web/Desktop: el botón abre el receptor correcto y conserva el mensaje/link.
- [ ] Android real + Chrome + WhatsApp: abre conversación correcta, texto precargado y regreso a Client estable.
- [ ] iPhone real + Safari + WhatsApp: abre conversación correcta, texto precargado y regreso a Client estable.
- [ ] Clipboard permitido: copia exacta.
- [ ] Clipboard denegado: mensaje recuperable y `Abrir invitación` disponible.
- [ ] Contacto sin WhatsApp disponible: omite WhatsApp sin inventar número.
- [ ] `EVENT_DAY`: compartir sigue disponible.
- [ ] Invitación cancelada: no hay acciones de distribución.
- [ ] Evento `CLOSED`: solo consulta.
- [ ] Evento `CANCELLED`: solo consulta y sin links operativos de distribución.

## Gates de repositorio

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @invitaciones/client test
```

Si este corte no modifica API/OpenAPI/Prisma, no necesita migración ni regeneración del SDK.
