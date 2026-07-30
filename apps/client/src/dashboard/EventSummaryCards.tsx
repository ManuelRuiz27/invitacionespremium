import type { Event } from '@invitaciones/api-client';
import { MetricCard } from '@invitaciones/ui';
import { Box } from '@mui/material';
import { getEventStatusPresentation } from '../shared/event-status';

export function EventSummaryCards({ events }: { events: Event[] }) {
  const counts = events.reduce(
    (result, event) => {
      const group = getEventStatusPresentation(event.status).group;
      result[group] += 1;
      return result;
    },
    { preparation: 0, active: 0, finished: 0, cancelled: 0 }
  );

  return (
    <Box
      aria-label="Resumen de Eventos"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
        gap: { xs: 2, md: 4 },
        mb: 5
      }}
    >
      <MetricCard label="Total de eventos" value={events.length} />
      <MetricCard label="En preparación" value={counts.preparation} />
      <MetricCard label="Activos" value={counts.active} />
      <MetricCard label="Finalizados" value={counts.finished} />
    </Box>
  );
}
