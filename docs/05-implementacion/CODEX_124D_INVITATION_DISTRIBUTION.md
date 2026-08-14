# CODEX-124D — Distribución manual de Invitaciones digitales

Estado: **IMPLEMENTADO EN RAMA — PENDIENTE DE ACEPTACIÓN**

## Motivo

El PRD siempre definió al Contacto como persona que recibe la Invitación por WhatsApp y dejó fuera del MVP únicamente
el **envío automático por WhatsApp API**. El workspace operativo había implementado Resumen y Mesas, pero no exponía
la acción necesaria para distribuir las Invitaciones digitales ya creadas.

Además, el handoff posterior a activación conservaba al Planner dentro de **Revisión y activación** sin una siguiente
acción operativa clara. Este corte corrige ambas omisiones sin inventar una integración externa ni un estado de entrega
que el sistema no puede probar.

## Fuentes normativas

1. `docs/01-producto/02_PRD.md`.
2. `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md`.
3. `docs/02-flujos-reglas/EVENT_STATE_MACHINE.md`.
4. `docs/04-tecnico/INVITATIONS_CONTRACT.md`.
5. `docs/04-tecnico/CONTACTS_CONTRACT.md`.
6. `docs/04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`.
7. `docs/04-tecnico/CLIENT_APP_CONTRACT.md`.

## Regla de producto cerrada

- `FLYER` y `FLIPBOOK` muestran **Invitaciones** dentro del workspace operativo.
- `ACTIVE` y `EVENT_DAY` permiten distribuir Invitaciones digitales.
- `CLOSED`, `ALBUM_PUBLISHED`, `ARCHIVED` y `CANCELLED` conservan consulta pero no ofrecen nuevos envíos.
- `PHYSICAL_QR` no muestra esta sección porque no crea Contactos/Invitaciones digitales.
- Demo no distribuye Invitaciones reales.
- Invitación específica cancelada no puede volver a compartirse desde la UI operativa.
- WhatsApp API, webhooks de entrega/lectura y automatización siguen fuera del MVP.

## Implementación

### Lecturas existentes

No se agrega endpoint:

```http
GET /api/v1/events/:eventId/contacts
GET /api/v1/events/:eventId/invitations
```

La correlación usa `Invitation.contactId → Contact.id`. Con el máximo contractual de 150 Contactos/Invitaciones, la
búsqueda y filtros pueden resolverse localmente después de ambas lecturas sin N+1.

### Filas

Cada Invitación muestra:

- nombre del Contacto;
- WhatsApp cuando sigue disponible;
- cantidad de Asistentes nominales actuales;
- Sin respuesta / Confirmada / No asistirá / Cancelada.

No se muestra **Enviada**, **Entregada** ni **Leída**.

### Acciones

`Enviar por WhatsApp` crea únicamente un deep link:

```text
https://wa.me/<telefono-solo-digitos>?text=<mensaje-codificado>
```

Mensaje MVP:

```text
Hola, te comparto la invitación para <Nombre del evento>:
<invitationLink>
```

El Planner termina la acción dentro de WhatsApp.

`Copiar enlace` copia exactamente el `invitationLink` existente. `Abrir invitación` abre el mismo link público en una
nueva pestaña.

Ninguna de estas acciones:

- regenera token;
- modifica Invitación;
- cambia RSVP;
- crea una mutación backend;
- crea idempotency key;
- registra entrega ficticia.

### Handoff posterior a activación

Cuando una activación queda confirmada, **Revisión y activación** deja de presentar al Evento como incompleto y cambia
a estado operativo:

- `FLYER` / `FLIPBOOK` → CTA **Enviar invitaciones** hacia
  `/eventos/:eventId?seccion=invitaciones`;
- `PHYSICAL_QR` → CTA **Ir al evento** hacia `/eventos/:eventId`.

El mismo handoff aplica cuando una activación tuvo respuesta incierta pero la lectura autoritativa posterior confirma
`ACTIVE`. No se repite la mutación de activación. El Planner conserva la confirmación visible y decide cuándo avanzar
al workspace.

## UX

Navegación digital:

```text
Resumen | Invitaciones | Mesas y distribución (si aplica) | Staff (cuando exista)
```

La sección se titula **Enviar invitaciones** y explica que el envío final se completa en WhatsApp. Buscar por nombre o
WhatsApp y filtrar por estado no producen requests nuevos. Los CTAs tienen targets táctiles mínimos de 44 px y no
dependen de hover.

## Privacidad

- La superficie es autenticada y hereda ownership de Contacts/Invitations API.
- No se intenta reconstruir un teléfono anonimizado.
- Si el teléfono no está disponible, se omite WhatsApp.
- Tokens y links no se registran en logs ni auditoría.
- Estados terminales retiran las acciones de distribución.

## Archivos

- `apps/client/src/workspace/InvitationDistribution.tsx`.
- `apps/client/src/workspace/InvitationDistribution.test.tsx`.
- `apps/client/src/workspace/ActiveEventWorkspacePage.tsx`.
- `apps/client/src/wizard/review/ReviewStep.tsx`.
- `apps/client/src/wizard/review/ReviewStepDistributionHandoff.test.tsx`.
- `docs/01-producto/02_PRD.md`.
- `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md`.
- `docs/04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`.
- `docs/04-tecnico/CLIENT_APP_CONTRACT.md`.
- `AGENTS.md`.

## QA obligatoria

Automatizada:

- Flyer/Flipbook muestran navegación Invitaciones;
- Physical QR no la muestra ni consulta Contactos/Invitaciones;
- ACTIVE/EVENT_DAY muestran acciones;
- estados posteriores son consulta sin acciones de distribución;
- Invitación cancelada no expone acciones;
- deep link WhatsApp usa teléfono normalizado sin `+` y contiene el `invitationLink` exacto;
- copiar usa el link exacto;
- no aparece copy de estado falso `Enviada`;
- búsqueda por nombre/WhatsApp y filtros no producen requests adicionales;
- errores de lectura son recuperables;
- activación digital confirmada ofrece **Enviar invitaciones** y no vuelve a mostrar advertencia de Evento incompleto;
- activación Physical QR confirmada ofrece **Ir al evento** y no muestra acción digital.

Manual antes de piloto:

- WhatsApp Web/desktop;
- Android Chrome con WhatsApp instalado;
- iPhone Safari con WhatsApp instalado;
- copiar enlace con permiso Clipboard concedido y denegado;
- contacto sin teléfono disponible;
- Evento en `EVENT_DAY`;
- Invitación específica cancelada;
- Evento `CLOSED` y `CANCELLED`.

## Fuera de alcance

- Meta/WhatsApp Business API;
- plantillas aprobadas por Meta;
- mensajes masivos;
- envío automático;
- colas/outbox;
- `sentAt`, `deliveredAt`, `readAt`;
- webhooks;
- métricas de mensajería;
- costo de conversación;
- reintentos automáticos;
- nueva entidad de distribución.
