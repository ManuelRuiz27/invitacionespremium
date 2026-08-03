import { useState } from 'react';
import type { AdminManualPaymentInput, ApiClient } from '@invitaciones/api-client';
import { MetricCard, StatusChip } from '@invitaciones/ui';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage, isUncertainFailure } from '../shared/admin-error';
import { AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { formatDateTime } from '../shared/admin-labels';
import { formatCredits, formatMxn, parseMxnToCents } from './finance-format';
import { useStableIdempotency } from './use-stable-idempotency';

type Action = 'credits' | 'line' | 'payment' | 'rebuild' | null;

export function AdminClientFinancePanel({ apiClient, clientId }: { apiClient: ApiClient; clientId: string }) {
  const [action, setAction] = useState<Action>(null);
  const balance = useQuery({
    queryKey: adminQueryKeys.finance(clientId),
    queryFn: ({ signal }) => apiClient.adminFinance.balance(clientId, signal)
  });
  if (balance.isPending) return <AdminLoadingState label="Cargando balance financiero..." />;
  if (balance.isError) return <AdminErrorState onRetry={() => void balance.refetch()} />;
  const data = balance.data;
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h2">Finanzas</Typography>
        <Typography color="text.secondary">
          Balance autoritativo del ledger. Ninguna accion aplica cambios optimistas.
        </Typography>
      </Box>
      {!data.reconciliation.matchesLedger ? (
        <Alert severity="warning">El cache no coincide con el ledger. Reconstruye el balance antes de operar.</Alert>
      ) : null}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard label="Creditos comprados" value={formatCredits(data.purchasedCredits)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard label="Linea disponible" value={formatCredits(data.creditLine.availableCredits)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard label="Deuda en creditos" value={formatCredits(data.debtCredits)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard label="Deuda MXN" value={formatMxn(data.debtMxnCents)} />
        </Grid>
      </Grid>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <Button variant="contained" onClick={() => setAction('credits')}>
          Asignar creditos gratuitos
        </Button>
        <Button variant="outlined" onClick={() => setAction('line')}>
          Configurar linea
        </Button>
        <Button variant="outlined" onClick={() => setAction('payment')}>
          Registrar pago manual
        </Button>
        <Button color="warning" onClick={() => setAction('rebuild')}>
          Reconstruir balance
        </Button>
      </Stack>
      <Divider />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Linea
          </Typography>
          <Typography>
            {data.creditLine.status ?? 'Sin asignar'} · {formatCredits(data.creditLine.usedCredits)} /{' '}
            {formatCredits(data.creditLine.limitCredits)} usados
          </Typography>
          {data.creditLine.expiresAt ? (
            <Typography variant="body2">Vigencia: {formatDateTime(data.creditLine.expiresAt)}</Typography>
          ) : null}
          {data.creditLine.notes ? <Typography variant="body2">Notas: {data.creditLine.notes}</Typography> : null}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Reconciliacion
          </Typography>
          <Box>
            <StatusChip
              label={data.reconciliation.matchesLedger ? 'Verificada' : 'Diferencia detectada'}
              tone={data.reconciliation.matchesLedger ? 'success' : 'danger'}
            />
          </Box>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Actualizado
          </Typography>
          <Typography>
            {formatDateTime(data.updatedAt)} · secuencia {data.lastLedgerSequence ?? 'sin movimientos'}
          </Typography>
        </Box>
      </Stack>
      <FinanceActionDialog
        action={action}
        onClose={() => setAction(null)}
        apiClient={apiClient}
        clientId={clientId}
        balance={data}
      />
    </Stack>
  );
}

function FinanceActionDialog({
  action,
  onClose,
  apiClient,
  clientId,
  balance
}: {
  action: Action;
  onClose: () => void;
  apiClient: ApiClient;
  clientId: string;
  balance: Awaited<ReturnType<ApiClient['adminFinance']['balance']>>;
}) {
  const queryClient = useQueryClient();
  const stable = useStableIdempotency();
  const [credits, setCredits] = useState('');
  const [reason, setReason] = useState('');
  const [limit, setLimit] = useState(String(balance.creditLine.limitCredits));
  const [lineStatus, setLineStatus] = useState<'ACTIVE' | 'SUSPENDED'>(balance.creditLine.status ?? 'ACTIVE');
  const [lineExpiresAt, setLineExpiresAt] = useState(balance.creditLine.expiresAt?.slice(0, 16) ?? '');
  const [lineNotes, setLineNotes] = useState(balance.creditLine.notes ?? '');
  const [kind, setKind] = useState<'CREDIT_PURCHASE' | 'DEBT_PAYMENT'>('CREDIT_PURCHASE');
  const [amount, setAmount] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [unitValue, setUnitValue] = useState('');
  const [lotId, setLotId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error('Accion no disponible');
      const numericCredits = Number(credits);
      let body: unknown;
      if (action === 'credits') {
        if (!Number.isInteger(numericCredits) || numericCredits <= 0 || !reason.trim())
          throw new Error('Captura creditos enteros positivos y un motivo.');
        body = { credits: numericCredits, reason: reason.trim() };
      } else if (action === 'line') {
        const numericLimit = Number(limit);
        if (!Number.isInteger(numericLimit) || numericLimit < 0)
          throw new Error('El limite debe ser un entero no negativo.');
        body = {
          limitCredits: numericLimit,
          status: lineStatus,
          ...(lineExpiresAt ? { expiresAt: new Date(lineExpiresAt).toISOString() } : {}),
          ...(lineNotes.trim() ? { notes: lineNotes.trim() } : {})
        };
      } else if (action === 'payment') {
        const cents = parseMxnToCents(amount);
        if (cents === null || cents <= 0 || !externalReference.trim())
          throw new Error('Captura un monto MXN positivo con hasta dos decimales y una referencia.');
        if (!Number.isInteger(numericCredits) || numericCredits <= 0)
          throw new Error('Los creditos deben ser enteros positivos.');
        if (kind === 'CREDIT_PURCHASE') {
          const unitCents = parseMxnToCents(unitValue);
          if (unitCents === null || unitCents <= 0) throw new Error('Captura el valor unitario del credito.');
          body = {
            kind,
            amountMxnCents: cents,
            externalReference: externalReference.trim(),
            credits: numericCredits,
            creditUnitValueMxnCents: unitCents
          } satisfies AdminManualPaymentInput;
        } else {
          if (!lotId.trim()) throw new Error('Captura el identificador del lote de deuda.');
          body = {
            kind,
            amountMxnCents: cents,
            externalReference: externalReference.trim(),
            allocations: [{ debtLotLedgerEntryId: lotId.trim(), credits: numericCredits }]
          } satisfies AdminManualPaymentInput;
        }
      }
      const fingerprint = JSON.stringify({ action, body });
      const key = stable.begin(fingerprint);
      if (!key) throw new Error('La operacion ya esta en curso.');
      try {
        if (action === 'credits')
          return await apiClient.adminFinance.assignCredits(
            clientId,
            body as Parameters<typeof apiClient.adminFinance.assignCredits>[1],
            key
          );
        if (action === 'line')
          return await apiClient.adminFinance.configureCreditLine(
            clientId,
            body as Parameters<typeof apiClient.adminFinance.configureCreditLine>[1],
            key
          );
        if (action === 'payment')
          return await apiClient.adminFinance.manualPayment(clientId, body as AdminManualPaymentInput, key);
        return await apiClient.adminFinance.rebuildBalance(clientId, key);
      } catch (cause) {
        stable.finish({ retain: isUncertainFailure(cause) });
        throw cause;
      }
    },
    onSuccess: async () => {
      stable.finish({ retain: false });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.finance(clientId) });
      onClose();
    },
    onError: (cause) => {
      setError(adminErrorMessage(cause).message);
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.finance(clientId) });
    }
  });

  const title =
    action === 'credits'
      ? 'Asignar creditos gratuitos'
      : action === 'line'
        ? 'Configurar linea de credito'
        : action === 'payment'
          ? 'Registrar pago manual aprobado'
          : 'Reconstruir balance desde ledger';
  return (
    <Dialog open={action !== null} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {action === 'credits' ? (
            <>
              <TextField
                label="Creditos"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                inputMode="numeric"
              />
              <TextField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} multiline />
            </>
          ) : null}
          {action === 'line' ? (
            <>
              <TextField
                label="Limite de creditos"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="numeric"
              />
              <FormControl>
                <InputLabel>Estado</InputLabel>
                <Select
                  label="Estado"
                  value={lineStatus}
                  onChange={(e) => setLineStatus(e.target.value as typeof lineStatus)}
                >
                  <MenuItem value="ACTIVE">Activa</MenuItem>
                  <MenuItem value="SUSPENDED">Suspendida</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Vigencia"
                type="datetime-local"
                value={lineExpiresAt}
                onChange={(e) => setLineExpiresAt(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField label="Notas" value={lineNotes} onChange={(e) => setLineNotes(e.target.value)} multiline />
            </>
          ) : null}
          {action === 'payment' ? (
            <>
              <FormControl>
                <InputLabel>Tipo</InputLabel>
                <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <MenuItem value="CREDIT_PURCHASE">Compra de creditos</MenuItem>
                  <MenuItem value="DEBT_PAYMENT">Pago de deuda</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Monto MXN"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              <TextField
                label="Referencia externa"
                value={externalReference}
                onChange={(e) => setExternalReference(e.target.value)}
              />
              <TextField
                label="Creditos"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                inputMode="numeric"
              />
              {kind === 'CREDIT_PURCHASE' ? (
                <TextField
                  label="Valor unitario MXN"
                  value={unitValue}
                  onChange={(e) => setUnitValue(e.target.value)}
                  inputMode="decimal"
                />
              ) : (
                <TextField label="ID del lote de deuda" value={lotId} onChange={(e) => setLotId(e.target.value)} />
              )}
            </>
          ) : null}
          {action === 'rebuild' ? (
            <Alert severity="warning">
              Esta accion reconstruira el balance a partir del ledger autoritativo. El ledger no se modifica.
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Procesando...' : 'Confirmar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
