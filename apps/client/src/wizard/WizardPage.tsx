import type { ApiClient, AvailableService, Event, UpdateEventInput } from '@invitaciones/api-client';
import { ErrorState, LoadingState } from '@invitaciones/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { GuestManagementPanel } from '../guests/GuestManagementPanel';
import { errorMessage } from '../shared/client-utils';
import { useSessionExpiry } from '../shared/use-session-expiry';
import { SerialAutosave } from './autosave/serial-autosave';
import { ConfirmationStep } from './confirmation/ConfirmationStep';
import { DataStep } from './data/DataStep';
import { eventFieldErrors, type EventFieldErrors } from './data/event-field-errors';
import { DesignStep } from './design/DesignStep';
import { FloorplanSeatingStep } from './floorplan/FloorplanSeatingStep';
import { PhysicalPassesStep } from './physical-passes/PhysicalPassesStep';
import { ReviewStep } from './review/ReviewStep';
import { WizardLayout } from './WizardLayout';
import { isEditableEvent, isMeaningfulDraft, stepsForService, type SaveState, type WizardStep } from './wizard-model';

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

const pendingDateMessage = 'Completa la fecha y la hora, o quítalas para continuar.';

// Mounted only while Datos has a partial date, so other steps retain their own router blockers.
function PendingDateGuard({ onBlocked }: { onBlocked: () => void }) {
  const blocker = useBlocker(true);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      blocker.reset();
      onBlocked();
    }
  }, [blocker, onBlocked]);
  return null;
}

export const applyDraftPatch = (draft: UpdateEventInput, patch: Partial<UpdateEventInput>): UpdateEventInput => ({
  ...draft,
  ...patch
});

export function WizardPage({ apiClient }: { apiClient: ApiClient }) {
  const { eventId, step = 'datos' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [services, setServices] = useState<AvailableService[]>();
  const [event, setEvent] = useState<Event>();
  const [draft, setDraft] = useState<UpdateEventInput>(emptyDraft);
  const [confirmedDraft, setConfirmedDraft] = useState<UpdateEventInput>();
  const draftRef = useRef<UpdateEventInput>(emptyDraft);
  const [loadError, setLoadError] = useState<unknown>();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<EventFieldErrors>({});
  const [creating, setCreating] = useState(false);
  const [pendingDate, setPendingDate] = useState(false);
  const pendingDateRef = useRef(false);
  const changePendingDate = useCallback((pending: boolean) => {
    pendingDateRef.current = pending;
    setPendingDate(pending);
    if (!pending) {
      setFieldErrors((current) => {
        if (current.eventDateTime !== pendingDateMessage) return current;
        const next = { ...current };
        delete next.eventDateTime;
        return next;
      });
      setMessage((current) => (current === pendingDateMessage ? undefined : current));
    }
  }, []);
  const showPendingDate = useCallback(() => {
    setFieldErrors((current) => ({ ...current, eventDateTime: pendingDateMessage }));
    setMessage(pendingDateMessage);
  }, []);
  const eventRef = useRef<Event | undefined>(undefined);
  eventRef.current = event;
  const createPromiseRef = useRef<Promise<Event | undefined> | undefined>(undefined);
  useSessionExpiry(loadError, eventId ? `/eventos/${eventId}/configuracion/${step}` : '/eventos/nuevo');
  const save = useCallback(
    async (value: UpdateEventInput) => {
      if (!eventRef.current) return;
      try {
        const updated = await apiClient.events.update(eventRef.current.id, value);
        eventRef.current = updated;
        setEvent(updated);
        setConfirmedDraft(value);
        setFieldErrors({});
        setMessage(undefined);
      } catch (reason) {
        setFieldErrors(eventFieldErrors(reason));
        setMessage(errorMessage(reason));
        throw reason;
      }
    },
    [apiClient]
  );
  const autosaveRef = useRef<SerialAutosave<UpdateEventInput> | null>(null);
  useEffect(() => {
    const autosave = new SerialAutosave(save, setSaveState);
    autosaveRef.current = autosave;
    return () => {
      autosave.dispose();
      if (autosaveRef.current === autosave) autosaveRef.current = null;
    };
  }, [save]);
  useEffect(() => {
    const warn = (browserEvent: BeforeUnloadEvent) => {
      if (pendingDateRef.current || autosaveRef.current?.hasPending()) browserEvent.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
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
          const loadedDraft = toDraft(loaded);
          setConfirmedDraft(loadedDraft);
          draftRef.current = loadedDraft;
          setDraft(loadedDraft);
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
    setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !(field in patch))));
    setMessage(undefined);
    const next = applyDraftPatch(draftRef.current, patch);
    draftRef.current = next;
    setDraft(next);
    if (eventRef.current && isEditableEvent(eventRef.current.status)) autosaveRef.current?.schedule(next);
  };
  const resetInvitationDesignAndChangeService = async (serviceId: string): Promise<void> => {
    const current = eventRef.current;
    if (!current) {
      changeDraft({ serviceId });
      return;
    }
    if (!(await autosaveRef.current?.flush())) throw new Error('Pending Event changes could not be saved.');
    setSaveState('saving');
    try {
      const request: UpdateEventInput & { resetInvitationDesign: true } = {
        ...draftRef.current,
        serviceId,
        resetInvitationDesign: true
      };
      const updated = await apiClient.events.update(current.id, request);
      const next = toDraft(updated);
      eventRef.current = updated;
      draftRef.current = next;
      setEvent(updated);
      setDraft(next);
      setConfirmedDraft(next);
      setSaveState('saved');
    } catch (reason) {
      setSaveState('error');
      throw reason;
    }
  };
  const ensureEvent = async (): Promise<Event | undefined> => {
    if (pendingDateRef.current) {
      showPendingDate();
      return;
    }
    if (eventRef.current) {
      if (!(await autosaveRef.current?.flush())) {
        return;
      }
      return eventRef.current;
    }
    if (createPromiseRef.current) return createPromiseRef.current;
    const currentDraft = draftRef.current;
    if (!isMeaningfulDraft(currentDraft)) {
      setMessage('Captura al menos el servicio o un dato principal antes de guardar.');
      return;
    }
    setCreating(true);
    setMessage(undefined);
    setFieldErrors({});
    setSaveState('saving');
    const promise = apiClient.events
      .create(currentDraft)
      .then((created) => {
        setEvent(created);
        const createdDraft = toDraft(created);
        setConfirmedDraft(createdDraft);
        draftRef.current = createdDraft;
        setDraft(createdDraft);
        setSaveState('saved');
        return created;
      })
      .catch((reason) => {
        setSaveState('error');
        setFieldErrors(eventFieldErrors(reason));
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
    const reloadedDraft = toDraft(next);
    setConfirmedDraft(reloadedDraft);
    draftRef.current = reloadedDraft;
    setDraft(reloadedDraft);
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
      saveState={pendingDate && (saveState === 'idle' || saveState === 'saved') ? 'pending' : saveState}
      message={message}
      busy={creating}
      onDismissMessage={() => setMessage(undefined)}
      onGo={(target) => void go(target)}
      onExit={() => void ensureEvent().then((saved) => saved && navigate('/eventos'))}
    >
      {pendingDate && selectedStep === 'datos' ? <PendingDateGuard onBlocked={showPendingDate} /> : null}
      {selectedStep === 'datos' ? (
        <DataStep
          key={eventId ?? 'new'}
          services={services ?? []}
          draft={draft}
          disabled={!editable || creating}
          onChange={changeDraft}
          apiClient={apiClient}
          event={event}
          confirmedDraft={confirmedDraft}
          fieldErrors={fieldErrors}
          saveState={saveState}
          onPendingDateChange={changePendingDate}
          onResetInvitationDesign={resetInvitationDesignAndChangeService}
        />
      ) : null}
      {selectedStep === 'contactos' && event ? (
        <GuestManagementPanel apiClient={apiClient} event={event} readOnly={!editable} />
      ) : null}
      {selectedStep === 'invitacion' && event ? (
        <DesignStep apiClient={apiClient} event={event} service={service} disabled={!editable} />
      ) : null}
      {selectedStep === 'confirmacion' ? (
        <ConfirmationStep draft={draft} disabled={!editable} onChange={changeDraft} />
      ) : null}
      {selectedStep === 'croquis' && event ? <FloorplanSeatingStep apiClient={apiClient} event={event} /> : null}
      {selectedStep === 'pases' && event ? (
        <PhysicalPassesStep apiClient={apiClient} event={event} disabled={!editable} />
      ) : null}
      {selectedStep === 'revision' && event ? (
        <ReviewStep
          apiClient={apiClient}
          event={event}
          service={service}
          user={user}
          onEventReload={onReload}
          onGo={(target) => void go(target)}
        />
      ) : null}
    </WizardLayout>
  );
}
