import {
  ApiError,
  type ApiClient,
  type AvailableService,
  type Contact,
  type Event,
  type UpdateEventInput
} from '@invitaciones/api-client';
import { ErrorState, LoadingState, PageHeader, StatusChip } from '@invitaciones/ui';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canViewFinance } from '../shared/roles';
import { useSessionExpiry } from '../shared/use-session-expiry';
import {
  createOperationKey,
  isEditableEvent,
  isMeaningfulDraft,
  SerialAutosave,
  stepsForService,
  type SaveState,
  type WizardStep
} from './wizard-model';

const labels: Record<WizardStep, string> = {
  datos: 'Datos',
  contactos: 'Contactos',
  invitacion: 'Invitación',
  confirmacion: 'Confirmación',
  croquis: 'Croquis',
  pases: 'Pases',
  revision: 'Revisión'
};

const emptyDraft: UpdateEventInput = {
  serviceId: null,
  name: null,
  socialType: null,
  eventDateTime: null,
  timeZone: 'America/Mexico_City',
  capacity: null,
  confirmationEnabled: false,
  locationUrl: null,
  giftRegistryUrl: null,
  floorplanEnabled: false
};

export function WizardPage({ apiClient }: { apiClient: ApiClient }) {
  const { eventId, step = 'datos' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [services, setServices] = useState<AvailableService[]>();
  const [event, setEvent] = useState<Event>();
  const [draft, setDraft] = useState<UpdateEventInput>(emptyDraft);
  const [loadError, setLoadError] = useState<unknown>();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>();
  const eventRef = useRef<Event | undefined>(undefined);
  eventRef.current = event;
  useSessionExpiry(loadError, eventId ? `/eventos/${eventId}/configuracion/${step}` : '/eventos/nuevo');

  const save = useCallback(
    async (value: UpdateEventInput) => {
      if (!eventRef.current) return;
      const updated = await apiClient.events.update(eventRef.current.id, value);
      setEvent(updated);
    },
    [apiClient]
  );
  const autosave = useMemo(() => new SerialAutosave(save, setSaveState), [save]);

  useEffect(() => () => autosave.dispose(), [autosave]);
  useEffect(() => {
    const warn = (browserEvent: BeforeUnloadEvent) => {
      if (!autosave.hasPending()) return;
      browserEvent.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [autosave]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiClient.services.listAvailable(controller.signal),
      eventId ? apiClient.events.get(eventId, controller.signal) : Promise.resolve(undefined)
    ])
      .then(([available, loaded]) => {
        setServices(available.filter((service) => service.code !== 'DEMO'));
        if (loaded) {
          setEvent(loaded);
          setDraft(toDraft(loaded));
        }
      })
      .catch(setLoadError);
    return () => controller.abort();
  }, [apiClient, eventId]);

  const service = services?.find((item) => item.id === draft.serviceId);
  const steps = stepsForService(service?.code);
  const selectedStep: WizardStep = steps.includes(step as WizardStep) ? (step as WizardStep) : steps[0]!;
  const editable = !event || isEditableEvent(event.status);

  useEffect(() => {
    if (event && step !== selectedStep) {
      navigate(`/eventos/${event.id}/configuracion/${selectedStep}`, { replace: true });
    }
  }, [event, navigate, selectedStep, step]);

  const changeDraft = (patch: Partial<UpdateEventInput>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (event && editable) autosave.schedule(next);
  };

  const ensureEvent = async (): Promise<Event | undefined> => {
    if (event) {
      const saved = await autosave.flush();
      if (!saved) {
        setMessage('No pudimos guardar los cambios. Reintenta antes de salir.');
        return undefined;
      }
      return eventRef.current;
    }
    if (!isMeaningfulDraft(draft)) {
      setMessage('Captura al menos el servicio o un dato principal antes de guardar.');
      return undefined;
    }
    setSaveState('saving');
    try {
      const created = await apiClient.events.create(draft);
      setEvent(created);
      setSaveState('saved');
      navigate(`/eventos/${created.id}/configuracion/${selectedStep}`, { replace: true });
      return created;
    } catch (error) {
      setSaveState('error');
      setMessage(errorMessage(error));
      return undefined;
    }
  };

  const go = async (target: WizardStep) => {
    const current = await ensureEvent();
    if (!current) return;
    navigate(`/eventos/${current.id}/configuracion/${target}`);
  };

  if (!services && !loadError) return <LoadingState label="Cargando configuración del Evento…" />;
  if (loadError) return <ErrorState title="No pudimos cargar el Evento." message={errorMessage(loadError)} />;

  return (
    <>
      <PageHeader
        title={event ? (event.name ?? 'Configurar Evento') : 'Nuevo Evento'}
        description="Completa cada etapa. Las validaciones definitivas se realizan en el servidor."
      />
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2.5 } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" aria-live="polite">
              {saveLabel(saveState)}
            </Typography>
            {event ? <StatusChip label={event.status} tone={editable ? 'warning' : 'neutral'} /> : null}
          </Stack>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Stepper nonLinear activeStep={steps.indexOf(selectedStep)}>
              {steps.map((item) => (
                <Step key={item}>
                  <StepButton onClick={() => void go(item)}>{labels[item]}</StepButton>
                </Step>
              ))}
            </Stepper>
          </Box>
          <Tabs
            value={selectedStep}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ display: { md: 'none' } }}
            onChange={(_, value: WizardStep) => void go(value)}
            aria-label="Etapas de configuración"
          >
            {steps.map((item) => (
              <Tab key={item} value={item} label={labels[item]} />
            ))}
          </Tabs>
        </Paper>

        {!editable ? <Alert severity="info">Este Evento es de solo lectura en su estado actual.</Alert> : null}
        {message ? (
          <Alert severity="warning" onClose={() => setMessage(undefined)}>
            {message}
          </Alert>
        ) : null}

        <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          {selectedStep === 'datos' ? (
            <DataStep services={services ?? []} draft={draft} disabled={!editable} onChange={changeDraft} />
          ) : null}
          {selectedStep === 'contactos' && event ? (
            <ContactsStep apiClient={apiClient} event={event} disabled={!editable} />
          ) : null}
          {selectedStep === 'invitacion' && event ? (
            <InvitationStep apiClient={apiClient} event={event} service={service} disabled={!editable} />
          ) : null}
          {selectedStep === 'confirmacion' ? (
            <ConfirmationStep draft={draft} disabled={!editable} onChange={changeDraft} />
          ) : null}
          {selectedStep === 'croquis' && event ? (
            <FloorplanStep
              apiClient={apiClient}
              event={event}
              draft={draft}
              disabled={!editable}
              onChange={changeDraft}
            />
          ) : null}
          {selectedStep === 'pases' && event ? (
            <PassesStep apiClient={apiClient} event={event} disabled={!editable} />
          ) : null}
          {selectedStep === 'revision' && event ? (
            <ReviewStep
              apiClient={apiClient}
              event={event}
              service={service}
              canSeeFinance={Boolean(user && canViewFinance(user.role))}
              onActivated={setEvent}
            />
          ) : null}
        </Paper>

        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1.5 }}>
          <Button onClick={() => void ensureEvent().then((saved) => saved && navigate('/eventos'))}>
            Guardar y salir
          </Button>
          <Stack direction="row" spacing={1}>
            <Button
              disabled={steps.indexOf(selectedStep) === 0}
              onClick={() => void go(steps[steps.indexOf(selectedStep) - 1]!)}
            >
              Anterior
            </Button>
            <Button
              variant="contained"
              disabled={steps.indexOf(selectedStep) === steps.length - 1}
              onClick={() => void go(steps[steps.indexOf(selectedStep) + 1]!)}
            >
              Guardar y continuar
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </>
  );
}

function DataStep({
  services,
  draft,
  disabled,
  onChange
}: {
  services: AvailableService[];
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
}) {
  const zones = useMemo(() => supportedTimeZones(), []);
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Datos del Evento
      </Typography>
      <TextField
        select
        required
        label="Servicio"
        value={draft.serviceId ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ serviceId: e.target.value || null })}
      >
        {services.map((service) => (
          <MenuItem key={service.id} value={service.id}>
            {service.code} · {service.credits} créditos
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Nombre"
        value={draft.name ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value || null })}
      />
      <TextField
        select
        label="Tipo social"
        value={draft.socialType ?? ''}
        disabled={disabled}
        onChange={(e) =>
          onChange({ socialType: (e.target.value || null) as NonNullable<UpdateEventInput['socialType']> | null })
        }
      >
        <MenuItem value="">Sin definir</MenuItem>
        {['WEDDING', 'QUINCEANERA', 'CORPORATE', 'BIRTHDAY', 'OTHER'].map((value) => (
          <MenuItem key={value} value={value}>
            {value}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="datetime-local"
        label="Fecha y hora"
        value={toLocalDate(draft.eventDateTime)}
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(e) => onChange({ eventDateTime: e.target.value ? new Date(e.target.value).toISOString() : null })}
      />
      <TextField
        select
        label="Zona horaria IANA"
        value={draft.timeZone ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ timeZone: e.target.value || null })}
      >
        {zones.map((zone) => (
          <MenuItem key={zone} value={zone}>
            {zone}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="number"
        label="Capacidad"
        value={draft.capacity ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ capacity: e.target.value ? Number(e.target.value) : null })}
      />
      <TextField
        type="url"
        label="Ubicación (HTTPS)"
        value={draft.locationUrl ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ locationUrl: e.target.value || null })}
      />
      <TextField
        type="url"
        label="Mesa de regalos (HTTPS)"
        value={draft.giftRegistryUrl ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ giftRegistryUrl: e.target.value || null })}
      />
    </Stack>
  );
}

function ContactsStep({ apiClient, event, disabled }: { apiClient: ApiClient; event: Event; disabled: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [groups, setGroups] = useState<Awaited<ReturnType<ApiClient['contacts']['groups']>>>([]);
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [preview, setPreview] = useState<Awaited<ReturnType<ApiClient['contacts']['preview']>>>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(
    () =>
      Promise.all([apiClient.contacts.list(event.id, search), apiClient.contacts.groups(event.id)])
        .then(([loadedContacts, loadedGroups]) => {
          setContacts(loadedContacts);
          setGroups(loadedGroups);
        })
        .catch((e) => setError(errorMessage(e))),
    [apiClient, event.id, search]
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const remaining = event.capacity === null ? null : event.capacity - contacts.length;
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Contactos y grupos
      </Typography>
      <Typography color={remaining !== null && remaining < 0 ? 'error' : 'text.secondary'}>
        Contactos: {contacts.length}
        {remaining === null ? '' : ` · Lugares disponibles: ${remaining}`}
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField label="Buscar contacto" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        onSubmit={(e) => {
          e.preventDefault();
          void apiClient.contacts
            .create(event.id, { name, whatsappPhone: phone, groupId: groupId || null })
            .then(() => {
              setName('');
              setPhone('');
              return refresh();
            })
            .catch((x) => setError(errorMessage(x)));
        }}
      >
        <TextField required label="Nombre" value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} />
        <TextField
          required
          label="WhatsApp E.164"
          value={phone}
          disabled={disabled}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextField
          select
          label="Grupo"
          value={groupId}
          disabled={disabled}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <MenuItem value="">Sin grupo</MenuItem>
          {groups.map((group) => (
            <MenuItem key={group.id} value={group.id}>
              {group.name}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" disabled={disabled}>
          Agregar
        </Button>
      </Stack>
      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        onSubmit={(e) => {
          e.preventDefault();
          void apiClient.contacts
            .createGroup(event.id, { name: groupName })
            .then(() => {
              setGroupName('');
              return refresh();
            })
            .catch((x) => setError(errorMessage(x)));
        }}
      >
        <TextField
          label="Nuevo grupo"
          required
          value={groupName}
          disabled={disabled}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <Button type="submit" disabled={disabled}>
          Crear grupo
        </Button>
      </Stack>
      <Typography variant="body2">Grupos: {groups.map((group) => group.name).join(', ') || 'ninguno'}</Typography>
      <Box component="ul" sx={{ m: 0 }}>
        {contacts.map((contact) => (
          <li key={contact.id}>
            {contact.name ?? 'Contacto anonimizado'} · {contact.whatsappPhone ?? 'Sin teléfono'}{' '}
            <Button
              size="small"
              disabled={disabled}
              onClick={() => void apiClient.contacts.remove(event.id, contact.id).then(refresh)}
            >
              Eliminar
            </Button>
            <Button
              size="small"
              disabled={disabled}
              onClick={() => {
                const updatedName = window.prompt('Nombre', contact.name ?? '');
                if (updatedName)
                  void apiClient.contacts.update(event.id, contact.id, { name: updatedName }).then(refresh);
              }}
            >
              Editar
            </Button>
          </li>
        ))}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: 'center' }}>
        <Button onClick={() => void apiClient.contacts.template(event.id).then(downloadBlob)}>
          Descargar plantilla CSV
        </Button>
        <Button component="label" disabled={disabled}>
          Previsualizar CSV
          <input
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void apiClient.contacts
                  .preview(event.id, file)
                  .then(setPreview)
                  .catch((x) => setError(errorMessage(x)));
            }}
          />
        </Button>
      </Stack>
      {preview ? (
        <Alert severity={preview.invalidRows ? 'warning' : 'success'}>
          Filas válidas: {preview.validRows}; inválidas: {preview.invalidRows}.{' '}
          <Button
            disabled={disabled || preview.validRows === 0 || preview.invalidRows > 0}
            onClick={() =>
              void apiClient.contacts
                .commit(event.id, preview.previewId, createOperationKey('csv', event.id))
                .then(() => {
                  setPreview(undefined);
                  return refresh();
                })
                .catch((x) => setError(errorMessage(x)))
            }
          >
            Confirmar importación
          </Button>
        </Alert>
      ) : null}
    </Stack>
  );
}

function InvitationStep({
  apiClient,
  event,
  service,
  disabled
}: {
  apiClient: ApiClient;
  event: Event;
  service: AvailableService | undefined;
  disabled: boolean;
}) {
  const [readiness, setReadiness] = useState<string[]>([]);
  const [invitations, setInvitations] = useState<Awaited<ReturnType<ApiClient['invitations']['list']>>>([]);
  const [design, setDesign] = useState<Awaited<ReturnType<ApiClient['design']['get']>>>();
  const [flyerAssets, setFlyerAssets] = useState<{ initial?: string; qr?: string }>({});
  const [hotspot, setHotspot] = useState({ x: 0.1, y: 0.1, width: 0.2, height: 0.1 });
  const [message, setMessage] = useState<string>();
  const refresh = useCallback(async () => {
    const [loadedInvitations, loadedReadiness] = await Promise.all([
      apiClient.invitations.list(event.id),
      apiClient.design.readiness(event.id)
    ]);
    setInvitations(loadedInvitations);
    setReadiness(loadedReadiness.blockers);
    try {
      setDesign(await apiClient.design.get(event.id));
    } catch {
      setDesign(undefined);
    }
  }, [apiClient, event.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const uploadPage = async (file: File) => {
    const asset = await apiClient.fileAssets.upload(event.id, file, 'FLIPBOOK_PAGE_IMAGE', 'FLIPBOOK_PAGE');
    if (!design) await apiClient.design.createFlipbook(event.id);
    await apiClient.design.addPage(event.id, { fileAssetId: asset.id });
    await refresh();
  };
  const uploadFlyer = async (file: File, kind: 'initial' | 'qr') => {
    const asset = await apiClient.fileAssets.upload(
      event.id,
      file,
      kind === 'initial' ? 'FLYER_INITIAL_IMAGE' : 'FLYER_QR_IMAGE',
      'FLYER'
    );
    if (design?.type === 'FLYER') {
      await (kind === 'initial'
        ? apiClient.design.replaceFlyerInitial(event.id, { assetId: asset.id })
        : apiClient.design.replaceFlyerQr(event.id, { assetId: asset.id }));
      await refresh();
      return;
    }
    const next = { ...flyerAssets, [kind]: asset.id };
    setFlyerAssets(next);
    if (next.initial && next.qr) {
      await apiClient.design.createFlyer(event.id, { initialAssetId: next.initial, qrAssetId: next.qr });
      await refresh();
    }
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Diseño de invitación
      </Typography>
      <Typography color="text.secondary">
        Modalidad: {service?.code ?? 'selecciona un servicio'}. Los archivos se entregan mediante endpoints privados.
      </Typography>
      {service?.code === 'FLYER' ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component="label" disabled={disabled}>
            Subir imagen inicial
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFlyer(file, 'initial').catch((x) => setMessage(errorMessage(x)));
              }}
            />
          </Button>
          <Button component="label" disabled={disabled}>
            Subir imagen QR
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFlyer(file, 'qr').catch((x) => setMessage(errorMessage(x)));
              }}
            />
          </Button>
        </Stack>
      ) : (
        <Button component="label" disabled={disabled}>
          Agregar página
          <input
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPage(file).catch((x) => setMessage(errorMessage(x)));
            }}
          />
        </Button>
      )}
      <Typography component="h3" variant="h4">
        Invitaciones y Asistentes
      </Typography>
      {invitations.length === 0 ? (
        <Typography color="text.secondary">Las invitaciones aparecerán al crear Contactos.</Typography>
      ) : null}
      {invitations.map((invitation) => (
        <Box key={invitation.id} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
            <Typography sx={{ flex: 1 }}>
              {invitation.contactName ?? 'Contacto'} · {invitation.assistants.length} Asistentes
            </Typography>
            <TextField
              select
              size="small"
              label="Modalidad"
              value={invitation.mode}
              disabled={disabled}
              onChange={(e) =>
                void apiClient.invitations
                  .update(event.id, invitation.id, { mode: e.target.value as 'INDIVIDUAL' | 'FAMILY_NOMINAL' })
                  .then(refresh)
              }
            >
              <MenuItem value="INDIVIDUAL">Individual</MenuItem>
              <MenuItem value="FAMILY_NOMINAL">Familiar nominal</MenuItem>
            </TextField>
            <Button
              disabled={disabled}
              onClick={() => {
                const name = window.prompt('Nombre del Asistente');
                if (name) void apiClient.invitations.addAssistant(event.id, invitation.id, { name }).then(refresh);
              }}
            >
              Agregar Asistente
            </Button>
          </Stack>
          {invitation.assistants.map((assistant) => (
            <Stack key={assistant.id} direction="row" sx={{ alignItems: 'center', pl: 2 }}>
              <Typography sx={{ flex: 1 }}>{assistant.name ?? 'Asistente anonimizado'}</Typography>
              <Button
                size="small"
                disabled={disabled || assistant.isPrimary}
                onClick={() => {
                  const name = window.prompt('Nombre', assistant.name ?? '');
                  if (name)
                    void apiClient.invitations
                      .updateAssistant(event.id, invitation.id, assistant.id, { name })
                      .then(refresh);
                }}
              >
                Editar
              </Button>
              <Button
                size="small"
                disabled={disabled || assistant.isPrimary}
                onClick={() =>
                  void apiClient.invitations.removeAssistant(event.id, invitation.id, assistant.id).then(refresh)
                }
              >
                Eliminar
              </Button>
            </Stack>
          ))}
        </Box>
      ))}
      <Typography component="h3" variant="h4">
        Hotspot accesible
      </Typography>
      <FormHelperText>Valores normalizados entre 0 y 1. Esta tabla es alternativa al editor visual.</FormHelperText>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <TextField
            key={field}
            type="number"
            label={field}
            value={hotspot[field]}
            slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01 } }}
            onChange={(e) => setHotspot({ ...hotspot, [field]: Number(e.target.value) })}
          />
        ))}
      </Stack>
      <Button
        disabled={disabled || (service?.code === 'FLIPBOOK' && !design?.pages[0])}
        onClick={() =>
          void apiClient.design
            .createHotspot(event.id, {
              ...normalizeHotspot(hotspot),
              action: 'RSVP',
              priority: 0,
              visualOwnerType: service?.code === 'FLIPBOOK' ? 'FLIPBOOK_PAGE' : 'FLYER',
              ...(service?.code === 'FLIPBOOK' && design?.pages[0] ? { flipbookPageId: design.pages[0].id } : {})
            })
            .then(() => setMessage('Hotspot guardado.'))
            .catch((x) => setMessage(errorMessage(x)))
        }
      >
        Agregar hotspot RSVP
      </Button>
      {readiness.length ? (
        <Alert severity="warning">Pendientes del backend: {readiness.join(', ')}</Alert>
      ) : (
        <Alert severity="success">Diseño listo según el backend.</Alert>
      )}
      {message ? <Alert severity="info">{message}</Alert> : null}
    </Stack>
  );
}

function ConfirmationStep({
  draft,
  disabled,
  onChange
}: {
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
}) {
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Confirmación de asistencia
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.confirmationEnabled}
            disabled={disabled}
            onChange={(e) => onChange({ confirmationEnabled: e.target.checked })}
          />
        }
        label="Permitir confirmaciones"
      />
      <Typography color="text.secondary">
        El cierre y las reglas de capacidad permanecen bajo autoridad del backend.
      </Typography>
    </Stack>
  );
}

function FloorplanStep({
  apiClient,
  event,
  draft,
  disabled,
  onChange
}: {
  apiClient: ApiClient;
  event: Event;
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (p: Partial<UpdateEventInput>) => void;
}) {
  const [message, setMessage] = useState<string>();
  const [floorplan, setFloorplan] = useState<Awaited<ReturnType<ApiClient['floorplan']['get']>>>();
  const refresh = useCallback(
    () =>
      apiClient.floorplan
        .get(event.id)
        .then(setFloorplan)
        .catch(() => setFloorplan(undefined)),
    [apiClient, event.id]
  );
  useEffect(() => {
    if (draft.floorplanEnabled) void refresh();
  }, [draft.floorplanEnabled, refresh]);
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Croquis opcional
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.floorplanEnabled}
            disabled={disabled}
            onChange={(e) => onChange({ floorplanEnabled: e.target.checked })}
          />
        }
        label="Usar croquis"
      />
      {draft.floorplanEnabled ? (
        <>
          <Button component="label" disabled={disabled}>
            Subir croquis
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void apiClient.fileAssets
                    .upload(event.id, f, 'FLOORPLAN_IMAGE', 'FLOORPLAN')
                    .then((asset) =>
                      floorplan
                        ? apiClient.floorplan.replaceImage(event.id, asset.id)
                        : apiClient.floorplan.setImage(event.id, asset.id)
                    )
                    .then((value) => {
                      setFloorplan(value);
                      setMessage('Croquis guardado.');
                    })
                    .catch((x) => setMessage(errorMessage(x)));
              }}
            />
          </Button>
          <Button
            disabled={disabled || floorplan?.locked}
            onClick={() =>
              void apiClient.floorplan
                .addShape(event.id, {
                  name: 'Mesa',
                  kind: 'TABLE',
                  geometry: 'CIRCLE',
                  capacity: 8,
                  x: 0.1,
                  y: 0.1,
                  width: 0.15,
                  height: 0.15,
                  rotation: 0
                })
                .then(() => refresh())
                .catch((x) => setMessage(errorMessage(x)))
            }
          >
            Agregar mesa de 8 lugares
          </Button>
          {floorplan?.shapes.map((shape) => (
            <Stack key={shape.id} direction="row" sx={{ alignItems: 'center' }}>
              <Typography sx={{ flex: 1 }}>
                {shape.name} · {shape.kind} · {shape.occupancy}/{shape.capacity}
              </Typography>
              <Button
                disabled={disabled || floorplan.locked}
                onClick={() => void apiClient.floorplan.removeShape(event.id, shape.id).then(refresh)}
              >
                Eliminar
              </Button>
            </Stack>
          ))}
          {floorplan ? (
            <Button
              disabled={disabled}
              onClick={() =>
                void (
                  floorplan.locked ? apiClient.floorplan.unlock(event.id) : apiClient.floorplan.lock(event.id)
                ).then(setFloorplan)
              }
            >
              {floorplan.locked ? 'Desbloquear croquis' : 'Bloquear croquis'}
            </Button>
          ) : null}
        </>
      ) : null}
      {message ? <Alert severity="info">{message}</Alert> : null}
    </Stack>
  );
}

function PassesStep({ apiClient, event, disabled }: { apiClient: ApiClient; event: Event; disabled: boolean }) {
  const [quantity, setQuantity] = useState(1);
  const [passes, setPasses] = useState<Awaited<ReturnType<ApiClient['physicalPasses']['list']>>>([]);
  const [message, setMessage] = useState<string>();
  const refresh = useCallback(() => apiClient.physicalPasses.list(event.id).then(setPasses), [apiClient, event.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const generate = async () => {
    try {
      await apiClient.physicalPasses.generate(
        event.id,
        { quantity },
        createOperationKey(`passes:${quantity}`, event.id)
      );
      await refresh();
    } catch (error) {
      try {
        await refresh();
        setMessage(
          'Se recuperó el listado después de un resultado de red desconocido. Verifica el lote antes de reintentar.'
        );
      } catch {
        setMessage(errorMessage(error));
      }
    }
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Pases físicos
      </Typography>
      <TextField
        type="number"
        label="Cantidad"
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
      <Button variant="contained" disabled={disabled || quantity < 1} onClick={() => void generate()}>
        Generar lote
      </Button>
      <Typography>{passes.length} pases generados</Typography>
      {passes.map((pass) => (
        <Stack key={pass.id} direction="row" sx={{ alignItems: 'center' }}>
          <Typography sx={{ flex: 1 }}>
            Pase {pass.passNumber} · {pass.status}
          </Typography>
          <Button
            onClick={() =>
              void apiClient.physicalPasses
                .svg(event.id, pass.id)
                .then((svg) => downloadBlob(new Blob([svg], { type: 'image/svg+xml' })))
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

function ReviewStep({
  apiClient,
  event,
  service,
  canSeeFinance,
  onActivated
}: {
  apiClient: ApiClient;
  event: Event;
  service: AvailableService | undefined;
  canSeeFinance: boolean;
  onActivated: (event: Event) => void;
}) {
  const [blockers, setBlockers] = useState<string[]>([]);
  const [balance, setBalance] = useState<number>();
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    void apiClient.design
      .readiness(event.id)
      .then((x) => setBlockers(x.blockers))
      .catch((e) => setBlockers([errorMessage(e)]));
    if (canSeeFinance) void apiClient.finance.balance().then((x) => setBalance(x.purchasedCredits));
  }, [apiClient, canSeeFinance, event.id]);
  const activate = () => {
    const accepted = window.confirm(
      `Al activar este evento se descontarán ${service?.credits ?? 0} créditos de tu saldo. Después podrás enviar invitaciones y generar accesos para staff.`
    );
    if (!accepted) return;
    void apiClient.events
      .activate(event.id, createOperationKey('activate', event.id))
      .then((x) => {
        onActivated(x.event);
        setMessage('Evento activado correctamente.');
      })
      .catch(async (x) => {
        try {
          const current = await apiClient.events.get(event.id);
          onActivated(current);
          setMessage(
            current.status === 'ACTIVE' ? 'La activación fue confirmada al reconciliar el Evento.' : errorMessage(x)
          );
        } catch {
          setMessage(errorMessage(x));
        }
      });
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Revisión y activación
      </Typography>
      <Typography>
        Servicio: {service?.code ?? 'Pendiente'} · Cobro base: {service?.credits ?? '—'} créditos
      </Typography>
      {canSeeFinance ? (
        <Typography>Saldo comprado: {balance ?? 'Cargando…'} créditos</Typography>
      ) : (
        <Typography color="text.secondary">Tu rol no tiene acceso al detalle financiero.</Typography>
      )}
      {blockers.length ? (
        <Alert severity="warning">Pendientes autoritativos: {blockers.join(', ')}</Alert>
      ) : (
        <Alert severity="success">Checklist del backend completo.</Alert>
      )}
      <Button variant="contained" disabled={blockers.length > 0 || event.status === 'ACTIVE'} onClick={activate}>
        Activar Evento
      </Button>
      {message ? <Alert severity="info">{message}</Alert> : null}
    </Stack>
  );
}

function toDraft(event: Event): UpdateEventInput {
  return {
    serviceId: event.serviceId,
    name: event.name,
    socialType: event.socialType,
    eventDateTime: event.eventDateTime,
    timeZone: event.timeZone,
    capacity: event.capacity,
    confirmationEnabled: event.confirmationEnabled,
    locationUrl: event.locationUrl,
    giftRegistryUrl: event.giftRegistryUrl,
    floorplanEnabled: event.floorplanEnabled
  };
}
function supportedTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'UTC'];
  }
}
function toLocalDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function saveLabel(state: SaveState): string {
  return (
    {
      idle: 'Sin cambios pendientes',
      pending: 'Cambios pendientes',
      saving: 'Guardando…',
      saved: 'Cambios guardados',
      error: 'No se pudo guardar; reintenta'
    } as const
  )[state];
}
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known: Record<string, string> = {
      EVENT_NOT_FOUND: 'No encontramos este Evento o ya no tienes acceso.',
      EVENT_NOT_EDITABLE: 'El Evento ya no admite cambios en su estado actual.',
      EVENT_CAPACITY_EXCEEDED: 'La cantidad de invitados supera la capacidad del Evento.',
      SERVICE_NOT_AVAILABLE: 'El servicio seleccionado ya no está disponible.',
      EVENT_ACTIVATION_INSUFFICIENT_CREDITS: 'No hay créditos suficientes para activar el Evento.',
      FINANCE_INSUFFICIENT_CREDITS: 'No hay créditos suficientes para activar el Evento.',
      EVENT_ACTIVATION_NOT_READY: 'El Evento todavía tiene requisitos pendientes.',
      DESIGN_NOT_READY: 'El diseño todavía tiene requisitos pendientes.',
      FILE_ASSET_NOT_READY: 'El archivo aún no está listo para asociarse.',
      IDEMPOTENCY_CONFLICT: 'La llave ya fue usada con datos distintos.'
    };
    return known[error.code] ?? `${error.code}: ${error.message}`;
  }
  return 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.';
}
function normalizeHotspot(value: { x: number; y: number; width: number; height: number }) {
  const clamp = (number: number) => Math.min(1, Math.max(0, number));
  const x = clamp(value.x);
  const y = clamp(value.y);
  return { x, y, width: Math.min(clamp(value.width), 1 - x), height: Math.min(clamp(value.height), 1 - y) };
}
function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'contactos.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
