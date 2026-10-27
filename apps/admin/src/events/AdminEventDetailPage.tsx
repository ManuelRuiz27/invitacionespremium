import { useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { ArrowBackOutlined, BuildOutlined, PersonOutlined, RestoreOutlined } from '@mui/icons-material';
import { Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';
import { accessModeLabel, eventServiceLabel, eventStatusLabel, formatDate } from '../shared/admin-labels';
import { AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { ConfirmSensitiveActionDialog } from '../shared/ConfirmSensitiveActionDialog';
import { isAbortError, type AdminScopedOperation, useAdminOperationScope } from '../shared/useAdminOperationScope';
import { AdminPlannerAssignmentDialog } from './AdminPlannerAssignmentDialog';
import { AdminAccessOperationsPanel } from './AdminAccessOperationsPanel';

export function AdminEventDetailPage({ apiClient }: { apiClient: ApiClient }) {
  const { eventId = '' } = useParams();
  return <AdminEventDetail key={eventId} apiClient={apiClient} eventId={eventId} />;
}

function AdminEventDetail({ apiClient, eventId }: { apiClient: ApiClient; eventId: string }) {
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string>();
  const operationScope = useAdminOperationScope('event', eventId);
  const event = useQuery({
    queryKey: adminQueryKeys.event(eventId),
    queryFn: ({ signal }) => apiClient.adminEvents.get(eventId, signal),
    enabled: Boolean(eventId)
  });
  const client = useQuery({
    queryKey: adminQueryKeys.client(event.data?.clientId ?? ''),
    queryFn: ({ signal }) => apiClient.adminClients.get(event.data!.clientId, signal),
    enabled: Boolean(event.data?.clientId)
  });
  const users = useQuery({
    queryKey: adminQueryKeys.clientUsers(event.data?.clientId ?? ''),
    queryFn: ({ signal }) => apiClient.adminClients.listUsers(event.data!.clientId, signal),
    enabled: Boolean(event.data?.clientId && event.data.assignedPlannerUserId)
  });
  const restore = useMutation({
    mutationFn: (operation: AdminScopedOperation) => apiClient.adminEvents.restore(eventId, operation.signal),
    onSuccess: async (_result, operation) => {
      if (!operation.isCurrent()) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.event(eventId) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.events })
      ]);
      if (!operation.isCurrent()) return;
      operation.finish();
      setRestoring(false);
    },
    onError: (cause, operation) => {
      if (operation.isCurrent() && !isAbortError(cause)) setError(adminErrorMessage(cause).message);
      operation.finish();
    }
  });

  function submitRestore() {
    const operation = operationScope.begin();
    if (!operation) return;
    setError(undefined);
    restore.mutate(operation);
  }
  if (event.isPending) return <AdminLoadingState label="Cargando Evento..." />;
  if (event.isError) return <AdminErrorState onRetry={() => void event.refetch()} />;
  const data = event.data;
  const accessControl = data.serviceCode === 'ACCESS_CONTROL';
  const planner = users.isSuccess
    ? users.data.find(
        (user) =>
          user.id === data.assignedPlannerUserId &&
          user.clientId === data.clientId &&
          (user.role === 'ORGANIZATION_PLANNER' || user.role === 'INDEPENDENT_PLANNER')
      )
    : undefined;
  const plannerLabel = !data.assignedPlannerUserId
    ? 'Sin asignar'
    : (planner?.email ?? (users.isPending ? 'Consultando Planner…' : 'Planner asignado; identidad no disponible'));
  return (
    <Stack spacing={3}>
      <Button component={Link} to="/eventos" startIcon={<ArrowBackOutlined />} sx={{ alignSelf: 'flex-start' }}>
        Volver a Eventos
      </Button>
      <PageHeader
        title={data.name ?? 'Evento sin nombre'}
        description={`${eventServiceLabel(data)}${accessControl ? ` · ${accessModeLabel(data.accessMode)}` : ''}`}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {!data.deletedAt ? (
              <Button variant="outlined" startIcon={<PersonOutlined />} onClick={() => setAssigning(true)}>
                Cambiar planner
              </Button>
            ) : null}
            {!data.deletedAt ? (
              <Button
                component={Link}
                to={`/eventos/${data.id}/preparar`}
                variant="contained"
                startIcon={<BuildOutlined />}
              >
                Preparar evento
              </Button>
            ) : null}
            {data.deletedAt ? (
              <Button variant="contained" startIcon={<RestoreOutlined />} onClick={() => setRestoring(true)}>
                Restaurar
              </Button>
            ) : null}
            <StatusChip label={eventStatusLabel[data.status]} tone={data.deletedAt ? 'danger' : 'neutral'} />
          </Stack>
        }
      />
      <Card>
        <CardContent>
          <Grid container spacing={3}>
            <Field
              label="Cliente"
              value={client.data?.name ?? (client.isPending ? 'Cargando...' : 'Cliente no disponible')}
            />
            <Field label="Servicio" value={eventServiceLabel(data)} />
            <Field label="Capacidad" value={data.capacity?.toString() ?? 'Sin definir'} />
            {accessControl ? <Field label="Modalidad" value={accessModeLabel(data.accessMode)} /> : null}
            <Field label="Croquis" value={data.floorplanEnabled ? 'Habilitado' : 'Deshabilitado'} />
            <Field label="Planner asignada" value={plannerLabel} />
            <Field label="Fecha del Evento" value={formatDate(data.eventDateTime)} />
            <Field label="Zona horaria" value={data.timeZone ?? 'Sin definir'} />
            <Field label="Tipo social" value={data.socialType ?? 'Sin definir'} />
            <Field label="Creador" value="Usuario registrado" />
            {!accessControl ? (
              <Field label="Confirmaciones" value={data.confirmationEnabled ? 'Habilitadas' : 'Deshabilitadas'} />
            ) : null}
            {users.isError ? (
              <Grid size={12}>
                <Button onClick={() => void users.refetch()}>Reintentar identidad del Planner</Button>
              </Grid>
            ) : null}
            <Grid size={12}>
              <Divider />
            </Grid>
            <Field label="Creado" value={formatDate(data.createdAt)} />
            <Field label="Actualizado" value={formatDate(data.updatedAt)} />
            <Field label="Eliminado" value={formatDate(data.deletedAt)} />
          </Grid>
        </CardContent>
      </Card>
      {!data.deletedAt &&
      data.serviceCode === 'ACCESS_CONTROL' &&
      (data.accessMode === 'NOMINAL' || data.accessMode === 'ANONYMOUS') ? (
        <AdminAccessOperationsPanel key={`${data.id}:${data.accessMode}`} apiClient={apiClient} event={data} />
      ) : null}
      <details>
        <summary>Referencias técnicas para soporte</summary>
        <Typography variant="body2">Evento: {data.id}</Typography>
        <Typography variant="body2">Creador: {data.createdByUserId}</Typography>
        <Typography variant="body2">Planner: {data.assignedPlannerUserId ?? 'Sin asignar'}</Typography>
      </details>
      <ConfirmSensitiveActionDialog
        open={restoring}
        title="Restaurar Evento"
        description="El Evento volvera a estar disponible para su Cliente. No se modifica su estado de negocio."
        confirmLabel="Restaurar"
        busy={restore.isPending}
        {...(error ? { error } : {})}
        onClose={() => {
          setRestoring(false);
          setError(undefined);
        }}
        onConfirm={submitRestore}
      />
      {client.data ? (
        <AdminPlannerAssignmentDialog
          apiClient={apiClient}
          client={client.data}
          event={data}
          open={assigning}
          onClose={() => setAssigning(false)}
        />
      ) : null}
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 4 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
    </Grid>
  );
}
