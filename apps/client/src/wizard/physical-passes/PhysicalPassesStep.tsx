import type { ApiClient, Event } from '@invitaciones/api-client';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttemptManager, isUncertainFailure } from '../wizard-model';
import { downloadBlob, errorMessage } from '../wizard-utils';

type Batch = { id: string; first: number; last: number; quantity: number; table: string | null };
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
    { key: string; identity: string; beforeMax: number; quantity: number; tableShapeId: string } | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
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
    if (busy) return;
    setBusy(true);
    const attemptedQuantity = retry && uncertain ? uncertain.quantity : quantity;
    const attemptedTable = retry && uncertain ? uncertain.tableShapeId : tableShapeId;
    const identity = `${attemptedQuantity}:${attemptedTable || 'none'}`;
    const attempt =
      retry && uncertain
        ? attempts.current.start('passes', uncertain.identity)
        : attempts.current.start('passes', identity, true);
    const beforeMax = retry && uncertain ? uncertain.beforeMax : Math.max(0, ...passes.map((pass) => pass.passNumber));
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
          const afterMax = Math.max(0, ...latest.map((pass) => pass.passNumber));
          if (afterMax > beforeMax) {
            attempts.current.clear('passes', attempt.key);
            setUncertain(undefined);
            setBatches((current) => [
              ...current,
              {
                id: attempt.key,
                first: beforeMax + 1,
                last: afterMax,
                quantity: afterMax - beforeMax,
                table: tables.find((table) => table.id === attemptedTable)?.name ?? null
              }
            ]);
            setMessage('El lote fue reconciliado con el listado del servidor.');
          } else {
            setUncertain({
              key: attempt.key,
              identity,
              beforeMax,
              quantity: attemptedQuantity,
              tableShapeId: attemptedTable
            });
            setMessage('No conocemos el resultado. Reintenta este mismo intento para conservar la llave.');
          }
        } catch {
          setUncertain({
            key: attempt.key,
            identity,
            beforeMax,
            quantity: attemptedQuantity,
            tableShapeId: attemptedTable
          });
          setMessage('No conocemos el resultado. Reintenta este mismo intento para conservar la llave.');
        }
      } else {
        attempts.current.clear('passes', attempt.key);
        setUncertain(undefined);
        setMessage(errorMessage(reason));
      }
    } finally {
      setBusy(false);
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
          disabled={busy || Boolean(uncertain)}
          slotProps={{ htmlInput: { min: 1 } }}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <TextField
          select
          label="Mesa opcional"
          value={tableShapeId}
          disabled={busy || Boolean(uncertain)}
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
          disabled={disabled || busy || Boolean(uncertain) || quantity < 1}
          onClick={() => void run(false)}
        >
          Generar lote
        </Button>
        {uncertain ? (
          <Button disabled={busy} onClick={() => void run(true)}>
            Reintentar lote incierto
          </Button>
        ) : null}
      </Stack>
      <Typography>
        {passes.length} pases generados · {passes.filter((pass) => pass.status === 'USED').length} usados ·{' '}
        {passes.filter((pass) => pass.status === 'UNUSED').length} no usados
      </Typography>
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
      {message ? <Alert severity="info">{message}</Alert> : null}
    </Stack>
  );
}
