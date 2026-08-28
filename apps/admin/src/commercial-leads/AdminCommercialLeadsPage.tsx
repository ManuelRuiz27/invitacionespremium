import type { AdminCommercialLead, CommercialOpportunityType, ApiClient } from '@invitaciones/api-client';
import { PageHeader } from '@invitaciones/ui';
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';
import { formatDate } from '../shared/admin-labels';
import { AdminEmptyState, AdminLoadingState } from '../shared/AdminStates';

const opportunityLabels: Record<CommercialOpportunityType, string> = {
  PLANNER_AGENCY: 'Planner o agencia',
  VENUE: 'Venue'
};

export function AdminCommercialLeadsPage({ apiClient }: { apiClient: ApiClient }) {
  const [opportunityType, setOpportunityType] = useState<CommercialOpportunityType | ''>('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: adminQueryKeys.commercialLeads(opportunityType || undefined, cursor),
    queryFn: ({ signal }) =>
      apiClient.adminCommercialLeads.list(
        {
          limit: 25,
          ...(opportunityType ? { opportunityType } : {}),
          ...(cursor ? { cursor } : {})
        },
        signal
      )
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Oportunidades"
        description="Solicitudes comerciales recibidas desde la landing. Vista exclusivamente de lectura."
      />
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <FormControl fullWidth sx={{ maxWidth: 360 }}>
          <InputLabel id="opportunity-type-label">Tipo de oportunidad</InputLabel>
          <Select
            labelId="opportunity-type-label"
            label="Tipo de oportunidad"
            value={opportunityType}
            onChange={(event) => {
              setOpportunityType(event.target.value as CommercialOpportunityType | '');
              setCursors([undefined]);
            }}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="PLANNER_AGENCY">Planner o agencia</MenuItem>
            <MenuItem value="VENUE">Venue</MenuItem>
          </Select>
        </FormControl>
      </Paper>
      <LeadQueryState
        query={query}
        page={cursors.length}
        onPrevious={() => setCursors((current) => current.slice(0, -1))}
        onNext={(nextCursor) => setCursors((current) => [...current, nextCursor])}
      />
    </Stack>
  );
}

function LeadQueryState({
  query,
  page,
  onPrevious,
  onNext
}: {
  query: ReturnType<typeof useQuery<{ items: AdminCommercialLead[]; nextCursor: string | null }>>;
  page: number;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  if (query.isPending) return <AdminLoadingState label="Cargando oportunidades..." />;
  if (query.isError) {
    return (
      <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}>
        {adminErrorMessage(query.error).message}
      </Alert>
    );
  }
  if (query.data.items.length === 0 && page === 1) {
    return <AdminEmptyState title="Sin oportunidades" description="No hay solicitudes que coincidan con el filtro." />;
  }
  return (
    <Stack spacing={2} aria-busy={query.isFetching}>
      <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table>
          <TableHead>
            <TableRow>
              {['Fecha', 'Tipo', 'Contacto', 'Negocio', 'Correo', 'Teléfono', 'Eventos / mes', 'Detalle'].map(
                (label) => (
                  <TableCell key={label}>{label}</TableCell>
                )
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {query.data.items.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>{formatDate(lead.createdAt)}</TableCell>
                <TableCell>{opportunityLabels[lead.opportunityType]}</TableCell>
                <TableCell>{lead.contactName}</TableCell>
                <TableCell>{lead.businessName}</TableCell>
                <TableCell>{lead.email}</TableCell>
                <TableCell>{lead.phone ?? '—'}</TableCell>
                <TableCell>{lead.estimatedEventsPerMonth ?? '—'}</TableCell>
                <TableCell>
                  <Button component={Link} to={`/oportunidades/${lead.id}`}>
                    Ver detalle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {query.data.items.map((lead) => (
          <Paper key={lead.id} variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={0.75}>
              <Typography sx={{ fontWeight: 700 }}>{lead.businessName}</Typography>
              <Typography variant="body2">{opportunityLabels[lead.opportunityType]}</Typography>
              <Typography variant="body2">{lead.contactName}</Typography>
              <Typography variant="body2" color="text.secondary">
                {lead.email} · {formatDate(lead.createdAt)}
              </Typography>
              <Button component={Link} to={`/oportunidades/${lead.id}`} sx={{ alignSelf: 'flex-start' }}>
                Ver detalle
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
        <Typography variant="body2">Página {page}</Typography>
        <Button disabled={page === 1 || query.isFetching} onClick={onPrevious}>
          Anterior
        </Button>
        <Button
          disabled={!query.data.nextCursor || query.isFetching}
          onClick={() => query.data.nextCursor && onNext(query.data.nextCursor)}
        >
          Siguiente
        </Button>
      </Stack>
    </Stack>
  );
}
