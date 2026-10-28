import { useState } from 'react';
import type {
  AdminManagedContract,
  AdminManagedConsumption,
  ApiClient,
  AssignManagedContractInput
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { formatDate } from '../shared/admin-labels';
import { ManagedVersionTerms } from './ManagedPlansSection';
import {
  managedConsumptionKey,
  managedContractsKey,
  managedModalityLabel,
  managedPlansKey,
  managedTierLabel
} from './managed-plan-format';
import { useManagedPlanMutation } from './useManagedPlanMutation';
import { ManagedCollectionsPanel } from './ManagedCollectionsPanel';

const contractStatusLabel: Record<AdminManagedContract['status'], string> = {
  CURRENT: 'Vigente',
  FUTURE: 'Programado',
  EXPIRED: 'Concluido'
};
const contractDate = (date: string) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export function ManagedClientCommercialPanel({
  apiClient,
  clientId,
  assignable
}: {
  apiClient: ApiClient;
  clientId: string;
  assignable: boolean;
}) {
  const queryClient = useQueryClient();
  const contracts = useQuery({
    queryKey: managedContractsKey(clientId),
    queryFn: ({ signal }) => apiClient.adminManagedPlans.listContracts(clientId, signal)
  });
  const [assigning, setAssigning] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');
  const [collectionsLocked, setCollectionsLocked] = useState(false);
  const selected =
    contracts.data?.find((contract) => contract.id === selectedId) ??
    contracts.data?.find((contract) => contract.status === 'CURRENT') ??
    contracts.data?.[0];
  return (
    <Stack component="section" aria-labelledby="client-commercial-title" spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
        <Typography id="client-commercial-title" component="h2" variant="h3">
          Plan comercial
        </Typography>
        <Button
          variant="outlined"
          disabled={!assignable || contracts.isPending || contracts.isError || collectionsLocked}
          onClick={() => setAssigning(true)}
        >
          Asignar plan comercial
        </Button>
      </Stack>
      <Alert severity="info">
        Registro comercial gestionado, separado del sistema de créditos. Pagos, facturación, renovación y excedentes se
        resuelven manualmente. No bloquea activaciones ni Scanner.
      </Alert>
      {notice ? (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}
      {!assignable ? (
        <Typography color="text.secondary">
          La Organización debe estar activa para aceptar un nuevo contrato.
        </Typography>
      ) : null}
      {contracts.isPending ? (
        <AdminLoadingState label="Cargando contratación comercial…" />
      ) : !contracts.data ? (
        <AdminErrorState onRetry={() => void contracts.refetch()} />
      ) : !contracts.data.length ? (
        <Typography>Sin plan comercial contratado.</Typography>
      ) : (
        <>
          <TextField
            select
            label="Contrato y vigencia"
            disabled={collectionsLocked}
            value={selected?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {contracts.data.map((contract) => (
              <MenuItem key={contract.id} value={contract.id}>
                {managedModalityLabel[contract.terms.modality]} · {managedTierLabel[contract.terms.tier]} ·{' '}
                {contractStatusLabel[contract.status]} · {contractDate(contract.startsOn)}
              </MenuItem>
            ))}
          </TextField>
          {selected ? (
            <>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Typography component="h3" variant="h4">
                    {selected.terms.commercialName} · {contractStatusLabel[selected.status]}
                  </Typography>
                  <Typography>
                    {managedModalityLabel[selected.terms.modality]} · {managedTierLabel[selected.terms.tier]}
                  </Typography>
                  <Typography>
                    {contractDate(selected.startsOn)} — {contractDate(selected.endsOn)} (fin exclusivo)
                  </Typography>
                  <ManagedVersionTerms version={selected.terms} />
                  <Typography variant="body2">
                    Términos aceptados el {formatDate(selected.acceptedAt)}. Importes en MXN antes de IVA, conservados
                    en el contrato.
                  </Typography>
                  {selected.terms.modality === 'PRIVATE' ? (
                    <Alert severity="info">
                      La Licencia Privada no genera ni despliega un frontend exclusivo. Su implementación y
                      certificación se contratan como proyecto independiente.
                    </Alert>
                  ) : null}
                  <Typography variant="caption">Versión aceptada: {selected.planVersionId}</Typography>
                </Stack>
              </Paper>
              <ManagedCollectionsPanel
                key={`${clientId}:${selected.id}`}
                apiClient={apiClient}
                clientId={clientId}
                contractId={selected.id}
                onLockChange={setCollectionsLocked}
              />
              <ManagedContractConsumption
                key={selected.id}
                apiClient={apiClient}
                clientId={clientId}
                contract={selected}
              />
            </>
          ) : null}
        </>
      )}
      {assigning ? (
        <AssignManagedContractDialog
          apiClient={apiClient}
          clientId={clientId}
          onClose={() => setAssigning(false)}
          onSaved={(contract) => {
            queryClient.setQueryData<AdminManagedContract[]>(managedContractsKey(clientId), (current = []) => [
              contract,
              ...current.filter(({ id }) => id !== contract.id)
            ]);
            setSelectedId(contract.id);
            setAssigning(false);
            setNotice('Contrato comercial registrado con los términos aceptados.');
            void queryClient.invalidateQueries({ queryKey: managedContractsKey(clientId) });
          }}
        />
      ) : null}
    </Stack>
  );
}

function AssignManagedContractDialog({
  apiClient,
  clientId,
  onClose,
  onSaved
}: {
  apiClient: ApiClient;
  clientId: string;
  onClose: () => void;
  onSaved: (contract: AdminManagedContract) => void;
}) {
  const plans = useQuery({
    queryKey: managedPlansKey,
    queryFn: ({ signal }) => apiClient.adminManagedPlans.list(signal)
  });
  const [modality, setModality] = useState('');
  const [planId, setPlanId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [validation, setValidation] = useState('');
  const mutation = useManagedPlanMutation<AssignManagedContractInput, AdminManagedContract>(
    `managed-contract-${clientId}`,
    (input, key, signal) => apiClient.adminManagedPlans.assignContract(clientId, input, key, signal),
    onSaved
  );
  const candidates = (plans.data ?? []).filter(
    (plan) => plan.isAvailable && plan.modality === modality && plan.currentVersionId
  );
  const plan = candidates.find(({ id }) => id === planId);
  const version = plan?.versions.find(({ id }) => id === versionId && id === plan.currentVersionId);
  function submit() {
    if (mutation.uncertain) {
      mutation.retry();
      return;
    }
    if (!version || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
      setValidation('Selecciona modalidad, plan, versión vigente y fecha de inicio.');
      return;
    }
    setValidation('');
    void mutation.submit({ planVersionId: version.id, startsOn });
  }
  return (
    <Dialog open onClose={mutation.locked ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Asignar plan comercial</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>
            Selecciona los términos comerciales que el salón acepta. La API valida vigencia y evita contratos solapados.
          </Typography>
          {plans.isPending ? (
            <AdminLoadingState label="Consultando planes disponibles…" />
          ) : plans.isError ? (
            <AdminErrorState onRetry={() => void plans.refetch()} />
          ) : (
            <>
              <TextField
                select
                label="Modalidad comercial"
                value={modality}
                disabled={mutation.locked}
                onChange={(event) => {
                  setModality(event.target.value);
                  setPlanId('');
                  setVersionId('');
                }}
              >
                <MenuItem value="STANDARD">Estándar Gestionado</MenuItem>
                <MenuItem value="PRIVATE">Licencia Privada</MenuItem>
              </TextField>
              <TextField
                select
                label="Plan"
                value={planId}
                disabled={mutation.locked || !modality}
                onChange={(event) => {
                  setPlanId(event.target.value);
                  setVersionId('');
                }}
              >
                {candidates.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {managedTierLabel[item.tier]}
                  </MenuItem>
                ))}
              </TextField>
              {modality && candidates.length === 0 ? (
                <Alert severity="warning">No hay planes disponibles con versión vigente para esta modalidad.</Alert>
              ) : null}
              <TextField
                select
                label="Versión comercial aceptada"
                value={versionId}
                disabled={mutation.locked || !plan}
                onChange={(event) => setVersionId(event.target.value)}
              >
                {plan?.versions
                  .filter((item) => item.id === plan.currentVersionId)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.commercialName} · desde {formatDate(item.validFrom)}
                    </MenuItem>
                  ))}
              </TextField>
              <TextField
                label="Inicio contractual"
                type="date"
                value={startsOn}
                disabled={mutation.locked}
                onChange={(event) => setStartsOn(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Button
                disabled={mutation.locked || plans.isFetching}
                onClick={() => {
                  setVersionId('');
                  void plans.refetch();
                }}
              >
                Actualizar versiones disponibles
              </Button>
              {version ? (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <ManagedVersionTerms version={version} />
                    <Typography variant="caption">Referencia de versión: {version.id}</Typography>
                  </Stack>
                </Paper>
              ) : null}
            </>
          )}
          {validation ? <Alert severity="error">{validation}</Alert> : null}
          {mutation.error ? <Alert severity={mutation.uncertain ? 'warning' : 'error'}>{mutation.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={mutation.locked} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={mutation.busy || (!mutation.uncertain && (!version || !startsOn))}
          onClick={submit}
        >
          {mutation.uncertain ? 'Reintentar mismo contrato' : 'Registrar contrato aceptado'}
        </Button>
      </DialogActions>
      {mutation.navigationGuard}
    </Dialog>
  );
}

function ManagedContractConsumption({
  apiClient,
  clientId,
  contract
}: {
  apiClient: ApiClient;
  clientId: string;
  contract: AdminManagedContract;
}) {
  const consumption = useQuery({
    queryKey: managedConsumptionKey(clientId, contract.id),
    queryFn: ({ signal }) => apiClient.adminManagedPlans.getConsumption(clientId, contract.id, signal),
    staleTime: 0
  });
  if (consumption.isPending) return <AdminLoadingState label="Consultando consumo contractual…" />;
  if (consumption.isError) return <AdminErrorState onRetry={() => void consumption.refetch()} />;
  const data = consumption.data;
  return (
    <Stack component="section" aria-labelledby="managed-consumption-title" spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
        <Typography id="managed-consumption-title" component="h3" variant="h4">
          Consumo de eventos del contrato
        </Typography>
        <Button disabled={consumption.isFetching} onClick={() => void consumption.refetch()}>
          Actualizar consumo comercial
        </Button>
      </Stack>
      <Box
        component="dl"
        aria-label="Consumo contractual"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 2,
          m: 0
        }}
      >
        {[
          ['Eventos utilizados', data.usedEvents],
          ['Incluidos utilizados', data.includedUsedEvents],
          ['Eventos extraordinarios', data.extraordinaryEvents],
          ['Disponibles del período actual', data.availableEvents]
        ].map(([label, value]) => (
          <Box key={label}>
            <Typography component="dt" color="text.secondary">
              {label}
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontWeight: 700 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      {data.annualAvailableEvents !== null ? (
        <Typography>Eventos incluidos disponibles del año contractual: {data.annualAvailableEvents}</Typography>
      ) : null}
      <Typography variant="body2" color="text.secondary">
        Consulta al {formatDate(data.asOf)}. Un evento se considera utilizado por su activación real; los
        extraordinarios se resuelven manualmente.
      </Typography>
      {data.cancelledEvents ? (
        <Alert severity="warning">
          {data.cancelledEvents} eventos consumidos fueron cancelados. Requieren resolución comercial manual; la
          cancelación no devuelve cupo automáticamente.
        </Alert>
      ) : null}
      <ConsumptionPeriods data={data} />
      {data.events.length ? (
        <Box component="details">
          <Typography component="summary" sx={{ cursor: 'pointer', minHeight: 44 }}>
            Eventos utilizados e incidencias
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {data.events.map((event) => (
              <Paper variant="outlined" sx={{ p: 2 }} key={event.eventId}>
                <Typography sx={{ fontWeight: 700 }}>{event.name ?? 'Evento sin nombre'}</Typography>
                <Typography>
                  Activado {formatDate(event.activatedAt)} · Período {event.periodIndex} ·{' '}
                  {event.extraordinary ? 'Extraordinario' : 'Incluido'}
                </Typography>
                {event.cancelled ? (
                  <Typography color="warning.main">Cancelado · Resolución comercial pendiente</Typography>
                ) : null}
              </Paper>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function ConsumptionPeriods({ data }: { data: AdminManagedConsumption }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Histórico mensual de consumo comercial">
        <TableHead>
          <TableRow>
            <TableCell>Período contractual</TableCell>
            <TableCell>Utilizados</TableCell>
            <TableCell>Incluidos</TableCell>
            <TableCell>Extraordinarios</TableCell>
            <TableCell>Disponibles</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.periods.map((period) => (
            <TableRow key={period.index} selected={period.index === data.currentPeriodIndex}>
              <TableCell>
                Período {period.index}: {contractDate(period.startsOn)} — {contractDate(period.endsOn)} (fin exclusivo)
              </TableCell>
              <TableCell>{period.usedEvents}</TableCell>
              <TableCell>{period.includedUsedEvents}</TableCell>
              <TableCell>{period.extraordinaryEvents}</TableCell>
              <TableCell>{period.availableEvents}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
