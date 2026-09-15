import type { ApiClient, Event } from '@invitaciones/api-client';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { AttemptManager, isUncertainFailure } from '../shared/attempt-manager';
import { errorMessage, operationReference } from '../shared/client-utils';

type Feedback = { message: string; reference?: string };

export function ManagedEventCloseAction({
  apiClient,
  event,
  onClosed,
  onReconcile
}: {
  apiClient: ApiClient;
  event: Event;
  onClosed: (event: Event) => Promise<void>;
  onReconcile: () => Promise<Event | undefined>;
}) {
  const attempts = useRef(new AttemptManager());
  const busyRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  const closeEvent = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(undefined);
    const attempt = attempts.current.start('close-event', event.id);

    try {
      const closed = await apiClient.events.close(event.id, attempt.key);
      attempts.current.clear('close-event', attempt.key);
      await onClosed(closed);
    } catch (reason) {
      if (isUncertainFailure(reason)) {
        const latest = await onReconcile().catch(() => undefined);
        if (latest?.status === 'CLOSED') {
          attempts.current.clear('close-event', attempt.key);
          return;
        }
        setFeedback({
          message: 'No pudimos confirmar el cierre. Revisa tu conexión e inténtalo nuevamente.'
        });
      } else {
        attempts.current.clear('close-event', attempt.key);
        const reference = operationReference(reason);
        setFeedback({ message: errorMessage(reason), ...(reference ? { reference } : {}) });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button color="error" variant="outlined" onClick={() => setDialogOpen(true)}>
        Cerrar evento
      </Button>
      <Dialog
        open={dialogOpen}
        onClose={busy ? undefined : () => setDialogOpen(false)}
        aria-labelledby="close-event-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="close-event-title">Cerrar evento</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">Esta acción finaliza la operación del evento.</Alert>
            <Typography>Al cerrar:</Typography>
            <BoxedConsequences />
            {feedback ? (
              <Alert severity="error" aria-live="polite">
                {feedback.message} {feedback.reference}
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button disabled={busy} onClick={() => setDialogOpen(false)}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void closeEvent()}>
            Cerrar evento
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function BoxedConsequences() {
  return (
    <Stack component="ul" spacing={0.75} sx={{ my: 0, pl: 3 }}>
      <Typography component="li">Termina la operación del Evento.</Typography>
      <Typography component="li">El Staff deja de operar.</Typography>
      <Typography component="li">Los invitados ya no pueden responder.</Typography>
      <Typography component="li">El Evento queda disponible para consulta.</Typography>
    </Stack>
  );
}
