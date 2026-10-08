import { useCallback, useState } from 'react';

/**
 * useState backed by localStorage, so tool settings survive leaving the table
 * and coming back. Accepts a value or an updater function, exactly like
 * useState, because callers reasonably reach for set(prev => !prev).
 * Falls back to the initial value when storage is unavailable (private mode,
 * or storage disabled).
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (v: T | ((prev: T) => T)) => void] {
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
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage full or disabled: keep the in-memory value */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}