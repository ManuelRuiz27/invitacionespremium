import { useRef } from 'react';

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useStableIdempotency() {
  const submitting = useRef(false);

  return {
    begin(existingKey?: string) {
      if (submitting.current) return null;
      submitting.current = true;
      return existingKey ?? newKey();
    },
    finish() {
      submitting.current = false;
    }
  };
}
