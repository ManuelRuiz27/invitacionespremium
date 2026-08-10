import type { ApiClient, Contact, Event, Invitation } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { ErrorState, LoadingState } from '@invitaciones/ui';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import WhatsApp from '@mui/icons-material/WhatsApp';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSessionExpiry } from '../shared/use-session-expiry';

type DistributionFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
type CopyFeedback = { severity: 'success' | 'error'; message: string };

type DistributionRow = {
  invitation: Invitation;
  displayName: string;
  phone: string | null;
};

const filters: Array<{ value: DistributionFilter; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PENDING', label: 'Sin respuesta' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'REJECTED', label: 'No asistirán' },
  { value: 'CANCELLED', label: 'Canceladas' }
];

export function InvitationDistribution({ apiClient, event }: { apiClient: ApiClient; event: Event }) {
  const returnTo = `/eventos/${event.id}?seccion=invitaciones`;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DistributionFilter>('ALL');
  const [feedback, setFeedback] = useState<CopyFeedback>();

  const contactsQuery = useQuery({
    queryKey: ['events', event.id, 'invitation-distribution', 'contacts'],
    queryFn: ({ signal }) => apiClient.contacts.list(event.id, undefined, signal),
    staleTime: 0
  });
  const invitationsQuery = useQuery({
    queryKey: ['events', event.id, 'invitation-distribution', 'invitations'],
    queryFn: () => apiClient.invitations.list(event.id),
    staleTime: 0
  });

  useSessionExpiry(contactsQuery.error ?? invitationsQuery.error, returnTo);

  const rows = useMemo(
    () => buildRows(contactsQuery.data ?? [], invitationsQuery.data ?? []),
    [contactsQuery.data, invitationsQuery.data]
  );
  const visibleRows = useMemo(() => filterRows(rows, search, filter), [filter, rows, search]);
  const summary = useMemo(() => invitationSummary(rows), [rows]);
  const canShare = event.status === 'ACTIVE' || event.status === 'EVENT_DAY';

  if (contactsQuery.isPending || invitationsQuery.isPending) {
    return <LoadingState label="Cargando invitaciones…" />;
  }

  const loadError = contactsQuery.error ?? invitationsQuery.error;
  if (loadError) {
    if (loadError instanceof ApiError && loadError.status === 401) return <LoadingState label="Redirigiendo…" />;
    return (
      <ErrorState
        title="No pudimos cargar las invitaciones."
        message="Revisa tu conexión e inténtalo nuevamente."
        {...(loadError instanceof ApiError && loadError.operationId ? { operationId: loadError.operationId } : {})}
        onRetry={() => {
          void contactsQuery.refetch();
          void invitationsQuery.refetch();
        }}
      />
    );
  }

  if (rows.length === 0) {
    return <Alert severity="info">Este evento no tiene invitaciones disponibles para compartir.</Alert>;
  }

  return (
    <Stack spacing={2.5}>
      {canShare ? (
        <Alert severity="info">
          Elige <strong>Enviar por WhatsApp</strong> para abrir la conversación con el enlace individual listo. El envío
          se completa en WhatsApp; InvitacionesPremium no marca entregas que WhatsApp no confirma.
        </Alert>
      ) : (
        <Alert severity="info">
          Este evento ya no admite nuevos envíos. Puedes consultar el estado final de sus invitaciones.
        </Alert>
      )}

      {feedback ? (
        <Alert severity={feedback.severity} aria-live="polite" onClose={() => setFeedback(undefined)}>
          {feedback.message}
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <TextField
          label="Buscar invitación"
          placeholder="Nombre o WhatsApp"
          value={search}
          onChange={(searchEvent) => setSearch(searchEvent.target.value)}
          size="small"
          sx={{ flex: 1, minWidth: 0 }}
        />
        <TextField
          select
          label="Estado"
          value={filter}
          onChange={(filterEvent) => setFilter(filterEvent.target.value as DistributionFilter)}
          size="small"
          sx={{ minWidth: { xs: '100%', sm: 180 } }}
        >
          {filters.map((item) => (
            <MenuItem key={item.value} value={item.value}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {summary.total} invitaciones · {summary.confirmed} confirmadas · {summary.pending} sin respuesta
      </Typography>

      {visibleRows.length === 0 ? (
        <Box sx={{ py: 4 }}>
          <Typography sx={{ fontWeight: 700 }}>No encontramos invitaciones con esos filtros.</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Cambia la búsqueda o el estado para ver otros resultados.
          </Typography>
        </Box>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, borderTop: 1, borderColor: 'divider' }}>
          {visibleRows.map((row) => {
            const status = invitationStatus(row.invitation);
            const invitationShareable = canShare && !row.invitation.cancelledAt;
            const whatsapp =
              invitationShareable && row.phone
                ? buildWhatsAppUrl(row.phone, event.name ?? 'el evento', row.invitation.invitationLink)
                : null;
            return (
              <Box
                component="li"
                key={row.invitation.id}
                sx={{
                  py: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
                  gap: 1.5,
                  alignItems: { md: 'center' }
                }}
              >
                <Stack spacing={0.75} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{row.displayName}</Typography>
                    <Chip size="small" label={status.label} color={status.color} variant="outlined" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {row.phone ?? 'WhatsApp no disponible'}
                    {' · '}
                    {row.invitation.assistants.length === 1
                      ? '1 persona en la invitación'
                      : `${row.invitation.assistants.length} personas en la invitación`}
                  </Typography>
                  {row.invitation.cancelledAt ? (
                    <Typography variant="body2" color="text.secondary">
                      Esta invitación fue cancelada por el organizador.
                    </Typography>
                  ) : null}
                </Stack>

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: { md: 'flex-end' } }}
                >
                  {invitationShareable ? (
                    <Button
                      variant="outlined"
                      startIcon={<ContentCopyRounded />}
                      sx={{ minHeight: 44 }}
                      onClick={() =>
                        void copyInvitationLink(row.invitation.invitationLink, row.displayName).then(setFeedback)
                      }
                    >
                      Copiar enlace
                    </Button>
                  ) : null}
                  {whatsapp ? (
                    <Button
                      component="a"
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="contained"
                      startIcon={<WhatsApp />}
                      sx={{ minHeight: 44 }}
                    >
                      Enviar por WhatsApp
                    </Button>
                  ) : null}
                  {invitationShareable ? (
                    <Button
                      component="a"
                      href={row.invitation.invitationLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      startIcon={<OpenInNewRounded />}
                      sx={{ minHeight: 44 }}
                    >
                      Abrir invitación
                    </Button>
                  ) : null}
                </Stack>
              </Box>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}

export function buildWhatsAppUrl(phone: string, eventName: string, invitationLink: string): string | null {
  const digits = phone.replace(/\D/gu, '');
  if (!digits) return null;
  const message = `Hola, te comparto la invitación para ${eventName}:\n${invitationLink}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildRows(contacts: Contact[], invitations: Invitation[]): DistributionRow[] {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  return invitations.map((invitation) => {
    const contact = contactsById.get(invitation.contactId) ?? null;
    return {
      invitation,
      displayName: contact?.name ?? invitation.contactName ?? 'Contacto sin nombre',
      phone: contact?.whatsappPhone ?? null
    };
  });
}

function filterRows(rows: DistributionRow[], search: string, filter: DistributionFilter): DistributionRow[] {
  const normalizedSearch = normalize(search);
  return rows.filter((row) => {
    if (filter !== 'ALL') {
      const state = row.invitation.cancelledAt ? 'CANCELLED' : row.invitation.responseStatus;
      if (state !== filter) return false;
    }
    if (!normalizedSearch) return true;
    return normalize(`${row.displayName} ${row.phone ?? ''}`).includes(normalizedSearch);
  });
}

function invitationSummary(rows: DistributionRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (!row.invitation.cancelledAt && row.invitation.responseStatus === 'CONFIRMED') summary.confirmed += 1;
      if (!row.invitation.cancelledAt && row.invitation.responseStatus === 'PENDING') summary.pending += 1;
      return summary;
    },
    { total: 0, confirmed: 0, pending: 0 }
  );
}

function invitationStatus(invitation: Invitation): {
  label: string;
  color: 'default' | 'success' | 'warning' | 'error';
} {
  if (invitation.cancelledAt) return { label: 'Cancelada', color: 'warning' };
  if (invitation.responseStatus === 'CONFIRMED') return { label: 'Confirmada', color: 'success' };
  if (invitation.responseStatus === 'REJECTED') return { label: 'No asistirá', color: 'error' };
  return { label: 'Sin respuesta', color: 'default' };
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-MX');
}

async function copyInvitationLink(invitationLink: string, displayName: string): Promise<CopyFeedback> {
  try {
    await copyText(invitationLink);
    return { severity: 'success', message: `Enlace de ${displayName} copiado.` };
  } catch {
    return {
      severity: 'error',
      message: 'No pudimos copiar el enlace. Abre la invitación y cópialo manualmente.'
    };
  }
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('COPY_FAILED');
}
