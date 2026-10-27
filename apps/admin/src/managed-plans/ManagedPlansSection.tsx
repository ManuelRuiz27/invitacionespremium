import { useState } from 'react';
import type {
  AdminManagedPlan,
  AdminManagedPlanVersion,
  ApiClient,
  CreateManagedPlanVersionInput
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { formatDate } from '../shared/admin-labels';
import { toIso } from '../catalog/catalog-format';
import {
  managedModalityLabel,
  managedMoney,
  managedPlansKey,
  managedTierLabel,
  managedVersionLabel,
  parseManagedMoney
} from './managed-plan-format';
import { useManagedPlanMutation } from './useManagedPlanMutation';

const modalities = ['STANDARD', 'PRIVATE'] as const;
const tiers = ['ESSENTIAL', 'FREQUENT', 'INTENSIVE'] as const;

export function ManagedPlansSection({ apiClient, active }: { apiClient: ApiClient; active: boolean }) {
  const queryClient = useQueryClient();
  const plans = useQuery({
    queryKey: managedPlansKey,
    queryFn: ({ signal }) => apiClient.adminManagedPlans.list(signal),
    enabled: active
  });
  const [editing, setEditing] = useState<AdminManagedPlan | null>(null);
  const [history, setHistory] = useState<AdminManagedPlan | null>(null);
  const [availability, setAvailability] = useState<AdminManagedPlan | null>(null);
  const [notice, setNotice] = useState('');
  if (!active && !editing && !availability && !history) return null;
  if (plans.isPending) return <AdminLoadingState label="Cargando Planes Gestionados…" />;
  if (plans.isError) return <AdminErrorState onRetry={() => void plans.refetch()} />;
  const incomplete = modalities
    .flatMap((modality) => tiers.map((tier) => ({ modality, tier })))
    .filter(
      ({ modality, tier }) =>
        !plans.data.some((plan) => plan.modality === modality && plan.tier === tier && plan.currentVersionId)
    );

  return (
    <Stack
      component="section"
      aria-labelledby="managed-plans-title"
      spacing={2}
      sx={{ display: active ? 'flex' : 'none' }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
        <Box>
          <Typography id="managed-plans-title" component="h2" variant="h3">
            Planes Gestionados
          </Typography>
          <Typography color="text.secondary">
            Estándar y Privada · MXN antes de IVA · licencia anual incluida.
          </Typography>
        </Box>
        <Button disabled={plans.isFetching} onClick={() => void plans.refetch()}>
          Actualizar planes
        </Button>
      </Stack>
      <Alert severity="info">
        La contratación, pagos, facturación, renovación y excedentes se administran manualmente. La Licencia Privada
        registra condiciones; su frontend exclusivo requiere un proyecto y certificación independientes.
      </Alert>
      {notice ? (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}
      {incomplete.length ? (
        <Alert severity="warning">
          Configuración incompleta:{' '}
          {incomplete
            .map(({ modality, tier }) => `${managedModalityLabel[modality]} / ${managedTierLabel[tier]}`)
            .join(', ')}
          . Revisa las versiones vigentes.
        </Alert>
      ) : null}
      {modalities.map((modality) => (
        <Stack key={modality} spacing={1.5}>
          <Typography component="h3" variant="h4">
            {managedModalityLabel[modality]}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {tiers.map((tier) => {
              const plan = plans.data.find((item) => item.modality === modality && item.tier === tier);
              const version = plan?.versions.find((item) => item.id === plan.currentVersionId);
              return (
                <Paper
                  component="article"
                  aria-label={`${managedModalityLabel[modality]} · ${managedTierLabel[tier]}`}
                  key={tier}
                  variant="outlined"
                  sx={{ p: 2 }}
                >
                  <Stack spacing={1.25}>
                    <Typography component="h4" variant="h5">
                      {version?.commercialName ?? managedTierLabel[tier]}
                    </Typography>
                    <Typography>
                      {plan?.isAvailable
                        ? 'Disponible para nuevas contrataciones'
                        : 'No disponible para nuevas contrataciones'}
                    </Typography>
                    {version ? (
                      <ManagedVersionTerms version={version} />
                    ) : (
                      <Typography color="warning.main">Versión vigente faltante</Typography>
                    )}
                    {plan ? (
                      <>
                        <Button onClick={() => setEditing(plan)}>Nueva versión de {managedTierLabel[tier]}</Button>
                        <Button onClick={() => setHistory(plan)}>Historial de {managedTierLabel[tier]}</Button>
                        <Button onClick={() => setAvailability(plan)}>
                          {plan.isAvailable ? 'Desactivar disponibilidad' : 'Activar disponibilidad'}
                        </Button>
                      </>
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        </Stack>
      ))}
      {editing ? (
        <ManagedPlanVersionDialog
          apiClient={apiClient}
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice('Nueva versión comercial guardada. Los contratos anteriores conservan sus importes.');
            void queryClient.invalidateQueries({ queryKey: managedPlansKey });
          }}
        />
      ) : null}
      <Dialog open={Boolean(history)} onClose={() => setHistory(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Historial comercial ·{' '}
          {history ? `${managedModalityLabel[history.modality]} / ${managedTierLabel[history.tier]}` : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {history?.versions.map((version) => (
              <Paper variant="outlined" sx={{ p: 2 }} key={version.id}>
                <Stack spacing={0.75}>
                  <Typography component="h3" variant="h5">
                    {managedVersionLabel(version)} · {version.commercialName}
                  </Typography>
                  <ManagedVersionTerms version={version} />
                  <Typography variant="body2">
                    Desde {formatDate(version.validFrom)}
                    {version.validUntil
                      ? ` hasta ${formatDate(version.validUntil)} (fin exclusivo)`
                      : ' · Sin fecha de cierre'}
                  </Typography>
                  <Typography variant="caption">Referencia de versión: {version.id}</Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistory(null)}>Cerrar historial</Button>
        </DialogActions>
      </Dialog>
      {availability ? (
        <ManagedPlanAvailabilityDialog
          apiClient={apiClient}
          plan={availability}
          onClose={() => setAvailability(null)}
          onSaved={() => {
            setAvailability(null);
            setNotice('Disponibilidad comercial guardada. Los contratos existentes conservan sus términos.');
            void queryClient.invalidateQueries({ queryKey: managedPlansKey });
          }}
        />
      ) : null}
    </Stack>
  );
}

function ManagedPlanAvailabilityDialog({
  apiClient,
  plan,
  onClose,
  onSaved
}: {
  apiClient: ApiClient;
  plan: AdminManagedPlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutation = useManagedPlanMutation(
    `managed-availability-${plan.id}`,
    (input: { isAvailable: boolean }, key, signal) =>
      apiClient.adminManagedPlans.setAvailability(plan.id, input, key, signal),
    onSaved
  );
  return (
    <Dialog open onClose={mutation.locked ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {plan.isAvailable ? 'Desactivar disponibilidad comercial' : 'Activar disponibilidad comercial'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            Este cambio aplica a nuevas contrataciones. Los contratos aceptados permanecen intactos.
          </Typography>
          {mutation.error ? <Alert severity={mutation.uncertain ? 'warning' : 'error'}>{mutation.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={mutation.locked} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={mutation.busy} onClick={() => void mutation.submit({ isAvailable: !plan.isAvailable })}>
          {mutation.uncertain ? 'Reintentar misma disponibilidad' : 'Confirmar disponibilidad'}
        </Button>
      </DialogActions>
      {mutation.navigationGuard}
    </Dialog>
  );
}

export function ManagedVersionTerms({
  version
}: {
  version: Pick<
    AdminManagedPlanVersion,
    | 'monthlyAmountMxnCents'
    | 'initialFeeMxnCents'
    | 'extraEventAmountMxnCents'
    | 'includedEventsPerMonth'
    | 'monthlyEventLimit'
    | 'includedEventsPerYear'
    | 'contractMonths'
    | 'eventCapacity'
  >;
}) {
  return (
    <>
      <Typography sx={{ fontWeight: 700 }}>{managedMoney(version.monthlyAmountMxnCents)} MXN / mes</Typography>
      <Typography>Cuota inicial: {managedMoney(version.initialFeeMxnCents)} MXN</Typography>
      <Typography>Evento extraordinario: {managedMoney(version.extraEventAmountMxnCents)} MXN</Typography>
      <Typography>
        {version.includedEventsPerMonth} eventos/mes de referencia · máximo incluido mensual:{' '}
        {version.monthlyEventLimit}
      </Typography>
      <Typography>
        {version.includedEventsPerYear === null
          ? 'Sin acumulación entre meses'
          : `Hasta ${version.includedEventsPerYear} eventos incluidos por año contractual`}
      </Typography>
      <Typography>
        Contrato: {version.contractMonths} meses · hasta {version.eventCapacity} accesos/evento
      </Typography>
    </>
  );
}

function ManagedPlanVersionDialog({
  apiClient,
  plan,
  onClose,
  onSaved
}: {
  apiClient: ApiClient;
  plan: AdminManagedPlan;
  onClose: () => void;
  onSaved: () => void;
}) {
  const source = plan.versions.find((version) => version.id === plan.currentVersionId);
  const [fields, setFields] = useState(() => ({
    commercialName: source?.commercialName ?? '',
    monthly: source ? (source.monthlyAmountMxnCents / 100).toFixed(2) : '',
    initial: source ? (source.initialFeeMxnCents / 100).toFixed(2) : '',
    extra: source ? (source.extraEventAmountMxnCents / 100).toFixed(2) : '',
    months: source?.contractMonths.toString() ?? '',
    monthlyEvents: source?.includedEventsPerMonth.toString() ?? '',
    monthlyLimit: source?.monthlyEventLimit.toString() ?? '',
    annual: source?.includedEventsPerYear?.toString() ?? '',
    capacity: source?.eventCapacity.toString() ?? '',
    validFrom: '',
    validUntil: ''
  }));
  const [validation, setValidation] = useState('');
  const [immediate, setImmediate] = useState(true);
  const mutation = useManagedPlanMutation<CreateManagedPlanVersionInput, AdminManagedPlanVersion>(
    `managed-version-${plan.id}`,
    (input, key, signal) => apiClient.adminManagedPlans.createVersion(plan.id, input, key, signal),
    onSaved
  );
  function submit() {
    if (mutation.uncertain) {
      mutation.retry();
      return;
    }
    const monthlyAmountMxnCents = parseManagedMoney(fields.monthly),
      initialFeeMxnCents = parseManagedMoney(fields.initial),
      extraEventAmountMxnCents = parseManagedMoney(fields.extra);
    const contractMonths = Number(fields.months),
      includedEventsPerMonth = Number(fields.monthlyEvents),
      monthlyEventLimit = Number(fields.monthlyLimit),
      eventCapacity = Number(fields.capacity);
    const includedEventsPerYear = fields.annual ? Number(fields.annual) : null;
    if (
      !fields.commercialName.trim() ||
      monthlyAmountMxnCents === null ||
      initialFeeMxnCents === null ||
      extraEventAmountMxnCents === null ||
      contractMonths !== 12 ||
      ![contractMonths, includedEventsPerMonth, monthlyEventLimit, eventCapacity].every(
        (value) => Number.isInteger(value) && value > 0
      ) ||
      (includedEventsPerYear !== null && (!Number.isInteger(includedEventsPerYear) || includedEventsPerYear <= 0)) ||
      (!immediate && !fields.validFrom) ||
      (!immediate && fields.validFrom && fields.validUntil && toIso(fields.validUntil) <= toIso(fields.validFrom))
    ) {
      setValidation('Revisa importes en MXN, límites enteros positivos y el intervalo de vigencia.');
      return;
    }
    setValidation('');
    void mutation.submit({
      commercialName: fields.commercialName.trim(),
      monthlyAmountMxnCents,
      initialFeeMxnCents,
      extraEventAmountMxnCents,
      contractMonths,
      includedEventsPerMonth,
      monthlyEventLimit,
      includedEventsPerYear,
      eventCapacity,
      ...(!immediate && fields.validFrom ? { validFrom: toIso(fields.validFrom) } : {}),
      validUntil: fields.validUntil ? toIso(fields.validUntil) : null
    });
  }
  const field = (key: keyof typeof fields, label: string, type = 'text') => (
    <TextField
      key={key}
      label={label}
      type={type}
      value={fields[key]}
      disabled={mutation.locked}
      onChange={(event) => setFields((old) => ({ ...old, [key]: event.target.value }))}
      slotProps={type === 'datetime-local' ? { inputLabel: { shrink: true } } : {}}
    />
  );
  return (
    <Dialog open onClose={mutation.locked ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Nueva versión · {managedModalityLabel[plan.modality]} / {managedTierLabel[plan.tier]}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Los importes se capturan en pesos MXN antes de IVA. Se creará una versión nueva; los contratos aceptados
            conservan su fotografía comercial.
          </Alert>
          {source ? (
            <Typography variant="body2">
              Versión actual desde {formatDate(source.validFrom)}. Cuota inicial y límites se copian para revisar.
            </Typography>
          ) : null}
          {field('commercialName', 'Nombre comercial')}
          {field('monthly', 'Mensualidad MXN')}
          {field('initial', 'Cuota inicial MXN')}
          {field('extra', 'Evento extraordinario MXN')}
          {field('months', 'Duración contractual en meses', 'number')}
          {field('monthlyEvents', 'Eventos incluidos por mes de referencia', 'number')}
          {field('monthlyLimit', 'Máximo de eventos incluidos por mes', 'number')}
          {plan.tier === 'FREQUENT' ? field('annual', 'Eventos incluidos por año', 'number') : null}
          {field('capacity', 'Accesos máximos por evento', 'number')}
          <FormControlLabel
            control={
              <Checkbox
                checked={immediate}
                disabled={mutation.locked}
                onChange={(event) => setImmediate(event.target.checked)}
              />
            }
            label="Aplicar desde ahora"
          />
          {!immediate ? field('validFrom', 'Vigencia comercial desde', 'datetime-local') : null}
          <Typography variant="caption">
            Aplicar desde ahora usa el instante confirmado por el servidor. Desactívalo para programar una fecha futura.
          </Typography>
          {field('validUntil', 'Vigencia comercial hasta (opcional)', 'datetime-local')}
          {validation ? <Alert severity="error">{validation}</Alert> : null}
          {mutation.error ? <Alert severity={mutation.uncertain ? 'warning' : 'error'}>{mutation.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={mutation.locked} onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="contained" disabled={mutation.busy} onClick={submit}>
          {mutation.uncertain ? 'Reintentar misma versión' : 'Guardar nueva versión'}
        </Button>
      </DialogActions>
      {mutation.navigationGuard}
    </Dialog>
  );
}
