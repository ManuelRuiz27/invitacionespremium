import { ApiError, type ApiClient, type CreatedStaffToken, type Event } from '@invitaciones/api-client';
import { ErrorState, LoadingState, StatusChip } from '@invitaciones/ui';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSessionExpiry } from '../shared/use-session-expiry';

const ACTIVE_LIMIT = 3;

export function StaffAccessPanel({
  apiClient,
  event,
  scannerAppUrl
}: {
  apiClient: ApiClient;
  event: Event;
  scannerAppUrl: string;
}) {
  const [alias, setAlias] = useState('');
  const [createdAccess, setCreatedAccess] = useState<CreatedStaffToken>();
  const [notice, setNotice] = useState<{ severity: 'success' | 'warning' | 'error'; message: string }>();
  const operational = event.status === 'ACTIVE' || event.status === 'EVENT_DAY';
  const returnTo = `/eventos/${event.id}?seccion=staff`;

  const tokensQuery = useQuery({
    queryKey: ['events', event.id, 'staff-tokens'],
    queryFn: ({ signal }) => apiClient.staffTokens.list(event.id, signal),
    enabled: operational,
    staleTime: 0
  });

  const createMutation = useMutation({
    mutationFn: (nextAlias: string) => apiClient.staffTokens.create(event.id, { alias: nextAlias }),
    retry: false,
    onSuccess: async (created) => {
      setCreatedAccess(created);
      setAlias('');
      setNotice({
        severity: 'success',
        message: 'Acceso Staff creado. Guarda o comparte el enlace ahora; el secreto no volverá a mostrarse.'
      });
      const refreshed = await tokensQuery.refetch();
      if (refreshed.isError) {
        setNotice({
          severity: 'warning',
          message:
            'El acceso fue creado, pero no pudimos actualizar la lista. El enlace recién generado sigue disponible abajo.'
        });
      }
    },
    onError: async (cause) => {
      setCreatedAccess(undefined);
      await tokensQuery.refetch();
      setNotice(staffCreationError(cause));
    }
  });

  useSessionExpiry(tokensQuery.error ?? createMutation.error, returnTo);

  const activeCount = useMemo(
    () => (tokensQuery.data ?? []).filter((staffToken) => staffToken.state === 'ACTIVE').length,
    [tokensQuery.data]
  );
  const limitReached = activeCount >= ACTIVE_LIMIT;
  const scannerUrl = createdAccess ? buildScannerUrl(scannerAppUrl, createdAccess.token) : undefined;

  if (!operational) {
    return <Alert severity="info">Los accesos Staff sólo se administran mientras el Evento está activo.</Alert>;
  }

  if (tokensQuery.isPending) {
    return <LoadingState label="Cargando accesos Staff…" />;
  }

  if (tokensQuery.isError) {
    if (tokensQuery.error instanceof ApiError && tokensQuery.error.status === 401) {
      return <LoadingState label="Redirigiendo…" />;
    }
    return (
      <ErrorState
        title="No pudimos cargar los accesos Staff."
        message="Revisa tu conexión e inténtalo nuevamente."
        {...(tokensQuery.error instanceof ApiError && tokensQuery.error.operationId
          ? { operationId: tokensQuery.error.operationId }
          : {})}
        onRetry={() => void tokensQuery.refetch()}
      />
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 920 }}>
      <Stack spacing={0.75}>
        <Typography component="h2" variant="h3">
          Staff
        </Typography>
        <Typography color="text.secondary">
          Crea accesos temporales para el personal que operará Scanner y check-in. Cada Evento admite hasta tres accesos
          activos.
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {activeCount} de {ACTIVE_LIMIT} accesos activos
      </Typography>

      {notice ? (
        <Alert severity={notice.severity} aria-live="polite" onClose={() => setNotice(undefined)}>
          {notice.message}
        </Alert>
      ) : null}

      {limitReached ? (
        <Alert severity="info">
          Ya existen tres accesos activos. Los accesos expirados no cuentan para este límite.
        </Alert>
      ) : null}

      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          const normalized = alias.trim().replace(/\s+/gu, ' ');
          if (!normalized || limitReached || createMutation.isPending) return;
          setCreatedAccess(undefined);
          setNotice(undefined);
          createMutation.mutate(normalized);
        }}
      >
        <TextField
          label="Alias del acceso"
          placeholder="Ej. Puerta principal"
          value={alias}
          disabled={limitReached || createMutation.isPending}
          slotProps={{ htmlInput: { maxLength: 80 } }}
          onChange={(changeEvent) => setAlias(changeEvent.target.value)}
          sx={{ flex: 1 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!alias.trim() || limitReached || createMutation.isPending}
          sx={{ minHeight: 44 }}
        >
          {createMutation.isPending ? 'Creando…' : 'Crear acceso'}
        </Button>
      </Stack>

      {createdAccess && scannerUrl ? (
        <Box
          component="section"
          aria-labelledby="new-staff-access-title"
          sx={{ p: 2.5, border: 1, borderColor: 'divider', borderRadius: 2 }}
        >
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography id="new-staff-access-title" component="h3" variant="h4">
                Acceso recién creado: {createdAccess.alias}
              </Typography>
              <Typography color="text.secondary">
                Este token se muestra una sola vez. Al recargar esta página seguirá existiendo el acceso, pero el
                secreto ya no podrá recuperarse.
              </Typography>
            </Stack>
            <TextField
              label="Token Staff"
              value={createdAccess.token}
              fullWidth
              slotProps={{ input: { readOnly: true } }}
            />
            <TextField label="Enlace Scanner" value={scannerUrl} fullWidth slotProps={{ input: { readOnly: true } }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyRounded />}
                onClick={() =>
                  void copyText(scannerUrl)
                    .then(() => setNotice({ severity: 'success', message: 'Enlace Scanner copiado.' }))
                    .catch(() =>
                      setNotice({ severity: 'error', message: 'No pudimos copiar el enlace. Cópialo manualmente.' })
                    )
                }
              >
                Copiar enlace
              </Button>
              <Button
                component="a"
                href={scannerUrl}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<OpenInNewRounded />}
              >
                Abrir Scanner
              </Button>
              <Button variant="text" onClick={() => setCreatedAccess(undefined)}>
                Ocultar secreto
              </Button>
            </Stack>
          </Stack>
        </Box>
      ) : null}

      <Box component="section" aria-labelledby="staff-access-list-title">
        <Typography id="staff-access-list-title" component="h3" variant="h4" sx={{ mb: 1.5 }}>
          Accesos del Evento
        </Typography>
        {(tokensQuery.data ?? []).length === 0 ? (
          <Alert severity="info">Todavía no hay accesos Staff para este Evento.</Alert>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, borderTop: 1, borderColor: 'divider' }}>
            {(tokensQuery.data ?? []).map((staffToken) => (
              <Box
                component="li"
                key={staffToken.id}
                sx={{
                  py: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  gap: 2,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}
              >
                <Stack spacing={0.5}>
                  <Typography sx={{ fontWeight: 700 }}>{staffToken.alias}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Creado {formatDateTime(staffToken.createdAt)}
                    {staffToken.expiredAt ? ` · Expiró ${formatDateTime(staffToken.expiredAt)}` : ''}
                  </Typography>
                </Stack>
                <StatusChip
                  label={staffToken.state === 'ACTIVE' ? 'Activo' : 'Expirado'}
                  tone={staffToken.state === 'ACTIVE' ? 'success' : 'neutral'}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

export function buildScannerUrl(scannerAppUrl: string, token: string): string {
  return `${scannerAppUrl.replace(/\/+$/u, '')}/scanner/${encodeURIComponent(token)}`;
}

function staffCreationError(cause: unknown): { severity: 'warning' | 'error'; message: string } {
  if (cause instanceof ApiError && cause.code === 'STAFF_TOKEN_LIMIT_REACHED') {
    return {
      severity: 'warning',
      message: 'Ya existen tres accesos activos. Actualizamos la lista para mostrar el estado actual.'
    };
  }
  if (cause instanceof ApiError && cause.code === 'STAFF_EVENT_NOT_OPERATIONAL') {
    return {
      severity: 'warning',
      message: 'El Evento ya no admite nuevos accesos Staff. Actualiza el Evento antes de continuar.'
    };
  }
  if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
    return { severity: 'error', message: 'No pudimos crear el acceso Staff. Revisa el alias y el estado del Evento.' };
  }
  return {
    severity: 'warning',
    message:
      'No pudimos confirmar si el acceso fue creado. Actualizamos la lista y no repetiremos la creación automáticamente. Si aparece un acceso nuevo, su token no puede recuperarse; crea otro sólo después de verificar el estado.'
  };
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('COPY_FAILED');
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
