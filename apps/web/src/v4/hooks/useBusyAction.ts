import {useCallback, useRef, useState} from 'react';

/**
 * Guards async UI actions against double-submit.
 * `run` no-ops while a previous call is still in flight.
 */
export function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const locked = useRef(false);

  const run = useCallback(async (fn: () => Promise<void>, key?: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    if (key) setBusyKey(key);
    try {
      await fn();
    } finally {
      locked.current = false;
      setBusy(false);
      setBusyKey(null);
    }
  }, []);

  return {busy, busyKey, run, isBusy: (key?: string) => (key ? busyKey === key : busy)};
}
