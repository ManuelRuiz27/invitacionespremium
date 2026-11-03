import { useEffect, useMemo, useState } from 'react';

export function useCountdownSeconds(targetTime: string | null | undefined, referenceTime?: string): number | null {
  const anchor = useMemo(
    () => ({
      reference: referenceTime ? Date.parse(referenceTime) : NaN,
      monotonicStart: performance.now()
    }),
    [referenceTime]
  );
  const [seconds, setSeconds] = useState<number | null>(() => {
    return remaining(targetTime, Number.isFinite(anchor.reference) ? anchor.reference : Date.now());
  });
  useEffect(() => {
    const now = () =>
      Number.isFinite(anchor.reference)
        ? anchor.reference + Math.max(0, performance.now() - anchor.monotonicStart)
        : Date.now();
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setSeconds(remaining(targetTime, now()));
    const sync = () => {
      if (interval !== undefined) clearInterval(interval);
      interval = undefined;
      tick();
      if (!document.hidden) interval = setInterval(tick, 1000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      if (interval !== undefined) clearInterval(interval);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [anchor, targetTime]);
  return seconds;
}

function remaining(targetTime: string | null | undefined, now: number): number | null {
  const target = targetTime ? Date.parse(targetTime) : NaN;
  return Number.isFinite(target) ? Math.max(0, Math.ceil((target - now) / 1000)) : null;
}
