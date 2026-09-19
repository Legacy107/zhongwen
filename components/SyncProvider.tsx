"use client";

import { useEffect } from "react";
import { startSync } from "@/lib/sync";

/**
 * Owns the background sync lifecycle for the app.
 *
 * Without this mounted nothing ever drains the outbox: grades accumulate in
 * IndexedDB and never reach Postgres. Rendered once from the root layout, it
 * registers the focus/online/timer triggers and tears them down on unmount.
 */
export function SyncProvider() {
  useEffect(() => startSync(), []);
  return null;
}
