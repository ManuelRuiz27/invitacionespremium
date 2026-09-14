import type { ApiClient, Event } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { ErrorState, LoadingState } from '@invitaciones/ui';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, operationReference } from '../shared/client-utils';
import { formatEventDate } from '../shared/formatters';
import { useSessionExpiry } from '../shared/use-session-expiry';

export type InvitationSummary = {
  total: number;
  pending: number;
  confirmed: number;
  rejected: number;
  cancelled: number;
};

export function EventConfirmationSummary({
  apiClient,
  event,
  summary
}: {
  apiClient: ApiClient;
  event: Event;
  summary: InvitationSummary;
}) {
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; message: string }>();
  const [busy, setBusy] = useState(false);
  const confirmationQuery = useQuery({
    queryKey: ['events', event.id, 'confirmation'],
    queryFn: ({ signal }) => apiClient.eventConfirmation.get(event.id, signal),
    staleTime: 0
  });

  useSessionExpiry(confirmationQuery.error, `/eventos/${event.id}?seccion=invitaciones`);

  if (confirmationQuery.isPending) return <LoadingState label="Cargando estado de confirmaciones…" />;
  if (confirmationQuery.error) {
    if (confirmationQuery.error instanceof ApiError && confirmationQuery.error.status === 401) {
      return <LoadingState label="Redirigiendo…" />;
    }
    return (
      <ErrorState
        title="No pudimos cargar el estado de confirmaciones."
        message="La lista de invitaciones sigue disponible. Reintenta para consultar y operar las confirmaciones."
        {...(confirmationQuery.error instanceof ApiError && confirmationQuery.error.operationId
          ? { operationId: confirmationQuery.error.operationId }
          : {})}
        onRetry={() => void confirmationQuery.refetch()}
      />
    );
  }

  const confirmation = confirmationQuery.data;

  const changeConfirmation = async (action: 'close' | 'reopen') => {
    setBusy(true);
    setFeedback(undefined);
    try {
      if (action === 'close') await apiClient.eventConfirmation.close(event.id);
      else await apiClient.eventConfirmation.reopen(event.id);
      await confirmationQuery.refetch();
      setFeedback({
        severity: 'success',
        message: action === 'close' ? 'Las confirmaciones quedaron cerradas.' : 'Las confirmaciones quedaron abiertas.'
      });
    } catch (error) {
      await confirmationQuery.refetch();
      const reference = operationReference(error);
      setFeedback({
        severity: 'error',
        message: `${errorMessage(error)}${reference ? ` ${reference}` : ''}`
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      component="section"
      aria-labelledby="confirmation-summary-title"
      sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}
    >
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography id="confirmation-summary-title" component="h3" variant="h6">
              Confirmaciones
            </Typography>
            <Chip
              size="small"
              color={confirmation.enabled && confirmation.open ? 'success' : 'default'}
              label={!confirmation.enabled ? 'Deshabilitadas' : confirmation.open ? 'Abiertas' : 'Cerradas'}
            />
          </Stack>
          {confirmation.enabled ? (
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => void changeConfirmation(confirmation.open ? 'close' : 'reopen')}
            >
              {confirmation.open ? 'Cerrar confirmaciones' : 'Reabrir confirmaciones'}
            </Button>
          ) : null}
        </Stack>

        {!confirmation.enabled ? (
          <Alert severity="info">
            La preparación técnica de este evento tiene las confirmaciones deshabilitadas. Contacta a
            InvitacionesPremium si deben habilitarse.
          </Alert>
        ) : !confirmation.open && confirmation.closedAt ? (
          <Typography variant="body2" color="text.secondary">
            Cerradas el {formatEventDate(confirmation.closedAt, event.timeZone, true)}.
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Los invitados todavía pueden responder desde su invitación.
          </Typography>
        )}

        {feedback ? (
          <Alert severity={feedback.severity} aria-live="polite" onClose={() => setFeedback(undefined)}>
            {feedback.message}
          </Alert>
        ) : null}

        <Box
          aria-label="Resumen RSVP"
          sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }, gap: 1.5 }}
        >
          {[
            ['Total', summary.total],
            ['Pendientes', summary.pending],
            ['Confirmadas', summary.confirmed],
            ['Rechazadas', summary.rejected],
            ['Canceladas', summary.cancelled]
          ].map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography sx={{ fontWeight: 750 }}>{value}</Typography>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
