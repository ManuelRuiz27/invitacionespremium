import { useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { AddOutlined, ArrowForwardOutlined } from '@mui/icons-material';
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { eventStatusLabel, formatDate } from '../shared/admin-labels';
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { AdminEventIntakeDialog } from './AdminEventIntakeDialog';

export function AdminEventsPage({ apiClient }: { apiClient: ApiClient }) {
  const [creating, setCreating] = useState(false);
  const events = useQuery({
    queryKey: adminQueryKeys.events,
    queryFn: ({ signal }) => apiClient.adminEvents.list(signal)
  });
  const clients = useQuery({
    queryKey: adminQueryKeys.clients,
    queryFn: ({ signal }) => apiClient.adminClients.list(signal)
  });
  if (events.isPending || clients.isPending) return <AdminLoadingState label="Cargando Eventos globales..." />;
  if (events.isError || clients.isError)
    return (
      <AdminErrorState
        onRetry={() => {
          void events.refetch();
          void clients.refetch();
        }}
      />
    );
  const clientNames = new Map(clients.data.map((client) => [client.id, client.name]));
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Eventos"
        description="Vista operativa global de Eventos, provenance y responsabilidad Planner."
        action={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
            Nuevo evento
          </Button>
        }
      />
      {events.data.length === 0 ? (
        <AdminEmptyState title="Sin Eventos" />
      ) : (
        <TableContainer sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Evento</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell>Servicio</TableCell>
                <TableCell>Creador</TableCell>
                <TableCell>Planner</TableCell>
                <TableCell align="right">Accion</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.data.map((event) => (
                <TableRow key={event.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>{event.name ?? 'Evento sin nombre'}</Typography>
                    {event.deletedAt ? (
                      <Typography variant="caption" color="error">
                        Eliminado
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{clientNames.get(event.clientId) ?? 'Cliente no disponible'}</TableCell>
                  <TableCell>
                    <StatusChip
                      label={eventStatusLabel[event.status]}
                      tone={
                        event.deletedAt
                          ? 'danger'
                          : event.status === 'ACTIVE' || event.status === 'EVENT_DAY'
                            ? 'success'
                            : 'neutral'
                      }
                    />
                  </TableCell>
                  <TableCell>{formatDate(event.eventDateTime)}</TableCell>
                  <TableCell>{event.serviceId ? 'Configurado' : 'Sin asignar'}</TableCell>
                  <TableCell>{event.createdByUserId}</TableCell>
                  <TableCell>{event.assignedPlannerUserId ?? 'Sin asignar'}</TableCell>
                  <TableCell align="right">
                    <Button component={Link} to={`/eventos/${event.id}`} endIcon={<ArrowForwardOutlined />}>
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Box>
        <Typography variant="caption" color="text.secondary">
          El contrato actual entrega la coleccion completa sin filtros ni paginacion. El nombre del servicio no forma
          parte de esta respuesta administrativa.
        </Typography>
      </Box>
      <AdminEventIntakeDialog
        apiClient={apiClient}
        clients={clients.data}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </Stack>
  );
}
