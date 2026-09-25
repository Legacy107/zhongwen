"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
        router.replace("/");
        return;
      }
      if (res.status === 429) {
        const { retryAfter } = (await res.json()) as { retryAfter: number };
        setError(`Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} min.`);
      } else if (res.status === 401) {
        setError("Wrong passphrase.");
      } else {
        setError("Could not sign in. Try again.");
      }
    } catch {
      setError("Can't reach the server. Check your connection.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sign in to sync</h1>
        <p className="text-sm text-neutral-400">
          Keeps your progress the same on every device. You can study without it.
        </p>
      </div>

      <input
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="Passphrase"
        aria-label="Passphrase"
        className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base outline-none focus:border-emerald-600"
      />

      <label className="flex items-center gap-3 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 accent-emerald-600"
        />
        Remember me for 30 days
      </label>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={busy || passphrase.length === 0}
        className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white active:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
