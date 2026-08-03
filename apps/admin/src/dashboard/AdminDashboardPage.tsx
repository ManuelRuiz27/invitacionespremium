import type { ApiClient } from '@invitaciones/api-client';
import { MetricCard, PageHeader } from '@invitaciones/ui';
import { Alert, Box, Divider, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminQueryKeys } from '../app/query-client';
import { AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { summarizeAdminDashboard } from './admin-dashboard';

export function AdminDashboardPage({ apiClient }: { apiClient: ApiClient }) {
  const clients = useQuery({
    queryKey: adminQueryKeys.clients,
    queryFn: ({ signal }) => apiClient.adminClients.list(signal)
  });
  const events = useQuery({
    queryKey: adminQueryKeys.events,
    queryFn: ({ signal }) => apiClient.adminEvents.list(signal)
  });
  if (clients.isPending || events.isPending) return <AdminLoadingState label="Preparando resumen administrativo..." />;
  if (clients.isError || events.isError)
    return <AdminErrorState onRetry={() => void Promise.all([clients.refetch(), events.refetch()])} />;
  const summary = summarizeAdminDashboard(clients.data, events.data);
  return (
    <Stack spacing={4}>
      <PageHeader
        title="Resumen de plataforma"
        description="Totales autoritativos de las colecciones administrativas actuales."
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          borderBlock: 1,
          borderColor: 'divider'
        }}
      >
        <MetricCard label="Clientes activos" value={summary.activeClients} />
        <MetricCard label="Clientes suspendidos" value={summary.suspendedClients} />
        <MetricCard label="Eventos operativos" value={summary.activeEvents} />
        <MetricCard label="En preparacion" value={summary.preparingEvents} />
      </Box>
      <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', lg: '1.3fr .7fr' } }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3">
            Composicion visible
          </Typography>
          {[
            ['Planners independientes', summary.planners],
            ['Organizaciones', summary.organizations],
            ['Eventos cerrados o con Album', summary.closedEvents],
            ['Eventos cancelados', summary.cancelledEvents]
          ].map(([label, value]) => (
            <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5 }}>
              <Typography color="text.secondary">{label}</Typography>
              <Typography sx={{ fontWeight: 760 }}>{value}</Typography>
            </Box>
          ))}
        </Stack>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3">
            Atencion administrativa
          </Typography>
          <Divider />
          {summary.suspendedClients ? (
            <Alert severity="warning">{summary.suspendedClients} Cliente(s) suspendido(s) requieren seguimiento.</Alert>
          ) : null}
          {summary.deletedEvents ? (
            <Alert severity="info">
              {summary.deletedEvents} Evento(s) con borrado logico pueden revisarse para restauracion.
            </Alert>
          ) : null}
          {!summary.suspendedClients && !summary.deletedEvents ? (
            <Typography color="text.secondary">No hay alertas accionables en los datos visibles.</Typography>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
