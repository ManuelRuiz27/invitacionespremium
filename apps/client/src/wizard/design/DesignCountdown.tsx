import { useEffect, useMemo, useState } from 'react';
import type { ApiClient, Countdown, Event, InvitationDesign, SaveCountdownInput } from '@invitaciones/api-client';
import { CountdownEditor, defaultCountdownStyle, useCountdownSeconds } from '@invitaciones/ui';
import { Alert, Button, Stack } from '@mui/material';
import { errorMessage } from '../../shared/client-utils';

export function DesignCountdown({
  apiClient,
  event,
  design,
  disabled,
  onSaved
}: {
  apiClient: ApiClient;
  event: Event;
  design: InvitationDesign;
  disabled: boolean;
  onSaved: (countdown: Countdown | null) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sources = useMemo(
    () =>
      design.type === 'FLYER'
        ? [{ id: 'flyer', label: 'Flyer', assetId: design.flyerInitialAssetId }]
        : design.pages.map((page) => ({ id: page.id, label: `Página ${page.position}`, assetId: page.fileAssetId })),
    [design.type, design.flyerInitialAssetId, design.pages]
  );
  const seconds = useCountdownSeconds(event.eventDateTime);
  useEffect(() => {
    const controller = new AbortController();
    const allocated: string[] = [];
    setUrls({});
    setLoadError(false);
    void Promise.all(
      sources.map(async (source) => {
        if (!source.assetId) return;
        try {
          const blob = await apiClient.fileAssets.content(event.id, source.assetId, controller.signal);
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          allocated.push(url);
          setUrls((current) => ({ ...current, [source.id]: url }));
        } catch {
          if (!controller.signal.aborted) setLoadError(true);
        }
      })
    );
    return () => {
      controller.abort();
      allocated.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [apiClient, event.id, sources, attempt]);
  const initialValue: SaveCountdownInput = {
    ...defaultCountdownStyle,
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.3,
    visualOwnerType: design.type === 'FLYER' ? 'FLYER' : 'FLIPBOOK_PAGE',
    flipbookPageId: design.type === 'FLIPBOOK' ? (design.pages[0]?.id ?? null) : null,
    revision: 0
  };
  const images = sources.map((source) => ({
    id: source.id,
    label: source.label,
    ...(urls[source.id] ? { url: urls[source.id] } : {}),
    guides: design.hotspots.filter((hotspot) =>
      source.id === 'flyer' ? hotspot.visualOwnerType === 'FLYER' : hotspot.flipbookPageId === source.id
    )
  }));
  const eventLabel =
    event.eventDateTime && event.timeZone
      ? `${new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: event.timeZone }).format(new Date(event.eventDateTime))} · ${event.timeZone.replaceAll('_', ' ')}`
      : 'Define el inicio y la zona horaria del evento en Datos.';
  return (
    <Stack spacing={1}>
      {loadError ? (
        <Alert
          severity="warning"
          action={<Button onClick={() => setAttempt((current) => current + 1)}>Reintentar</Button>}
        >
          No pudimos cargar todas las imágenes de la cuenta regresiva.
        </Alert>
      ) : null}
      <CountdownEditor<SaveCountdownInput>
        value={design.countdown ?? null}
        initialValue={initialValue}
        images={images}
        seconds={seconds}
        eventLabel={eventLabel}
        disabled={disabled}
        onSave={async (draft) => {
          const { id, ...input } = draft as SaveCountdownInput & { id?: string };
          void id;
          try {
            onSaved(await apiClient.design.saveCountdown(event.id, input));
          } catch (error) {
            throw new Error(countdownError(error), { cause: error });
          }
        }}
        onRemove={async (value) => {
          try {
            await apiClient.design.removeCountdown(event.id, value.revision);
            onSaved(null);
          } catch (error) {
            throw new Error(countdownError(error), { cause: error });
          }
        }}
      />
    </Stack>
  );
}

function countdownError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'COUNTDOWN_REVISION_CONFLICT')
    return 'La cuenta regresiva cambió en otra sesión. Actualiza el diseño antes de volver a guardar.';
  return errorMessage(error);
}
