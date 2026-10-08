import { useCallback, useState } from 'react';

/**
 * useState backed by localStorage, so tool settings survive leaving the table
 * and coming back. Falls back to the initial value when storage is
 * unavailable (private mode, or storage disabled).
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or disabled: keep the in-memory value */
      }
    },
    [key],
  );

  return [value, set];
}