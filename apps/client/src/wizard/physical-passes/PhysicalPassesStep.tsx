import type { ApiClient, Event } from '@invitaciones/api-client';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttemptManager, isUncertainFailure } from '../wizard-model';
import { downloadBlob, errorMessage } from '../wizard-utils';
import {
  createPhysicalPassesPdf,
  PHYSICAL_PASSES_PER_PDF_PAGE,
  physicalPassesPdfFilename
} from './physical-passes-pdf';

type Batch = { id: string; first: number; last: number; quantity: number; table: string | null };
type TableOption = { id: string; name: string; capacity: number; availableCapacity: number };
type Message = { severity: 'error' | 'info' | 'success'; text: string };
export function PhysicalPassesStep({
  apiClient,
  event,
  disabled
}: {
  apiClient: ApiClient;
  event: Event;
  disabled: boolean;
}) {
  const attempts = useRef(new AttemptManager());
  const [quantity, setQuantity] = useState(1);
  const [tableShapeId, setTableShapeId] = useState('');
  const [passes, setPasses] = useState<Awaited<ReturnType<ApiClient['physicalPasses']['list']>>>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [tablesState, setTablesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [tablesRequest, setTablesRequest] = useState(0);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [uncertain, setUncertain] = useState<
    { key: string; identity: string; quantity: number; tableShapeId: string } | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ completed: number; total: number }>();
  const [message, setMessage] = useState<Message>();
  const refresh = useCallback(() => apiClient.physicalPasses.list(event.id).then(setPasses), [apiClient, event.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!event.floorplanEnabled) {
      setTables([]);
      setTableShapeId('');
      setTablesState('idle');
      return;
    }
    const controller = new AbortController();
    setTablesState('loading');
    void apiClient.floorplan
      .get(event.id, controller.signal)
      .then((value) => {
        const nextTables = value.shapes
          .filter((shape) => shape.kind === 'TABLE')
          .map(({ id, name, capacity, availableCapacity }) => ({ id, name, capacity, availableCapacity }));
        setTables(nextTables);
        setTableShapeId((current) =>
          nextTables.some((table) => table.id === current && table.availableCapacity > 0) ? current : ''
        );
        setTablesState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setTables([]);
          setTableShapeId('');
          setTablesState('error');
        }
      });
    return () => controller.abort();
  }, [apiClient, event.floorplanEnabled, event.id, tablesRequest]);
  const selectedTableAvailable = tables.some(
    (table) => table.id === tableShapeId && table.availableCapacity > 0
  );
  const tableSelectionInvalid =
    event.floorplanEnabled && (tablesState !== 'ready' || !selectedTableAvailable);
  const run = async (retry = false) => {
    if (busy || exporting || (!retry && tableSelectionInvalid)) return;
    setBusy(true);
    const attemptedQuantity = retry && uncertain ? uncertain.quantity : quantity;
    const attemptedTable = retry && uncertain ? uncertain.tableShapeId : tableShapeId;
    const identity = `${attemptedQuantity}:${attemptedTable || 'none'}`;
    const attempt =
      retry && uncertain
        ? attempts.current.start('passes', uncertain.identity)
        : attempts.current.start('passes', identity, true);
    try {
      const result = await apiClient.physicalPasses.generate(
        event.id,
        { quantity: attemptedQuantity, ...(attemptedTable ? { tableShapeId: attemptedTable } : {}) },
        attempt.key
      );
      attempts.current.clear('passes', attempt.key);
      setUncertain(undefined);
      setBatches((current) => [
        ...current,
        {
          id: result.generationOperationId,
          first: result.firstPassNumber,
          last: result.lastPassNumber,
          quantity: result.quantity,
          table: result.table?.name ?? null
        }
      ]);
      await refresh();
    } catch (reason) {
      if (isUncertainFailure(reason)) {
        try {
          const latest = await apiClient.physicalPasses.list(event.id);
          setPasses(latest);
          setUncertain({
            key: attempt.key,
            identity,
            quantity: attemptedQuantity,
            tableShapeId: attemptedTable
          });
          setMessage({
            severity: 'info',
            text: 'No conocemos el resultado. Reintenta este mismo intento para conservar la llave.'
          });
        } catch {
          setUncertain({
            key: attempt.key,
            identity,
            quantity: attemptedQuantity,
            tableShapeId: attemptedTable
          });
          setMessage({
            severity: 'info',
            text: 'No conocemos el resultado. Reintenta este mismo intento para conservar la llave.'
          });
        }
      } else {
        attempts.current.clear('passes', attempt.key);
        setUncertain(undefined);
        setMessage({ severity: 'error', text: errorMessage(reason) });
      }
    } finally {
      setBusy(false);
    }
  };
  const exportPdf = async () => {
    if (busy || exporting || passes.length === 0) return;
    setExporting(true);
    setExportProgress({ completed: 0, total: passes.length });
    setMessage(undefined);
    try {
      const latestPasses = await apiClient.physicalPasses.list(event.id);
      setPasses(latestPasses);
      const pdf = await createPhysicalPassesPdf({
        eventName: event.name,
        passes: latestPasses,
        loadSvg: (pass) => apiClient.physicalPasses.svg(event.id, pass.id),
        onProgress: (completed, total) => setExportProgress({ completed, total })
      });
      downloadBlob(pdf, physicalPassesPdfFilename(event.name));
      setMessage({
        severity: 'success',
        text: `PDF listo: ${latestPasses.length} pases en ${Math.ceil(latestPasses.length / PHYSICAL_PASSES_PER_PDF_PAGE)} hoja(s).`
      });
    } catch (reason) {
      setMessage({ severity: 'error', text: `No fue posible exportar la plantilla. ${errorMessage(reason)}` });
    } finally {
      setExporting(false);
      setExportProgress(undefined);
    }
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Pases físicos
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          type="number"
          label="Cantidad"
          value={quantity}
          disabled={busy || exporting || Boolean(uncertain)}
          slotProps={{ htmlInput: { min: 1 } }}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        {event.floorplanEnabled ? (
          <TextField
            select
            required
            label="Mesa"
            value={tableShapeId}
            disabled={busy || exporting || Boolean(uncertain) || tablesState !== 'ready' || tables.length === 0}
            helperText="Cada lote debe asignarse a una Mesa preparada."
            onChange={(e) => setTableShapeId(e.target.value)}
          >
            <MenuItem value="" disabled>
              Selecciona una Mesa
            </MenuItem>
            {tables.map((table) => (
              <MenuItem key={table.id} value={table.id} disabled={table.availableCapacity === 0}>
                {table.name} · {table.availableCapacity} de {table.capacity} lugares disponibles
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Los pases se generarán sin Mesa.
          </Typography>
        )}
        <Button
          variant="contained"
          disabled={
            disabled ||
            busy ||
            exporting ||
            Boolean(uncertain) ||
            quantity < 1 ||
            tableSelectionInvalid
          }
          onClick={() => void run(false)}
        >
          Generar lote
        </Button>
        {uncertain ? (
          <Button disabled={busy || exporting} onClick={() => void run(true)}>
            Reintentar lote incierto
          </Button>
        ) : null}
      </Stack>
      {event.floorplanEnabled && tablesState === 'loading' ? (
        <Typography role="status">Cargando Mesas…</Typography>
      ) : null}
      {event.floorplanEnabled && tablesState === 'error' ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setTablesRequest((current) => current + 1)}>
              Reintentar
            </Button>
          }
        >
          No pudimos cargar las Mesas. Reintenta antes de generar el lote.
        </Alert>
      ) : null}
      {event.floorplanEnabled && tablesState === 'ready' && tables.length === 0 ? (
        <Alert severity="warning">
          No hay Mesas preparadas para este Evento. Solicita al equipo de InvitacionesPremium completar la distribución.
        </Alert>
      ) : null}
      <Typography>
        {passes.length} pases generados · {passes.filter((pass) => pass.status === 'USED').length} usados ·{' '}
        {passes.filter((pass) => pass.status === 'UNUSED').length} no usados
      </Typography>
      <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
        <Button
          variant="outlined"
          startIcon={<DownloadOutlinedIcon />}
          disabled={busy || exporting || passes.length === 0}
          onClick={() => void exportPdf()}
        >
          {exporting && exportProgress
            ? `Preparando PDF ${exportProgress.completed}/${exportProgress.total}`
            : 'Exportar plantilla PDF'}
        </Button>
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {exporting && exportProgress
            ? `Se han preparado ${exportProgress.completed} de ${exportProgress.total} pases.`
            : `Descarga todos los pases en hojas A4 listas para imprimir, con ${PHYSICAL_PASSES_PER_PDF_PAGE} pases por hoja.`}
        </Typography>
      </Stack>
      {batches.map((batch) => (
        <Alert key={batch.id} severity="success">
          Lote {batch.first}–{batch.last} · {batch.quantity} pases · Mesa: {batch.table ?? 'sin Mesa'}
        </Alert>
      ))}
      {passes.map((pass) => (
        <Stack key={pass.id} direction="row" sx={{ alignItems: 'center' }}>
          <Typography sx={{ flex: 1 }}>
            Pase {String(pass.passNumber).padStart(4, '0')} · {pass.status === 'USED' ? 'Usado' : 'No usado'} · Mesa:{' '}
            {pass.table?.name ?? 'sin Mesa'}
          </Typography>
          <Button
            disabled={exporting}
            onClick={() =>
              void apiClient.physicalPasses
                .svg(event.id, pass.id)
                .then((svg) =>
                  downloadBlob(
                    new Blob([svg], { type: 'image/svg+xml' }),
                    `pase-${String(pass.passNumber).padStart(4, '0')}.svg`
                  )
                )
            }
          >
            Descargar SVG
          </Button>
        </Stack>
      ))}
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
    </Stack>
  );
}
