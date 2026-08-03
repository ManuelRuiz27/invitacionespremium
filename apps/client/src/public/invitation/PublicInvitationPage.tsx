import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type ApiClient,
  type PublicInvitationView,
  type PublicRsvpAssistantInput
} from '@invitaciones/api-client';
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { PublicLayout } from '../PublicLayout';
import { isUncertainNetworkResult, publicErrorMessage } from '../errors/public-error-message';
import { isAbortError, usePublicOperationScope } from '../operations/usePublicOperationScope';
import { albumTokenFromContentPath } from '../routing/public-content-path';
import { InvitationRenderer } from './InvitationRenderer';
import { invitationStatusLabel, nominalIntentMatches } from './invitation-state';
import { PublicQrDialog } from './PublicQrDialog';
import { RsvpDialog } from './RsvpDialog';

type LoadState =
  | { kind: 'loading'; token: string }
  | { kind: 'error'; token: string; message: string; operationId?: string }
  | { kind: 'ready'; token: string; view: PublicInvitationView };

export function PublicInvitationPage({ apiClient }: { apiClient: ApiClient }) {
  const { invitationToken = '' } = useParams();
  return <PublicInvitationTokenPage key={invitationToken} apiClient={apiClient} invitationToken={invitationToken} />;
}

function PublicInvitationTokenPage({ apiClient, invitationToken }: { apiClient: ApiClient; invitationToken: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading', token: invitationToken });
  const [rsvpOpen, setRsvpOpen] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'info' } | null>(null);
  const [rsvpError, setRsvpError] = useState<string>();
  const scope = usePublicOperationScope(invitationToken);
  const mutationSignalRef = useRef<AbortSignal | null>(null);

  const reload = useCallback(
    (showLoading = true) => {
      const operation = scope.begin('resolve');
      if (showLoading) setState({ kind: 'loading', token: invitationToken });
      void apiClient.publicInvitation
        .resolve(invitationToken, operation.signal)
        .then(
          (view) => {
            if (operation.isCurrent()) setState({ kind: 'ready', token: invitationToken, view });
          },
          (error: unknown) => {
            if (!operation.isCurrent() || isAbortError(error)) return;
            const display = publicErrorMessage(error, 'Esta invitación no está disponible.');
            setState({ kind: 'error', token: invitationToken, ...display });
          }
        )
        .finally(operation.finish);
    },
    [apiClient, invitationToken, scope]
  );

  useEffect(() => {
    setRsvpOpen(null);
    setQrOpen(null);
    setNotice(null);
    setRsvpError(undefined);
    setBusy(false);
    mutationSignalRef.current = null;
    reload();
    return scope.abortAll;
  }, [invitationToken, reload, scope]);

  const mutate = async (intent: 'CONFIRMED' | 'REJECTED', assistants: PublicRsvpAssistantInput[] = []) => {
    if (state.kind !== 'ready' || mutationSignalRef.current) return;
    const action =
      intent === 'REJECTED'
        ? 'reject'
        : state.view.invitation?.responseStatus === 'CONFIRMED'
          ? 'updateAssistants'
          : 'confirm';
    const operation = scope.begin(`mutation:${action}`);
    mutationSignalRef.current = operation.signal;
    setBusy(true);
    setRsvpError(undefined);
    try {
      if (intent === 'REJECTED') await apiClient.publicInvitation.reject(invitationToken, operation.signal);
      else if (state.view.invitation?.responseStatus === 'CONFIRMED')
        await apiClient.publicInvitation.updateAssistants(invitationToken, assistants, operation.signal);
      else await apiClient.publicInvitation.confirm(invitationToken, assistants, operation.signal);
      if (!operation.isCurrent()) return;
      const view = await apiClient.publicInvitation.resolve(invitationToken, operation.signal);
      if (!operation.isCurrent()) return;
      setState({ kind: 'ready', token: invitationToken, view });
      setRsvpOpen(null);
      setNotice({
        severity: 'success',
        message: intent === 'CONFIRMED' ? 'Tu confirmación quedó guardada.' : 'Registramos que no asistirás.'
      });
    } catch (error) {
      if (!operation.isCurrent() || isAbortError(error)) return;
      if (invalidatesProjection(error)) {
        try {
          const view = await apiClient.publicInvitation.resolve(invitationToken, operation.signal);
          if (!operation.isCurrent()) return;
          setState({ kind: 'ready', token: invitationToken, view });
          setRsvpOpen(null);
          if (view.status !== 'AVAILABLE') setQrOpen(null);
          return;
        } catch (reloadError) {
          if (!operation.isCurrent() || isAbortError(reloadError)) return;
          if (reloadError instanceof ApiError && reloadError.status === 404) {
            setState({
              kind: 'error',
              token: invitationToken,
              message: 'Esta invitación no está disponible.',
              ...(reloadError.operationId ? { operationId: reloadError.operationId } : {})
            });
            setRsvpOpen(null);
            setQrOpen(null);
            return;
          }
        }
      } else if (isUncertainNetworkResult(error)) {
        try {
          const view = await apiClient.publicInvitation.resolve(invitationToken, operation.signal);
          if (!operation.isCurrent()) return;
          setState({ kind: 'ready', token: invitationToken, view });
          if (nominalIntentMatches(view, intent, assistants)) {
            setRsvpOpen(null);
            setNotice({
              severity: 'success',
              message: intent === 'CONFIRMED' ? 'Tu confirmación quedó guardada.' : 'Registramos que no asistirás.'
            });
            return;
          }
        } catch (reloadError) {
          if (!operation.isCurrent() || isAbortError(reloadError)) return;
          // The original intention remains retryable; no local nominal state is committed.
        }
      }
      if (!operation.isCurrent()) return;
      setRsvpError(
        publicErrorMessage(error, 'No pudimos confirmar el resultado. Revisa tu conexión e inténtalo nuevamente.')
          .message
      );
    } finally {
      if (mutationSignalRef.current === operation.signal) mutationSignalRef.current = null;
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  };

  if (state.token !== invitationToken || state.kind === 'loading') return <InvitationLoading />;
  if (state.kind === 'error') {
    return (
      <PublicLayout>
        <Stack spacing={3} sx={{ minHeight: '75svh', justifyContent: 'center', maxWidth: 600 }}>
          <Typography component="h1" variant="h1">
            Esta invitación no está disponible.
          </Typography>
          <Alert severity="info">{state.message}</Alert>
          {state.operationId ? <Typography variant="caption">Referencia: {state.operationId}</Typography> : null}
          <Button variant="outlined" onClick={() => reload(false)}>
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
            {view.message}
          </Typography>
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
          <Alert severity={notice.severity} aria-live="polite">
            {notice.message}
          </Alert>
        ) : null}
        <InvitationRenderer
          apiClient={apiClient}
          token={invitationToken}
          view={view}
          onRsvp={() => {
            if (view.confirmation?.open) setRsvpOpen(invitationToken);
            else
              setNotice({
                severity: 'info',
                message: 'La confirmación de asistencia ya fue cerrada. Contacta al organizador.'
              });
          }}
          onQr={() => setQrOpen(invitationToken)}
          onUnavailableQr={() =>
            setNotice({
              severity: 'info',
              message: view.confirmation?.open
                ? 'Confirma tu asistencia para ver tu QR.'
                : 'El QR ya no está disponible.'
            })
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
            <Button variant="contained" onClick={() => setRsvpOpen(invitationToken)} sx={{ width: 'fit-content' }}>
              {response === 'CONFIRMED' ? 'Modificar acompañantes' : 'Confirmar asistencia'}
            </Button>
          ) : null}
          {view.qr?.available ? (
            <Button variant="outlined" onClick={() => setQrOpen(invitationToken)} sx={{ width: 'fit-content' }}>
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
        open={rsvpOpen === invitationToken}
        view={view}
        busy={busy}
        {...(rsvpError ? { error: rsvpError } : {})}
        onClose={() => {
          setRsvpOpen(null);
          setRsvpError(undefined);
        }}
        onFormChange={() => setRsvpError(undefined)}
        onConfirm={(value) => void mutate('CONFIRMED', value)}
        onReject={() => void mutate('REJECTED')}
      />
      {qrOpen === invitationToken && view.qr?.available ? (
        <PublicQrDialog apiClient={apiClient} token={invitationToken} onClose={() => setQrOpen(null)} />
      ) : null}
    </PublicLayout>
  );
}

const projectionInvalidatingCodes = new Set([
  'INVITATION_NOT_FOUND',
  'RSVP_NOT_AVAILABLE',
  'RSVP_CLOSED',
  'RSVP_INVITATION_CANCELLED',
  'RSVP_EVENT_CANCELLED',
  'RSVP_EVENT_STATE_INVALID'
]);

function invalidatesProjection(error: unknown): boolean {
  return error instanceof ApiError && projectionInvalidatingCodes.has(error.code);
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
