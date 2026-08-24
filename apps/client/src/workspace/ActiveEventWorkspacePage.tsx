import type { ApiClient, Event, EventStatus } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { ErrorState, LoadingState, StatusChip } from '@invitaciones/ui';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { Alert, Box, Button, Link as MuiLink, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getEventStatusPresentation } from '../shared/event-status';
import { formatEventDateLong, serviceLabels, socialTypeLabels } from '../shared/formatters';
import { useSessionExpiry } from '../shared/use-session-expiry';
import { InvitationDistribution } from './InvitationDistribution';
import { SeatingWorkspace } from './SeatingWorkspace';
import { StaffAccessPanel } from './StaffAccessPanel';

const preparationDestinations: Partial<Record<EventStatus, string>> = {
  DRAFT: 'datos',
  CONFIGURED: 'datos',
  READY_TO_ACTIVATE: 'revision'
};

const workspaceStatuses = new Set<EventStatus>([
  'ACTIVE',
  'EVENT_DAY',
  'CLOSED',
  'ALBUM_PUBLISHED',
  'ARCHIVED',
  'CANCELLED'
]);

const stateMessages: Partial<Record<EventStatus, string>> = {
  ACTIVE: 'Este evento está operativo.',
  EVENT_DAY: 'Hoy es el día del evento.',
  CLOSED: 'Este evento está cerrado y disponible para consulta.',
  ALBUM_PUBLISHED: 'El álbum de este evento está publicado.',
  ARCHIVED: 'Este evento está archivado y ya no admite cambios operativos.',
  CANCELLED: 'Este evento fue cancelado.'
};

type WorkspaceSection = 'resumen' | 'invitaciones' | 'mesas' | 'staff';

export function ActiveEventWorkspacePage({
  apiClient,
  scannerAppUrl
}: {
  apiClient: ApiClient;
  scannerAppUrl?: string;
}) {
  const { eventId = '' } = useParams();
  const returnTo = `/eventos/${eventId}`;
  const eventQuery = useQuery({
    queryKey: ['events', eventId],
    queryFn: ({ signal }) => apiClient.events.get(eventId, signal),
    enabled: Boolean(eventId),
    staleTime: 0
  });
  const event = eventQuery.data;
  const workspaceAllowed = event ? workspaceStatuses.has(event.status) : false;

  useSessionExpiry(eventQuery.error, returnTo);

  if (!eventId) {
    return <WorkspaceUnavailable title="Este evento no está disponible." />;
  }

  if (eventQuery.isPending) {
    return <LoadingState label="Cargando evento…" />;
  }

  if (eventQuery.isError) {
    if (isUnauthorized(eventQuery.error)) return <LoadingState label="Redirigiendo…" />;
    if (isStatus(eventQuery.error, 403)) {
      return (
        <WorkspaceUnavailable title="Acceso no permitido" description="Tu cuenta no tiene acceso a este evento." />
      );
    }
    if (isStatus(eventQuery.error, 404)) {
      return <WorkspaceUnavailable title="Este evento no está disponible." />;
    }
    return (
      <>
        <Typography component="h1" variant="h2" sx={{ mb: 3 }}>
          Evento
        </Typography>
        <ErrorState
          title="No pudimos cargar este evento."
          message="Revisa tu conexión e inténtalo nuevamente."
          {...(eventQuery.error instanceof ApiError && eventQuery.error.operationId
            ? { operationId: eventQuery.error.operationId }
            : {})}
          onRetry={() => void eventQuery.refetch()}
        />
      </>
    );
  }

  if (!event) {
    return <WorkspaceUnavailable title="Este evento no está disponible." />;
  }

  const destination = preparationDestinations[event.status];
  if (destination) {
    return <Navigate to={`/eventos/${eventId}/configuracion/${destination}`} replace />;
  }

  if (!workspaceAllowed) {
    return <WorkspaceUnavailable title="Este evento no está disponible." />;
  }

  return (
    <EventWorkspace
      apiClient={apiClient}
      event={event}
      {...(scannerAppUrl ? { scannerAppUrl } : {})}
    />
  );
}

function EventWorkspace({
  apiClient,
  event,
  scannerAppUrl
}: {
  apiClient: ApiClient;
  event: Event;
  scannerAppUrl?: string;
}) {
  const [searchParams] = useSearchParams();
  const showInvitations = event.serviceCode === 'FLYER' || event.serviceCode === 'FLIPBOOK';
  const showSeating =
    event.floorplanEnabled &&
    (event.serviceCode === 'FLYER' || event.serviceCode === 'FLIPBOOK' || event.serviceCode === 'PHYSICAL_QR');
  const showStaff = Boolean(scannerAppUrl && (event.status === 'ACTIVE' || event.status === 'EVENT_DAY'));
  const requestedSection = searchParams.get('seccion');
  const section: WorkspaceSection =
    requestedSection === 'invitaciones' && showInvitations
      ? 'invitaciones'
      : requestedSection === 'mesas' && showSeating
        ? 'mesas'
        : requestedSection === 'staff' && showStaff
          ? 'staff'
          : 'resumen';
  const status = getEventStatusPresentation(event.status);
  const serviceLabel = event.serviceCode ? serviceLabels[event.serviceCode] : 'Servicio no disponible';
  const canShareInvitations = event.status === 'ACTIVE' || event.status === 'EVENT_DAY';
  const details = [
    ['Fecha y hora', formatEventDateLong(event.eventDateTime, event.timeZone)],
    ['Tipo de evento', event.socialType ? socialTypeLabels[event.socialType] : 'Tipo pendiente'],
    ['Servicio contratado', serviceLabel],
    ['Capacidad', event.capacity === null ? 'Capacidad pendiente' : `${event.capacity} personas`],
    ['Mesas y distribución', event.floorplanEnabled ? 'Con distribución de mesas' : 'Sin distribución de mesas']
  ];

  const navLinkSx = {
    display: 'inline-flex',
    flexShrink: 0,
    minHeight: 44,
    alignItems: 'center',
    px: 1.5,
    borderBottom: 2,
    color: 'text.primary',
    fontWeight: 700
  } as const;

  return (
    <Stack spacing={{ xs: 3, md: 4 }}>
      <Button
        component={Link}
        to="/eventos"
        startIcon={<ArrowBackRounded />}
        sx={{ alignSelf: 'flex-start', minHeight: 44 }}
      >
        Volver a eventos
      </Button>

      <Stack component="header" spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' } }}>
          <Typography component="h1" variant="h2">
            {event.name ?? 'Evento sin nombre'}
          </Typography>
          <StatusChip label={status.label} tone={status.tone} />
        </Stack>
        <Typography color="text.secondary">{formatEventDateLong(event.eventDateTime, event.timeZone)}</Typography>
      </Stack>

      <Box
        component="nav"
        aria-label="Secciones del Evento"
        sx={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: 1,
          borderColor: 'divider',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <MuiLink
          component={Link}
          to={`/eventos/${event.id}`}
          aria-current={section === 'resumen' ? 'page' : undefined}
          underline="none"
          sx={{ ...navLinkSx, px: 1, borderColor: section === 'resumen' ? 'primary.main' : 'transparent' }}
        >
          Resumen
        </MuiLink>
        {showInvitations ? (
          <MuiLink
            component={Link}
            to={`/eventos/${event.id}?seccion=invitaciones`}
            aria-current={section === 'invitaciones' ? 'page' : undefined}
            underline="none"
            sx={{ ...navLinkSx, borderColor: section === 'invitaciones' ? 'primary.main' : 'transparent' }}
          >
            Invitaciones
          </MuiLink>
        ) : null}
        {showSeating ? (
          <MuiLink
            component={Link}
            to={`/eventos/${event.id}?seccion=mesas`}
            aria-current={section === 'mesas' ? 'page' : undefined}
            underline="none"
            sx={{ ...navLinkSx, borderColor: section === 'mesas' ? 'primary.main' : 'transparent' }}
          >
            Mesas y distribución
          </MuiLink>
        ) : null}
        {showStaff ? (
          <MuiLink
            component={Link}
            to={`/eventos/${event.id}?seccion=staff`}
            aria-current={section === 'staff' ? 'page' : undefined}
            underline="none"
            sx={{ ...navLinkSx, borderColor: section === 'staff' ? 'primary.main' : 'transparent' }}
          >
            Staff
          </MuiLink>
        ) : null}
      </Box>

      {section === 'invitaciones' ? (
        <Box component="section" aria-labelledby="invitation-distribution-title">
          <Typography id="invitation-distribution-title" component="h2" variant="h3" sx={{ mb: 0.75 }}>
            {canShareInvitations ? 'Enviar invitaciones' : 'Invitaciones'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {canShareInvitations
              ? 'Comparte el enlace individual de cada invitación y consulta su respuesta.'
              : 'Consulta la respuesta final de las invitaciones de este evento.'}
          </Typography>
          <InvitationDistribution apiClient={apiClient} event={event} />
        </Box>
      ) : section === 'mesas' ? (
        <Box component="section" aria-labelledby="seating-workspace-title">
          <Typography id="seating-workspace-title" component="h2" variant="h3" sx={{ mb: 0.75 }}>
            Mesas y distribución
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Selecciona una Mesa en el Croquis para consultar su ocupación
            {event.serviceCode === 'PHYSICAL_QR' ? '.' : ' y organizar Asistentes.'}
          </Typography>
          <SeatingWorkspace apiClient={apiClient} event={event} />
        </Box>
      ) : section === 'staff' && scannerAppUrl ? (
        <StaffAccessPanel apiClient={apiClient} event={event} scannerAppUrl={scannerAppUrl} />
      ) : (
        <Box component="section" aria-labelledby="event-overview-title" sx={{ maxWidth: 920 }}>
          <Typography id="event-overview-title" component="h2" variant="h3" sx={{ mb: 1 }}>
            Resumen
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Información principal para identificar y consultar este evento.
          </Typography>

          <Alert severity={event.status === 'CANCELLED' ? 'warning' : 'info'} sx={{ mb: 3 }}>
            {stateMessages[event.status]}
          </Alert>

          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              columnGap: 4
            }}
          >
            {details.map(([label, value]) => (
              <Box key={label} sx={{ minWidth: 0, py: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography component="dt" variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography component="dd" sx={{ m: 0, mt: 0.5, fontWeight: 650, overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Stack>
  );
}

function WorkspaceUnavailable({ title, description }: { title: string; description?: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 640, py: { xs: 3, md: 6 } }}>
      <Typography component="h1" variant="h2">
        {title}
      </Typography>
      {description ? <Typography color="text.secondary">{description}</Typography> : null}
      <Button component={Link} to="/eventos" variant="contained" sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        Volver a eventos
      </Button>
    </Stack>
  );
}

function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

function isUnauthorized(error: unknown): boolean {
  return isStatus(error, 401);
}
