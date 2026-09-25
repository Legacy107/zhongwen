"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageHeader, Switch } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { sync } from "@/lib/sync";

/**
 * The passphrase only unlocks sync. Reviewing works signed out, entirely from
 * this device's own storage, so nothing here blocks studying offline.
 */
export function SignInForm() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [show, setShow] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase, remember }),
      });
      if (res.ok) {
        // Push what queued up while signed out, rather than waiting for the timer.
        void sync();
        router.replace("/settings");
        return;
      }
      if (res.status === 429) {
        const { retryAfter } = (await res.json()) as { retryAfter: number };
        setError(`Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} min.`);
      } else if (res.status === 401) {
        setError("That passphrase isn't right.");
      } else {
        setError("Could not sign in. Try again.");
      }
    } catch {
      setError("Can't reach the server. Check your connection.");
    }
    setAttempt((n) => n + 1);
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader title="Sign in" back="/settings" />
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-5 pt-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Mascot mood="happy" size={110} />
          <h2 className="text-2xl font-extrabold text-ink">Sync your progress</h2>
          <p className="text-ink-2">Keeps every device on the same cards and streak. You can study without it.</p>
        </div>

        <motion.div
          key={attempt}
          animate={attempt > 0 ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
          transition={{ duration: 0.35 }}
          className="relative"
        >
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            aria-label="Passphrase"
            aria-invalid={error ? true : undefined}
            className="field pr-14"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide passphrase" : "Show passphrase"}
            className="absolute right-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-ink-3 active:bg-surface-3"
          >
            <Icon name={show ? "eyeOff" : "eye"} size={22} />
          </button>
        </motion.div>

        <div className="flex min-h-12 items-center justify-between gap-3">
          <span className="font-bold text-ink">Remember me for 30 days</span>
          <Switch label="Remember me for 30 days" on={remember} onChange={setRemember} />
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-soft px-4 py-3 font-bold text-red-ink">
            <Icon name="alert" size={20} />
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || passphrase.length === 0} className="btn btn-primary btn-block">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Link href="/settings" className="btn btn-ghost btn-block">
          Not now
        </Link>
      </form>
    </div>
  );
}
