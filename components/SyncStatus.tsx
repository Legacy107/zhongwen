"use client";

import Link from "next/link";
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
  unauthorized: "Signed out",
  error: "Sync failed",
};

interface AuthState {
  required: boolean;
  signedIn: boolean;
}

/** Null when the server can't be reached; the line then just shows "Offline". */
async function readAuth(): Promise<AuthState | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    return res.ok ? ((await res.json()) as AuthState) : null;
  } catch {
    return null;
  }
}

/**
 * One line of sync health: when this device last reached the server and how
 * much is still queued. Queued grades are safe locally, so this informs rather
 * than alarms.
 */
export function SyncStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const [last, count, authState] = await Promise.all([
        getLastSyncedAt(),
        db.outbox.count(),
        readAuth(),
      ]);
      if (cancelled) return;
      setLastSynced(last);
      setPending(count);
      setAuth(authState);
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

  const signOut = async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      return; // Offline: the cookie is still set, so say nothing changed.
    }
    setAuth((a) => (a ? { ...a, signedIn: false } : a));
    void sync();
  };

  const needsSignIn = status === "unauthorized" || (auth?.required && !auth.signedIn);

  const label =
    status && status !== "idle"
      ? LABEL[status]
      : lastSynced
        ? `Synced ${ago(lastSynced)}`
        : "Not synced yet";

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
      <span>
        <span className={status === "error" ? "text-rose-400" : ""}>
          {needsSignIn && status !== "syncing" ? "Signed out" : label}
        </span>
        {pending > 0 && status !== "syncing" && ` · ${pending} waiting`}
      </span>
      {needsSignIn ? (
        <Link
          href="/signin"
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-white active:bg-emerald-800"
        >
          Sign in
        </Link>
      ) : (
        <span className="flex gap-2">
          {auth?.signedIn && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg px-2 py-1.5 text-neutral-500 active:bg-neutral-800"
            >
              Sign out
            </button>
          )}
          <button
            type="button"
            onClick={() => void sync()}
            disabled={status === "syncing"}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-neutral-300 active:bg-neutral-700 disabled:opacity-50"
          >
            Sync now
          </button>
        </span>
      )}
    </div>
  );
}
