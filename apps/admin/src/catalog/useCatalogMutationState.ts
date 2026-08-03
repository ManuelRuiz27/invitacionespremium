import { useRef, useState } from 'react';
import { adminErrorMessage } from '../shared/admin-error';
import { isAbortError, useAdminOperationScope } from '../shared/useAdminOperationScope';

export const CATALOG_UNCERTAIN_MESSAGE =
  'El resultado no pudo confirmarse. Actualiza la información antes de repetir la acción.';

export type CatalogMutationPhase =
  | 'idle'
  | 'submitting'
  | 'uncertain'
  | 'reconciling'
  | 'resolved_applied'
  | 'resolved_not_applied'
  | 'deterministic_error';

export type CatalogReconciliation<T> =
  | { status: 'applied'; value?: T }
  | { status: 'not_applied'; value?: T }
  | { status: 'unavailable' }
  | { status: 'ambiguous' };

interface ReconciliationHandlers<T> {
  applied?: (value: T | undefined) => void;
  notApplied?: (value: T | undefined) => void;
  unavailable?: () => void;
}

export function useCatalogMutationState(entityType: string, entityId: string) {
  const { begin } = useAdminOperationScope(entityType, entityId);
  const phaseRef = useRef<CatalogMutationPhase>('idle');
  const [phase, setRenderedPhase] = useState<CatalogMutationPhase>('idle');
  const [error, setError] = useState('');

  const setPhase = (next: CatalogMutationPhase) => {
    phaseRef.current = next;
    setRenderedPhase(next);
  };

  async function submit<T>(request: (signal: AbortSignal) => Promise<T>, onSuccess: (value: T) => void) {
    if (!['idle', 'resolved_not_applied', 'deterministic_error'].includes(phaseRef.current)) return;
    const operation = begin();
    if (!operation) return;
    setPhase('submitting');
    setError('');
    try {
      const result = await request(operation.signal);
      if (operation.isCurrent()) {
        setPhase('resolved_applied');
        onSuccess(result);
      }
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        const parsed = adminErrorMessage(reason);
        if (parsed.uncertain) {
          setPhase('uncertain');
          setError(CATALOG_UNCERTAIN_MESSAGE);
        } else {
          setPhase('deterministic_error');
          setError(parsed.message);
        }
      }
    } finally {
      operation.finish();
    }
  }

  async function reconcile<T>(
    request: (signal: AbortSignal) => Promise<CatalogReconciliation<T>>,
    handlers: ReconciliationHandlers<T> = {}
  ) {
    if (phaseRef.current !== 'uncertain') return;
    const operation = begin();
    if (!operation) return;
    setPhase('reconciling');
    setError('');
    try {
      const result = await request(operation.signal);
      if (!operation.isCurrent()) return;
      if (result.status === 'applied') {
        setPhase('resolved_applied');
        handlers.applied?.(result.value);
      } else if (result.status === 'not_applied') {
        setPhase('resolved_not_applied');
        setError('La informacion autoritativa no muestra el cambio. Puedes confirmar un nuevo intento.');
        handlers.notApplied?.(result.value);
      } else if (result.status === 'unavailable') {
        setPhase('resolved_applied');
        handlers.unavailable?.();
      } else {
        setPhase('uncertain');
        setError('La informacion autoritativa es ambigua. El resultado continua sin confirmarse.');
      }
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        setPhase('uncertain');
        setError(CATALOG_UNCERTAIN_MESSAGE);
      }
    } finally {
      operation.finish();
    }
  }

  const allowExplicitRetry = () => {
    if (phaseRef.current !== 'uncertain') return;
    setPhase('resolved_not_applied');
    setError('El resultado sigue sin confirmarse. El siguiente envio sera un intento nuevo y explicito.');
  };

  return {
    phase,
    error,
    busy: phase === 'submitting' || phase === 'reconciling',
    canSubmit: phase === 'idle' || phase === 'resolved_not_applied' || phase === 'deterministic_error',
    needsReconciliation: phase === 'uncertain',
    submit,
    reconcile,
    allowExplicitRetry
  };
}
