"use client";

import { useEffect, useState } from "react";
import { db, getLastSyncedAt } from "@/lib/db/local";
import { onSyncComplete, onSyncStatus, sync, type SyncStatus as Status } from "@/lib/sync";

function ago(when: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - when.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return when.toLocaleDateString();
}

const LABEL: Record<Exclude<Status, "idle">, string> = {
  syncing: "Syncing…",
  offline: "Offline",
  unauthorized: "Sign-in needed",
  error: "Sync failed",
};

/**
 * One line of sync health: when this device last reached the server and how
 * much is still queued. Queued grades are safe locally, so this informs rather
 * than alarms.
 */
export function SyncStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const [last, count] = await Promise.all([getLastSyncedAt(), db.outbox.count()]);
      if (cancelled) return;
      setLastSynced(last);
      setPending(count);
    };
    void read();
    const offStatus = onSyncStatus(setStatus);
    const offComplete = onSyncComplete(() => void read());
    return () => {
      cancelled = true;
      offStatus();
      offComplete();
    };
  }, []);

  const label =
    status && status !== "idle"
      ? LABEL[status]
      : lastSynced
        ? `Synced ${ago(lastSynced)}`
        : "Not synced yet";

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
      <span>
        <span className={status === "error" || status === "unauthorized" ? "text-rose-400" : ""}>
          {label}
        </span>
        {pending > 0 && status !== "syncing" && ` · ${pending} waiting`}
      </span>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={status === "syncing"}
        className="rounded-lg bg-neutral-800 px-3 py-1.5 text-neutral-300 active:bg-neutral-700 disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  );
}
