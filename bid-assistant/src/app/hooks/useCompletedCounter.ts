import { useCallback, useEffect, useState } from 'react';

// Manual "completed bids" tally, persisted permanently in localStorage. It is
// incremented when a session is marked completed and only ever reset by the
// user clicking Reset (e.g. at the start of a new day).
const STORAGE_KEY = 'bidCompletedCounter';

function readCounter(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeCounter(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable (private mode, etc.); keep the in-memory value.
  }
}

export function useCompletedCounter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(readCounter());

    // Keep multiple side-panel instances in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setCount(readCounter());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const increment = useCallback(() => {
    setCount((prev) => {
      const next = prev + 1;
      writeCounter(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    writeCounter(0);
    setCount(0);
  }, []);

  return { count, increment, reset };
}
