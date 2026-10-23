import {
  ApiError,
  type AccessOperations,
  type AnonymousAccessOperations,
  type ApiClient,
  type Event,
  type NominalAccessOperations
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSessionExpiry } from '../../shared/use-session-expiry';
import { useWorkspaceRealtime } from '../useWorkspaceRealtime';

type StatusFilter = 'ALL' | 'PENDING' | 'ENTERED' | 'UNUSED' | 'USED' | 'REVOKED';
const statusLabels: Record<Exclude<StatusFilter, 'ALL'>, string> = {
  PENDING: 'Pendiente',
  ENTERED: 'Ingresado',
  UNUSED: 'Pendiente',
  USED: 'Utilizado',
  REVOKED: 'Revocado'
};

export function accessOperationsPollingInterval(status: string | undefined): number | false {
  return status === 'ACTIVE' || status === 'EVENT_DAY' ? 10_000 : false;
}

export function AccessOperationsPanel({ apiClient, event }: { apiClient: ApiClient; event: Event }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const queryKey = ['access-operations', event.id, event.accessMode, page];
  const privacy = useMemo(
    () =>
      queryClient
        .getQueryCache()
        .find({ queryKey: ['access-operations', event.id, event.accessMode, page], exact: true })?.meta ?? {
        blockedDataVersion: -1
      },
    [queryClient, event.id, event.accessMode, page]
  );
  const operations = useQuery({
    queryKey,
    meta: privacy,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.events.getAccessOperations(event.id, signal, page);
      } catch (error) {
        if (suppressSnapshot(error)) {
          // The barrier survives transient failures and remounts of every cached page.
          for (const query of queryClient
            .getQueryCache()
            .findAll({ queryKey: ['access-operations', event.id, event.accessMode] })) {
            if (query.meta) query.meta.blockedDataVersion = query.state.dataUpdateCount;
          }
          await queryClient.cancelQueries(
            {
              queryKey: ['access-operations', event.id, event.accessMode],
              predicate: (query) => query.queryKey[3] !== page
            },
            { revert: false }
          );
        }
        throw error;
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      suppressSnapshot(query.state.error) || query.state.dataUpdateCount <= Number(query.meta?.blockedDataVersion ?? -1)
        ? false
        : accessOperationsPollingInterval(query.state.data?.eventStatus)
  });
  const denied = accessDenied(operations.error);
  const snapshotBlocked =
    (queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0) <= Number(privacy.blockedDataVersion ?? -1);
  const data =
    !snapshotBlocked &&
    !suppressSnapshot(operations.error) &&
    operations.data?.eventId === event.id &&
    operations.data.accessMode === event.accessMode
      ? operations.data
      : undefined;
  const live = Boolean(data && accessOperationsPollingInterval(data.eventStatus));
  const responseStatus = data?.eventStatus;
  useEffect(() => {
    if (responseStatus && responseStatus !== event.status) {
      void queryClient.invalidateQueries({ queryKey: ['events', event.id] });
    }
  }, [responseStatus, event.status, event.id, queryClient]);
  useSessionExpiry(operations.error, `/eventos/${event.id}?seccion=ingresos`);
  useWorkspaceRealtime(
    event.id,
    live,
    {
      onSeatingUpdated: () => undefined,
      onTerminal: () => undefined,
      onOperationalChange: () =>
        void queryClient.invalidateQueries({ queryKey: ['access-operations', event.id, event.accessMode] })
    },
    'dashboard'
  );

  const changePage = (next: number) => {
    setPage(next);
    setSearch('');
    setStatus('ALL');
  };
  const refresh = () => void operations.refetch();

  return (
    <Stack component="section" aria-labelledby="access-operations-title" spacing={3} sx={{ minWidth: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography id="access-operations-title" component="h2" variant="h3">
            Ingresos y aforo
          </Typography>
          <Typography color="text.secondary">Consulta los accesos del evento y su ingreso registrado.</Typography>
        </Box>
        <Button
          onClick={refresh}
          disabled={operations.isFetching}
          variant="outlined"
          sx={{ minHeight: 44, alignSelf: { xs: 'flex-start', sm: 'center' } }}
        >
          {operations.isFetching ? 'Actualizando…' : 'Actualizar'}
        </Button>
      </Stack>
      {operations.isPending ? <Typography role="status">Cargando ingresos y aforo…</Typography> : null}
      {operations.isError ? (
        <Alert severity={data ? 'warning' : 'error'}>
          {data
            ? 'Datos desactualizados. No pudimos obtener una lectura nueva; las cifras siguientes corresponden a la última consulta confirmada.'
            : denied
              ? 'El evento no está disponible o tu cuenta ya no tiene acceso.'
              : operations.error instanceof ApiError && operations.error.status === 410
                ? 'El plazo permitido para consultar estos datos terminó. La información ya no está disponible.'
                : operations.error instanceof ApiError && operations.error.code === 'ACCESS_OPERATIONS_INCONSISTENT'
                  ? 'Hay una inconsistencia en los registros de acceso. Solicita a InvitacionesPremium revisar el evento antes de interpretar sus cifras.'
                  : 'No pudimos consultar los ingresos. Revisa tu conexión y utiliza Actualizar para reintentar.'}
        </Alert>
      ) : null}
      {data ? (
        <>
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            {operations.isError ? 'Última lectura confirmada' : 'Datos al'}:{' '}
            <time dateTime={data.asOf}>{formatTime(data.asOf, event.timeZone)}</time>
            {event.timeZone ? '' : ' UTC'}
          </Typography>
          <Box
            component="dl"
            aria-label="Cifras del evento"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
              gap: 2
            }}
          >
            {(
              [
                ['Accesos vigentes', data.activeRights],
                ['Ingresados', data.entered],
                ['Pendientes', data.pending],
                ['Capacidad disponible', data.availableCapacity]
              ] as const
            ).map(([label, value]) => (
              <Box key={label} sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, minWidth: 0 }}>
                <Typography component="dt" variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography component="dd" variant="h3" sx={{ m: 0, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {value ?? 'Por definir'}
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            La capacidad disponible indica cuántos derechos adicionales pueden emitirse. Los pendientes ya tienen un
            acceso vigente.
          </Typography>
          <Box
            component="dl"
            aria-label="Capacidad e histórico"
            sx={{ m: 0, display: 'flex', flexWrap: 'wrap', gap: 3 }}
          >
            {(
              [
                ['Capacidad total', data.capacity],
                ['Emitidos históricamente', data.issuedHistorical],
                ['Revocados históricamente', data.revokedHistorical]
              ] as const
            ).map(([label, value]) => (
              <Box key={label}>
                <Typography component="dt" variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography component="dd" sx={{ m: 0, fontWeight: 700 }}>
                  {value ?? 'Pendiente de configurar'}
                </Typography>
              </Box>
            ))}
          </Box>
          <OperationsTables data={data} enabled={event.floorplanEnabled} />
          <Stack spacing={2} component="section" aria-labelledby="access-detail-title">
            <Typography id="access-detail-title" component="h3" variant="h5">
              {data.accessMode === 'NOMINAL' ? 'Detalle por invitado' : 'Detalle por folio'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Buscar en esta página"
                value={search}
                onChange={(change) => setSearch(change.target.value)}
                fullWidth
              />
              <TextField
                select
                label="Estado en esta página"
                value={status}
                onChange={(change) => setStatus(change.target.value as StatusFilter)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="ALL">Todos</MenuItem>
                {(data.accessMode === 'NOMINAL'
                  ? (['PENDING', 'ENTERED'] as const)
                  : (['UNUSED', 'USED', 'REVOKED'] as const)
                ).map((value) => (
                  <MenuItem key={value} value={value}>
                    {statusLabels[value]}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              La búsqueda y los filtros se aplican sólo a esta página. Las cifras del evento y de las mesas conservan
              sus totales completos.
            </Typography>
            {data.details.length === 0 ? (
              <Typography color="text.secondary">No hay registros de acceso para mostrar.</Typography>
            ) : data.accessMode === 'NOMINAL' ? (
              <NominalDetails
                rows={data.details.filter(
                  (row) =>
                    matchesStatus(row.status, status) &&
                    matchesSearch([row.name, row.group, row.table?.name, row.seat?.label], search)
                )}
                mobile={mobile}
                timeZone={event.timeZone}
              />
            ) : (
              <AnonymousDetails
                rows={data.details.filter(
                  (row) =>
                    matchesStatus(row.status, status) &&
                    matchesSearch([String(row.passNumber), row.table?.name], search)
                )}
                mobile={mobile}
                timeZone={event.timeZone}
              />
            )}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ gap: 1, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Typography variant="body2">
                Página {data.detailPage} · {data.detailTotal} registros en total
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  disabled={operations.isFetching || data.detailPage <= 1}
                  onClick={() => changePage(data.detailPage - 1)}
                  sx={{ minHeight: 44 }}
                >
                  Anterior
                </Button>
                <Button
                  disabled={operations.isFetching || data.detailPage * data.detailPageSize >= data.detailTotal}
                  onClick={() => changePage(data.detailPage + 1)}
                  sx={{ minHeight: 44 }}
                >
                  Siguiente
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}

function OperationsTables({ data, enabled }: { data: AccessOperations; enabled: boolean }) {
  if (!enabled && data.tables.length === 0)
    return <Typography color="text.secondary">Este evento no utiliza croquis ni mesas.</Typography>;
  return (
    <Stack spacing={1} component="section" aria-labelledby="access-tables-title">
      <Typography id="access-tables-title" component="h3" variant="h5">
        Ocupación por mesa
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Los derechos asignados reservan lugares; Ingresados muestra el uso registrado de esos accesos.
      </Typography>
      {data.tables.length ? (
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table size="small" aria-label="Ocupación por mesa" sx={{ minWidth: 580 }}>
            <TableHead>
              <TableRow>
                {['Mesa', 'Capacidad', 'Derechos asignados', 'Ingresados', 'Pendientes', 'Disponibles'].map(
                  (label, index) => (
                    <TableCell key={label} align={index ? 'right' : 'left'}>
                      {label}
                    </TableCell>
                  )
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tables.map((table) => (
                <TableRow key={table.tableId}>
                  <TableCell component="th" scope="row">
                    {table.tableName}
                  </TableCell>
                  {[table.capacity, table.activeRights, table.entered, table.pending, table.availableCapacity].map(
                    (value, index) => (
                      <TableCell key={index} align="right">
                        {value}
                      </TableCell>
                    )
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography color="text.secondary">No hay mesas activas para mostrar.</Typography>
      )}
    </Stack>
  );
}

function NominalDetails({
  rows,
  mobile,
  timeZone
}: {
  rows: NominalAccessOperations['details'];
  mobile: boolean;
  timeZone: string | null;
}) {
  if (rows.length === 0)
    return (
      <Typography color="text.secondary">No hay invitados que coincidan con los filtros de esta página.</Typography>
    );
  if (mobile)
    return (
      <Stack component="ul" aria-label="Ingresos nominales" sx={{ p: 0, m: 0, listStyle: 'none' }} spacing={2}>
        {rows.map((row) => (
          <Box component="li" key={row.assistantId} sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
              {row.name ?? 'Identidad protegida'}
            </Typography>
            <DetailFields
              fields={[
                ['Grupo', row.group ?? 'Sin grupo'],
                ['Mesa / Lugar', place(row.table, row.seat)],
                ['Estado', statusLabels[row.status]],
                ['Hora de ingreso', formatTime(row.enteredAt, timeZone)]
              ]}
            />
          </Box>
        ))}
      </Stack>
    );
  return (
    <TableContainer>
      <Table aria-label="Ingresos nominales" size="small">
        <TableHead>
          <TableRow>
            {['Nombre', 'Grupo', 'Mesa / Lugar', 'Estado', 'Hora de ingreso'].map((label) => (
              <TableCell key={label}>{label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.assistantId}>
              <TableCell component="th" scope="row">
                {row.name ?? 'Identidad protegida'}
              </TableCell>
              <TableCell>{row.group ?? 'Sin grupo'}</TableCell>
              <TableCell>{place(row.table, row.seat)}</TableCell>
              <TableCell>{statusLabels[row.status]}</TableCell>
              <TableCell>{formatTime(row.enteredAt, timeZone)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function AnonymousDetails({
  rows,
  mobile,
  timeZone
}: {
  rows: AnonymousAccessOperations['details'];
  mobile: boolean;
  timeZone: string | null;
}) {
  if (rows.length === 0)
    return <Typography color="text.secondary">No hay folios que coincidan con los filtros de esta página.</Typography>;
  if (mobile)
    return (
      <Stack component="ul" aria-label="Ingresos por folio" sx={{ p: 0, m: 0, listStyle: 'none' }} spacing={2}>
        {rows.map((row) => (
          <Box component="li" key={row.passNumber} sx={{ pb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography sx={{ fontWeight: 700 }}>Folio {row.passNumber}</Typography>
            <DetailFields
              fields={[
                ['Mesa', row.table?.name ?? 'Sin mesa'],
                ['Estado', statusLabels[row.status]],
                ['Hora de uso', formatTime(row.usedAt, timeZone)]
              ]}
            />
          </Box>
        ))}
      </Stack>
    );
  return (
    <TableContainer>
      <Table aria-label="Ingresos por folio" size="small">
        <TableHead>
          <TableRow>
            {['Folio', 'Mesa', 'Estado', 'Hora de uso'].map((label) => (
              <TableCell key={label}>{label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.passNumber}>
              <TableCell component="th" scope="row">
                {row.passNumber}
              </TableCell>
              <TableCell>{row.table?.name ?? 'Sin mesa'}</TableCell>
              <TableCell>{statusLabels[row.status]}</TableCell>
              <TableCell>{formatTime(row.usedAt, timeZone)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function DetailFields({ fields }: { fields: Array<[string, string]> }) {
  return (
    <Box
      component="dl"
      sx={{ m: 0, mt: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 0.5 }}
    >
      {fields.map(([label, value]) => (
        <Box key={label} sx={{ display: 'contents' }}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function accessDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
function suppressSnapshot(error: unknown): boolean {
  return error instanceof ApiError && error.status < 500;
}
function matchesStatus(value: string, status: StatusFilter): boolean {
  return status === 'ALL' || status === value;
}
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}
function matchesSearch(values: Array<string | null | undefined>, query: string): boolean {
  const term = normalize(query);
  return !term || values.some((value) => value && normalize(value).includes(term));
}
function place(table: { name: string } | null, seat: { label: string } | null): string {
  return table ? `${table.name}${seat ? ` · Lugar ${seat.label}` : ''}` : 'Sin mesa';
}
function formatTime(value: string | null, timeZone: string | null): string {
  return value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium', timeZone: timeZone ?? 'UTC' }).format(
        new Date(value)
      )
    : 'Sin ingreso';
}
