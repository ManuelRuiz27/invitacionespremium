import { useEffect, useState } from 'react';
import type { PublicInvitationView, PublicRsvpAssistantInput } from '@invitaciones/api-client';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { additionalAssistants } from './invitation-state';
import { AssistantsEditor } from './AssistantsEditor';

export function RsvpDialog({
  open,
  view,
  busy,
  error,
  onClose,
  onConfirm,
  onReject
}: {
  open: boolean;
  view: PublicInvitationView;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (assistants: PublicRsvpAssistantInput[]) => void;
  onReject: () => void;
}) {
  const [assistants, setAssistants] = useState<PublicRsvpAssistantInput[]>([]);
  const [confirmReject, setConfirmReject] = useState(false);
  const primary = view.assistants?.find((assistant) => assistant.isPrimary);
  const invitation = view.invitation;
  useEffect(() => {
    if (open) {
      setAssistants(additionalAssistants(view));
      setConfirmReject(false);
    }
  }, [open, view]);
  if (!invitation || !primary) return null;
  const invalid =
    assistants.some((assistant) => !assistant.name.trim()) || assistants.length > invitation.additionalAssistantLimit;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="rsvp-title">
      <DialogTitle id="rsvp-title">Confirmación de asistencia</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>
            Confirma quiénes asistirán. Los nombres pueden modificarse mientras la confirmación permanezca abierta.
          </Typography>
          <AssistantsEditor
            primaryName={primary.name}
            assistants={assistants}
            limit={invitation.additionalAssistantLimit}
            disabled={busy}
            onChange={setAssistants}
          />
          {error ? (
            <Alert severity="error" aria-live="assertive">
              {error}
            </Alert>
          ) : null}
          {confirmReject ? (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" disabled={busy} onClick={onReject}>
                  Sí, rechazar
                </Button>
              }
            >
              ¿Confirmas que no asistirás? Los nombres se conservarán.
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={busy}>
          Cerrar
        </Button>
        <Button color="inherit" onClick={() => setConfirmReject(true)} disabled={busy}>
          No asistiré
        </Button>
        <Button
          variant="contained"
          onClick={() => onConfirm(assistants.map((item) => ({ ...item, name: item.name.trim() })))}
          disabled={busy || invalid}
        >
          {invitation.responseStatus === 'CONFIRMED' ? 'Guardar cambios' : 'Confirmar asistencia'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
