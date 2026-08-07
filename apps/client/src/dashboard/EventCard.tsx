import type { Event } from '@invitaciones/api-client';
import { StatusChip } from '@invitaciones/ui';
import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { getEventStatusPresentation } from '../shared/event-status';
import { formatEventDate, socialTypeLabels } from '../shared/formatters';
import { Link } from 'react-router-dom';

export function EventCard({ event, onView }: { event: Event; onView: (event: Event) => void }) {
  const presentation = getEventStatusPresentation(event.status);
  return (
    <Box component="article" sx={{ py: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, alignItems: 'flex-start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" variant="h4">
            {event.name ?? 'Evento sin nombre'}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            {event.socialType ? socialTypeLabels[event.socialType] : 'Tipo de evento pendiente'}
          </Typography>
        </Box>
        <StatusChip label={presentation.label} tone={presentation.tone} />
      </Stack>
      <Box
        component="dl"
        sx={{
          my: 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1.5,
          '& dt': { color: 'text.secondary', fontSize: '0.75rem' },
          '& dd': { m: 0, fontWeight: 600 }
        }}
      >
        <Box>
          <dt>Fecha</dt>
          <dd>{formatEventDate(event.eventDateTime, event.timeZone)}</dd>
        </Box>
        <Box>
          <dt>Capacidad</dt>
          <dd>{event.capacity ?? 'Pendiente'}</dd>
        </Box>
      </Box>
      {['DRAFT', 'CONFIGURED'].includes(event.status) ? (
        <Button component={Link} to={`/eventos/${event.id}/configuracion/datos`} variant="text">
          Continuar configuración
        </Button>
      ) : event.status === 'READY_TO_ACTIVATE' ? (
        <Button component={Link} to={`/eventos/${event.id}/configuracion/revision`} variant="text">
          Activar evento
        </Button>
      ) : (
        <Button variant="text" onClick={() => onView(event)}>
          Ver evento
        </Button>
      )}
      <Divider sx={{ mt: 2.5 }} />
    </Box>
  );
}
