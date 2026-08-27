import {
  ApiError,
  type AdminEvent,
  type AdminEventCommercial,
  type AdminPrice,
  type AdminHotspotInput,
  type AdminHotspotUpdate,
  type AdminInvitationDesign,
  type ApiClient
} from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { ArrowBackOutlined, DeleteOutlined, OpenInNewOutlined } from '@mui/icons-material';
import {
  Alert,
  Button,
  Card,
  CardContent,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { adminQueryKeys } from '../../app/query-client';
import { adminErrorMessage } from '../../shared/admin-error';
import { eventStatusLabel } from '../../shared/admin-labels';
import { AdminErrorState, AdminLoadingState } from '../../shared/AdminStates';
import { AdminFloorplanBuilderWorkspace } from './floorplan/AdminFloorplanBuilderWorkspace';
import { AdminPilotOperationalLog } from './pilot/AdminPilotOperationalLog';

type Section = 'comercial' | 'datos' | 'invitacion' | 'croquis' | 'registro';

export function AdminEventPreparationPage({ apiClient }: { apiClient: ApiClient }) {
  const { eventId = '' } = useParams();
  const location = useLocation();
  const section: Section = location.pathname.endsWith('/comercial')
    ? 'comercial'
    : location.pathname.endsWith('/invitacion')
      ? 'invitacion'
      : location.pathname.endsWith('/croquis')
        ? 'croquis'
        : location.pathname.endsWith('/registro')
          ? 'registro'
          : 'datos';
  const event = useQuery({
    queryKey: adminQueryKeys.event(eventId),
    queryFn: ({ signal }) => apiClient.adminEvents.get(eventId, signal),
    enabled: Boolean(eventId)
  });

  if (event.isPending) return <AdminLoadingState label="Cargando preparación del Evento..." />;
  if (event.isError) return <AdminErrorState onRetry={() => void event.refetch()} />;
  if (event.data.deletedAt) {
    return <Alert severity="warning">Este Evento está eliminado y no admite preparación.</Alert>;
  }

  const data = event.data;
  const base = `/eventos/${data.id}/preparar`;
  return (
    <Stack spacing={3}>
      <Button
        component={Link}
        to={`/eventos/${data.id}`}
        startIcon={<ArrowBackOutlined />}
        sx={{ alignSelf: 'flex-start' }}
      >
        Volver al Evento
      </Button>
      <PageHeader
        title={`Preparar ${data.name ?? 'Evento sin nombre'}`}
        description={`Cliente ${data.clientId} · Servicio ${data.serviceCode ?? 'sin asignar'}`}
        action={<StatusChip label={eventStatusLabel[data.status]} tone="neutral" />}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} aria-label="Secciones de preparación">
        {(['comercial', 'datos', 'invitacion', 'croquis', 'registro'] as const).map((item) => (
          <Button
            key={item}
            component={Link}
            to={`${base}/${item}`}
            variant={section === item ? 'contained' : 'outlined'}
          >
            {item === 'comercial'
              ? 'Comercial'
              : item === 'datos'
                ? 'Datos'
                : item === 'invitacion'
                  ? 'Invitación'
                  : item === 'croquis'
                    ? 'Croquis'
                    : 'Registro operativo'}
          </Button>
        ))}
      </Stack>
      {section === 'comercial' ? <CommercialSection apiClient={apiClient} event={data} /> : null}
      {section === 'datos' ? <EventDataSection apiClient={apiClient} event={data} /> : null}
      {section === 'invitacion' ? <InvitationSection apiClient={apiClient} event={data} /> : null}
      {section === 'croquis' ? <AdminFloorplanBuilderWorkspace apiClient={apiClient} event={data} /> : null}
      {section === 'registro' ? <AdminPilotOperationalLog apiClient={apiClient} event={data} /> : null}
    </Stack>
  );
}

function CommercialSection({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const queryClient = useQueryClient();
  const operationRunning = useRef(false);
  const lastOperationAt = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [requoteOpen, setRequoteOpen] = useState(false);
  const [proposedServiceId, setProposedServiceId] = useState(event.serviceId ?? '');
  const [proposedCapacity, setProposedCapacity] = useState(String(event.capacity ?? ''));
  const quote = useQuery({
    queryKey: ['admin', 'event-commercial', event.id],
    queryFn: ({ signal }) =>
      apiClient.adminEventPreparation.getCommercialQuote(event.clientId, event.id, undefined, signal)
  });
  const catalog = useQuery({
    queryKey: ['admin', 'catalog', 'prices'],
    queryFn: ({ signal }) => apiClient.adminCatalog.listPrices(signal),
    enabled: requoteOpen
  });
  const capacity = Number(proposedCapacity);
  const proposalValid = Boolean(proposedServiceId) && Number.isInteger(capacity) && capacity >= 1 && capacity <= 150;
  const preview = useQuery({
    queryKey: ['admin', 'event-commercial-preview', event.id, proposedServiceId, capacity],
    queryFn: ({ signal }) =>
      apiClient.adminEventPreparation.getCommercialQuote(
        event.clientId,
        event.id,
        { serviceId: proposedServiceId, capacity },
        signal
      ),
    enabled: requoteOpen && proposalValid,
    retry: false
  });
  const run = async (operation: () => Promise<AdminEventCommercial>) => {
    const now = Date.now();
    if (operationRunning.current || now - lastOperationAt.current < 750) return false;
    lastOperationAt.current = now;
    operationRunning.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await operation();
      queryClient.setQueryData(['admin', 'event-commercial', event.id], result);
      await Promise.all([queryClient.invalidateQueries({ queryKey: adminQueryKeys.event(event.id) }), quote.refetch()]);
      return true;
    } catch (cause) {
      setMessage(adminErrorMessage(cause).message);
      return false;
    } finally {
      operationRunning.current = false;
      setBusy(false);
    }
  };
  if (quote.isPending) return <AdminLoadingState label="Cargando cotización comercial..." />;
  if (quote.isError) return <AdminErrorState onRetry={() => void quote.refetch()} />;
  const data = quote.data;
  const isDigital = data.serviceCode === 'FLYER' || data.serviceCode === 'FLIPBOOK';
  const stale = data.authorizedAt !== null && !data.lockMatchesCurrentContext;
  const legacyNeedsRequote = data.customWorkExists && data.authorizedAt === null;
  const canChangeTerms = data.authorizedAt !== null || legacyNeedsRequote;
  const displayedCredits = data.authorizedAt
    ? (data.lockedFinalCostCredits ?? data.finalCostCredits)
    : data.finalCostCredits;
  const displayedMxn = data.authorizedAt ? (data.lockedAmountMxnCents ?? data.amountMxnCents) : data.amountMxnCents;
  const state = stale
    ? 'Requiere nueva cotización'
    : data.designKickoffAt
      ? 'Diseño iniciado'
      : data.authorizedAt
        ? 'Precio congelado'
        : 'Pendiente de autorización';
  return (
    <Stack spacing={2}>
      {message ? <Alert severity="error">{message}</Alert> : null}
      <Alert severity={stale ? 'warning' : data.authorizedAt ? 'success' : 'info'}>{state}</Alert>
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography component="h2" variant="h4">
              Comercial
            </Typography>
            <CommercialField label="Cliente" value={data.clientName} />
            <CommercialField label="Canal comercial" value={channelLabel(data.commercialChannel)} />
            <CommercialField label="SKU" value={serviceLabel(data.serviceCode)} />
            <CommercialField label="Capacidad" value={`${data.capacity} personas`} />
            <CommercialField label="Tarifa" value={commercialRule(data)} />
            <CommercialField
              label={data.authorizedAt ? 'Precio congelado' : 'Precio cotizado'}
              value={`${displayedCredits} créditos`}
            />
            <CommercialField label="Equivalente" value={formatMxn(displayedMxn)} />
            <CommercialField
              label="Cobertura financiera actual"
              value={`${data.coverage.totalAvailableCredits} créditos · ${data.coverage.sufficient ? 'suficiente' : 'insuficiente'}`}
            />
            <CommercialField label="Autorización" value={data.authorizedAt ? 'Autorizado' : 'Pendiente'} />
            <CommercialField label="Price lock" value={data.priceLockedAt ? 'Precio congelado' : 'Pendiente'} />
            {isDigital ? (
              <CommercialField label="Design kickoff" value={data.designKickoffAt ? 'Diseño iniciado' : 'Pendiente'} />
            ) : null}
            <Alert severity="info">
              La autorización no reserva créditos. El cargo se realiza al activar el evento.
            </Alert>
            {!data.authorizedAt && !data.customWorkExists ? (
              <Button
                variant="contained"
                disabled={busy || !data.coverage.sufficient}
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Confirmas que Provider registra la aceptación comercial y valida la cobertura actual?'
                    )
                  ) {
                    void run(() =>
                      apiClient.adminEventPreparation.authorizeCommercial(event.clientId, event.id, {
                        acceptanceConfirmed: true
                      })
                    );
                  }
                }}
              >
                Autorizar preparación
              </Button>
            ) : null}
            {canChangeTerms ? (
              <Button
                variant={stale || legacyNeedsRequote ? 'contained' : 'outlined'}
                disabled={busy}
                onClick={() => {
                  setProposedServiceId(data.serviceId);
                  setProposedCapacity(String(data.capacity));
                  setRequoteOpen(true);
                }}
              >
                {data.designKickoffAt && !stale ? 'Cambiar términos' : 'Re-cotizar'}
              </Button>
            ) : null}
            {isDigital && data.authorizedAt && data.lockMatchesCurrentContext && !data.designKickoffAt ? (
              <Button
                variant="contained"
                disabled={busy}
                onClick={() =>
                  void run(() => apiClient.adminEventPreparation.startDesignKickoff(event.clientId, event.id))
                }
              >
                Iniciar diseño
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
      <CommercialRequoteDialog
        busy={busy}
        catalog={catalog.data ?? []}
        catalogPending={catalog.isPending}
        capacity={proposedCapacity}
        open={requoteOpen}
        preview={preview.data}
        previewError={preview.isError}
        previewPending={preview.isPending && preview.isFetching}
        serviceId={proposedServiceId}
        onCapacityChange={setProposedCapacity}
        onClose={() => setRequoteOpen(false)}
        onConfirm={() => {
          if (!preview.data || busy) return;
          if (!window.confirm('¿Confirmas la nueva cotización y el reemplazo del price lock?')) return;
          void run(() =>
            apiClient.adminEventPreparation.requoteCommercial(event.clientId, event.id, {
              serviceId: proposedServiceId,
              capacity,
              acceptanceConfirmed: true
            })
          ).then((succeeded) => {
            if (succeeded) setRequoteOpen(false);
          });
        }}
        onServiceChange={setProposedServiceId}
      />
    </Stack>
  );
}

function CommercialRequoteDialog({
  busy,
  catalog,
  catalogPending,
  capacity,
  open,
  preview,
  previewError,
  previewPending,
  serviceId,
  onCapacityChange,
  onClose,
  onConfirm,
  onServiceChange
}: {
  busy: boolean;
  catalog: AdminPrice[];
  catalogPending: boolean;
  capacity: string;
  open: boolean;
  preview: AdminEventCommercial | undefined;
  previewError: boolean;
  previewPending: boolean;
  serviceId: string;
  onCapacityChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onServiceChange: (value: string) => void;
}) {
  const services = [
    ...new Map(
      catalog
        .filter((price) => price.pricingVersion === 2 && price.serviceCode !== 'DEMO')
        .map((price) => [price.serviceId, price] as const)
    ).values()
  ];
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Re-cotizar Evento</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            select
            label="SKU propuesto"
            value={services.some((service) => service.serviceId === serviceId) ? serviceId : ''}
            disabled={catalogPending || busy}
            onChange={(change) => onServiceChange(change.target.value)}
          >
            {services.map((service) => (
              <MenuItem key={service.serviceId} value={service.serviceId}>
                {serviceLabel(service.serviceCode)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Capacidad propuesta"
            type="number"
            slotProps={{ htmlInput: { min: 1, max: 150 } }}
            value={capacity}
            disabled={busy}
            onChange={(change) => onCapacityChange(change.target.value)}
          />
          {previewPending ? <Typography>Calculando cotización vigente...</Typography> : null}
          {previewError ? (
            <Alert severity="warning">No hay tarifa vigente disponible para re-cotizar estos términos.</Alert>
          ) : null}
          {preview ? (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <CommercialField label="SKU" value={serviceLabel(preview.serviceCode)} />
                  <CommercialField label="Capacidad" value={`${preview.capacity} personas`} />
                  <CommercialField label="Tarifa vigente" value={commercialRule(preview)} />
                  <CommercialField label="Precio vigente" value={`${preview.finalCostCredits} créditos`} />
                  <CommercialField
                    label="Cobertura actual"
                    value={`${preview.coverage.totalAvailableCredits} créditos · ${preview.coverage.sufficient ? 'suficiente' : 'insuficiente'}`}
                  />
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={busy || !preview?.coverage.sufficient}>
          Confirmar nueva cotización
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CommercialField({ label, value }: { label: string; value: string }) {
  return (
    <Typography>
      <strong>{label}:</strong> {value}
    </Typography>
  );
}

function channelLabel(channel: AdminEventCommercial['commercialChannel']) {
  return channel === 'PARTNER'
    ? 'Planner / agencia partner'
    : channel === 'VENUE'
      ? 'Venue recurrente'
      : 'Estándar / PVP';
}

function serviceLabel(service: AdminEventCommercial['serviceCode']) {
  return service === 'PHYSICAL_QR' ? 'QR / EventOps' : service === 'FLIPBOOK' ? 'Flipbook' : 'Flyer';
}

function commercialRule(data: AdminEventCommercial) {
  return data.venueTier
    ? `Volumen ${venueTierLabel[data.venueTier]}`
    : `${data.capacityMin ?? 1}–${data.capacityMax ?? data.capacity} personas`;
}

const venueTierLabel: Record<NonNullable<AdminEventCommercial['venueTier']>, string> = {
  ONE_TO_TWO: '1–2 eventos/mes',
  THREE_TO_FIVE: '3–5 eventos/mes',
  SIX_TO_TEN: '6–10 eventos/mes',
  ELEVEN_PLUS: '11+ eventos/mes'
};

function formatMxn(cents: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

function EventDataSection({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => eventDraft(event));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const set = (field: keyof typeof draft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const updated = await apiClient.adminEventPreparation.updateEvent(event.clientId, event.id, {
        name: draft.name.trim() || null,
        socialType: draft.socialType ? (draft.socialType as AdminEvent['socialType']) : null,
        eventDateTime: draft.eventDateTime ? new Date(draft.eventDateTime).toISOString() : null,
        timeZone: draft.timeZone.trim() || null,
        capacity: draft.capacity ? Number(draft.capacity) : null,
        confirmationEnabled: draft.confirmationEnabled,
        floorplanEnabled: draft.floorplanEnabled,
        locationUrl: draft.locationUrl.trim() || null,
        giftRegistryUrl: draft.giftRegistryUrl.trim() || null
      });
      queryClient.setQueryData(adminQueryKeys.event(event.id), updated);
      setDraft(eventDraft(updated));
      setMessage('Datos guardados.');
    } catch (cause) {
      setMessage(adminErrorMessage(cause).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardContent>
        <Stack
          spacing={2}
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Typography component="h2" variant="h4">
            Datos del Evento
          </Typography>
          <TextField label="Servicio" value={event.serviceCode ?? event.serviceId ?? 'Sin asignar'} disabled />
          <TextField label="Nombre" value={draft.name} onChange={(e) => set('name', e.target.value)} />
          <TextField
            select
            label="Tipo social"
            value={draft.socialType}
            onChange={(e) => set('socialType', e.target.value)}
          >
            <MenuItem value="">Sin definir</MenuItem>
            {['WEDDING', 'QUINCEANERA', 'CORPORATE', 'BIRTHDAY', 'OTHER'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Fecha y hora"
            type="datetime-local"
            value={draft.eventDateTime}
            onChange={(e) => set('eventDateTime', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField label="Zona horaria" value={draft.timeZone} onChange={(e) => set('timeZone', e.target.value)} />
          <TextField
            label="Capacidad"
            type="number"
            value={draft.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
          <TextField
            label="URL de ubicación"
            value={draft.locationUrl}
            onChange={(e) => set('locationUrl', e.target.value)}
          />
          <TextField
            label="URL de mesa de regalos"
            value={draft.giftRegistryUrl}
            onChange={(e) => set('giftRegistryUrl', e.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.confirmationEnabled}
                onChange={(e) => set('confirmationEnabled', e.target.checked)}
              />
            }
            label="Confirmación habilitada"
          />
          <FormControlLabel
            control={
              <Checkbox checked={draft.floorplanEnabled} onChange={(e) => set('floorplanEnabled', e.target.checked)} />
            }
            label="Croquis habilitado"
          />
          {message ? <Alert severity={message === 'Datos guardados.' ? 'success' : 'error'}>{message}</Alert> : null}
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Guardando...' : 'Guardar datos'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function InvitationSection({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const supported = event.serviceCode === 'FLYER' || event.serviceCode === 'FLIPBOOK';
  const [design, setDesign] = useState<AdminInvitationDesign>();
  const [readiness, setReadiness] = useState<{ complete: boolean; blockers: string[] }>();
  const [assets, setAssets] = useState<Awaited<ReturnType<ApiClient['adminEventPreparation']['listInvitationAssets']>>>(
    []
  );
  const [hotspots, setHotspots] = useState<Awaited<ReturnType<ApiClient['adminEventPreparation']['listHotspots']>>>([]);
  const [initialAssetId, setInitialAssetId] = useState<string>();
  const [qrAssetId, setQrAssetId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [previewUrl, setPreviewUrl] = useState<string>();

  const reload = async (signal?: AbortSignal) => {
    if (!supported) return;
    const [nextDesign, nextReadiness, nextAssets, nextHotspots] = await Promise.all([
      apiClient.adminEventPreparation.getDesign(event.clientId, event.id, signal).catch((cause) => {
        if (cause instanceof ApiError && cause.status === 404) return undefined;
        throw cause;
      }),
      apiClient.adminEventPreparation.getReadiness(event.clientId, event.id, signal),
      apiClient.adminEventPreparation.listInvitationAssets(event.clientId, event.id, signal),
      apiClient.adminEventPreparation.listHotspots(event.clientId, event.id, signal)
    ]);
    setDesign(nextDesign);
    setReadiness(nextReadiness);
    setAssets(nextAssets);
    setHotspots(nextHotspots);
  };
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch((cause) => setMessage(adminErrorMessage(cause).message));
    return () => controller.abort();
  }, [event.clientId, event.id, supported]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await operation();
      await reload();
    } catch (cause) {
      setMessage(adminErrorMessage(cause).message);
    } finally {
      setBusy(false);
    }
  };
  const uploadFlyer = async (input: ChangeEvent<HTMLInputElement>, kind: 'initial' | 'qr') => {
    const file = input.target.files?.[0];
    if (!file) return;
    await run(async () => {
      const asset = await apiClient.adminEventPreparation.uploadInvitationAsset(
        event.clientId,
        event.id,
        file,
        kind === 'initial' ? 'FLYER_INITIAL_IMAGE' : 'FLYER_QR_IMAGE'
      );
      if (design?.type === 'FLYER') {
        await (kind === 'initial'
          ? apiClient.adminEventPreparation.replaceFlyerInitial(event.clientId, event.id, { assetId: asset.id })
          : apiClient.adminEventPreparation.replaceFlyerQr(event.clientId, event.id, { assetId: asset.id }));
      } else if (kind === 'initial') setInitialAssetId(asset.id);
      else setQrAssetId(asset.id);
    });
  };
  const uploadPage = async (input: ChangeEvent<HTMLInputElement>, pageId?: string) => {
    const file = input.target.files?.[0];
    if (!file) return;
    await run(async () => {
      const asset = await apiClient.adminEventPreparation.uploadInvitationAsset(
        event.clientId,
        event.id,
        file,
        'FLIPBOOK_PAGE_IMAGE'
      );
      if (pageId)
        await apiClient.adminEventPreparation.replacePage(event.clientId, event.id, pageId, { assetId: asset.id });
      else await apiClient.adminEventPreparation.addPage(event.clientId, event.id, { fileAssetId: asset.id });
    });
  };
  const preview = async (assetId: string) => {
    await run(async () => {
      const blob = await apiClient.adminEventPreparation.invitationAssetContent(event.clientId, event.id, assetId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    });
  };

  if (!supported)
    return <Alert severity="info">El servicio de este Evento no admite diseño de invitación digital.</Alert>;
  if (!event.designKickoffAt) {
    return (
      <Alert
        severity="warning"
        action={
          <Button component={Link} to={`/eventos/${event.id}/preparar/comercial`} color="inherit">
            Ir a Comercial
          </Button>
        }
      >
        Autoriza los términos comerciales e inicia el diseño antes de cargar o editar la invitación.
      </Alert>
    );
  }
  return (
    <Stack spacing={2}>
      {message ? <Alert severity="error">{message}</Alert> : null}
      <Alert severity={readiness?.complete ? 'success' : 'warning'}>
        {readiness?.complete
          ? 'Invitación técnicamente lista.'
          : `Pendiente: ${readiness?.blockers.join(', ') || 'cargando estado'}`}
      </Alert>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h4">
              Diseño {event.serviceCode === 'FLYER' ? 'Flyer' : 'Flipbook'}
            </Typography>
            {event.serviceCode === 'FLYER' ? (
              <>
                <UploadButton
                  label={design ? 'Reemplazar imagen principal' : 'Subir imagen principal'}
                  onChange={(e) => void uploadFlyer(e, 'initial')}
                  disabled={busy}
                />
                <UploadButton
                  label={design ? 'Reemplazar imagen QR' : 'Subir imagen QR'}
                  onChange={(e) => void uploadFlyer(e, 'qr')}
                  disabled={busy}
                />
                {!design ? (
                  <Button
                    variant="contained"
                    disabled={busy || !initialAssetId || !qrAssetId}
                    onClick={() =>
                      void run(() =>
                        apiClient.adminEventPreparation.createFlyer(event.clientId, event.id, {
                          initialAssetId: initialAssetId!,
                          qrAssetId: qrAssetId!
                        })
                      )
                    }
                  >
                    Crear Flyer
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {!design ? (
                  <Button
                    variant="contained"
                    disabled={busy}
                    onClick={() =>
                      void run(() => apiClient.adminEventPreparation.createFlipbook(event.clientId, event.id))
                    }
                  >
                    Crear Flipbook
                  </Button>
                ) : null}
                {design?.type === 'FLIPBOOK' ? (
                  <UploadButton label="Agregar página" onChange={(e) => void uploadPage(e)} disabled={busy} />
                ) : null}
                {design?.pages.map((page, index) => (
                  <Stack
                    key={page.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ alignItems: 'center' }}
                  >
                    <Typography sx={{ flex: 1 }}>Página {index + 1}</Typography>
                    <Button
                      disabled={busy || index === 0}
                      onClick={() =>
                        void run(() =>
                          apiClient.adminEventPreparation.reorderPages(event.clientId, event.id, {
                            pageIds: move(
                              design.pages.map((item) => item.id),
                              index,
                              index - 1
                            )
                          })
                        )
                      }
                    >
                      Subir
                    </Button>
                    <Button
                      disabled={busy || index === design.pages.length - 1}
                      onClick={() =>
                        void run(() =>
                          apiClient.adminEventPreparation.reorderPages(event.clientId, event.id, {
                            pageIds: move(
                              design.pages.map((item) => item.id),
                              index,
                              index + 1
                            )
                          })
                        )
                      }
                    >
                      Bajar
                    </Button>
                    <UploadButton
                      label={`Reemplazar página ${index + 1}`}
                      onChange={(e) => void uploadPage(e, page.id)}
                      disabled={busy}
                    />
                    <Button
                      color="error"
                      startIcon={<DeleteOutlined />}
                      disabled={busy}
                      onClick={() =>
                        void run(() => apiClient.adminEventPreparation.removePage(event.clientId, event.id, page.id))
                      }
                    >
                      Eliminar
                    </Button>
                  </Stack>
                ))}
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography component="h2" variant="h4">
              Archivos privados
            </Typography>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Vista previa privada"
                style={{ maxWidth: 420, maxHeight: 420, objectFit: 'contain' }}
              />
            ) : null}
            {assets.map((asset) => (
              <Stack key={asset.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ flex: 1 }}>
                  {asset.originalName} · {asset.status}
                </Typography>
                <Button startIcon={<OpenInNewOutlined />} onClick={() => void preview(asset.id)}>
                  Vista previa
                </Button>
                <Button
                  color="error"
                  onClick={() =>
                    void run(() =>
                      apiClient.adminEventPreparation.removeInvitationAsset(event.clientId, event.id, asset.id)
                    )
                  }
                >
                  Eliminar archivo
                </Button>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
      <Hotspots apiClient={apiClient} event={event} design={design} hotspots={hotspots} busy={busy} run={run} />
    </Stack>
  );
}

function Hotspots({
  apiClient,
  event,
  design,
  hotspots,
  busy,
  run
}: {
  apiClient: ApiClient;
  event: AdminEvent;
  design: AdminInvitationDesign | undefined;
  hotspots: Awaited<ReturnType<ApiClient['adminEventPreparation']['listHotspots']>>;
  busy: boolean;
  run: (operation: () => Promise<unknown>) => Promise<void>;
}) {
  const [action, setAction] = useState<AdminHotspotInput['action']>('RSVP');
  const [url, setUrl] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [geometry, setGeometry] = useState({ x: 0.1, y: 0.1, width: 0.25, height: 0.1, priority: 0 });
  const save = async () => {
    const firstPage = design?.type === 'FLIPBOOK' ? design.pages[0]?.id : undefined;
    const values: AdminHotspotUpdate = {
      action,
      ...geometry,
      ...(action === 'EXTERNAL_LINK' && url ? { url } : {})
    };
    if (editingId) {
      await run(() => apiClient.adminEventPreparation.updateHotspot(event.clientId, event.id, editingId, values));
    } else {
      const body: AdminHotspotInput = {
        ...geometry,
        action,
        visualOwnerType: firstPage ? 'FLIPBOOK_PAGE' : 'FLYER',
        ...(firstPage ? { flipbookPageId: firstPage } : {}),
        ...(action === 'EXTERNAL_LINK' && url ? { url } : {})
      };
      await run(() => apiClient.adminEventPreparation.createHotspot(event.clientId, event.id, body));
    }
    setEditingId(undefined);
    setAction('RSVP');
    setUrl('');
    setGeometry({ x: 0.1, y: 0.1, width: 0.25, height: 0.1, priority: hotspots.length + 1 });
  };
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography component="h2" variant="h4">
            Zonas interactivas
          </Typography>
          <TextField
            select
            label="Acción"
            value={action}
            onChange={(e) => setAction(e.target.value as AdminHotspotInput['action'])}
          >
            {['RSVP', 'LOCATION', 'GIFT_REGISTRY', 'QR_AREA', 'EXTERNAL_LINK'].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          {action === 'EXTERNAL_LINK' ? (
            <TextField label="URL externa" value={url} onChange={(e) => setUrl(e.target.value)} />
          ) : null}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {(['x', 'y', 'width', 'height', 'priority'] as const).map((field) => (
              <TextField
                key={field}
                label={field === 'width' ? 'Ancho' : field === 'height' ? 'Alto' : field}
                type="number"
                value={geometry[field]}
                onChange={(e) => setGeometry((current) => ({ ...current, [field]: Number(e.target.value) }))}
                slotProps={{
                  htmlInput: field === 'priority' ? { min: 0, step: 1 } : { min: 0, max: 1, step: 0.01 }
                }}
              />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            x, y, ancho y alto usan valores normalizados entre 0 y 1.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={
                busy ||
                !design ||
                geometry.x < 0 ||
                geometry.y < 0 ||
                geometry.width <= 0 ||
                geometry.height <= 0 ||
                geometry.x + geometry.width > 1 ||
                geometry.y + geometry.height > 1
              }
              onClick={() => void save()}
            >
              {editingId ? 'Guardar zona' : 'Agregar zona'}
            </Button>
            {editingId ? <Button onClick={() => setEditingId(undefined)}>Cancelar edición</Button> : null}
          </Stack>
          {hotspots.map((hotspot) => (
            <Stack key={hotspot.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography sx={{ flex: 1 }}>
                {hotspot.action} · x {hotspot.x} y {hotspot.y} · prioridad {hotspot.priority}
              </Typography>
              <Button
                disabled={busy}
                onClick={() => {
                  setEditingId(hotspot.id);
                  setAction(hotspot.action);
                  setUrl(hotspot.url ?? '');
                  setGeometry({
                    x: hotspot.x,
                    y: hotspot.y,
                    width: hotspot.width,
                    height: hotspot.height,
                    priority: hotspot.priority
                  });
                }}
              >
                Editar zona
              </Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() =>
                  void run(() => apiClient.adminEventPreparation.removeHotspot(event.clientId, event.id, hotspot.id))
                }
              >
                Eliminar zona
              </Button>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function UploadButton({
  label,
  onChange,
  disabled
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}) {
  return (
    <Button component="label" variant="outlined" disabled={disabled}>
      {label}
      <input hidden type="file" accept="image/png,image/jpeg" onChange={onChange} />
    </Button>
  );
}

function eventDraft(event: AdminEvent) {
  return {
    name: event.name ?? '',
    socialType: event.socialType ?? '',
    eventDateTime: event.eventDateTime?.slice(0, 16) ?? '',
    timeZone: event.timeZone ?? '',
    capacity: event.capacity?.toString() ?? '',
    confirmationEnabled: event.confirmationEnabled,
    floorplanEnabled: event.floorplanEnabled,
    locationUrl: event.locationUrl ?? '',
    giftRegistryUrl: event.giftRegistryUrl ?? ''
  };
}

function move(values: string[], from: number, to: number) {
  const next = [...values];
  const [value] = next.splice(from, 1);
  if (value) next.splice(to, 0, value);
  return next;
}
