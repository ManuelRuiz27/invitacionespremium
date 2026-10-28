import { useState } from 'react';
import type {
  ApiClient,
  AdminManagedCollections,
  AdminManagedObligation,
  AdminManagedCollectionHistoryEntry,
  RegisterManagedPaymentInput
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { managedMoney, parseManagedMoney } from './managed-plan-format';
import { useManagedPlanMutation } from './useManagedPlanMutation';

export const managedCollectionsKey = (clientId: string, contractId: string) =>
  ['admin-managed-collections', clientId, contractId] as const;
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const instantLabel = (date: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(
    new Date(date)
  );
const statusLabel = { PENDING: 'Pendiente', PARTIAL: 'Parcial', PAID: 'Pagado', OVERDUE: 'Vencido' };
const methodLabel = { TRANSFER: 'Transferencia', CASH: 'Efectivo', CARD: 'Tarjeta', OTHER: 'Otro' };
type Candidate = AdminManagedCollections['extraordinaryCandidates'][number];
type Action =
  | { kind: 'PAYMENT'; obligation: AdminManagedObligation }
  | { kind: 'REVERSAL'; payment: AdminManagedCollectionHistoryEntry }
  | { kind: 'EXTRA'; event: Candidate };
type Mutation =
  | { kind: 'PAYMENT'; input: RegisterManagedPaymentInput }
  | { kind: 'REVERSAL'; paymentId: string; reason: string }
  | { kind: 'EXTRA'; eventId: string };

export function ManagedCollectionsPanel({
  apiClient,
  clientId,
  contractId,
  onLockChange
}: {
  apiClient: ApiClient;
  clientId: string;
  contractId: string;
  onLockChange: (locked: boolean) => void;
}) {
  const cache = useQueryClient();
  const queryKey = managedCollectionsKey(clientId, contractId);
  const collections = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiClient.adminManagedPlans.getCollections(clientId, contractId, signal)
  });
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState('');
  function close() {
    setAction(null);
    onLockChange(false);
  }
  function open(next: Action) {
    setAction(next);
    onLockChange(true);
    setNotice('');
  }
  if (!collections.data)
    return collections.isPending ? (
      <AdminLoadingState label="Cargando cobros y pagos…" />
    ) : (
      <AdminErrorState onRetry={() => void collections.refetch()} />
    );
  const data = collections.data;
  return (
    <Stack component="section" aria-labelledby="managed-collections-title" spacing={2}>
      <Typography id="managed-collections-title" component="h3" variant="h4">
        Cobros y pagos
      </Typography>
      <Button
        sx={{ alignSelf: 'flex-start' }}
        disabled={action !== null || collections.isFetching}
        onClick={() => void collections.refetch()}
      >
        Actualizar cobros
      </Button>
      {collections.isError && (
        <Alert severity="warning">
          No se pudieron actualizar los cobros. Se conserva la última consulta y cualquier operación pendiente.
        </Alert>
      )}
      <Typography color="text.secondary">
        Importes netos en MXN, antes de IVA. Registro manual; no emite facturas ni confirma movimientos bancarios.
        Fechas en America/Mexico_City.
      </Typography>
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1 }}>
        {(
          [
            ['Total contractual y extras confirmados', data.summary.totalMxnCents],
            ['Pagado', data.summary.paidMxnCents],
            ['Saldo pendiente', data.summary.balanceMxnCents],
            ['Saldo vencido', data.summary.overdueMxnCents]
          ] as const
        ).map(([label, value]) => (
          <Paper variant="outlined" key={label} sx={{ p: 2, minWidth: 0 }}>
            <Typography variant="body2">{label}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere', fontWeight: 700 }}>{managedMoney(value)}</Typography>
          </Paper>
        ))}
      </Box>
      <Typography variant="body2">
        Exigible al {dateLabel(data.today)}: {managedMoney(data.summary.dueMxnCents)} · Vencimientos futuros:{' '}
        {managedMoney(data.summary.futureMxnCents)}.
      </Typography>
      {data.alerts.overdueInstallments > 0 && (
        <Alert severity="warning">
          Mensualidades vencidas con saldo: {data.alerts.overdueInstallments}. El seguimiento comercial no bloquea la
          operación.
        </Alert>
      )}
      {data.alerts.endingWithin30Days && (
        <Alert severity="info">
          El contrato termina en los próximos 30 días. La renovación requiere aceptar un nuevo contrato.
        </Alert>
      )}
      {data.alerts.expiredWithoutSuccessor && (
        <Alert severity="warning">Contrato vencido sin contratación posterior. Revisa la renovación manualmente.</Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Obligaciones comerciales" sx={{ minWidth: 760 }}>
          <TableHead>
            <TableRow>
              {['Concepto', 'Vencimiento', 'Importe neto', 'Pagado', 'Saldo', 'Estado', 'Acción'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.obligations.map((row) => (
              <TableRow key={row.id}>
                <TableCell component="th" scope="row">
                  {row.label}
                </TableCell>
                <TableCell>{dateLabel(row.dueOn)}</TableCell>
                <TableCell>{managedMoney(row.amountMxnCents)}</TableCell>
                <TableCell>{managedMoney(row.paidMxnCents)}</TableCell>
                <TableCell>{managedMoney(row.balanceMxnCents)}</TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Chip
                      size="small"
                      label={statusLabel[row.status]}
                      color={row.status === 'PAID' ? 'success' : 'default'}
                    />
                    {row.overdue && row.status === 'PARTIAL' && (
                      <Typography variant="caption" color="warning.main">
                        Saldo vencido
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    disabled={row.balanceMxnCents === 0 || action !== null}
                    onClick={() => open({ kind: 'PAYMENT', obligation: row })}
                  >
                    Registrar pago
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography component="h4" variant="h5">
        Eventos extraordinarios
      </Typography>
      <Typography variant="body2">
        La proyección de consumo identifica candidatos. Cada cargo requiere confirmación manual; una cancelación no
        elimina el consumo ni revierte cargos.
      </Typography>
      {!data.extraordinaryCandidates.length && (
        <Typography color="text.secondary">Sin eventos extraordinarios detectados.</Typography>
      )}
      {data.extraordinaryCandidates.map((event) => (
        <Paper key={event.eventId} variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{event.name ?? 'Evento sin nombre'}</Typography>
              <Typography variant="body2">
                Fecha del evento: {event.eventDateTime ? instantLabel(event.eventDateTime) : 'Sin fecha'} ·{' '}
                {managedMoney(event.amountMxnCents)} netos
              </Typography>
              {event.cancelled && (
                <Alert severity="warning">
                  Evento cancelado: requiere revisión comercial manual antes de confirmar el cargo.
                </Alert>
              )}
            </Box>
            {event.confirmedChargeId ? (
              <Chip label="Cargo confirmado" />
            ) : (
              <Button disabled={action !== null} onClick={() => open({ kind: 'EXTRA', event })}>
                Confirmar extraordinario
              </Button>
            )}
          </Stack>
        </Paper>
      ))}
      <Typography component="h4" variant="h5">
        Historial de movimientos
      </Typography>
      {!data.history.length && <Typography color="text.secondary">Sin movimientos registrados.</Typography>}
      {data.history.map((entry) => (
        <Paper key={entry.id} variant="outlined" sx={{ p: 2, overflowWrap: 'anywhere' }}>
          <Stack spacing={0.5}>
            <Typography sx={{ fontWeight: 700 }}>
              {entry.kind === 'PAYMENT'
                ? 'Pago registrado'
                : entry.kind === 'REVERSAL'
                  ? 'Reversión completa'
                  : 'Extraordinario confirmado'}{' '}
              · {managedMoney(entry.amountMxnCents)}
            </Typography>
            <Typography>
              {data.obligations.find((row) => row.id === entry.obligationId)?.label ?? 'Concepto comercial'}
            </Typography>
            <Typography variant="body2">
              {entry.kind === 'EXTRA_CONFIRM' ? 'Exigible' : 'Fecha efectiva del pago'}: {dateLabel(entry.effectiveOn)}{' '}
              · Registro: {instantLabel(entry.occurredAt)}
            </Typography>
            <Typography variant="body2">
              Administrador: {entry.actorLabel}
              {entry.method ? ` · ${methodLabel[entry.method]}` : ''}
            </Typography>
            {entry.reference && <Typography variant="body2">Referencia: {entry.reference}</Typography>}
            {entry.notes && <Typography variant="body2">Notas: {entry.notes}</Typography>}
            {entry.reversalReason && (
              <Typography variant="body2">Motivo de reversión: {entry.reversalReason}</Typography>
            )}
            {entry.kind === 'PAYMENT' &&
              (entry.reversed ? (
                <Chip label="Pago revertido" size="small" sx={{ alignSelf: 'flex-start' }} />
              ) : (
                <Button
                  sx={{ alignSelf: 'flex-start' }}
                  disabled={action !== null}
                  onClick={() => open({ kind: 'REVERSAL', payment: entry })}
                >
                  Revertir pago
                </Button>
              ))}
          </Stack>
        </Paper>
      ))}
      {action && (
        <ManagedCollectionDialog
          action={action}
          data={data}
          apiClient={apiClient}
          clientId={clientId}
          contractId={contractId}
          onClose={close}
          onSaved={(result) => {
            cache.setQueryData(queryKey, result);
            void cache.invalidateQueries({ queryKey });
            close();
            setNotice('Movimiento comercial registrado.');
          }}
        />
      )}
    </Stack>
  );
}

function ManagedCollectionDialog({
  action,
  data,
  apiClient,
  clientId,
  contractId,
  onClose,
  onSaved
}: {
  action: Action;
  data: AdminManagedCollections;
  apiClient: ApiClient;
  clientId: string;
  contractId: string;
  onClose: () => void;
  onSaved: (result: AdminManagedCollections) => void;
}) {
  const [amount, setAmount] = useState(
    action.kind === 'PAYMENT' ? (action.obligation.balanceMxnCents / 100).toFixed(2) : ''
  );
  const [effectiveOn, setEffectiveOn] = useState(data.today);
  const [method, setMethod] = useState<RegisterManagedPaymentInput['method']>('TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useManagedPlanMutation<Mutation, AdminManagedCollections>(
    `${clientId}:${contractId}:collections`,
    (input, key, signal) =>
      input.kind === 'PAYMENT'
        ? apiClient.adminManagedPlans.registerPayment(clientId, contractId, input.input, key, signal)
        : input.kind === 'REVERSAL'
          ? apiClient.adminManagedPlans.reversePayment(
              clientId,
              contractId,
              input.paymentId,
              { reason: input.reason },
              key,
              signal
            )
          : apiClient.adminManagedPlans.confirmExtraordinary(
              clientId,
              contractId,
              { eventId: input.eventId },
              key,
              signal
            ),
    onSaved
  );
  const cents = parseManagedMoney(amount);
  const paymentValid =
    action?.kind === 'PAYMENT' &&
    cents !== null &&
    cents > 0 &&
    cents <= action.obligation.balanceMxnCents &&
    effectiveOn !== '' &&
    effectiveOn <= data.today;
  function submit() {
    if (!action || !confirmed || mutation.locked) return;
    if (action.kind === 'PAYMENT' && paymentValid && cents !== null)
      void mutation.submit({
        kind: 'PAYMENT',
        input: {
          concept: action.obligation.concept,
          installmentNumber: action.obligation.installmentNumber,
          extraordinaryChargeId: action.obligation.extraordinaryChargeId,
          amountMxnCents: cents,
          effectiveOn,
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null
        }
      });
    else if (action.kind === 'REVERSAL' && action.payment.paymentId && reason.trim())
      void mutation.submit({ kind: 'REVERSAL', paymentId: action.payment.paymentId, reason: reason.trim() });
    else if (action.kind === 'EXTRA') void mutation.submit({ kind: 'EXTRA', eventId: action.event.eventId });
  }
  return (
    <>
      <Dialog
        open={action !== null}
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (!mutation.locked) {
            onClose();
          }
        }}
      >
        <DialogTitle>
          {action?.kind === 'PAYMENT'
            ? 'Registrar pago comercial'
            : action?.kind === 'REVERSAL'
              ? 'Revertir pago comercial'
              : 'Confirmar cargo extraordinario'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>Importes netos en MXN, antes de IVA.</Typography>
            {action?.kind === 'PAYMENT' && (
              <>
                <Typography sx={{ fontWeight: 700 }}>
                  {action.obligation.label} · Saldo: {managedMoney(action.obligation.balanceMxnCents)}
                </Typography>
                <TextField
                  label="Importe neto MXN"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={mutation.locked}
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                />
                <TextField
                  label="Fecha efectiva del pago"
                  type="date"
                  value={effectiveOn}
                  onChange={(event) => setEffectiveOn(event.target.value)}
                  disabled={mutation.locked}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: data.today } }}
                />
                <TextField
                  select
                  label="Método de pago"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as RegisterManagedPaymentInput['method'])}
                  disabled={mutation.locked}
                >
                  {Object.entries(methodLabel).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Referencia (opcional)"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  disabled={mutation.locked}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                />
                <TextField
                  label="Notas (opcional)"
                  multiline
                  minRows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={mutation.locked}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                />
              </>
            )}
            {action?.kind === 'REVERSAL' && (
              <>
                <Typography>
                  Se revertirá el pago completo de {managedMoney(action.payment.amountMxnCents)}. El registro original
                  se conserva y su saldo vuelve a quedar pendiente.
                </Typography>
                <TextField
                  label="Motivo de reversión"
                  multiline
                  minRows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={mutation.locked}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </>
            )}
            {action?.kind === 'EXTRA' && (
              <>
                <Typography>
                  {action.event.name ?? 'Evento sin nombre'} · {managedMoney(action.event.amountMxnCents)} netos según
                  el contrato.
                </Typography>
                <Typography>El cargo será exigible desde hoy y no se podrá editar ni eliminar.</Typography>
                {action.event.cancelled && (
                  <Alert severity="warning">
                    Evento cancelado. Confirma únicamente tras revisar el cobro comercial.
                  </Alert>
                )}
              </>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={mutation.locked}
                />
              }
              label="He revisado y confirmo este movimiento comercial"
            />
            {mutation.error && <Alert severity="error">{mutation.error}</Alert>}
            {mutation.uncertain && (
              <Alert severity="warning">
                La respuesta no pudo confirmarse. Reintenta esta misma operación para reconciliar el resultado sin
                duplicarla.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={mutation.locked}
            onClick={() => {
              onClose();
            }}
          >
            Cancelar
          </Button>
          {mutation.uncertain ? (
            <Button disabled={mutation.busy} onClick={mutation.retry}>
              Reintentar misma operación
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={
                mutation.busy ||
                !confirmed ||
                (action?.kind === 'PAYMENT' && !paymentValid) ||
                (action?.kind === 'REVERSAL' && !reason.trim())
              }
              onClick={submit}
            >
              Confirmar registro
            </Button>
          )}
        </DialogActions>
      </Dialog>
      {mutation.navigationGuard}
    </>
  );
}
