import type { ApiClient, Event } from '@invitaciones/api-client';
import { StatusChip } from '@invitaciones/ui';
import { Alert, Box, Button, Link as MuiLink, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { GuestManagementPanel } from '../../guests/GuestManagementPanel';
import { formatEventDateLong } from '../../shared/formatters';
import { getEventStatusPresentation } from '../../shared/event-status';
import { SeatingWorkspace } from '../SeatingWorkspace';
import { StaffAccessPanel } from '../StaffAccessPanel';
import { AccessMaterialPanel } from './AccessMaterialPanel';
import { AccessOperationsPanel } from './AccessOperationsPanel';

const preparationStatuses = new Set<Event['status']>(['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE']);

const readinessMessages: Record<string, string> = {
  EVENT_BASIC_DATA_INCOMPLETE: 'InvitacionesPremium debe completar los datos del evento.',
  EVENT_PLANNER_ASSIGNMENT_INVALID: 'InvitacionesPremium debe revisar el Planner responsable.',
  EVENT_ACCESS_MATERIAL_MISSING: 'Falta material de acceso vigente.',
  EVENT_ACCESS_CREDENTIAL_MISSING: 'Emite una credencial vigente para cada invitado registrado.',
  EVENT_ACCESS_MATERIAL_INCONSISTENT: 'Revisa las credenciales o pases vigentes con InvitacionesPremium.',
  EVENT_ACCESS_CAPACITY_EXCEEDED: 'Revisa la capacidad del evento con InvitacionesPremium.',
  EVENT_ACCESS_SEATING_INCOMPLETE: 'Completa el acomodo de los accesos vigentes.',
  EVENT_FLOORPLAN_MISSING: 'InvitacionesPremium debe preparar el croquis.',
  EVENT_FLOORPLAN_IMAGE_NOT_READY: 'InvitacionesPremium debe completar la imagen del croquis.',
  EVENT_FLOORPLAN_TABLE_MISSING: 'InvitacionesPremium debe preparar las mesas del croquis.',
  EVENT_FLOORPLAN_INCONSISTENT: 'InvitacionesPremium debe revisar las mesas y capacidades del croquis.',
  EVENT_FLOORPLAN_INCOMPLETE: 'InvitacionesPremium debe completar el croquis.',
  EVENT_FLOORPLAN_PENDING_SEATING: 'Completa el acomodo de invitados.'
};

export function AccessControlWorkspace({
  apiClient,
  event,
  scannerAppUrl
}: {
  apiClient: ApiClient;
  event: Event;
  scannerAppUrl?: string;
}) {
  const [searchParams] = useSearchParams();
  const nominal = event.accessMode === 'NOMINAL';
  const preparing = preparationStatuses.has(event.status);
  const operational = event.status === 'ACTIVE' || event.status === 'EVENT_DAY';
  const status = getEventStatusPresentation(event.status);
  const sections = [
    { id: 'resumen', label: 'Resumen' },
    ...(nominal ? [{ id: 'invitados', label: 'Invitados' }] : []),
    { id: 'accesos', label: nominal ? 'Credenciales individuales' : 'Pases físicos' },
    { id: 'ingresos', label: 'Ingresos y aforo' },
    ...(event.floorplanEnabled ? [{ id: 'mesas', label: 'Mesas y distribución' }] : []),
    ...(operational && scannerAppUrl ? [{ id: 'staff', label: 'Staff' }] : [])
  ];
  const section = sections.find(({ id }) => id === searchParams.get('seccion'))?.id ?? 'resumen';
  const guide = operational
    ? [
        { label: 'Preparar material', section: 'accesos' },
        { label: 'Crear Staff', section: scannerAppUrl ? 'staff' : undefined },
        { label: 'Abrir Scanner en el dispositivo de recepción', section: scannerAppUrl ? 'staff' : undefined },
        { label: 'Consultar Ingresos y aforo', section: 'ingresos' }
      ]
    : nominal
      ? [
          { label: 'Registrar invitados', section: 'invitados' },
          { label: 'Emitir credenciales', section: 'accesos' },
          ...(event.floorplanEnabled ? [{ label: 'Completar Mesas', section: 'mesas' }] : []),
          { label: 'Solicitar activación a InvitacionesPremium', section: undefined }
        ]
      : [
          { label: 'Esperar la generación de lotes por InvitacionesPremium', section: undefined },
          { label: 'Revisar pases y folios', section: 'accesos' },
          { label: 'Descargar e imprimir material', section: 'accesos' },
          { label: 'Solicitar activación a InvitacionesPremium', section: undefined }
        ];
  const readiness = useQuery({
    queryKey: ['access-readiness', event.id],
    queryFn: ({ signal }) => apiClient.events.getAccessReadiness(event.id, signal),
    enabled: preparing && section === 'resumen',
    staleTime: 0
  });

  return (
    <Stack spacing={3}>
      <Button component={Link} to="/eventos" sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        Volver a eventos
      </Button>
      <Stack component="header" spacing={1}>
        <Typography component="h1" variant="h2">
          {event.name ?? 'Evento sin nombre'}
        </Typography>
        <Box>
          <StatusChip label={status.label} tone={status.tone} />
        </Box>
        <Typography color="text.secondary">{formatEventDateLong(event.eventDateTime, event.timeZone)}</Typography>
        <Typography>Control de acceso · {nominal ? 'Nominal individual' : 'Pases anónimos numerados'}</Typography>
      </Stack>
      {preparing ? (
        <Alert severity="info">
          InvitacionesPremium prepara la infraestructura y activa el evento.{' '}
          {nominal
            ? 'Puedes registrar invitados, emitir sus credenciales y preparar el acomodo.'
            : 'La generación de lotes corresponde a InvitacionesPremium; puedes consultar y descargar los pases preparados.'}
        </Alert>
      ) : !operational ? (
        <Alert severity="info">Este evento está disponible en modo de consulta.</Alert>
      ) : null}
      <Box
        component="nav"
        aria-label="Secciones del Evento"
        sx={{ display: 'flex', overflowX: 'auto', borderBottom: 1, borderColor: 'divider' }}
      >
        {sections.map(({ id, label }) => (
          <MuiLink
            key={id}
            component={Link}
            to={`/eventos/${event.id}${id === 'resumen' ? '' : `?seccion=${id}`}`}
            aria-current={id === section ? 'page' : undefined}
            underline="none"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
              minHeight: 44,
              px: 1.5,
              fontWeight: 700,
              borderBottom: 2,
              borderColor: id === section ? 'primary.main' : 'transparent'
            }}
          >
            {label}
          </MuiLink>
        ))}
      </Box>
      {section === 'invitados' ? (
        <GuestManagementPanel apiClient={apiClient} event={event} readOnly={!preparing} />
      ) : section === 'accesos' ? (
        <AccessMaterialPanel key={`${event.id}:${event.accessMode}`} apiClient={apiClient} event={event} />
      ) : section === 'mesas' ? (
        <SeatingWorkspace apiClient={apiClient} event={event} />
      ) : section === 'ingresos' ? (
        <AccessOperationsPanel key={`${event.id}:${event.accessMode}`} apiClient={apiClient} event={event} />
      ) : section === 'staff' && scannerAppUrl ? (
        <StaffAccessPanel apiClient={apiClient} event={event} scannerAppUrl={scannerAppUrl} />
      ) : (
        <Stack spacing={2} sx={{ maxWidth: 920 }}>
          <Typography component="h2" variant="h3">
            Resumen
          </Typography>
          <Typography>Capacidad: {event.capacity ?? 'Pendiente'} personas</Typography>
          <Typography>{event.floorplanEnabled ? 'Con distribución de mesas' : 'Sin distribución de mesas'}</Typography>
          {preparing || operational ? (
            <Box component="section" aria-labelledby="access-guide-title">
              <Typography id="access-guide-title" component="h3" variant="h4">
                {operational ? 'Próximos pasos para recibir invitados' : 'Prepara tu evento'}
              </Typography>
              <Box component="ol" sx={{ pl: 3, '& li': { mb: 1 } }}>
                {guide.map((step) => (
                  <li key={step.label}>
                    {step.section ? (
                      <MuiLink
                        component={Link}
                        to={`/eventos/${event.id}?seccion=${step.section}`}
                        sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
                      >
                        {step.label}
                      </MuiLink>
                    ) : (
                      step.label
                    )}
                  </li>
                ))}
              </Box>
              {operational ? (
                <Typography color="text.secondary">
                  {scannerAppUrl
                    ? 'Desde Staff, crea el acceso y abre su enlace Scanner en el dispositivo de recepción.'
                    : 'Solicita a InvitacionesPremium la habilitación del enlace de Scanner para crear accesos Staff.'}
                </Typography>
              ) : (
                <Typography color="text.secondary">
                  La preparación que se muestra abajo es la revisión vigente de InvitacionesPremium para activar el
                  evento.
                </Typography>
              )}
            </Box>
          ) : null}
          {preparing && readiness.isPending ? <Typography role="status">Consultando preparación…</Typography> : null}
          {preparing && readiness.isError ? (
            <Alert severity="error" action={<Button onClick={() => void readiness.refetch()}>Reintentar</Button>}>
              No pudimos consultar la preparación.
            </Alert>
          ) : null}
          {preparing && readiness.data ? (
            <>
              <Typography>Accesos vigentes: {readiness.data.activeMaterialCount}</Typography>
              <Alert severity={readiness.data.complete ? 'success' : 'info'}>
                {readiness.data.complete
                  ? 'Preparación completa. InvitacionesPremium puede activar el evento.'
                  : 'Hay requisitos pendientes antes de la activación.'}
              </Alert>
              <Box component="ul">
                {readiness.data.blockers.map((code) => (
                  <li key={code}>{readinessMessages[code] ?? 'Revisa este requisito con InvitacionesPremium.'}</li>
                ))}
              </Box>
            </>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
