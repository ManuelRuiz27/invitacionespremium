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
import { clientStatusLabel, clientTypeLabel, formatDate } from '../shared/admin-labels';
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { CreateOrganizationDialog } from './CreateOrganizationDialog';

export function AdminClientsPage({ apiClient }: { apiClient: ApiClient }) {
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: adminQueryKeys.clients,
    queryFn: ({ signal }) => apiClient.adminClients.list(signal)
  });
  if (query.isPending) return <AdminLoadingState label="Cargando Clientes..." />;
  if (query.isError) return <AdminErrorState onRetry={() => void query.refetch()} />;
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Clientes"
        description="Coleccion administrativa completa expuesta por el contrato actual."
        action={
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setCreating(true)}>
            Crear organizacion
          </Button>
        }
      />
      {query.data.length === 0 ? (
        <AdminEmptyState title="Sin Clientes" description="Todavia no existen Clientes visibles en la plataforma." />
      ) : (
        <TableContainer sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Creacion</TableCell>
                <TableCell align="right">Accion</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.data.map((client) => (
                <TableRow key={client.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>{client.name}</Typography>
                  </TableCell>
                  <TableCell>{clientTypeLabel[client.type]}</TableCell>
                  <TableCell>
                    <StatusChip
                      label={clientStatusLabel[client.status]}
                      tone={client.status === 'ACTIVE' ? 'success' : 'warning'}
                    />
                  </TableCell>
                  <TableCell>{formatDate(client.createdAt)}</TableCell>
                  <TableCell align="right">
                    <Button component={Link} to={`/clientes/${client.id}`} endIcon={<ArrowForwardOutlined />}>
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
          El OpenAPI actual no ofrece filtros ni paginacion para esta coleccion; no se aplican filtros locales que
          aparenten cobertura global.
        </Typography>
      </Box>
      <CreateOrganizationDialog apiClient={apiClient} open={creating} onClose={() => setCreating(false)} />
    </Stack>
  );
}
