import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, PublicInvitationView, PublicRsvpAssistantInput } from '@invitaciones/api-client';
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { PublicLayout } from '../PublicLayout';
import { isUncertainNetworkResult, publicErrorMessage } from '../errors/public-error-message';
import { albumTokenFromContentPath } from '../routing/public-content-path';
import { InvitationRenderer } from './InvitationRenderer';
import { invitationStatusLabel, nominalIntentMatches } from './invitation-state';
import { PublicQrDialog } from './PublicQrDialog';
import { RsvpDialog } from './RsvpDialog';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; operationId?: string }
  | { kind: 'ready'; view: PublicInvitationView };

export function PublicInvitationPage({ apiClient }: { apiClient: ApiClient }) {
  const { invitationToken = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string>();

  const load = useCallback(
    async (signal?: AbortSignal) => apiClient.publicInvitation.resolve(invitationToken, signal),
    [apiClient, invitationToken]
  );
  const reload = useCallback(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void load(controller.signal).then(
      (view) => setState({ kind: 'ready', view }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const display = publicErrorMessage(error, 'Esta invitación no está disponible.');
        setState({ kind: 'error', ...display });
      }
    );
    return controller;
  }, [load]);

  useEffect(() => {
    setRsvpOpen(false);
    setQrOpen(false);
    setNotice(null);
    const controller = reload();
    return () => controller.abort();
  }, [invitationToken, reload]);

  const mutate = async (intent: 'CONFIRMED' | 'REJECTED', assistants: PublicRsvpAssistantInput[] = []) => {
    if (state.kind !== 'ready') return;
    setBusy(true);
    setRsvpError(undefined);
    try {
      if (intent === 'REJECTED') await apiClient.publicInvitation.reject(invitationToken);
      else if (state.view.invitation?.responseStatus === 'CONFIRMED')
        await apiClient.publicInvitation.updateAssistants(invitationToken, assistants);
      else await apiClient.publicInvitation.confirm(invitationToken, assistants);
      const view = await load();
      setState({ kind: 'ready', view });
      setRsvpOpen(false);
      setNotice(intent === 'CONFIRMED' ? 'Tu confirmación quedó guardada.' : 'Registramos que no asistirás.');
    } catch (error) {
      if (isUncertainNetworkResult(error)) {
        try {
          const view = await load();
          setState({ kind: 'ready', view });
          if (nominalIntentMatches(view, intent, assistants)) {
            setRsvpOpen(false);
            setNotice(intent === 'CONFIRMED' ? 'Tu confirmación quedó guardada.' : 'Registramos que no asistirás.');
            return;
          }
        } catch {
          // The original intention remains retryable; no local nominal state is committed.
        }
      }
      setRsvpError(
        publicErrorMessage(error, 'No pudimos confirmar el resultado. Revisa tu conexión e inténtalo nuevamente.')
          .message
      );
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'loading') return <InvitationLoading />;
  if (state.kind === 'error') {
    return (
      <PublicLayout>
        <Stack spacing={3} sx={{ minHeight: '75svh', justifyContent: 'center', maxWidth: 600 }}>
          <Typography component="h1" variant="h1">
            Esta invitación no está disponible.
          </Typography>
          <Alert severity="info">{state.message}</Alert>
          {state.operationId ? <Typography variant="caption">Referencia: {state.operationId}</Typography> : null}
          <Button variant="outlined" onClick={() => reload()}>
            Reintentar
          </Button>
        </Stack>
      </PublicLayout>
    );
  }
  const view = state.view;
  if (view.status === 'CANCELLED') {
    return (
      <PublicLayout>
        <Stack sx={{ minHeight: '75svh', justifyContent: 'center', maxWidth: 680 }} spacing={2}>
          <Typography component="h1" variant="h1">
            Invitación cancelada
          </Typography>
          <Typography variant="h4">{view.message}</Typography>
        </Stack>
      </PublicLayout>
    );
  }
  if (view.status === 'CLOSED') return <ClosedInvitation view={view} />;
  const response = view.invitation?.responseStatus ?? 'PENDING';
  const albumToken =
    view.album?.state === 'AVAILABLE' && view.album.contentPath
      ? albumTokenFromContentPath(view.album.contentPath)
      : null;
  return (
    <PublicLayout>
      <Stack spacing={{ xs: 3, md: 5 }}>
        <Box component="header" sx={{ display: 'grid', gap: 1, maxWidth: 760 }}>
          <Typography component="h1" variant="h1" sx={{ fontFamily: 'Georgia, serif' }}>
            {view.event?.name}
          </Typography>
          {view.event ? (
            <Typography color="text.secondary">
              {formatEventDate(view.event.eventDateTime, view.event.timeZone)}
            </Typography>
          ) : null}
          <Chip
            label={invitationStatusLabel[response]}
            color={response === 'CONFIRMED' ? 'success' : 'default'}
            sx={{ width: 'fit-content' }}
          />
        </Box>
        {notice ? (
          <Alert severity="success" aria-live="polite">
            {notice}
          </Alert>
        ) : null}
        <InvitationRenderer
          apiClient={apiClient}
          token={invitationToken}
          view={view}
          onRsvp={() => setRsvpOpen(true)}
          onQr={() => setQrOpen(true)}
          onUnavailableQr={() =>
            setNotice(
              view.confirmation?.open ? 'Confirma tu asistencia para ver tu QR.' : 'El QR ya no está disponible.'
            )
          }
        />
        <Stack
          component="section"
          aria-labelledby="confirmation-title"
          spacing={2}
          sx={{ py: 3, borderTop: '1px solid', borderColor: 'divider' }}
        >
          <Typography id="confirmation-title" component="h2" variant="h2">
            Tu asistencia
          </Typography>
          {!view.confirmation?.open ? (
            <Alert severity="info">La confirmación de asistencia ya fue cerrada. Contacta al organizador.</Alert>
          ) : null}
          {view.confirmation?.open ? (
            <Button variant="contained" onClick={() => setRsvpOpen(true)} sx={{ width: 'fit-content' }}>
              {response === 'CONFIRMED' ? 'Modificar acompañantes' : 'Confirmar asistencia'}
            </Button>
          ) : null}
          {view.qr?.available ? (
            <Button variant="outlined" onClick={() => setQrOpen(true)} sx={{ width: 'fit-content' }}>
              Ver mi QR
            </Button>
          ) : null}
          {albumToken ? (
            <Button component={Link} to={`/album/${encodeURIComponent(albumToken)}`} sx={{ width: 'fit-content' }}>
              Abrir álbum
            </Button>
          ) : null}
          {view.album?.state === 'RESTRICTED' ? <Typography>Álbum disponible solo para asistentes</Typography> : null}
        </Stack>
      </Stack>
      <RsvpDialog
        open={rsvpOpen}
        view={view}
        busy={busy}
        {...(rsvpError ? { error: rsvpError } : {})}
        onClose={() => setRsvpOpen(false)}
        onConfirm={(value) => void mutate('CONFIRMED', value)}
        onReject={() => void mutate('REJECTED')}
      />
      {qrOpen && view.qr?.available ? (
        <PublicQrDialog apiClient={apiClient} token={invitationToken} onClose={() => setQrOpen(false)} />
      ) : null}
    </PublicLayout>
  );
}

function ClosedInvitation({ view }: { view: PublicInvitationView }) {
  const token =
    view.album?.state === 'AVAILABLE' && view.album.contentPath
      ? albumTokenFromContentPath(view.album.contentPath)
      : null;
  return (
    <PublicLayout tone="dark">
      <Stack spacing={3} sx={{ minHeight: '75svh', justifyContent: 'center', maxWidth: 720 }}>
        <Typography component="h1" variant="h1" sx={{ fontFamily: 'Georgia, serif' }}>
          Este evento ha finalizado.
        </Typography>
        {token ? (
          <Button
            component={Link}
            to={`/album/${encodeURIComponent(token)}`}
            variant="contained"
            sx={{ width: 'fit-content' }}
          >
            Ver álbum del evento
          </Button>
        ) : null}
        {view.album?.state === 'RESTRICTED' ? <Typography>Álbum disponible solo para asistentes</Typography> : null}
      </Stack>
    </PublicLayout>
  );
}

function InvitationLoading() {
  return (
    <PublicLayout>
      <Stack role="status" aria-label="Cargando invitación" spacing={3}>
        <Skeleton variant="text" width="60%" height={72} />
        <Skeleton variant="rounded" sx={{ width: '100%', aspectRatio: '4 / 5', maxHeight: '70svh' }} />
      </Stack>
    </PublicLayout>
  );
}

function formatEventDate(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone }).format(
      new Date(value)
    );
  } catch {
    return '';
  }
}
