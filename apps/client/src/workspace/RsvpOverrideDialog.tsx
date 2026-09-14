import type { Invitation, RsvpAssistantInput, RsvpOverrideInput } from '@invitaciones/api-client';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { AssistantsEditor } from '../shared/AssistantsEditor';

export function RsvpOverrideDialog({
  invitation,
  displayName,
  open,
  busy,
  onClose,
  onSubmit
}: {
  invitation: Invitation;
  displayName: string;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: RsvpOverrideInput) => Promise<boolean>;
}) {
  const [assistants, setAssistants] = useState<RsvpAssistantInput[]>(() => additionalAssistants(invitation));
  const primary = invitation.assistants.find((assistant) => assistant.isPrimary);

  useEffect(() => {
    if (open) setAssistants(additionalAssistants(invitation));
  }, [invitation, open]);

  const submit = async (input: RsvpOverrideInput) => {
    const saved = await onSubmit(input);
    if (!saved) setAssistants(additionalAssistants(invitation));
    onClose();
  };

  const confirmedAssistants = assistants.map((assistant) => ({
    ...(assistant.id ? { id: assistant.id } : {}),
    name: assistant.name.trim()
  }));
  const confirmationInvalid =
    confirmedAssistants.some((assistant) => !assistant.name) ||
    confirmedAssistants.length > invitation.additionalAssistantLimit;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Corregir confirmación de {displayName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Guarda la lista completa que debe quedar confirmada. El titular se corrige desde Invitados.
          </Alert>
          <AssistantsEditor
            primaryName={primary?.name ?? displayName}
            assistants={assistants}
            limit={invitation.additionalAssistantLimit}
            disabled={busy}
            onChange={setAssistants}
          />
          <Typography variant="body2" color="text.secondary">
            {assistants.length} de {invitation.additionalAssistantLimit} acompañantes adicionales
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap' }}>
        <Button disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          color="error"
          disabled={busy}
          onClick={() => void submit({ responseStatus: 'REJECTED', additionalAssistants: [] })}
        >
          Marcar rechazada
        </Button>
        <Button
          variant="contained"
          disabled={busy || confirmationInvalid}
          onClick={() => void submit({ responseStatus: 'CONFIRMED', additionalAssistants: confirmedAssistants })}
        >
          Guardar confirmación
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function additionalAssistants(invitation: Invitation): RsvpAssistantInput[] {
  return invitation.assistants
    .filter((assistant) => !assistant.isPrimary)
    .map((assistant) => ({ id: assistant.id, name: assistant.name ?? '' }));
}
