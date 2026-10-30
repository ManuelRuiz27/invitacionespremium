import type { AdminFloorplan } from '@invitaciones/api-client';
import { Button, Chip, Paper, Stack, Typography } from '@mui/material';

const countLabel = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function AdminFloorplanTraceReview({
  floorplan,
  disabled,
  onBack,
  onFinalize
}: {
  floorplan: AdminFloorplan;
  disabled: boolean;
  onBack: () => void;
  onFinalize: () => void;
}) {
  const tables = floorplan.shapes.filter((shape) => shape.kind === 'TABLE');
  const zones = floorplan.shapes.filter((shape) => shape.kind === 'DECORATIVE_ZONE');
  const exact = floorplan.seatingMode === 'SEAT';
  const blocked = floorplan.seats.filter((seat) => seat.isBlocked).length;
  return (
    <Paper
      component="section"
      aria-label="Revisión de distribución"
      variant="outlined"
      sx={{ p: 1.5, borderRadius: 2 }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography component="h3" variant="subtitle1" sx={{ mr: 'auto' }}>
            Revisar distribución
          </Typography>
          <Button disabled={disabled} onClick={onBack}>
            Volver a corregir
          </Button>
          <Button variant="contained" disabled={disabled} onClick={onFinalize}>
            Finalizar distribución
          </Button>
        </Stack>
        <Typography variant="body2">
          {countLabel(tables.length, 'mesa', 'mesas')} · {countLabel(zones.length, 'zona', 'zonas')} ·{' '}
          {exact
            ? `${countLabel(floorplan.seats.length, 'lugar definido', 'lugares definidos')} · ${countLabel(blocked, 'bloqueado', 'bloqueados')}`
            : `${tables.reduce((sum, table) => sum + table.capacity, 0)} lugares de capacidad configurada`}
        </Typography>
        <Stack
          component="ul"
          aria-label="Resumen por mesa"
          spacing={0.5}
          sx={{ m: 0, pl: 2.5, maxHeight: 100, overflow: 'auto' }}
        >
          {tables.map((table) => {
            const seats = floorplan.seats.filter((seat) => seat.floorplanShapeId === table.id);
            const warning = exact && (table.capacity === 0 || seats.length === 0);
            return (
              <Stack
                key={table.id}
                component="li"
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {table.name}:{' '}
                  {exact
                    ? `${countLabel(table.capacity, 'asignable', 'asignables')} · ${countLabel(seats.length, 'definido', 'definidos')} · ${countLabel(seats.filter((seat) => seat.isBlocked).length, 'bloqueado', 'bloqueados')}`
                    : `${table.capacity} lugares configurados`}
                </Typography>
                {warning ? (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label={seats.length === 0 ? 'Sin lugares definidos' : 'Sin lugares asignables'}
                  />
                ) : null}
              </Stack>
            );
          })}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Resumen del último plano leído. Finalizar no activa el Evento ni asigna personas; la validación existente
          determina si se puede finalizar.
        </Typography>
      </Stack>
    </Paper>
  );
}
