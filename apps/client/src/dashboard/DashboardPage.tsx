import type { ApiClient } from '@invitaciones/api-client';
import { ErrorState, LoadingState, PageHeader } from '@invitaciones/ui';
import { useQuery } from '@tanstack/react-query';
import { toDisplayError } from '../shared/error-message';
import { useSessionExpiry } from '../shared/use-session-expiry';
import { EventSummaryCards } from './EventSummaryCards';
import { EventsList } from './EventsList';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';

export function DashboardPage({ apiClient }: { apiClient: ApiClient }) {
  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: ({ signal }) => apiClient.events.list(signal)
  });
  useSessionExpiry(eventsQuery.error, '/eventos');

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Consulta el estado y los datos principales de tus Eventos autorizados."
        action={
          <Button component={Link} to="/eventos/nuevo" variant="contained">
            Crear Evento
          </Button>
        }
      />
      {eventsQuery.isPending ? <LoadingState label="Cargando Eventos…" /> : null}
      {eventsQuery.isError ? (
        <ErrorState {...toDisplayError(eventsQuery.error)} onRetry={() => void eventsQuery.refetch()} />
      ) : null}
      {eventsQuery.data ? (
        <>
          <EventSummaryCards events={eventsQuery.data} />
          <EventsList events={eventsQuery.data} />
        </>
      ) : null}
    </>
  );
}
