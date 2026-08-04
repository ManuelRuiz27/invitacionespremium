import { ApiError, type AdminAuditFilters, type AdminAuditLog, type ApiClient } from '@invitaciones/api-client';
import { PageHeader } from '@invitaciones/ui';
import { ContentCopyOutlined, VisibilityOutlined } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
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
  TextField,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';
import { formatDate } from '../shared/admin-labels';
import { AdminEmptyState, AdminLoadingState } from '../shared/AdminStates';
import { localDateTimeToInstant } from './audit-date';

type DraftFilters = Omit<AdminAuditFilters, 'createdFrom' | 'createdTo' | 'cursor'> & {
  createdFrom?: string;
  createdTo?: string;
};

const emptyFilters: DraftFilters = { limit: 25 };

export function AdminAuditPage({ apiClient }: { apiClient: ApiClient }) {
  const auditClient = requireAuditClient(apiClient);
  const [draft, setDraft] = useState<DraftFilters>(emptyFilters);
  const [filters, setFilters] = useState<AdminAuditFilters>({ limit: 25 });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [validationError, setValidationError] = useState<string>();
  const [selected, setSelected] = useState<AdminAuditLog>();
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: adminQueryKeys.audit(filters, cursor),
    queryFn: ({ signal }) =>
      auditClient.listAuditLogs({ ...filters, ...(cursor === undefined ? {} : { cursor }) }, signal)
  });

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    try {
      const createdFrom = localDateTimeToInstant(draft.createdFrom ?? '');
      const createdTo = localDateTimeToInstant(draft.createdTo ?? '');
      if (createdFrom && createdTo && Date.parse(createdFrom) > Date.parse(createdTo)) {
        setValidationError('La fecha final debe ser posterior o igual a la inicial.');
        return;
      }
      setValidationError(undefined);
      setFilters({
        ...compactDraft(draft),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdTo ? { createdTo } : {})
      });
      setCursors([undefined]);
    } catch {
      setValidationError('Revisa las fechas capturadas.');
    }
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setFilters({ limit: 25 });
    setCursors([undefined]);
    setValidationError(undefined);
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Auditoría"
        description="Consulta global de registros inmutables. Esta vista es exclusivamente de lectura."
      />
      <Alert severity="info">
        Los registros se muestran sin enriquecer identidades ni recursos. Los datos sensibles vuelven a sanitizarse
        antes de la entrega.
      </Alert>
      <AuditFilters
        draft={draft}
        setDraft={setDraft}
        onSubmit={applyFilters}
        onClear={clearFilters}
        {...(validationError ? { error: validationError } : {})}
        disabled={false}
      />
      <AuditQueryState
        query={query}
        page={cursors.length}
        onSelect={setSelected}
        onPrevious={() => setCursors((current) => current.slice(0, -1))}
        onNext={(nextCursor) => setCursors((current) => [...current, nextCursor])}
      />
      <AuditDetailDialog entry={selected} onClose={() => setSelected(undefined)} />
    </Stack>
  );
}

function AuditFilters({
  draft,
  setDraft,
  onSubmit,
  onClear,
  error,
  disabled
}: {
  draft: DraftFilters;
  setDraft: (value: DraftFilters) => void;
  onSubmit: (event: FormEvent) => void;
  onClear: () => void;
  error?: string;
  disabled: boolean;
}) {
  const field = (key: keyof DraftFilters) => ({
    value: draft[key] ?? '',
    onChange: (event: { target: { value: unknown } }) => setDraft({ ...draft, [key]: event.target.value })
  });
  return (
    <Paper component="form" variant="outlined" sx={{ p: 2.5 }} onSubmit={onSubmit}>
      <Stack spacing={2}>
        <Typography variant="h3">Filtros</Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Cliente ID" {...field('clientId')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Evento ID" {...field('eventId')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel id="audit-actor-type-label">Tipo de actor</InputLabel>
              <Select labelId="audit-actor-type-label" label="Tipo de actor" {...field('actorType')}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="USER">Usuario</MenuItem>
                <MenuItem value="STAFF_TOKEN">Token staff</MenuItem>
                <MenuItem value="PUBLIC_TOKEN">Token público</MenuItem>
                <MenuItem value="SYSTEM">Sistema</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Actor ID" {...field('actorId')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Tipo de recurso" {...field('resourceType')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Recurso ID" {...field('resourceId')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Acción" {...field('action')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField fullWidth label="Operación ID" {...field('operationId')} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth>
              <InputLabel id="audit-limit-label">Registros por página</InputLabel>
              <Select labelId="audit-limit-label" label="Registros por página" {...field('limit')}>
                {[25, 50, 100].map((limit) => (
                  <MenuItem key={limit} value={limit}>
                    {limit}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label="Desde"
              slotProps={{ inputLabel: { shrink: true } }}
              {...field('createdFrom')}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              type="datetime-local"
              label="Hasta"
              slotProps={{ inputLabel: { shrink: true } }}
              {...field('createdTo')}
            />
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary">
          Las fechas se interpretan en la zona horaria local del navegador y se envían como instantes exactos.
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disabled={disabled}>
            Aplicar filtros
          </Button>
          <Button type="button" onClick={onClear} disabled={disabled}>
            Limpiar
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function AuditQueryState({
  query,
  page,
  onSelect,
  onPrevious,
  onNext
}: {
  query: ReturnType<typeof useQuery<{ items: AdminAuditLog[]; nextCursor: string | null }>>;
  page: number;
  onSelect: (entry: AdminAuditLog) => void;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  if (query.isPending) return <AdminLoadingState label="Cargando registros de auditoría..." />;
  if (query.isError) {
    if (isAbortError(query.error)) return <Alert severity="info">La consulta fue cancelada.</Alert>;
    const error = adminErrorMessage(query.error);
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}>
        {forbidden ? 'No tienes permiso para consultar la auditoría.' : error.message}
      </Alert>
    );
  }
  if (query.data.items.length === 0 && page === 1) {
    return <AdminEmptyState title="Sin registros" description="No hay registros que coincidan con los filtros." />;
  }
  return (
    <Stack spacing={2} aria-busy={query.isFetching}>
      <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', lg: 'block' } }}>
        <Table>
          <TableHead>
            <TableRow>
              {['Fecha', 'Actor', 'Acción', 'Recurso', 'Cliente', 'Evento', 'Operación', 'Detalle'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {query.data.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} onSelect={onSelect} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack spacing={1.5} sx={{ display: { xs: 'flex', lg: 'none' } }}>
        {query.data.items.map((entry) => (
          <AuditCard key={entry.id} entry={entry} onSelect={onSelect} />
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

function AuditRow({ entry, onSelect }: { entry: AdminAuditLog; onSelect: (entry: AdminAuditLog) => void }) {
  return (
    <TableRow>
      <TableCell>{formatDate(entry.createdAt)}</TableCell>
      <TableCell>
        <Actor entry={entry} />
      </TableCell>
      <TableCell>{entry.action}</TableCell>
      <TableCell>
        {entry.resourceType}
        <Identifier value={entry.resourceId} label="recurso" />
      </TableCell>
      <TableCell>
        <Identifier value={entry.clientId} label="cliente" />
      </TableCell>
      <TableCell>
        <Identifier value={entry.eventId} label="evento" />
      </TableCell>
      <TableCell>
        <Identifier value={entry.operationId} label="operación" />
      </TableCell>
      <TableCell>
        <IconButton aria-label={`Ver detalle ${entry.id}`} onClick={() => onSelect(entry)}>
          <VisibilityOutlined />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

function AuditCard({ entry, onSelect }: { entry: AdminAuditLog; onSelect: (entry: AdminAuditLog) => void }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700 }}>{entry.action}</Typography>
          <Typography variant="caption">{formatDate(entry.createdAt)}</Typography>
        </Stack>
        <Typography variant="body2">
          <Actor entry={entry} />
        </Typography>
        <Typography variant="body2">{entry.resourceType}</Typography>
        <Identifier value={entry.resourceId} label="recurso" />
        <Button startIcon={<VisibilityOutlined />} onClick={() => onSelect(entry)}>
          Ver detalle
        </Button>
      </Stack>
    </Paper>
  );
}

function Actor({ entry }: { entry: AdminAuditLog }) {
  if (entry.actorType === 'SYSTEM') return <>Sistema</>;
  if (entry.actorType === 'PUBLIC_TOKEN') return <>Token público · {truncate(entry.actorFingerprint)}</>;
  return (
    <>
      {entry.actorType === 'USER' ? 'Usuario' : 'Token staff'} · {entry.actorId}
    </>
  );
}

function Identifier({ value, label }: { value: string | null; label: string }) {
  if (!value)
    return (
      <Typography variant="caption" color="text.secondary">
        —
      </Typography>
    );
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      <IconButton
        size="small"
        aria-label={`Copiar ID de ${label}`}
        onClick={() => void navigator.clipboard?.writeText(value)}
      >
        <ContentCopyOutlined fontSize="inherit" />
      </IconButton>
    </Stack>
  );
}

function AuditDetailDialog({ entry, onClose }: { entry: AdminAuditLog | undefined; onClose: () => void }) {
  return (
    <Dialog open={Boolean(entry)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Detalle del registro</DialogTitle>
      <DialogContent dividers>
        {entry ? (
          <Stack spacing={2}>
            <Typography variant="body2">Registro {entry.id}</Typography>
            {(['beforeData', 'afterData', 'metadata'] as const).map((field) => (
              <Box key={field}>
                <Typography sx={{ fontWeight: 700 }}>{field}</Typography>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'grey.100',
                    p: 1.5,
                    borderRadius: 1,
                    maxHeight: 260,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere'
                  }}
                >
                  {JSON.stringify(entry[field], null, 2)}
                </Box>
              </Box>
            ))}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

function compactDraft(draft: DraftFilters): AdminAuditFilters {
  const { createdFrom: _from, createdTo: _to, ...values } = draft;
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== '' && value !== undefined)
  ) as AdminAuditFilters;
}

function truncate(value: string | null) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'sin huella';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function requireAuditClient(apiClient: ApiClient) {
  if (!apiClient.adminAudit) throw new Error('The administrative audit client is unavailable.');
  return apiClient.adminAudit;
}
