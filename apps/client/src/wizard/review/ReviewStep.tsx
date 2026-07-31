import type { ApiClient, AuthUser, AvailableService, Event, FinanceBalance } from '@invitaciones/api-client';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  Stack,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttemptManager, isUncertainFailure } from '../wizard-model';
import { blockerMessage, errorMessage, operationReference } from '../wizard-utils';

type Check = { label: string; ok: boolean; detail?: string };
export function ReviewStep({
  apiClient,
  event,
  service,
  user,
  onEventReload
}: {
  apiClient: ApiClient;
  event: Event;
  service: AvailableService | undefined;
  user: AuthUser;
  onEventReload: (event: Event) => void;
}) {
  const attempts = useRef(new AttemptManager());
  const [current, setCurrent] = useState(event);
  const [checks, setChecks] = useState<Check[]>([]);
  const [balance, setBalance] = useState<FinanceBalance>();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [reference, setReference] = useState<string>();
  const physical = service?.code === 'PHYSICAL_QR';
  const canSeeFinance = user.role !== 'ORGANIZATION_PLANNER';
  const load = useCallback(async () => {
    try {
      const latest = await apiClient.events.get(event.id);
      setCurrent(latest);
      onEventReload(latest);
      if (physical) {
        const [passes, floorplan] = await Promise.all([
          apiClient.physicalPasses.list(event.id),
          latest.floorplanEnabled
            ? apiClient.floorplan.get(event.id).catch(() => undefined)
            : Promise.resolve(undefined)
        ]);
        setChecks([
          {
            label: 'Datos del Evento',
            ok: Boolean(latest.name && latest.eventDateTime && latest.capacity && latest.serviceId)
          },
          { label: 'Pases generados', ok: passes.length > 0, detail: `${passes.length} disponibles` },
          ...(latest.floorplanEnabled
            ? [{ label: 'Croquis completo y bloqueado', ok: Boolean(floorplan?.locked && floorplan.shapes.length) }]
            : [])
        ]);
      } else {
        const [readiness, contacts, invitations, floorplan] = await Promise.all([
          apiClient.design.readiness(event.id),
          apiClient.contacts.list(event.id),
          apiClient.invitations.list(event.id),
          latest.floorplanEnabled
            ? apiClient.floorplan.get(event.id).catch(() => undefined)
            : Promise.resolve(undefined)
        ]);
        setChecks([
          {
            label: 'Datos del Evento',
            ok: Boolean(latest.name && latest.eventDateTime && latest.capacity && latest.serviceId)
          },
          { label: 'Contactos', ok: contacts.length > 0, detail: `${contacts.length} Contactos` },
          { label: 'Invitaciones activas', ok: invitations.length > 0 },
          { label: 'Diseño', ok: readiness.complete, detail: readiness.blockers.map(blockerMessage).join(' ') },
          { label: 'Confirmación de asistencia', ok: latest.confirmationEnabled },
          { label: 'Ubicación', ok: Boolean(latest.locationUrl) },
          { label: 'Mesa de regalos', ok: Boolean(latest.giftRegistryUrl) },
          ...(latest.floorplanEnabled
            ? [{ label: 'Croquis completo y bloqueado', ok: Boolean(floorplan?.locked && floorplan.shapes.length) }]
            : [])
        ]);
      }
      if (canSeeFinance) setBalance(await apiClient.finance.balance());
    } catch (reason) {
      setMessage(errorMessage(reason));
      setReference(operationReference(reason));
    }
  }, [apiClient, canSeeFinance, event.id, onEventReload, physical]);
  useEffect(() => {
    void load();
  }, [load]);
  const activate = async () => {
    if (busy) return;
    setBusy(true);
    const attempt = attempts.current.start('activate', event.id);
    try {
      const result = await apiClient.events.activate(event.id, attempt.key);
      attempts.current.clear('activate', attempt.key);
      setCurrent(result.event);
      onEventReload(result.event);
      setDialog(false);
      setMessage('Evento activado correctamente.');
    } catch (reason) {
      if (!isUncertainFailure(reason)) attempts.current.clear('activate', attempt.key);
      try {
        const latest = await apiClient.events.get(event.id);
        setCurrent(latest);
        onEventReload(latest);
        if (latest.status === 'ACTIVE') {
          attempts.current.clear('activate', attempt.key);
          setDialog(false);
          setMessage('La activación fue confirmada al reconciliar el Evento.');
        } else {
          setMessage(errorMessage(reason));
          setReference(operationReference(reason));
        }
      } catch {
        setMessage(errorMessage(reason));
        setReference(operationReference(reason));
      }
    } finally {
      setBusy(false);
    }
  };
  const available = (balance?.purchasedCredits ?? 0) + (balance?.creditLine.availableCredits ?? 0);
  const insufficient = canSeeFinance && Boolean(service) && available < (service?.credits ?? 0);
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Revisión y activación
      </Typography>
      <Typography>
        Servicio: {service?.code ?? 'Pendiente'} · Costo vigente estimado: {service?.credits ?? '—'} créditos
      </Typography>
      <List>
        {checks.map((check) => (
          <ListItem key={check.label} sx={{ color: check.ok ? 'success.main' : 'warning.main' }}>
            {check.ok ? '✓' : 'Pendiente:'} {check.label}
            {check.detail ? ` · ${check.detail}` : ''}
          </ListItem>
        ))}
      </List>
      {current.status === 'READY_TO_ACTIVATE' ? (
        <Alert severity="success">El backend confirmó que el Evento está listo para activar.</Alert>
      ) : (
        <Alert severity="warning">
          El Evento aún no está listo para activar. Guarda y resuelve los pendientes indicados.
        </Alert>
      )}
      {canSeeFinance ? (
        <Stack>
          <Typography>Saldo comprado: {balance?.purchasedCredits ?? 'Cargando…'} créditos</Typography>
          <Typography>
            Línea utilizada: {balance?.creditLine.usedCredits ?? '—'} · disponible:{' '}
            {balance?.creditLine.availableCredits ?? '—'} créditos
          </Typography>
          {insufficient ? <Alert severity="error">Saldo y línea insuficientes para el costo estimado.</Alert> : null}
        </Stack>
      ) : (
        <Alert severity="info">Tu Organización administra el pago. Tu rol no tiene acceso al detalle financiero.</Alert>
      )}
      <Button
        variant="contained"
        disabled={current.status !== 'READY_TO_ACTIVATE' || busy || insufficient}
        onClick={() => setDialog(true)}
      >
        Activar Evento
      </Button>
      {message ? (
        <Alert severity="info">
          {message}
          {reference ? (
            <Typography variant="caption" sx={{ display: 'block' }}>
              {reference}
            </Typography>
          ) : null}
        </Alert>
      ) : null}
      <Dialog open={dialog} onClose={() => !busy && setDialog(false)} aria-labelledby="activation-title">
        <DialogTitle id="activation-title">Confirmar activación</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>Costo vigente: {service?.credits ?? '—'} créditos.</Typography>
            <Typography>
              Estimación de cobro: {service?.credits ?? '—'} créditos; el servidor calculará el monto definitivo.
            </Typography>
            {canSeeFinance ? (
              <>
                <Typography>Saldo comprado: {balance?.purchasedCredits ?? '—'}.</Typography>
                <Typography>Línea utilizada: {balance?.creditLine.usedCredits ?? '—'}.</Typography>
              </>
            ) : (
              <Typography>
                La Organización administra el cobro; no se muestra información financiera a tu rol.
              </Typography>
            )}
            {insufficient ? <Alert severity="error">No hay fondos suficientes.</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDialog(false)}>
            Cancelar
          </Button>
          <Button variant="contained" disabled={busy || insufficient} onClick={() => void activate()}>
            {busy ? 'Activando…' : 'Confirmar activación'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
