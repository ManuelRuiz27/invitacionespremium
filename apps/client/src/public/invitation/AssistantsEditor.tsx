import type { PublicRsvpAssistantInput } from '@invitaciones/api-client';
import { Button, Stack, TextField, Typography } from '@mui/material';

export function AssistantsEditor({
  primaryName,
  assistants,
  limit,
  disabled,
  onChange
}: {
  primaryName: string;
  assistants: PublicRsvpAssistantInput[];
  limit: number;
  disabled?: boolean;
  onChange: (value: PublicRsvpAssistantInput[]) => void;
}) {
  return (
    <Stack spacing={2}>
      <TextField
        label="Invitado principal"
        value={primaryName}
        disabled
        fullWidth
        helperText="El invitado principal no puede modificarse."
      />
      {assistants.map((assistant, index) => (
        <Stack key={assistant.id ?? `new-${index}`} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            label={`Acompañante ${index + 1}`}
            value={assistant.name}
            required
            disabled={disabled}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 120 } }}
            onChange={(event) =>
              onChange(
                assistants.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, name: event.target.value } : item
                )
              )
            }
          />
          <Button
            color="inherit"
            disabled={disabled}
            onClick={() => onChange(assistants.filter((_, itemIndex) => itemIndex !== index))}
          >
            Retirar
          </Button>
        </Stack>
      ))}
      {assistants.length < limit ? (
        <Button disabled={disabled} variant="outlined" onClick={() => onChange([...assistants, { name: '' }])}>
          Agregar acompañante
        </Button>
      ) : (
        <Typography color="text.secondary" variant="body2">
          Máximo de acompañantes alcanzado.
        </Typography>
      )}
    </Stack>
  );
}
