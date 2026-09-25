"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A boolean preference in localStorage, shared by every component that reads
 * the same key and safe to render on the server.
 *
 * useSyncExternalStore makes the server render and the first client render
 * agree on `fallback` instead of flashing the wrong state, and every mounted
 * toggle for a key updates together when one of them changes it.
 */
const listeners = new Map<string, Set<() => void>>();

function listenersFor(key: string): Set<() => void> {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  return set;
}

export function useStoredToggle(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listenersFor(key);
      set.add(listener);
      return () => set.delete(listener);
    },
    [key],
  );
  const read = useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    } catch {
      return fallback;
    }
  }, [key, fallback]);

  const on = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Private mode: the toggle just won't persist.
      }
      listenersFor(key).forEach((l) => l());
    },
    [key],
  );
  return [on, set];
}
