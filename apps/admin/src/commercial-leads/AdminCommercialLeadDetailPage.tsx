import type { ApiClient } from '@invitaciones/api-client';
import { PageHeader } from '@invitaciones/ui';
import { Alert, Button, Grid, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';
import { formatDate } from '../shared/admin-labels';
import { AdminLoadingState } from '../shared/AdminStates';

export function AdminCommercialLeadDetailPage({ apiClient }: { apiClient: ApiClient }) {
  const leadId = useParams().leadId ?? '';
  const query = useQuery({
    queryKey: adminQueryKeys.commercialLead(leadId),
    queryFn: ({ signal }) => apiClient.adminCommercialLeads.get(leadId, signal),
    enabled: Boolean(leadId)
  });

  if (query.isPending) return <AdminLoadingState label="Cargando oportunidad..." />;
  if (query.isError) {
    return (
      <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}>
        {adminErrorMessage(query.error).message}
      </Alert>
    );
  }

  const lead = query.data;
  return (
    <Stack spacing={3}>
      <PageHeader title={lead.businessName} description="Detalle de la oportunidad comercial. Vista de solo lectura." />
      <Button component={Link} to="/oportunidades" sx={{ alignSelf: 'flex-start' }}>
        Volver a oportunidades
      </Button>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Field label="Tipo" value={lead.opportunityType === 'VENUE' ? 'Venue' : 'Planner o agencia'} />
          <Field label="Contacto" value={lead.contactName} />
          <Field label="Correo" value={lead.email} />
          <Field label="Teléfono" value={lead.phone ?? 'Sin teléfono'} />
          <Field
            label="Eventos estimados por mes"
            value={lead.estimatedEventsPerMonth?.toString() ?? 'Sin estimación'}
          />
          <Field label="Consentimiento de privacidad" value={formatDate(lead.privacyAcceptedAt)} />
          <Field label="Recibida" value={formatDate(lead.createdAt)} />
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">
              Notas
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{lead.notes ?? 'Sin notas'}</Typography>
          </Grid>
        </Grid>
      </Paper>
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, md: 6 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    </Grid>
  );
}
