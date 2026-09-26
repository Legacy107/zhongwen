"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PageHeader, Segmented, Switch } from "@/components/ui/Controls";
import { Icon, type IconName } from "@/components/ui/Icon";
import { db, exportBackup, getLastSyncedAt, importBackup } from "@/lib/db/local";
import { getDailyGoal, GOAL_CHOICES, setDailyGoal } from "@/lib/goal";
import { playCorrect, setSfxEnabled } from "@/lib/sound";
import { onSyncComplete, onSyncStatus, sync, type SyncStatus } from "@/lib/sync";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useAutoSpeak } from "@/lib/useAutoSpeak";
import { useStoredToggle } from "@/lib/useStoredToggle";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-ink-3">{title}</h2>
      <div className="card flex flex-col divide-y-2 divide-line">{children}</div>
    </section>
  );
}

function Item({ icon, title, detail, children }: { icon: IconName; title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-ink-2">
        <Icon name={icon} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">{title}</p>
        {detail && <p className="text-sm text-ink-3">{detail}</p>}
      </div>
      {children}
    </div>
  );
}

function ago(when: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - when.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return when.toLocaleDateString();
}

interface AuthState {
  required: boolean;
  signedIn: boolean;
}

async function readAuth(): Promise<AuthState | null> {
  try {
    const res = await fetch("/api/auth", { cache: "no-store" });
    return res.ok ? ((await res.json()) as AuthState) : null;
  } catch {
    return null;
  }
}

function SyncItems() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const [last, count, a] = await Promise.all([getLastSyncedAt(), db.outbox.count(), readAuth()]);
      if (cancelled) return;
      setLastSynced(last);
      setPending(count);
      setAuth(a);
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

  const signedOut = status === "unauthorized" || (auth?.required && !auth.signedIn);
  const detail = signedOut
    ? "Signed out. Progress stays on this device until you sign in."
    : status === "syncing"
      ? "Syncing…"
      : status === "offline"
        ? "Offline. Changes sync when you reconnect."
        : status === "error"
          ? "The last sync failed. It retries automatically."
          : lastSynced
            ? `Synced ${ago(lastSynced)}${pending ? ` · ${pending} waiting` : ""}`
            : "Not synced yet";

  const signOut = async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      return;
    }
    setAuth((a) => (a ? { ...a, signedIn: false } : a));
    void sync();
  };

  return (
    <>
      <Item icon="cloud" title="Sync across devices" detail={detail}>
        {signedOut ? (
          <Link href="/signin" className="btn btn-primary btn-sm">
            Sign in
          </Link>
        ) : (
          <button type="button" onClick={() => void sync()} disabled={status === "syncing"} className="btn btn-secondary btn-sm">
            Sync now
          </button>
        )}
      </Item>
      {auth?.signedIn && (
        <Item icon="lock" title="Signed in" detail="Stays signed in for 30 days with Remember me.">
          <button type="button" onClick={() => void signOut()} className="btn btn-ghost btn-sm !text-red">
            Sign out
          </button>
        </Item>
      )}
    </>
  );
}

const GOAL_NAME: Record<number, string> = {
  10: "Casual: a few minutes a day",
  20: "Regular: about 10 minutes",
  30: "Serious: about 15 minutes",
  50: "Intense: 25 minutes or more",
};

/** Synced, so the goal is the same on every device. */
function GoalPicker() {
  const [goal, setGoal] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDailyGoal().then((g) => !cancelled && setGoal(g));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div>
        <p className="font-bold text-ink">Daily goal</p>
        <p className="text-sm text-ink-3">
          {goal ? GOAL_NAME[goal] ?? `${goal} a day` : "…"}. Reviews, tone drills and sentences read all count.
        </p>
      </div>
      {goal !== null && (
        <Segmented
          label="Daily goal"
          value={String(goal)}
          onChange={(v) => {
            setGoal(Number(v));
            void setDailyGoal(Number(v));
          }}
          options={GOAL_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
        />
      )}
    </div>
  );
}

function BackupItems() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    setBusy("export");
    try {
      const url = URL.createObjectURL(await exportBackup());
      const a = document.createElement("a");
      a.href = url;
      a.download = `hanviet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Backup downloaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const onImport = useCallback(async (file: File) => {
    setBusy("import");
    try {
      const { cards, reviews } = await importBackup(file);
      setMessage(`Restored ${cards} cards and ${reviews} reviews.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <>
      <Item icon="download" title="Export a backup" detail="A copy of your review history you keep yourself.">
        <button type="button" onClick={onExport} disabled={busy !== null} className="btn btn-secondary btn-sm">
          {busy === "export" ? "…" : "Export"}
        </button>
      </Item>
      <Item icon="upload" title="Restore from a backup" detail={message ?? "Merges with what is here; nothing is overwritten by older data."}>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="btn btn-secondary btn-sm"
        >
          {busy === "import" ? "…" : "Restore"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </Item>
    </>
  );
}

// Inlined at build time by next.config.ts.
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION;
const COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT;
const BUILT_AT = process.env.NEXT_PUBLIC_APP_BUILT_AT;

/** The build running here, to tell whether this device has picked up a deploy. */
function VersionItem() {
  // In this device's time zone, so from the client only: the page is
  // prerendered at build time.
  const built = useSyncExternalStore(
    () => () => {},
    () => (BUILT_AT ? new Date(BUILT_AT).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""),
    () => "",
  );
  const when = process.env.NODE_ENV === "development" ? "development server" : built && `built ${built}`;
  return <Item icon="info" title={`Version ${VERSION}`} detail={[COMMIT?.slice(0, 7), when].filter(Boolean).join(" · ")} />;
}

export function SettingsScreen() {
  // Same key and "1"/"0" format lib/sound reads, so the two stay in step.
  const [sfx, setSfx] = useStoredToggle("sfxEnabled", true);
  const [autoSpeak, setAutoSpeak] = useAutoSpeak();
  const [theme, setTheme] = useTheme();

  return (
    <div className="flex flex-col pb-28">
      <PageHeader title="Settings" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4">
        <Section title="Learning">
          <GoalPicker />
        </Section>

        <Section title="Sound">
          <Item icon="sparkles" title="Sound effects" detail="Chimes for right answers, combos and goals.">
            <Switch
              label="Sound effects"
              on={sfx}
              onChange={(on) => {
                setSfx(on);
                setSfxEnabled(on);
                if (on) playCorrect();
              }}
            />
          </Item>
          <Item icon="speaker" title="Speak words automatically" detail="Say each tile as you tap it, and each answer.">
            <Switch label="Speak words automatically" on={autoSpeak} onChange={setAutoSpeak} />
          </Item>
        </Section>

        <Section title="Appearance">
          <div className="flex flex-col gap-3 px-4 py-3.5">
            <p className="font-bold text-ink">Theme</p>
            <Segmented<ThemeChoice>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
        </Section>

        <Section title="Sync">
          <SyncItems />
        </Section>

        <Section title="Backup">
          <BackupItems />
        </Section>

        <Section title="About">
          <VersionItem />
          <div className="flex flex-col gap-2 px-4 py-3.5 text-sm text-ink-2">
            <p>
              <span className="font-bold text-ink">HánViệt</span>: Mandarin through Sino-Vietnamese.
            </p>
            <p>
              Vocabulary from HSK 3.0 (ivankra/hsk30, MIT). Vietnamese glosses from CVDICT by Phong Phan and English from
              CC-CEDICT (both CC BY-SA 4.0). Readings from the Unicode Unihan database. Reading sentences from{" "}
              <a className="underline" href="https://tatoeba.org" target="_blank" rel="noreferrer">
                Tatoeba
              </a>{" "}
              (CC BY 2.0 FR).
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
