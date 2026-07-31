import type { ApiClient, AvailableService, Event, UpdateEventInput } from '@invitaciones/api-client';
import { ErrorState, LoadingState } from '@invitaciones/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useSessionExpiry } from '../shared/use-session-expiry';
import { SerialAutosave } from './autosave/serial-autosave';
import { ConfirmationStep } from './confirmation/ConfirmationStep';
import { ContactsStep } from './contacts/ContactsStep';
import { DataStep } from './data/DataStep';
import { DesignStep } from './design/DesignStep';
import { FloorplanStep } from './floorplan/FloorplanStep';
import { PhysicalPassesStep } from './physical-passes/PhysicalPassesStep';
import { ReviewStep } from './review/ReviewStep';
import { WizardLayout } from './WizardLayout';
import { isEditableEvent, isMeaningfulDraft, stepsForService, type SaveState, type WizardStep } from './wizard-model';
import { errorMessage } from './wizard-utils';

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
const toDraft = (event: Event): UpdateEventInput => ({
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
});

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
  const [creating, setCreating] = useState(false);
  const eventRef = useRef<Event | undefined>(undefined);
  eventRef.current = event;
  const createPromiseRef = useRef<Promise<Event | undefined> | undefined>(undefined);
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
      if (autosave.hasPending()) browserEvent.preventDefault();
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
        setServices(available.filter((item) => item.code !== 'DEMO'));
        if (loaded) {
          setEvent(loaded);
          setDraft(toDraft(loaded));
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setLoadError(reason);
      });
    return () => controller.abort();
  }, [apiClient, eventId]);
  const service = services?.find((item) => item.id === draft.serviceId);
  const steps = stepsForService(service?.code);
  const selectedStep: WizardStep = steps.includes(step as WizardStep) ? (step as WizardStep) : steps[0]!;
  const editable = !event || isEditableEvent(event.status);
  useEffect(() => {
    if (event && step !== selectedStep)
      navigate(`/eventos/${event.id}/configuracion/${selectedStep}`, { replace: true });
  }, [event, navigate, selectedStep, step]);
  const changeDraft = (patch: Partial<UpdateEventInput>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (event && editable) autosave.schedule(next);
  };
  const ensureEvent = async (): Promise<Event | undefined> => {
    if (eventRef.current) {
      if (!(await autosave.flush())) {
        setMessage('No pudimos guardar los cambios. Reintenta antes de salir.');
        return;
      }
      return eventRef.current;
    }
    if (createPromiseRef.current) return createPromiseRef.current;
    if (!isMeaningfulDraft(draft)) {
      setMessage('Captura al menos el servicio o un dato principal antes de guardar.');
      return;
    }
    setCreating(true);
    setSaveState('saving');
    const promise = apiClient.events
      .create(draft)
      .then((created) => {
        setEvent(created);
        setDraft(toDraft(created));
        setSaveState('saved');
        return created;
      })
      .catch((reason) => {
        setSaveState('error');
        setMessage(errorMessage(reason));
        return undefined;
      })
      .finally(() => {
        createPromiseRef.current = undefined;
        setCreating(false);
      });
    createPromiseRef.current = promise;
    return promise;
  };
  const go = async (target: WizardStep) => {
    const current = await ensureEvent();
    if (current) navigate(`/eventos/${current.id}/configuracion/${target}`);
  };
  const onReload = useCallback((next: Event) => {
    setEvent(next);
    setDraft(toDraft(next));
  }, []);
  if (!services && !loadError) return <LoadingState label="Cargando configuración del Evento…" />;
  if (loadError) return <ErrorState title="No pudimos cargar el Evento." message={errorMessage(loadError)} />;
  if (!user) return null;
  return (
    <WizardLayout
      event={event}
      steps={steps}
      selectedStep={selectedStep}
      editable={editable}
      saveState={saveState}
      message={message}
      busy={creating}
      onDismissMessage={() => setMessage(undefined)}
      onGo={(target) => void go(target)}
      onExit={() => void ensureEvent().then((saved) => saved && navigate('/eventos'))}
    >
      {selectedStep === 'datos' ? (
        <DataStep services={services ?? []} draft={draft} disabled={!editable || creating} onChange={changeDraft} />
      ) : null}
      {selectedStep === 'contactos' && event ? (
        <ContactsStep apiClient={apiClient} event={event} disabled={!editable} />
      ) : null}
      {selectedStep === 'invitacion' && event ? (
        <DesignStep apiClient={apiClient} event={event} service={service} disabled={!editable} />
      ) : null}
      {selectedStep === 'confirmacion' ? (
        <ConfirmationStep draft={draft} disabled={!editable} onChange={changeDraft} />
      ) : null}
      {selectedStep === 'croquis' && event ? (
        <FloorplanStep apiClient={apiClient} event={event} draft={draft} disabled={!editable} onChange={changeDraft} />
      ) : null}
      {selectedStep === 'pases' && event ? (
        <PhysicalPassesStep apiClient={apiClient} event={event} disabled={!editable} />
      ) : null}
      {selectedStep === 'revision' && event ? (
        <ReviewStep apiClient={apiClient} event={event} service={service} user={user} onEventReload={onReload} />
      ) : null}
    </WizardLayout>
  );
}
