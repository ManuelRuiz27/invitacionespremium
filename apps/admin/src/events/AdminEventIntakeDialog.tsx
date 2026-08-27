import { useEffect, useRef, useState } from 'react';
import { ApiError, type AdminClient, type ApiClient } from '@invitaciones/api-client';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';

type PaidServiceCode = 'FLYER' | 'FLIPBOOK' | 'PHYSICAL_QR';

const serviceOptions: { code: PaidServiceCode; label: string }[] = [
  { code: 'PHYSICAL_QR', label: 'QR / EventOps' },
  { code: 'FLYER', label: 'Flyer' },
  { code: 'FLIPBOOK', label: 'Flipbook' }
];

export function AdminEventIntakeDialog({
  apiClient,
  clients,
  open,
  onClose
}: {
  apiClient: ApiClient;
  clients: AdminClient[];
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submitLock = useRef(false);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [serviceCode, setServiceCode] = useState<PaidServiceCode>('PHYSICAL_QR');
  const [capacityInput, setCapacityInput] = useState('');
  const [assignedPlannerUserId, setAssignedPlannerUserId] = useState('');
  const [acceptanceConfirmed, setAcceptanceConfirmed] = useState(false);
  const [error, setError] = useState('');
  const selectedClient = clients.find((client) => client.id === clientId);
  const capacity = Number(capacityInput);
  const validQuoteInput = Boolean(clientId) && Number.isInteger(capacity) && capacity >= 1 && capacity <= 150;
  const users = useQuery({
    queryKey: adminQueryKeys.clientUsers(clientId),
    queryFn: ({ signal }) => apiClient.adminClients.listUsers(clientId, signal),
    enabled: open && Boolean(clientId)
  });
  const candidates = (users.data ?? []).filter((user) =>
    selectedClient?.type === 'PLANNER' ? user.role === 'INDEPENDENT_PLANNER' : user.role === 'ORGANIZATION_PLANNER'
  );
  const quote = useQuery({
    queryKey: ['admin-event-intake-quote', clientId, serviceCode, capacity],
    queryFn: ({ signal }) => apiClient.adminEvents.quoteIntake(clientId, { serviceCode, capacity }, signal),
    enabled: open && validQuoteInput
  });

  useEffect(() => {
    setAssignedPlannerUserId('');
    setAcceptanceConfirmed(false);
  }, [clientId]);

  useEffect(() => {
    if (selectedClient?.type === 'PLANNER' && candidates.length === 1) {
      setAssignedPlannerUserId(candidates[0]!.id);
    }
  }, [candidates, selectedClient?.type]);

  useEffect(() => setAcceptanceConfirmed(false), [serviceCode, capacityInput]);

  const create = useMutation({
    mutationFn: () =>
      apiClient.adminEvents.createForClient(clientId, {
        name: name.trim() || null,
        serviceCode,
        capacity,
        acceptedServicePriceId: quote.data!.servicePriceId,
        assignedPlannerUserId: assignedPlannerUserId || null,
        acceptanceConfirmed: true
      }),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.events });
      reset();
      onClose();
      await navigate(`/eventos/${event.id}/preparar/comercial`);
    },
    onError: async (cause) => {
      if (cause instanceof ApiError && cause.code === 'EVENT_COMMERCIAL_QUOTE_STALE') {
        setAcceptanceConfirmed(false);
        setError('La cotizacion cambio. Revisa los terminos actualizados y confirma nuevamente.');
        await quote.refetch();
        return;
      }
      setError(adminErrorMessage(cause).message);
    },
    onSettled: () => {
      submitLock.current = false;
    }
  });

  function reset() {
    setClientId('');
    setName('');
    setServiceCode('PHYSICAL_QR');
    setCapacityInput('');
    setAssignedPlannerUserId('');
    setAcceptanceConfirmed(false);
    setError('');
  }

  function submit() {
    if (submitLock.current) return;
    if (!quote.data || !quote.data.coverage.sufficient || !acceptanceConfirmed) {
      setError('Obtén una cotizacion con cobertura suficiente y confirma sus terminos.');
      return;
    }
    if (selectedClient?.type === 'PLANNER' && !assignedPlannerUserId) {
      setError('Selecciona la Planner independiente responsable.');
      return;
    }
    submitLock.current = true;
    setError('');
    create.mutate();
  }

  return (
    <Dialog open={open} onClose={create.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nuevo evento</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Cliente" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            {clients.map((client) => (
              <MenuItem key={client.id} value={client.id} disabled={client.status !== 'ACTIVE'}>
                {client.name} · {client.type === 'PLANNER' ? 'Planner' : 'Organización'}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Nombre del evento" value={name} onChange={(event) => setName(event.target.value)} />
          <TextField
            select
            label="Servicio"
            value={serviceCode}
            onChange={(event) => setServiceCode(event.target.value as PaidServiceCode)}
          >
            {serviceOptions.map((option) => (
              <MenuItem key={option.code} value={option.code}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Capacidad"
            type="number"
            value={capacityInput}
            slotProps={{ htmlInput: { min: 1, max: 150 } }}
            onChange={(event) => setCapacityInput(event.target.value)}
          />
          <TextField
            select
            label="Planner responsable"
            value={assignedPlannerUserId}
            disabled={!clientId || users.isPending}
            onChange={(event) => {
              setAssignedPlannerUserId(event.target.value);
              setAcceptanceConfirmed(false);
            }}
          >
            {selectedClient?.type === 'ORGANIZATION' ? <MenuItem value="">Sin asignar</MenuItem> : null}
            {candidates.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.email}
              </MenuItem>
            ))}
          </TextField>
          {quote.isFetching ? <Typography color="text.secondary">Calculando cotizacion…</Typography> : null}
          {quote.data ? (
            <Stack spacing={0.5} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="subtitle2">Cotizacion autoritativa</Typography>
              <Typography>Canal: {quote.data.commercialChannel}</Typography>
              <Typography>
                Regla: {quote.data.venueTier ?? `${quote.data.capacityMin ?? '—'}–${quote.data.capacityMax ?? '—'}`}
              </Typography>
              <Typography>Créditos: {quote.data.finalCostCredits}</Typography>
              <Typography>MXN: ${(quote.data.amountMxnCents / 100).toLocaleString('es-MX')}</Typography>
              <Alert severity={quote.data.coverage.sufficient ? 'success' : 'warning'}>
                Cobertura {quote.data.coverage.sufficient ? 'suficiente' : 'insuficiente'} · disponible{' '}
                {quote.data.coverage.totalAvailableCredits} créditos
              </Alert>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={acceptanceConfirmed}
                    onChange={(event) => setAcceptanceConfirmed(event.target.checked)}
                    disabled={!quote.data.coverage.sufficient}
                  />
                }
                label="Confirmo estos términos comerciales"
              />
            </Stack>
          ) : null}
          {quote.isError ? <Alert severity="error">{adminErrorMessage(quote.error).message}</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={create.isPending || !quote.data?.coverage.sufficient}>
          {create.isPending ? 'Creando…' : 'Crear evento'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
