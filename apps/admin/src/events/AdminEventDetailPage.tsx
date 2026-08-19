import { useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { ArrowBackOutlined, BuildOutlined, RestoreOutlined } from '@mui/icons-material';
import { Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';
import { eventStatusLabel, formatDate } from '../shared/admin-labels';
import { AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { ConfirmSensitiveActionDialog } from '../shared/ConfirmSensitiveActionDialog';
import { isAbortError, type AdminScopedOperation, useAdminOperationScope } from '../shared/useAdminOperationScope';

export function AdminEventDetailPage({ apiClient }: { apiClient: ApiClient }) {
  const { eventId = '' } = useParams();
  return <AdminEventDetail key={eventId} apiClient={apiClient} eventId={eventId} />;
}

function AdminEventDetail({ apiClient, eventId }: { apiClient: ApiClient; eventId: string }) {
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState(false);
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
  return (
    <Stack spacing={3}>
      <Button component={Link} to="/eventos" startIcon={<ArrowBackOutlined />} sx={{ alignSelf: 'flex-start' }}>
        Volver a Eventos
      </Button>
      <PageHeader
        title={data.name ?? 'Evento sin nombre'}
        description="Detalle administrativo global de solo lectura."
        action={
          <Stack direction="row" spacing={1}>
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
            <Field label="Fecha del Evento" value={formatDate(data.eventDateTime)} />
            <Field label="Zona horaria" value={data.timeZone ?? 'Sin definir'} />
            <Field label="Tipo social" value={data.socialType ?? 'Sin definir'} />
            <Field label="Capacidad" value={data.capacity?.toString() ?? 'Sin definir'} />
            <Field label="Servicio" value={data.serviceId ? 'Configurado' : 'Sin asignar'} />
            <Field label="Creador" value={data.createdByUserId} />
            <Field label="Confirmaciones" value={data.confirmationEnabled ? 'Habilitadas' : 'Deshabilitadas'} />
            <Field label="Croquis" value={data.floorplanEnabled ? 'Habilitado' : 'Deshabilitado'} />
            <Grid size={12}>
              <Divider />
            </Grid>
            <Field label="Creado" value={formatDate(data.createdAt)} />
            <Field label="Actualizado" value={formatDate(data.updatedAt)} />
            <Field label="Eliminado" value={formatDate(data.deletedAt)} />
          </Grid>
        </CardContent>
      </Card>
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
