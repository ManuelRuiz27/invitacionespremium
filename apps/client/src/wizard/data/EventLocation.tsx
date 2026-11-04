import OpenInNew from '@mui/icons-material/OpenInNew';
import { Button, Stack, TextField } from '@mui/material';
import { pastedMapHref } from './event-link-preview';

export function EventLocation({
  value,
  href,
  error,
  disabled,
  onChange
}: {
  value: string | null | undefined;
  href: string | null;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <TextField
        size="small"
        fullWidth
        type="url"
        label="Ubicación"
        name="locationUrl"
        error={Boolean(error)}
        helperText={error ?? 'Pega el enlace del lugar del evento.'}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(pastedMapHref(e.target.value) ?? (e.target.value || null))}
        onPaste={(e) => {
          const url = pastedMapHref(e.clipboardData.getData('text'));
          if (url) {
            e.preventDefault();
            onChange(url);
          }
        }}
      />
      {href ? (
        <Button
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNew fontSize="small" />}
          sx={{ alignSelf: 'flex-start', minHeight: 44 }}
        >
          Abrir ubicación
        </Button>
      ) : null}
    </Stack>
  );
}
