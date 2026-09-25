"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the sentence pages speak on their own: each word as its tile is
 * tapped, and the sentence once an answer is committed. The replay button
 * still works when this is off, because pressing it is an explicit request.
 *
 * Kept in localStorage behind useSyncExternalStore so the server render and
 * the first client render agree (both read "on") instead of flashing the
 * wrong icon, and so every mounted toggle updates together.
 */
const KEY = "chinese.autoSpeak";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAutoSpeak(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private mode: the toggle just won't persist.
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}
