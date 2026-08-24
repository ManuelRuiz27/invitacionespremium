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
  const [tables, setTables] = useState<{ id: string; name: string }[]>([]);
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
    if (event.floorplanEnabled)
      void apiClient.floorplan
        .get(event.id)
        .then((value) =>
          setTables(value.shapes.filter((shape) => shape.kind === 'TABLE').map(({ id, name }) => ({ id, name })))
        )
        .catch(() => setTables([]));
  }, [apiClient, event.floorplanEnabled, event.id, refresh]);
  const run = async (retry = false) => {
    if (busy || exporting) return;
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
        <TextField
          select
          label="Mesa opcional"
          value={tableShapeId}
          disabled={busy || exporting || Boolean(uncertain)}
          onChange={(e) => setTableShapeId(e.target.value)}
        >
          <MenuItem value="">Sin Mesa</MenuItem>
          {tables.map((table) => (
            <MenuItem key={table.id} value={table.id}>
              {table.name}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          disabled={disabled || busy || exporting || Boolean(uncertain) || quantity < 1}
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
