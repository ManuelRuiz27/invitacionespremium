import { Button, Paper, Stack, Typography } from '@mui/material';

export function AdminFloorplanTraceSession({
  tableName,
  count,
  busy,
  onFinish
}: {
  tableName: string;
  count: number;
  busy: boolean;
  onFinish: () => void;
}) {
  return (
    <Paper component="section" aria-label="Trazado de lugares" variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography component="h3" variant="subtitle1">
          Trazando lugares · {tableName}
        </Typography>
        <Typography role="status">
          {count} lugares confirmados{busy ? ' · Confirmando punto…' : ''}
        </Typography>
        <Button variant="contained" onClick={onFinish} sx={{ ml: 'auto', minHeight: 44 }}>
          Terminar mesa
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {busy
          ? 'Espera la confirmación antes del siguiente punto.'
          : 'Toca cada lugar del plano. Usa zoom o mover plano para ajustar la vista; termina esta mesa antes de cambiar de herramienta.'}
      </Typography>
    </Paper>
  );
}
