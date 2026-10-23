import { ApiError, type AdminEvent, type ApiClient } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { adminQueryKeys } from '../app/query-client';

export function AdminAccessOperationsPanel({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const queryClient = useQueryClient();
  const queryKey = adminQueryKeys.accessOperations(event.clientId, event.id, event.accessMode ?? null);
  const privacy = useMemo(
    () =>
      queryClient.getQueryCache().find({
        queryKey: adminQueryKeys.accessOperations(event.clientId, event.id, event.accessMode ?? null),
        exact: true
      })?.meta ?? { blockedDataVersion: -1 },
    [queryClient, event.clientId, event.id, event.accessMode]
  );
  const summary = useQuery({
    queryKey,
    meta: privacy,
    queryFn: async ({ signal }) => {
      try {
        const result = await apiClient.adminEventPreparation.getAccessOperations(event.clientId, event.id, signal);
        if (result.eventId !== event.id || result.accessMode !== event.accessMode) {
          throw new ApiError(502, 'UNEXPECTED_API_RESPONSE', 'El resumen no corresponde al Evento solicitado.');
        }
        return result;
      } catch (error) {
        if (authoritativeFailure(error))
          privacy.blockedDataVersion = queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0;
        throw error;
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) =>
      !authoritativeFailure(query.state.error) &&
      query.state.dataUpdateCount > Number(query.meta?.blockedDataVersion ?? -1) &&
      ['ACTIVE', 'EVENT_DAY'].includes(query.state.data?.eventStatus ?? event.status)
        ? 10_000
        : false,
    refetchIntervalInBackground: false,
    retry: false
  });
  const dataVersion = queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0;
  const snapshotBlocked = typeof privacy.blockedDataVersion === 'number' && dataVersion <= privacy.blockedDataVersion;
  const data = snapshotBlocked || (summary.isError && !transientFailure(summary.error)) ? undefined : summary.data;
  const inconsistent = summary.error instanceof ApiError && summary.error.code === 'ACCESS_OPERATIONS_INCONSISTENT';
  const expired = summary.error instanceof ApiError && summary.error.code === 'ACCESS_OPERATIONS_CONTENT_EXPIRED';

  return (
    <Card component="section" aria-labelledby="admin-access-operations-title">
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Typography id="admin-access-operations-title" component="h2" variant="h4">
              Ingresos y aforo
            </Typography>
            <Button
              variant="outlined"
              disabled={summary.isFetching}
              onClick={() => void summary.refetch()}
              sx={{ minHeight: 44 }}
            >
              {summary.isFetching ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </Stack>
          {!data && summary.isPending ? (
            <Stack direction="row" spacing={1} role="status" sx={{ alignItems: 'center' }}>
              <CircularProgress size={20} aria-hidden="true" />
              <Typography>Consultando ingresos y aforo…</Typography>
            </Stack>
          ) : null}
          {summary.isError ? (
            <Alert severity={data ? 'warning' : 'error'} role="alert">
              {inconsistent
                ? 'No podemos mostrar cifras conciliadas. Revisa la incidencia de accesos y vuelve a actualizar. El resumen anterior se ha ocultado.'
                : expired
                  ? 'La información operativa ya no está disponible por su política de conservación.'
                  : data
                    ? 'Datos desactualizados. No pudimos actualizar la última lectura. Reintenta con Actualizar.'
                    : 'No pudimos consultar ingresos y aforo. Reintenta con Actualizar.'}
            </Alert>
          ) : null}
          {data ? (
            <>
              <Typography>Modalidad: {data.accessMode === 'NOMINAL' ? 'Nominal' : 'Anónima'}</Typography>
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                {summary.isFetching ? 'Actualizando la lectura. ' : ''}Última lectura del servidor:{' '}
                <Box component="time" dateTime={data.asOf}>
                  {new Date(data.asOf).toLocaleString('es-MX', { timeZone: event.timeZone ?? 'UTC' })}
                </Box>
              </Typography>
              <Grid container spacing={2} sx={{ m: 0 }}>
                <Metric label="Accesos vigentes" value={data.activeRights} />
                <Metric label="Ingresados" value={data.entered} />
                <Metric label="Pendientes" value={data.pending} />
                <Metric label="Capacidad disponible" value={data.availableCapacity} />
              </Grid>
              <Typography variant="body2" color="text.secondary">
                La capacidad disponible permite emitir nuevos derechos de acceso. Los pendientes son accesos vigentes
                que aún no han ingresado.
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.5, md: 3 }}>
                <Typography>Capacidad total: {data.capacity ?? 'Sin definir'}</Typography>
                <Typography>Emitidos históricos: {data.issuedHistorical}</Typography>
                <Typography>Revocados históricos: {data.revokedHistorical}</Typography>
              </Stack>
              {data.activeRights === 0 ? (
                <Alert severity="info">Este Evento todavía no tiene accesos vigentes.</Alert>
              ) : null}
              {data.tables.length ? (
                <TableContainer sx={{ overflowX: 'auto' }} tabIndex={0} aria-label="Desplazar resumen de Mesas">
                  <Table size="small" aria-label="Ocupación por Mesa" sx={{ minWidth: 620 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Mesa</TableCell>
                        <TableCell align="right">Capacidad</TableCell>
                        <TableCell align="right">Derechos asignados</TableCell>
                        <TableCell align="right">Ingresados</TableCell>
                        <TableCell align="right">Pendientes</TableCell>
                        <TableCell align="right">Disponibles</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.tables.map((table) => (
                        <TableRow key={table.tableId} sx={{ height: 48 }}>
                          <TableCell component="th" scope="row">
                            {table.tableName}
                          </TableCell>
                          <TableCell align="right">{table.capacity}</TableCell>
                          <TableCell align="right">{table.activeRights}</TableCell>
                          <TableCell align="right">{table.entered}</TableCell>
                          <TableCell align="right">{table.pending}</TableCell>
                          <TableCell align="right">{table.availableCapacity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary">
                  {event.floorplanEnabled
                    ? 'No hay Mesas activas para esta lectura.'
                    : 'Evento sin Croquis: se muestran los totales del Evento.'}
                </Typography>
              )}
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Box component="dl" sx={{ m: 0, p: 2, border: 1, borderColor: 'divider', borderRadius: 2, height: '100%' }}>
        <Typography component="dt" variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography component="dd" variant="h3" sx={{ m: 0 }}>
          {value ?? 'Sin definir'}
        </Typography>
      </Box>
    </Grid>
  );
}

function transientFailure(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500;
}

function authoritativeFailure(error: unknown) {
  return error instanceof ApiError && [401, 403, 404, 409, 410].includes(error.status);
}
