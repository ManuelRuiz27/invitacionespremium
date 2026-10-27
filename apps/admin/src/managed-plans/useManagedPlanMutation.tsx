import { useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { adminErrorMessage } from '../shared/admin-error';
import { useAdminOperationScope } from '../shared/useAdminOperationScope';

export function useManagedPlanMutation<TInput, TResult>(
  scopeId: string,
  mutate: (input: TInput, key: string, signal: AbortSignal) => Promise<TResult>,
  confirmed: (result: TResult) => void
) {
  const scope = useAdminOperationScope('managed-commercial', scopeId);
  const attempt = useRef<{ input: TInput; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const blocker = useBlocker(busy || uncertain);
  useBeforeUnload((event) => {
    if (!busy && !uncertain) return;
    event.preventDefault();
    event.returnValue = '';
  });

  async function submit(input: TInput) {
    const operation = scope.begin();
    if (!operation) return;
    const current = attempt.current ?? { input, key: globalThis.crypto.randomUUID() };
    attempt.current = current;
    setBusy(true);
    setError('');
    try {
      const result = await mutate(current.input, current.key, operation.signal);
      if (!operation.isCurrent()) return;
      attempt.current = null;
      setUncertain(false);
      confirmed(result);
    } catch (cause) {
      if (!operation.isCurrent()) return;
      const failure = adminErrorMessage(cause);
      setError(failure.message);
      setUncertain(failure.uncertain);
      if (!failure.uncertain) attempt.current = null;
    } finally {
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  }

  return {
    submit,
    retry: () => attempt.current && void submit(attempt.current.input),
    busy,
    uncertain,
    error,
    locked: busy || uncertain,
    navigationGuard: (
      <Dialog open={blocker.state === 'blocked'}>
        <DialogTitle>Conserva la operación comercial</DialogTitle>
        <DialogContent>
          Resuelve o reintenta la misma operación antes de salir. Se conservarán los datos y la referencia del intento.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Permanecer</Button>
        </DialogActions>
      </Dialog>
    )
  };
}
