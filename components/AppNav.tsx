"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/review": "Review",
  "/build": "Build sentences",
  "/tones": "Tone training",
  "/progress": "Progress",
};

/**
 * Header bar with a way back home, on every screen except home itself.
 *
 * Lives in the root layout so a new mode gets it without remembering to add
 * one. Top-padded by the safe-area inset: the installed PWA uses a
 * black-translucent status bar, so content otherwise sits underneath it.
 */
export function AppNav() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-neutral-900 bg-neutral-950/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <Link
        href="/"
        className="-ml-2 rounded-lg px-2 py-1 text-sm text-neutral-300 active:bg-neutral-800"
      >
        ← Home
      </Link>
      <span className="text-sm font-medium text-neutral-500">{TITLES[pathname] ?? ""}</span>
    </header>
  );
}
