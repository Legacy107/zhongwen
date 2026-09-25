"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { onSyncStatus, type SyncStatus } from "@/lib/sync";

/**
 * A cloud in the home top bar: quiet when sync is healthy, marked when it is
 * signed out or failing, so a silent break in sync is visible within a glance.
 */
export function SyncBadge() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => onSyncStatus(setStatus), []);

  // Signed out is a choice (studying works without sync), so it is shown but
  // not flagged. Only a failing sync gets the red dot.
  const problem = status === "error";
  const label =
    status === "unauthorized"
      ? "Signed out of sync"
      : status === "error"
        ? "Sync failed"
        : status === "offline"
          ? "Offline"
          : status === "syncing"
            ? "Syncing"
            : "Sync";

  return (
    <Link
      href="/settings"
      aria-label={label}
      title={label}
      className={`relative grid size-11 place-items-center rounded-xl active:bg-surface-2 ${
        problem ? "text-red" : status === "syncing" ? "text-blue" : "text-ink-3"
      }`}
    >
      <Icon name="cloud" size={24} />
      {problem && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-red ring-2 ring-bg" />}
    </Link>
  );
}
