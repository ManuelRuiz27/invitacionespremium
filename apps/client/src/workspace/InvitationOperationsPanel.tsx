import type { ApiClient, Assistant, Contact, Event, Invitation } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { ErrorState, LoadingState } from '@invitaciones/ui';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import WhatsApp from '@mui/icons-material/WhatsApp';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage, operationReference } from '../shared/client-utils';
import { useSessionExpiry } from '../shared/use-session-expiry';

type DistributionFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
type Feedback = { severity: 'success' | 'error'; message: string };
type InvitationMode = Invitation['mode'];

type InvitationRow = {
  invitation: Invitation;
  displayName: string;
  phone: string | null;
};

type RunMutation = (identity: string, action: () => Promise<unknown>, successMessage: string) => Promise<boolean>;

const preparationStatuses = new Set<Event['status']>(['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE']);

const filters: Array<{ value: DistributionFilter; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PENDING', label: 'Sin respuesta' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'REJECTED', label: 'No asistirán' },
  { value: 'CANCELLED', label: 'Canceladas' }
];

const modeLabels: Record<InvitationMode, string> = {
  INDIVIDUAL: 'Individual',
  FAMILY_NOMINAL: 'Familia nominal'
};

export function InvitationOperationsPanel({ apiClient, event }: { apiClient: ApiClient; event: Event }) {
  const returnTo = `/eventos/${event.id}?seccion=invitaciones`;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DistributionFilter>('ALL');
  const [feedback, setFeedback] = useState<Feedback>();
  const [busyIdentity, setBusyIdentity] = useState<string>();

  const contactsQuery = useQuery({
    queryKey: ['events', event.id, 'invitation-operations', 'contacts'],
    queryFn: ({ signal }) => apiClient.contacts.list(event.id, undefined, signal),
    staleTime: 0
  });
  const invitationsQuery = useQuery({
    queryKey: ['events', event.id, 'invitation-operations', 'invitations'],
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
  const canManageNominal = preparationStatuses.has(event.status);
  const canShare = event.status === 'ACTIVE' || event.status === 'EVENT_DAY';

  const runMutation: RunMutation = async (identity, action, successMessage) => {
    setBusyIdentity(identity);
    setFeedback(undefined);
    try {
      await action();
      await invitationsQuery.refetch();
      setFeedback({ severity: 'success', message: successMessage });
      return true;
    } catch (error) {
      await invitationsQuery.refetch();
      const reference = operationReference(error);
      setFeedback({
        severity: 'error',
        message: `${errorMessage(error)}${reference ? ` ${reference}` : ''}`
      });
      return false;
    } finally {
      setBusyIdentity(undefined);
    }
  };

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
    return (
      <Alert severity="info">
        Este evento todavía no tiene invitaciones. Cada invitado agregado en Invitados recibe automáticamente una
        invitación individual.
      </Alert>
    );
  }

  return (
    <Stack spacing={2.5} data-testid="invitation-operations-panel">
      {canManageNominal ? (
        <Alert severity="info">
          Cada invitado ya tiene una invitación individual y una persona titular. Convierte una invitación en familia
          nominal cuando necesites agregar acompañantes por nombre.
        </Alert>
      ) : canShare ? (
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
          {visibleRows.map((row) => (
            <InvitationOperationRow
              key={row.invitation.id}
              apiClient={apiClient}
              event={event}
              row={row}
              canManageNominal={canManageNominal}
              canShare={canShare}
              busyIdentity={busyIdentity}
              runMutation={runMutation}
              onFeedback={setFeedback}
            />
          ))}
        </Box>
      )}
    </Stack>
  );
}

function InvitationOperationRow({
  apiClient,
  event,
  row,
  canManageNominal,
  canShare,
  busyIdentity,
  runMutation,
  onFeedback
}: {
  apiClient: ApiClient;
  event: Event;
  row: InvitationRow;
  canManageNominal: boolean;
  canShare: boolean;
  busyIdentity: string | undefined;
  runMutation: RunMutation;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { invitation } = row;
  const status = invitationStatus(invitation);
  const invitationShareable = canShare && !invitation.cancelledAt;
  const whatsapp =
    invitationShareable && row.phone
      ? buildWhatsAppUrl(row.phone, event.name ?? 'el evento', invitation.invitationLink)
      : null;
  const nominalEditable = canManageNominal && !invitation.cancelledAt;

  return (
    <Box component="li" sx={{ py: 2.5, borderBottom: 1, borderColor: 'divider' }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
        >
          <Stack spacing={0.75} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{row.displayName}</Typography>
              <Chip size="small" label={status.label} color={status.color} variant="outlined" />
              {!nominalEditable ? <Chip size="small" label={modeLabels[invitation.mode]} variant="outlined" /> : null}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {row.phone ?? 'WhatsApp no disponible'} ·{' '}
              {invitation.assistants.length === 1
                ? '1 persona en la invitación'
                : `${invitation.assistants.length} personas en la invitación`}
            </Typography>
            {invitation.cancelledAt ? (
              <Typography variant="body2" color="text.secondary">
                Esta invitación fue cancelada por el organizador.
              </Typography>
            ) : null}
          </Stack>

          {invitationShareable ? (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'center' }, justifyContent: { md: 'flex-end' } }}
            >
              <Button
                variant="outlined"
                startIcon={<ContentCopyRounded />}
                sx={{ minHeight: 44 }}
                onClick={() => void copyInvitationLink(invitation.invitationLink, row.displayName).then(onFeedback)}
              >
                Copiar enlace
              </Button>
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
              <Button
                component="a"
                href={invitation.invitationLink}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<OpenInNewRounded />}
                sx={{ minHeight: 44 }}
              >
                Abrir invitación
              </Button>
            </Stack>
          ) : null}
        </Stack>

        {nominalEditable ? (
          <NominalInvitationEditor
            apiClient={apiClient}
            eventId={event.id}
            invitation={invitation}
            displayName={row.displayName}
            busyIdentity={busyIdentity}
            runMutation={runMutation}
            onFeedback={onFeedback}
          />
        ) : (
          <ReadOnlyAssistants invitation={invitation} />
        )}
      </Stack>
    </Box>
  );
}

function NominalInvitationEditor({
  apiClient,
  eventId,
  invitation,
  displayName,
  busyIdentity,
  runMutation,
  onFeedback
}: {
  apiClient: ApiClient;
  eventId: string;
  invitation: Invitation;
  displayName: string;
  busyIdentity: string | undefined;
  runMutation: RunMutation;
  onFeedback: (feedback: Feedback) => void;
}) {
  const additionalAssistants = invitation.assistants.filter((assistant) => !assistant.isPrimary);
  const [limitDraft, setLimitDraft] = useState(String(invitation.additionalAssistantLimit));
  const [newAssistantName, setNewAssistantName] = useState('');
  const [editingAssistantId, setEditingAssistantId] = useState<string>();
  const [editingName, setEditingName] = useState('');
  const busy = busyIdentity?.startsWith(`${invitation.id}:`) ?? false;

  useEffect(() => {
    setLimitDraft(String(invitation.additionalAssistantLimit));
  }, [invitation.additionalAssistantLimit]);

  const changeMode = async (mode: InvitationMode) => {
    if (mode === invitation.mode) return;
    if (mode === 'INDIVIDUAL' && additionalAssistants.length > 0) {
      onFeedback({
        severity: 'error',
        message: 'Elimina primero los acompañantes adicionales para convertir esta invitación en individual.'
      });
      return;
    }
    const body = mode === 'INDIVIDUAL' ? { mode, additionalAssistantLimit: 0 } : { mode };
    await runMutation(
      `${invitation.id}:mode`,
      () => apiClient.invitations.update(eventId, invitation.id, body),
      `La invitación de ${displayName} ahora es ${modeLabels[mode].toLocaleLowerCase('es-MX')}.`
    );
  };

  const saveLimit = async () => {
    const nextLimit = Number(limitDraft);
    if (!Number.isInteger(nextLimit) || nextLimit < 0 || nextLimit > 149) {
      onFeedback({ severity: 'error', message: 'El límite debe ser un número entero entre 0 y 149.' });
      setLimitDraft(String(invitation.additionalAssistantLimit));
      return;
    }
    const updated = await runMutation(
      `${invitation.id}:limit`,
      () => apiClient.invitations.update(eventId, invitation.id, { additionalAssistantLimit: nextLimit }),
      `Límite de acompañantes de ${displayName} actualizado.`
    );
    if (!updated) setLimitDraft(String(invitation.additionalAssistantLimit));
  };

  const createAssistant = async () => {
    const name = normalizeName(newAssistantName);
    if (!name) {
      onFeedback({ severity: 'error', message: 'Escribe el nombre del acompañante.' });
      return;
    }
    const created = await runMutation(
      `${invitation.id}:create`,
      () => apiClient.invitations.addAssistant(eventId, invitation.id, { name }),
      `${name} se agregó a la invitación de ${displayName}.`
    );
    if (created) setNewAssistantName('');
  };

  const saveAssistant = async (assistant: Assistant) => {
    const name = normalizeName(editingName);
    if (!name) {
      onFeedback({ severity: 'error', message: 'Escribe el nombre del acompañante.' });
      return;
    }
    const updated = await runMutation(
      `${invitation.id}:update:${assistant.id}`,
      () => apiClient.invitations.updateAssistant(eventId, invitation.id, assistant.id, { name }),
      `El nombre del acompañante se actualizó a ${name}.`
    );
    if (updated) {
      setEditingAssistantId(undefined);
      setEditingName('');
    } else {
      setEditingName(assistant.name ?? '');
    }
  };

  const removeAssistant = async (assistant: Assistant) => {
    await runMutation(
      `${invitation.id}:delete:${assistant.id}`,
      () => apiClient.invitations.removeAssistant(eventId, invitation.id, assistant.id),
      `${assistant.name ?? 'El acompañante'} se eliminó de la invitación de ${displayName}.`
    );
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-end' } }}>
          <TextField
            select
            label={`Tipo de invitación de ${displayName}`}
            value={invitation.mode}
            onChange={(modeEvent) => void changeMode(modeEvent.target.value as InvitationMode)}
            size="small"
            disabled={busy}
            sx={{ minWidth: { sm: 220 } }}
          >
            <MenuItem value="INDIVIDUAL">Individual</MenuItem>
            <MenuItem value="FAMILY_NOMINAL">Familia nominal</MenuItem>
          </TextField>

          {invitation.mode === 'FAMILY_NOMINAL' ? (
            <>
              <TextField
                type="number"
                label={`Límite de acompañantes de ${displayName}`}
                value={limitDraft}
                onChange={(limitEvent) => setLimitDraft(limitEvent.target.value)}
                size="small"
                disabled={busy}
                slotProps={{ htmlInput: { min: 0, max: 149, step: 1 } }}
                sx={{ minWidth: { sm: 220 } }}
              />
              <Button
                variant="outlined"
                onClick={() => void saveLimit()}
                disabled={busy || limitDraft === String(invitation.additionalAssistantLimit)}
                sx={{ minHeight: 40 }}
              >
                Guardar límite
              </Button>
            </>
          ) : null}
        </Stack>

        <Stack spacing={1}>
          <Typography variant="subtitle2">Personas nominales</Typography>
          {invitation.assistants.map((assistant) =>
            assistant.isPrimary ? (
              <AssistantName key={assistant.id} assistant={assistant} primary />
            ) : editingAssistantId === assistant.id ? (
              <Stack
                key={assistant.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ alignItems: { sm: 'center' } }}
              >
                <TextField
                  label={`Nombre del acompañante de ${displayName}`}
                  value={editingName}
                  onChange={(nameEvent) => setEditingName(nameEvent.target.value)}
                  size="small"
                  disabled={busy}
                  sx={{ flex: 1 }}
                />
                <Button onClick={() => void saveAssistant(assistant)} disabled={busy}>
                  Guardar
                </Button>
                <Button
                  onClick={() => {
                    setEditingAssistantId(undefined);
                    setEditingName('');
                  }}
                  disabled={busy}
                >
                  Cancelar
                </Button>
              </Stack>
            ) : (
              <Stack
                key={assistant.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
              >
                <AssistantName assistant={assistant} />
                <Stack direction="row" spacing={0.5}>
                  <Button
                    size="small"
                    aria-label={`Editar acompañante ${assistant.name ?? ''}`}
                    onClick={() => {
                      setEditingAssistantId(assistant.id);
                      setEditingName(assistant.name ?? '');
                    }}
                    disabled={busy}
                  >
                    Editar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    aria-label={`Eliminar acompañante ${assistant.name ?? ''}`}
                    onClick={() => void removeAssistant(assistant)}
                    disabled={busy}
                  >
                    Eliminar
                  </Button>
                </Stack>
              </Stack>
            )
          )}
        </Stack>

        {invitation.mode === 'FAMILY_NOMINAL' ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-end' } }}>
            <TextField
              label={`Nuevo acompañante de ${displayName}`}
              value={newAssistantName}
              onChange={(nameEvent) => setNewAssistantName(nameEvent.target.value)}
              size="small"
              disabled={busy || additionalAssistants.length >= invitation.additionalAssistantLimit}
              helperText={`${additionalAssistants.length} de ${invitation.additionalAssistantLimit} acompañantes adicionales`}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              onClick={() => void createAssistant()}
              disabled={busy || additionalAssistants.length >= invitation.additionalAssistantLimit}
              sx={{ minHeight: 40 }}
            >
              Agregar acompañante
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}

function ReadOnlyAssistants({ invitation }: { invitation: Invitation }) {
  return (
    <Stack spacing={0.75} aria-label="Personas nominales">
      {invitation.assistants.map((assistant) => (
        <AssistantName key={assistant.id} assistant={assistant} primary={assistant.isPrimary} />
      ))}
    </Stack>
  );
}

function AssistantName({ assistant, primary = false }: { assistant: Assistant; primary?: boolean }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {assistant.name ?? 'Nombre no disponible'}
      </Typography>
      {primary ? <Chip size="small" label="Titular" /> : <Chip size="small" label="Acompañante" variant="outlined" />}
    </Stack>
  );
}

export function buildWhatsAppUrl(phone: string, eventName: string, invitationLink: string): string | null {
  const digits = phone.replace(/\D/gu, '');
  if (!digits) return null;
  const message = `Hola, te comparto la invitación para ${eventName}:\n${invitationLink}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildRows(contacts: Contact[], invitations: Invitation[]): InvitationRow[] {
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

function filterRows(rows: InvitationRow[], search: string, filter: DistributionFilter): InvitationRow[] {
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

function invitationSummary(rows: InvitationRow[]) {
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

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

async function copyInvitationLink(invitationLink: string, displayName: string): Promise<Feedback> {
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
