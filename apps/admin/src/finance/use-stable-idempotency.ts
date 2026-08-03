import { useRef } from 'react';

type PendingIntent = { fingerprint: string; key: string };

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useStableIdempotency() {
  const pending = useRef<PendingIntent | null>(null);
  const submitting = useRef(false);

  return {
    begin(fingerprint: string) {
      if (submitting.current) return null;
      submitting.current = true;
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: newKey() };
      return pending.current.key;
    },
    finish({ retain }: { retain: boolean }) {
      submitting.current = false;
      if (!retain) pending.current = null;
    }
  };
}
