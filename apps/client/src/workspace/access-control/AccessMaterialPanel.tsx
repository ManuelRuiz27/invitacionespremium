import { ApiError, type ApiClient, type Event } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { AttemptManager, isUncertainFailure } from '../../shared/attempt-manager';
import { downloadBlob, errorMessage } from '../../shared/client-utils';
import { createPhysicalPassesPdf } from '../../wizard/physical-passes/physical-passes-pdf';
import { nominalCredentialPrintableSvg } from './nominal-credential-print';

type Intent = { kind: 'ISSUE'; assistantId: string } | { kind: 'REVOKE'; id: string; reason: string };
const materialStatuses = new Set<Event['status']>(['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE', 'ACTIVE', 'EVENT_DAY']);

export function AccessMaterialPanel({ apiClient, event }: { apiClient: ApiClient; event: Event }) {
  const nominal = event.accessMode === 'NOMINAL';
  const mutable = materialStatuses.has(event.status);
  const queryClient = useQueryClient();
  const attempts = useRef(new AttemptManager());
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [uncertain, setUncertain] = useState<Intent>();
  const [revoking, setRevoking] = useState<{ id: string; label: string }>();
  const [reason, setReason] = useState('OPERATOR_REQUEST');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const blocker = useBlocker(busy || Boolean(uncertain));
  useBeforeUnload((event) => {
    if (!busy && !uncertain) return;
    event.preventDefault();
    event.returnValue = '';
  });
  const materialKey = ['access-material', event.id, event.accessMode];
  const material = useQuery({
    queryKey: materialKey,
    queryFn: async ({ signal }) =>
      nominal
        ? { nominal: await apiClient.nominalAccessCredentials.list(event.id, signal), passes: [] }
        : { nominal: [], passes: await apiClient.physicalPasses.list(event.id) }
  });
  const subjects = useQuery({
    queryKey: ['access-subjects', event.id],
    queryFn: async () => {
      const [contacts, groups] = await Promise.all([
        apiClient.contacts.list(event.id),
        apiClient.contacts.groups(event.id)
      ]);
      return contacts
        .filter((contact) => Boolean(contact.assistantId))
        .map((contact) => ({
          id: contact.assistantId!,
          name: contact.name,
          groupName: groups.find(({ id }) => id === contact.groupId)?.name ?? 'Sin grupo'
        }));
    },
    enabled: nominal
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: materialKey }),
      ...(nominal ? [queryClient.invalidateQueries({ queryKey: ['access-subjects', event.id] })] : [])
    ]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['events', event.id] }),
      queryClient.invalidateQueries({ queryKey: ['access-readiness', event.id] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-floorplan', event.id] })
    ]);
  };
  const execute = async (intent: Intent) => {
    if (lock.current || (!mutable && !uncertain)) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const attempt = attempts.current.start('material', JSON.stringify(intent));
    try {
      if (intent.kind === 'ISSUE')
        await apiClient.nominalAccessCredentials.issue(event.id, intent.assistantId, attempt.key);
      else if (nominal)
        await apiClient.nominalAccessCredentials.revoke(
          event.id,
          intent.id,
          { revocationReasonCode: intent.reason },
          attempt.key
        );
      else
        await apiClient.physicalPasses.revoke(
          event.id,
          intent.id,
          { revocationReasonCode: intent.reason },
          attempt.key
        );
      attempts.current.clear('material', attempt.key);
      setUncertain(undefined);
      setRevoking(undefined);
      setSelected(new Set());
      setNotice(
        intent.kind === 'ISSUE' ? 'Credencial emitida.' : 'Acceso revocado. El QR anterior ya no permite ingresar.'
      );
      await refresh();
    } catch (cause) {
      if (
        isUncertainFailure(cause) ||
        (cause instanceof ApiError && (cause.status >= 500 || cause.code === 'UNEXPECTED_API_RESPONSE'))
      ) {
        setUncertain(intent);
        setError('No conocemos el resultado. Reintenta la misma operación para conservar su clave y datos.');
      } else {
        attempts.current.clear('material', attempt.key);
        setUncertain(undefined);
        setError(errorMessage(cause));
        await refresh();
      }
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const credentials = material.data?.nominal ?? [];
  const passes = material.data?.passes ?? [];
  const enabled = mutable && !busy && !uncertain;
  const downloadable = (!nominal || mutable) && !busy && !uncertain;
  const selectable = useMemo(
    () =>
      nominal
        ? (material.data?.nominal ?? [])
            .filter(
              (credential) =>
                credential.status === 'ISSUED' &&
                !credential.hasActiveCheckIn &&
                subjects.data?.some(({ id }) => id === credential.assistantId)
            )
            .map(({ id }) => id)
        : (material.data?.passes ?? []).filter(({ status }) => status === 'UNUSED').map(({ id }) => id),
    [material.data, nominal, subjects.data]
  );
  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => selectable.includes(id)));
      return next.size === current.size ? current : next;
    });
  }, [selectable]);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const svg = (id: string) =>
    nominal ? apiClient.nominalAccessCredentials.svg(event.id, id) : apiClient.physicalPasses.svg(event.id, id);
  const downloadSvg = async (id: string) => {
    if (lock.current || !downloadable) return;
    lock.current = true;
    setBusy(true);
    try {
      downloadBlob(
        new Blob([await svg(id)], { type: 'image/svg+xml' }),
        `${nominal ? 'credencial' : 'pase'}-${id}.svg`
      );
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const exportPdf = async () => {
    if (lock.current || !downloadable || selected.size === 0) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      // Revalidate the selected material before rendering; SVG also checks current validity.
      const latest = nominal
        ? await apiClient.nominalAccessCredentials.list(event.id)
        : await apiClient.physicalPasses.list(event.id);
      const validIds = new Set(
        latest
          .filter((item) =>
            'hasActiveCheckIn' in item ? item.status === 'ISSUED' && !item.hasActiveCheckIn : item.status === 'UNUSED'
          )
          .map(({ id }) => id)
      );
      const ids = [...selected].filter((id) => selectable.includes(id) && validIds.has(id));
      if (ids.length !== selected.size) {
        setSelected(new Set(ids));
        throw new Error('MATERIAL_CHANGED');
      }
      const printable = ids.map((id, index) => ({
        id,
        passNumber: nominal ? index + 1 : passes.find((pass) => pass.id === id)!.passNumber
      }));
      const pdf = await createPhysicalPassesPdf({
        eventName: event.name,
        passes: printable,
        loadSvg: async ({ id }) => {
          const source = await svg(id);
          if (!nominal) return source;
          const credential = credentials.find((item) => item.id === id)!;
          return nominalCredentialPrintableSvg(
            source,
            subjects.data?.find((subject) => subject.id === credential.assistantId)?.name ?? 'Invitado'
          );
        }
      });
      downloadBlob(pdf, nominal ? 'credenciales-individuales.pdf' : 'pases-fisicos.pdf');
      setNotice('PDF preparado con los accesos seleccionados vigentes.');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'MATERIAL_CHANGED'
          ? 'La vigencia de la selección cambió. Revisa los accesos antes de exportar.'
          : errorMessage(cause)
      );
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (material.isPending || (nominal && subjects.isPending))
    return <Typography role="status">Cargando accesos…</Typography>;
  if (material.isError || (nominal && subjects.isError))
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={() => void Promise.all([material.refetch(), ...(nominal ? [subjects.refetch()] : [])])}>
            Reintentar
          </Button>
        }
      >
        No pudimos cargar los accesos.
      </Alert>
    );
  const beginRevoke = (id: string, label: string) => {
    setRevoking({ id, label });
    setReason('OPERATOR_REQUEST');
  };

  return (
    <Stack spacing={2} sx={{ '& button': { minHeight: 44 } }}>
      <Typography component="h2" variant="h3">
        {nominal ? 'Credenciales individuales' : 'Pases físicos'}
      </Typography>
      {!nominal ? (
        <Alert severity="info">
          InvitacionesPremium genera los lotes. Puedes consultar, descargar y revocar pases sin uso; el historial
          conserva todos los folios.
        </Alert>
      ) : (
        <Typography color="text.secondary">
          Cada invitado registrado tiene un acceso individual, sin confirmación RSVP. Una credencial revocada se
          sustituye emitiendo una nueva.
        </Typography>
      )}
      {error ? <Alert severity={uncertain ? 'warning' : 'error'}>{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {uncertain ? (
        <Button disabled={busy} onClick={() => void execute(uncertain)}>
          Reintentar operación incierta
        </Button>
      ) : null}
      <Button disabled={!downloadable || selected.size === 0} variant="outlined" onClick={() => void exportPdf()}>
        Exportar seleccionados a PDF ({selected.size})
      </Button>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button disabled={!downloadable || selectable.length === 0} onClick={() => setSelected(new Set(selectable))}>
          Seleccionar todos los descargables
        </Button>
        <Button disabled={busy || Boolean(uncertain) || selected.size === 0} onClick={() => setSelected(new Set())}>
          Limpiar selección
        </Button>
      </Stack>
      <Button disabled={busy} onClick={() => void refresh()}>
        Actualizar accesos
      </Button>
      {busy ? <Typography role="status">Procesando accesos…</Typography> : null}
      {nominal ? (
        <Box component="ul" aria-label="Credenciales por invitado" sx={{ p: 0, listStyle: 'none' }}>
          {(subjects.data ?? []).map((subject) => {
            const history = credentials.filter(({ assistantId }) => assistantId === subject.id);
            const current = history.find(({ status }) => status === 'ISSUED');
            const checkedIn = history.some(({ hasActiveCheckIn }) => hasActiveCheckIn);
            return (
              <Stack
                component="li"
                key={subject.id}
                spacing={1}
                sx={{ py: 2, borderBottom: 1, borderColor: 'divider' }}
              >
                <Typography sx={{ fontWeight: 700 }}>{subject.name ?? 'Invitado anonimizado'}</Typography>
                <Typography variant="body2">
                  {subject.groupName} · {current ? 'Emitida' : 'Pendiente de emisión'} ·{' '}
                  {checkedIn ? 'Ingreso registrado' : 'Sin ingreso registrado'}
                </Typography>
                {!current && !checkedIn && mutable ? (
                  <Button
                    disabled={!enabled}
                    onClick={() => void execute({ kind: 'ISSUE', assistantId: subject.id })}
                    sx={{ alignSelf: 'flex-start', minHeight: 44 }}
                  >
                    {history.length ? 'Reemitir credencial' : 'Emitir credencial'}
                  </Button>
                ) : null}
                {history.map((credential) => (
                  <Stack
                    key={credential.id}
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{ gap: 1, alignItems: { sm: 'center' } }}
                  >
                    <Typography variant="body2">
                      {credential.status === 'REVOKED'
                        ? `Revocada · ${credential.revocationReasonCode}`
                        : 'Credencial vigente'}
                    </Typography>
                    {credential.status === 'ISSUED' && mutable ? (
                      <>
                        <Checkbox
                          disabled={!enabled || credential.hasActiveCheckIn}
                          checked={selected.has(credential.id)}
                          onChange={() => toggle(credential.id)}
                          slotProps={{ input: { 'aria-label': `Seleccionar credencial de ${subject.name}` } }}
                        />
                        <Button disabled={!enabled} onClick={() => void downloadSvg(credential.id)}>
                          Descargar QR SVG
                        </Button>
                        {!credential.hasActiveCheckIn ? (
                          <Button
                            disabled={!enabled}
                            color="error"
                            onClick={() => beginRevoke(credential.id, subject.name ?? 'Invitado')}
                          >
                            Revocar credencial
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </Stack>
                ))}
              </Stack>
            );
          })}
          {!subjects.data?.length ? (
            <Typography component="li">
              Aún no hay invitados registrados. Agrega invitados durante la preparación para emitir sus accesos.
            </Typography>
          ) : null}
          {credentials
            .filter((credential) => !subjects.data?.some(({ id }) => id === credential.assistantId))
            .map((credential) => (
              <Stack component="li" key={credential.id} spacing={1} sx={{ py: 2 }}>
                <Typography>
                  Identidad retirada ·{' '}
                  {credential.status === 'REVOKED' ? 'Revocada' : 'Credencial pendiente de revocación'}
                </Typography>
                {mutable && credential.status === 'ISSUED' && !credential.hasActiveCheckIn ? (
                  <Button disabled={!enabled} onClick={() => beginRevoke(credential.id, 'Identidad retirada')}>
                    Revocar credencial
                  </Button>
                ) : null}
              </Stack>
            ))}
        </Box>
      ) : (
        <Box component="ul" aria-label="Lista de pases físicos" sx={{ p: 0, listStyle: 'none' }}>
          {passes.map((pass) => (
            <Stack
              component="li"
              key={pass.id}
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ gap: 1, alignItems: { sm: 'center' }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
            >
              <Typography>
                Folio {pass.passNumber} · {pass.table?.name ?? 'Sin mesa'} ·{' '}
                {pass.status === 'UNUSED' ? 'Sin usar' : pass.status === 'USED' ? 'Utilizado' : 'Revocado'}
              </Typography>
              {pass.status !== 'REVOKED' ? (
                <Button disabled={!downloadable} onClick={() => void downloadSvg(pass.id)}>
                  Descargar SVG del folio {pass.passNumber}
                </Button>
              ) : null}
              {pass.status === 'UNUSED' ? (
                <>
                  <Checkbox
                    disabled={!downloadable}
                    checked={selected.has(pass.id)}
                    onChange={() => toggle(pass.id)}
                    slotProps={{ input: { 'aria-label': `Seleccionar folio ${pass.passNumber}` } }}
                  />
                  {mutable ? (
                    <Button
                      disabled={!enabled}
                      color="error"
                      onClick={() => beginRevoke(pass.id, `Folio ${pass.passNumber}`)}
                    >
                      Revocar folio {pass.passNumber}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </Stack>
          ))}
          {!passes.length ? (
            <Typography component="li">
              Aún no hay pases. Solicita la generación del lote a InvitacionesPremium.
            </Typography>
          ) : null}
        </Box>
      )}
      <Dialog
        sx={{ '& button': { minHeight: 44 } }}
        open={Boolean(revoking) && mutable}
        onClose={() => {
          if (!busy && !uncertain) setRevoking(undefined);
        }}
        aria-labelledby="revoke-access-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="revoke-access-title">Revocar acceso</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              {revoking?.label}. El QR dejará de permitir nuevos ingresos. Esta acción es irreversible.
            </Typography>
            <TextField
              select
              label="Motivo"
              disabled={busy || Boolean(uncertain)}
              value={reason}
              onChange={(change) => setReason(change.target.value)}
            >
              <MenuItem value="OPERATOR_REQUEST">Solicitud del operador</MenuItem>
            </TextField>
            {uncertain ? (
              <Alert severity="warning">Resultado incierto. Cierra el aviso al resolver el mismo intento.</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || Boolean(uncertain)} onClick={() => setRevoking(undefined)}>
            Cancelar
          </Button>
          <Button
            color="error"
            disabled={busy}
            onClick={() => {
              if (uncertain) void execute(uncertain);
              else if (revoking) void execute({ kind: 'REVOKE', id: revoking.id, reason });
            }}
          >
            {uncertain ? 'Reintentar misma revocación' : 'Confirmar revocación'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={blocker.state === 'blocked'}
        aria-labelledby="pending-access-title"
        sx={{ '& button': { minHeight: 44 } }}
      >
        <DialogTitle id="pending-access-title">Hay una operación pendiente</DialogTitle>
        <DialogContent>
          Conserva esta pantalla hasta resolver el intento pendiente para mantener su misma clave y datos.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Seguir trabajando</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
