import type { UpdateEventInput } from '@invitaciones/api-client';
import { Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';

export function ConfirmationStep({
  draft,
  disabled,
  onChange
}: {
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
}) {
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Confirmación de asistencia
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.confirmationEnabled}
            disabled={disabled}
            onChange={(event) => onChange({ confirmationEnabled: event.target.checked })}
          />
        }
        label="Permitir confirmaciones"
      />
      <Typography color="text.secondary">
        El backend conserva la autoridad sobre cierre, cupo y asistentes nominales.
      </Typography>
    </Stack>
  );
}
