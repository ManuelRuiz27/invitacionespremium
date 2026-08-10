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
import { Link } from 'react-router-dom';
import { serviceLabels } from '../../shared/formatters';
import { AttemptManager, isUncertainFailure } from '../wizard-model';
import type { WizardStep } from '../wizard-model';
import { blockerMessage, errorMessage, operationReference } from '../wizard-utils';

type Check = { label: string; ok: boolean; step: WizardStep; detail?: string };
export function ReviewStep({
  apiClient,
  event,
  service,
  user,
  onEventReload,
  onGo
}: {
  apiClient: ApiClient;
  event: Event;
  service: AvailableService | undefined;
  user: AuthUser;
  onEventReload: (event: Event) => void;
  onGo: (step: WizardStep) => void;
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
  const digital = service?.code === 'FLYER' || service?.code === 'FLIPBOOK';
  const operational = current.status === 'ACTIVE' || current.status === 'EVENT_DAY';
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
            ok: Boolean(latest.name && latest.eventDateTime && latest.capacity && latest.serviceId),
            step: 'datos'
          },
          { label: 'Pases generados', ok: passes.length > 0, step: 'pases', detail: `${passes.length} disponibles` },
          ...(latest.floorplanEnabled
            ? [
                {
                  label: 'Mesas listas',
                  ok: Boolean(floorplan?.locked && floorplan.shapes.length),
                  step: 'croquis' as const
                }
              ]
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
            ok: Boolean(latest.name && latest.eventDateTime && latest.capacity && latest.serviceId),
            step: 'datos'
          },
          { label: 'Invitados', ok: contacts.length > 0, step: 'contactos', detail: `${contacts.length} registrados` },
          { label: 'Invitaciones activas', ok: invitations.length > 0, step: 'contactos' },
          {
            label: 'Invitación',
            ok: readiness.complete,
            step: 'invitacion',
            detail: readiness.blockers.map(blockerMessage).join(' ')
          },
          { label: 'Confirmación de asistencia', ok: latest.confirmationEnabled, step: 'confirmacion' },
          { label: 'Ubicación', ok: Boolean(latest.locationUrl), step: 'datos' },
          { label: 'Mesa de regalos', ok: Boolean(latest.giftRegistryUrl), step: 'datos' },
          ...(latest.floorplanEnabled
            ? [
                {
                  label: 'Mesas listas',
                  ok: Boolean(floorplan?.locked && floorplan.shapes.length),
                  step: 'croquis' as const
                }
              ]
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
      setMessage('El evento quedó activado correctamente.');
    } catch (reason) {
      if (!isUncertainFailure(reason)) attempts.current.clear('activate', attempt.key);
      try {
        const latest = await apiClient.events.get(event.id);
        setCurrent(latest);
        onEventReload(latest);
        if (latest.status === 'ACTIVE') {
          attempts.current.clear('activate', attempt.key);
          setDialog(false);
          setMessage('El evento quedó activado correctamente.');
        } else {
          setMessage(
            isUncertainFailure(reason)
              ? 'No pudimos confirmar la activación. Revisa tu conexión e inténtalo nuevamente.'
              : errorMessage(reason)
          );
          setReference(operationReference(reason));
        }
      } catch {
        setMessage(
          isUncertainFailure(reason)
            ? 'No pudimos confirmar la activación. Revisa tu conexión e inténtalo nuevamente.'
            : errorMessage(reason)
        );
        setReference(operationReference(reason));
      }
    } finally {
      setBusy(false);
    }
  };
  const available = (balance?.purchasedCredits ?? 0) + (balance?.creditLine.availableCredits ?? 0);
  const insufficient = canSeeFinance && Boolean(service) && available < (service?.credits ?? 0);
  const lineCreditsNeeded = Math.max(0, (service?.credits ?? 0) - (balance?.purchasedCredits ?? 0));
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Revisión y activación
      </Typography>
      <Typography>
        Servicio: {service ? serviceLabels[service.code] : 'Pendiente'} · Costo de activación: {service?.credits ?? '—'}{' '}
        créditos
      </Typography>
      <List>
        {checks.map((check) => (
          <ListItem
            key={check.label}
            sx={{ color: check.ok ? 'success.main' : 'warning.main', gap: 1, flexWrap: 'wrap' }}
          >
            <span>
              {check.ok ? '✓' : 'Pendiente:'} {check.label}
              {check.detail ? ` · ${check.detail}` : ''}
            </span>
            {!check.ok && !operational ? (
              <Button size="small" onClick={() => onGo(check.step)}>
                Corregir
              </Button>
            ) : null}
          </ListItem>
        ))}
      </List>
      {operational ? (
        <Alert severity="success">El evento está activo y listo para operar.</Alert>
      ) : current.status === 'READY_TO_ACTIVATE' ? (
        <Alert severity="success">Todo está listo para activar este evento.</Alert>
      ) : (
        <Alert severity="warning">El evento aún no está listo para activar. Resuelve los pendientes indicados.</Alert>
      )}
      {canSeeFinance ? (
        <Stack>
          <Typography>Saldo comprado: {balance?.purchasedCredits ?? 'Cargando…'} créditos</Typography>
          <Typography>
            Línea utilizada: {balance?.creditLine.usedCredits ?? '—'} · disponible:{' '}
            {balance?.creditLine.availableCredits ?? '—'} créditos
          </Typography>
          {!operational && insufficient ? (
            <Alert severity="error">
              No tienes créditos suficientes para activar este evento. Compra créditos o solicita línea de crédito para
              continuar.
            </Alert>
          ) : null}
        </Stack>
      ) : (
        <Alert severity="info">Tu Organización administra el pago. Tu rol no tiene acceso al detalle financiero.</Alert>
      )}
      {operational ? (
        <Button
          component={Link}
          to={digital ? `/eventos/${event.id}?seccion=invitaciones` : `/eventos/${event.id}`}
          variant="contained"
          sx={{ alignSelf: 'flex-start', minHeight: 44 }}
        >
          {digital ? 'Enviar invitaciones' : 'Ir al evento'}
        </Button>
      ) : (
        <Button
          variant="contained"
          disabled={current.status !== 'READY_TO_ACTIVATE' || busy || insufficient}
          onClick={() => setDialog(true)}
        >
          Activar Evento
        </Button>
      )}
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
            <Typography>Costo de activación: {service?.credits ?? '—'} créditos.</Typography>
            {canSeeFinance ? (
              <>
                <Typography>Saldo comprado: {balance?.purchasedCredits ?? '—'}.</Typography>
                <Typography>Línea utilizada: {balance?.creditLine.usedCredits ?? '—'}.</Typography>
                {lineCreditsNeeded > 0 ? (
                  <Typography>
                    Este evento se activará usando tu línea de crédito disponible. Se generará una deuda por{' '}
                    {lineCreditsNeeded} créditos.
                  </Typography>
                ) : (
                  <Typography>
                    Al activar este evento se descontarán {service?.credits ?? '—'} créditos de tu saldo. Después podrás
                    enviar invitaciones y generar accesos para staff.
                  </Typography>
                )}
              </>
            ) : (
              <>
                <Typography>
                  La Organización administra el cobro; no se muestra información financiera a tu rol.
                </Typography>
                <Typography>Después de activar podrás enviar invitaciones y generar accesos para staff.</Typography>
              </>
            )}
            {insufficient ? (
              <Alert severity="error">
                No tienes créditos suficientes para activar este evento. Compra créditos o solicita línea de crédito
                para continuar.
              </Alert>
            ) : null}
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
