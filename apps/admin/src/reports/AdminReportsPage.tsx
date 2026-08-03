import type { AdminFinanceCut, AdminReport, ApiClient } from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { ArrowForwardOutlined } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Grid,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography
} from '@mui/material';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { formatDate } from '../shared/admin-labels';
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { privacyLabels, reportStatusLabels, reportTypeLabels } from './reports-format';

export function AdminReportsPage({ apiClient }: { apiClient: ApiClient }) {
  const [tab, setTab] = useState(0);
  return (
    <Stack spacing={3}>
      <PageHeader title="Reportes" description="Metadata global y cortes derivados de fuentes autoritativas." />
      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} aria-label="Secciones de reportes">
          <Tab label="Metadata" />
          <Tab label="Cortes financieros" />
        </Tabs>
      </Paper>
      {tab === 0 ? <ReportsList apiClient={apiClient} /> : <FinanceCuts apiClient={apiClient} />}
    </Stack>
  );
}

export function AdminEventReportsRoute({ apiClient }: { apiClient: ApiClient }) {
  const { eventId = '' } = useParams();
  return <AdminEventReportsPage key={eventId} apiClient={apiClient} eventId={eventId} />;
}

export function AdminEventReportsPage({ apiClient, eventId }: { apiClient: ApiClient; eventId: string }) {
  const query = useQuery({
    queryKey: adminQueryKeys.eventReports(eventId),
    queryFn: ({ signal }) => apiClient.adminReports.listEvent(eventId, signal)
  });
  return (
    <Stack spacing={3}>
      <PageHeader title="Reportes del Evento" description={`Metadata administrativa del Evento ${eventId}.`} />
      <Button component={Link} to={`/eventos/${encodeURIComponent(eventId)}`} sx={{ alignSelf: 'flex-start' }}>
        Ver detalle del Evento
      </Button>
      <ReportQueryState query={query} />
    </Stack>
  );
}

function ReportsList({ apiClient }: { apiClient: ApiClient }) {
  const query = useQuery({
    queryKey: adminQueryKeys.reports,
    queryFn: ({ signal }) => apiClient.adminReports.list(signal)
  });
  return <ReportQueryState query={query} />;
}

function ReportQueryState({ query }: { query: UseQueryResult<AdminReport[]> }) {
  if (query.isPending) return <AdminLoadingState label="Cargando metadata de reportes..." />;
  if (query.isError) return <AdminErrorState onRetry={() => void query.refetch()} />;
  if (query.data.length === 0)
    return <AdminEmptyState title="Sin reportes" description="No hay metadata administrativa disponible." />;
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Platform Admin recibe solo metadata. No se exponen dataset, nombres, PDF, descarga, hashes ni rutas de
        almacenamiento.
      </Alert>
      <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tipo</TableCell>
              <TableCell>Estado y privacidad</TableCell>
              <TableCell>Evento / Cliente</TableCell>
              <TableCell>Snapshot y retencion</TableCell>
              <TableCell align="right">Accion</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {query.data.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{reportTypeLabels[report.type]}</TableCell>
                <TableCell>
                  {reportStatusLabels[report.status]} · {privacyLabels[report.privacyMode]}
                </TableCell>
                <TableCell>
                  {report.eventId}
                  <br />
                  {report.clientId}
                </TableCell>
                <TableCell>
                  {formatDate(report.generatedAtSnapshot)}
                  <br />
                  {formatDate(report.retentionUntil)}
                </TableCell>
                <TableCell align="right">
                  <Button component={Link} to={`/reportes/eventos/${encodeURIComponent(report.eventId)}`}>
                    Ver Evento
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack spacing={2} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {query.data.map((report: AdminReport) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </Stack>
    </Stack>
  );
}

function ReportCard({ report }: { report: AdminReport }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>{reportTypeLabels[report.type]}</Typography>
          <Typography variant="body2">
            Evento {report.eventId} · Cliente {report.clientId}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Snapshot {formatDate(report.generatedAtSnapshot)} · plantilla v{report.templateVersion}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Solicitado por {report.requestedByUserId}
          </Typography>
          <Typography variant="caption">
            Detalle hasta {formatDate(report.detailedUntil)} · retencion hasta {formatDate(report.retentionUntil)}
          </Typography>
        </Box>
        <Stack spacing={1} sx={{ alignItems: { md: 'flex-end' } }}>
          <Stack direction="row" spacing={1}>
            <StatusChip
              label={reportStatusLabels[report.status]}
              tone={report.status === 'READY' ? 'success' : 'neutral'}
            />
            <StatusChip label={privacyLabels[report.privacyMode]} tone="neutral" />
          </Stack>
          <Button
            component={Link}
            to={`/reportes/eventos/${encodeURIComponent(report.eventId)}`}
            endIcon={<ArrowForwardOutlined />}
          >
            Ver Evento
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function FinanceCuts({ apiClient }: { apiClient: ApiClient }) {
  const daily = useQuery({
    queryKey: adminQueryKeys.dailyCut,
    queryFn: ({ signal }) => apiClient.adminFinance.dailyCut(signal)
  });
  const monthly = useQuery({
    queryKey: adminQueryKeys.monthlyCut,
    queryFn: ({ signal }) => apiClient.adminFinance.monthlyCut(signal)
  });
  if (daily.isPending || monthly.isPending) return <AdminLoadingState label="Cargando cortes financieros..." />;
  if (daily.isError || monthly.isError)
    return (
      <AdminErrorState
        onRetry={() => {
          void daily.refetch();
          void monthly.refetch();
        }}
      />
    );
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Los periodos son los definidos por la API; el contrato actual no acepta filtros ni parametros de fecha.
      </Alert>
      <CutPanel title="Corte diario" cut={daily.data} />
      <CutPanel title="Corte mensual" cut={monthly.data} />
    </Stack>
  );
}

const cutMetrics: [keyof AdminFinanceCut, string, 'credits' | 'money' | 'count'][] = [
  ['incomeMxnCents', 'Ingresos reales', 'money'],
  ['creditsSold', 'Creditos vendidos', 'credits'],
  ['creditsGranted', 'Creditos asignados sin ingreso', 'credits'],
  ['creditsConsumed', 'Creditos consumidos', 'credits'],
  ['creditsLent', 'Creditos prestados', 'credits'],
  ['debtGeneratedCredits', 'Deuda generada', 'credits'],
  ['debtGeneratedMxnCents', 'Deuda generada MXN', 'money'],
  ['debtPaidCredits', 'Deuda pagada', 'credits'],
  ['debtPaidMxnCents', 'Deuda pagada MXN', 'money'],
  ['pendingDebtCredits', 'Deuda pendiente', 'credits'],
  ['pendingDebtMxnCents', 'Deuda pendiente MXN', 'money'],
  ['pendingPurchasedCredits', 'Saldo comprado pendiente', 'credits'],
  ['internalRefundCredits', 'Devoluciones internas', 'credits'],
  ['reversalCount', 'Reversos contables', 'count']
];
function CutPanel({ title, cut }: { title: string; cut: AdminFinanceCut }) {
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h3">{title}</Typography>
          <Typography color="text.secondary">
            [ {formatDate(cut.from)}, {formatDate(cut.until)} )
          </Typography>
        </Box>
        <Grid container spacing={1.5}>
          {cutMetrics.map(([key, label, kind]) => (
            <Grid key={key} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  {kind === 'money' ? money.format(Number(cut[key]) / 100) : String(cut[key])}
                  {kind === 'credits' ? ' creditos' : ''}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Paper>
  );
}
