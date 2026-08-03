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
import {
  type AdminFinanceAction,
  type AdminFinanceIntent,
  useAdminFinanceIntentRegistry,
  useAdminFinanceIntents
} from './admin-finance-intents';
import { useStableIdempotency } from './use-stable-idempotency';
import { isAbortError, type AdminScopedOperation, useAdminOperationScope } from '../shared/useAdminOperationScope';

type Action = AdminFinanceAction | null;

export function AdminClientFinancePanel({ apiClient, clientId }: { apiClient: ApiClient; clientId: string }) {
  const [action, setAction] = useState<Action>(null);
  const [retryIntent, setRetryIntent] = useState<AdminFinanceIntent | null>(null);
  const intentRegistry = useAdminFinanceIntentRegistry();
  const uncertainIntents = useAdminFinanceIntents(clientId);
  const balance = useQuery({
    queryKey: adminQueryKeys.finance(clientId),
    queryFn: ({ signal }) => apiClient.adminFinance.balance(clientId, signal),
    refetchOnMount: uncertainIntents.length > 0 ? 'always' : true
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
      {uncertainIntents.map((intent) => (
        <Alert
          severity="warning"
          key={intent.fingerprint}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={() => void balance.refetch()}>
                Consultar balance
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setRetryIntent(intent);
                  setAction(intent.action);
                }}
              >
                Reintentar
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  intentRegistry.discard(clientId, intent.fingerprint);
                  setRetryIntent(null);
                  setAction(null);
                }}
              >
                Descartar
              </Button>
            </Stack>
          }
        >
          Existe una operacion financiera con resultado no confirmado para este Cliente.
        </Alert>
      ))}
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
        <Button
          variant="contained"
          onClick={() => {
            setRetryIntent(null);
            setAction('credits');
          }}
        >
          Asignar creditos gratuitos
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setRetryIntent(null);
            setAction('line');
          }}
        >
          Configurar linea
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setRetryIntent(null);
            setAction('payment');
          }}
        >
          Registrar pago manual
        </Button>
        <Button
          color="warning"
          onClick={() => {
            setRetryIntent(null);
            setAction('rebuild');
          }}
        >
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
      {action ? (
        <FinanceActionDialog
          action={action}
          retryIntent={retryIntent}
          onClose={() => {
            setAction(null);
            setRetryIntent(null);
          }}
          apiClient={apiClient}
          clientId={clientId}
          balance={data}
        />
      ) : null}
    </Stack>
  );
}

function FinanceActionDialog({
  action,
  onClose,
  apiClient,
  clientId,
  balance,
  retryIntent
}: {
  action: Action;
  onClose: () => void;
  apiClient: ApiClient;
  clientId: string;
  balance: Awaited<ReturnType<ApiClient['adminFinance']['balance']>>;
  retryIntent: AdminFinanceIntent | null;
}) {
  const queryClient = useQueryClient();
  const stable = useStableIdempotency();
  const intentRegistry = useAdminFinanceIntentRegistry();
  const operationScope = useAdminOperationScope('finance-client', clientId);
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

  type FinanceMutationRequest = {
    operation: AdminScopedOperation;
    action: AdminFinanceAction;
    body: unknown;
    fingerprint: string;
    key: string;
  };

  const execute = (request: FinanceMutationRequest) => {
    const { action: requestAction, body, key, operation } = request;
    if (requestAction === 'credits')
      return apiClient.adminFinance.assignCredits(
        clientId,
        body as Parameters<typeof apiClient.adminFinance.assignCredits>[1],
        key,
        operation.signal
      );
    if (requestAction === 'line')
      return apiClient.adminFinance.configureCreditLine(
        clientId,
        body as Parameters<typeof apiClient.adminFinance.configureCreditLine>[1],
        key,
        operation.signal
      );
    if (requestAction === 'payment')
      return apiClient.adminFinance.manualPayment(clientId, body as AdminManualPaymentInput, key, operation.signal);
    return apiClient.adminFinance.rebuildBalance(clientId, key, operation.signal);
  };

  const mutation = useMutation({
    mutationFn: async (request: FinanceMutationRequest) => {
      try {
        return await execute(request);
      } catch (cause) {
        const unauthorized = cause instanceof Error && 'status' in cause && cause.status === 401;
        const uncertain = !unauthorized && (isAbortError(cause) || isUncertainFailure(cause));
        if (uncertain)
          intentRegistry.record({
            clientId,
            action: request.action,
            body: request.body,
            fingerprint: request.fingerprint,
            key: request.key,
            status: 'uncertain'
          });
        stable.finish();
        throw cause;
      }
    },
    onSuccess: async (_result, request) => {
      intentRegistry.discard(clientId, request.fingerprint);
      stable.finish();
      if (!request.operation.isCurrent()) {
        request.operation.finish();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.finance(clientId) });
      if (!request.operation.isCurrent()) return;
      request.operation.finish();
      onClose();
    },
    onError: (cause, request) => {
      if (request.operation.isCurrent() && !isAbortError(cause)) {
        setError(adminErrorMessage(cause).message);
        if (!(cause instanceof Error && 'status' in cause && cause.status === 401))
          void queryClient.invalidateQueries({ queryKey: adminQueryKeys.finance(clientId) });
      }
      request.operation.finish();
    }
  });

  function buildBody(selectedAction: AdminFinanceAction): unknown {
    const numericCredits = Number(credits);
    if (selectedAction === 'credits') {
      if (!Number.isInteger(numericCredits) || numericCredits <= 0 || !reason.trim())
        throw new Error('Captura creditos enteros positivos y un motivo.');
      return { credits: numericCredits, reason: reason.trim() };
    }
    if (selectedAction === 'line') {
      const numericLimit = Number(limit);
      if (!Number.isInteger(numericLimit) || numericLimit < 0)
        throw new Error('El limite debe ser un entero no negativo.');
      return {
        limitCredits: numericLimit,
        status: lineStatus,
        ...(lineExpiresAt ? { expiresAt: new Date(lineExpiresAt).toISOString() } : {}),
        ...(lineNotes.trim() ? { notes: lineNotes.trim() } : {})
      };
    }
    if (selectedAction === 'rebuild') return undefined;
    const cents = parseMxnToCents(amount);
    if (cents === null || cents <= 0 || !externalReference.trim())
      throw new Error('Captura un monto MXN positivo con hasta dos decimales y una referencia.');
    if (!Number.isInteger(numericCredits) || numericCredits <= 0)
      throw new Error('Los creditos deben ser enteros positivos.');
    if (kind === 'CREDIT_PURCHASE') {
      const unitCents = parseMxnToCents(unitValue);
      if (unitCents === null || unitCents <= 0) throw new Error('Captura el valor unitario del credito.');
      return {
        kind,
        amountMxnCents: cents,
        externalReference: externalReference.trim(),
        credits: numericCredits,
        creditUnitValueMxnCents: unitCents
      } satisfies AdminManualPaymentInput;
    }
    if (!lotId.trim()) throw new Error('Captura el identificador del lote de deuda.');
    return {
      kind,
      amountMxnCents: cents,
      externalReference: externalReference.trim(),
      allocations: [{ debtLotLedgerEntryId: lotId.trim(), credits: numericCredits }]
    } satisfies AdminManualPaymentInput;
  }

  function submitMutation() {
    if (!action) return;
    const operation = operationScope.begin();
    if (!operation) return;
    try {
      const selectedAction = retryIntent?.action ?? action;
      const body = retryIntent ? retryIntent.body : buildBody(selectedAction);
      const fingerprint = retryIntent?.fingerprint ?? JSON.stringify({ action: selectedAction, body });
      const existingIntent = intentRegistry.find(clientId, fingerprint);
      const key = stable.begin(retryIntent?.key ?? existingIntent?.key);
      if (!key) {
        operation.finish();
        return;
      }
      setError(null);
      mutation.mutate({ operation, action: selectedAction, body, fingerprint, key });
    } catch (cause) {
      operation.finish();
      setError(cause instanceof Error ? cause.message : 'No fue posible validar la operacion.');
    }
  }

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
          {retryIntent ? (
            <Alert severity="warning">Se reutilizara la misma intencion y llave del resultado no confirmado.</Alert>
          ) : null}
          {action === 'credits' && !retryIntent ? (
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
          {action === 'line' && !retryIntent ? (
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
          {action === 'payment' && !retryIntent ? (
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
            submitMutation();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Procesando...' : 'Confirmar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
