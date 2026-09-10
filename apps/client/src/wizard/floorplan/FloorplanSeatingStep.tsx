import type { ApiClient, Event } from '@invitaciones/api-client';
import { Alert, Stack, Typography } from '@mui/material';
import { SeatingWorkspace } from '../../workspace/SeatingWorkspace';

export function FloorplanSeatingStep({ apiClient, event }: { apiClient: ApiClient; event: Event }) {
  return (
    <Stack component="section" spacing={2} aria-labelledby="floorplan-seating-title">
      <Stack spacing={0.5}>
        <Typography component="h2" variant="h4" id="floorplan-seating-title">
          Mesas y distribución
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Consulta el plano y las Mesas preparadas para organizar a las personas de este Evento.
        </Typography>
      </Stack>
      {event.floorplanEnabled ? (
        <SeatingWorkspace apiClient={apiClient} event={event} />
      ) : (
        <Alert severity="info">
          Este Evento todavía no usa distribución de Mesas. El equipo de InvitacionesPremium puede preparar el plano y
          sus capacidades antes de organizar personas o generar pases por Mesa.
        </Alert>
      )}
    </Stack>
  );
}
