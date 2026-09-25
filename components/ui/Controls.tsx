"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * The big blue speaker button next to a prompt, Duolingo-style. `slow`
 * renders the smaller companion that replays at a slower rate.
 */
export function SpeakButton({
  onClick,
  size = "lg",
  label = "Play audio",
}: {
  onClick: () => void;
  size?: "lg" | "md" | "sm";
  label?: string;
}) {
  const dims = size === "lg" ? "size-16" : size === "md" ? "size-12" : "size-11";
  const icon = size === "lg" ? 32 : size === "md" ? 24 : 20;
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`btn btn-info btn-icon ${dims}`}>
      <Icon name="speaker" size={icon} />
    </button>
  );
}

/** An icon-only toggle for a session's top bar (sound, pinyin). */
export function TopBarToggle({
  on,
  onChange,
  iconOn,
  iconOff,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  iconOn: Parameters<typeof Icon>[0]["name"];
  iconOff: Parameters<typeof Icon>[0]["name"];
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid size-11 place-items-center rounded-xl transition-colors active:bg-surface-2 ${
        on ? "text-blue" : "text-ink-3"
      }`}
    >
      <Icon name={on ? iconOn : iconOff} size={24} />
    </button>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-green" : "bg-surface-3"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className={`absolute top-1 size-6 rounded-full bg-white shadow-[0_2px_0_rgba(0,0,0,0.15)] ${
          on ? "right-1" : "left-1"
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl border-2 border-line bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
              active ? "text-blue-ink" : "text-ink-2"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${label}`}
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
                className="absolute inset-0 rounded-xl border-2 border-blue/50 bg-surface shadow-[0_2px_0_var(--line)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 pb-3">
        {back && (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 grid size-11 place-items-center rounded-xl text-ink-2 active:bg-surface-2"
          >
            <Icon name="chevronLeft" size={26} strokeWidth={3} />
          </Link>
        )}
        <h1 className="flex-1 text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {right}
      </div>
    </header>
  );
}

/** Centred loading state with a bouncing trio of dots. */
export function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24" role="status">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-3.5 rounded-full bg-green"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
          />
        ))}
      </div>
      <p className="text-sm font-bold text-ink-3">{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-bold text-red-ink">{message}</p>
      <Link href="/" className="btn btn-secondary">
        Back home
      </Link>
    </div>
  );
}
