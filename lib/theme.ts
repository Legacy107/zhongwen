"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_KEY } from "./themeScript";

/**
 * Light, dark, or follow the system. The palette itself is CSS light-dark()
 * pairs; this only pins `data-theme` on <html> when the learner overrides it.
 */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = THEME_KEY;
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  // The status bar and browser chrome follow too, not just the page.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const scheme = (m.getAttribute("media") ?? "").includes("dark") ? "dark" : "light";
    m.setAttribute("content", THEME_COLORS[choice === "system" ? scheme : choice]);
  });
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "system" as ThemeChoice,
  );
  const set = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: applies for this page only.
    }
    applyTheme(next);
    listeners.forEach((l) => l());
  }, []);
  return [theme, set];
}
