"use client";

import confetti from "canvas-confetti";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { playFanfare, playGoal } from "@/lib/sound";
import { Icon, type IconName } from "./Icon";
import { Mascot } from "./Mascot";

export interface CompletionStat {
  label: string;
  value: number;
  /** Rendered after the counted number, e.g. "%". */
  suffix?: string;
  /** Formats the counted number instead of the default integer. */
  format?: (n: number) => string;
  icon: IconName;
  /** Token colour name: green, gold, blue, purple, orange. */
  color: "green" | "gold" | "blue" | "purple" | "orange";
}

/** Header faces use the deeper shades, so the white label stays legible. */
const COLOR: Record<CompletionStat["color"], { box: string; head: string; label: string; text: string }> = {
  green: { box: "border-primary", head: "bg-primary", label: "text-white", text: "text-green-ink" },
  gold: { box: "border-gold", head: "bg-gold", label: "text-[#4a2f00]", text: "text-gold-ink" },
  blue: { box: "border-info", head: "bg-info", label: "text-white", text: "text-blue-ink" },
  purple: { box: "border-purple", head: "bg-purple", label: "text-white", text: "text-purple-ink" },
  orange: { box: "border-orange-lip", head: "bg-orange-lip", label: "text-white", text: "text-orange-ink" },
};

function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const n = useMotionValue(0);
  const text = useTransform(n, (v) => (format ? format(v) : Math.round(v).toLocaleString()));
  useEffect(() => {
    const controls = animate(n, value, { duration: 0.9, delay: 0.35, ease: "easeOut" });
    return () => controls.stop();
  }, [n, value]);
  return <motion.span>{text}</motion.span>;
}

interface SessionCompleteProps {
  title: string;
  subtitle?: string;
  stats: CompletionStat[];
  /** Crossed the daily goal during this session: a bigger celebration. */
  goalMet?: { streak: number } | null;
  primary: { label: string; href?: string; onClick?: () => void };
  secondary?: { label: string; href?: string; onClick?: () => void };
  /** Confetti and fanfare. Off when the session had nothing in it: no party for zero. */
  celebrate?: boolean;
  children?: ReactNode;
}

/**
 * The end-of-session moment: the cat, a headline, three counted-up stats, and
 * a way onward. Confetti and the fanfare fire once on mount; meeting the daily
 * goal gets its own banner and a longer cue.
 */
export function SessionComplete({
  title,
  subtitle,
  stats,
  goalMet,
  primary,
  secondary,
  celebrate = true,
  children,
}: SessionCompleteProps) {
  useEffect(() => {
    if (!celebrate) return;
    if (goalMet) playGoal();
    else playFanfare();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const colors = ["#4FC31B", "#FFB400", "#1AAFF0", "#FF8A1E", "#B06CF7"];
    void confetti({ particleCount: 70, spread: 75, startVelocity: 42, origin: { y: 0.35 }, colors });
    const t = setTimeout(
      () => void confetti({ particleCount: 40, spread: 100, origin: { y: 0.3 }, colors, scalar: 0.8 }),
      350,
    );
    return () => clearTimeout(t);
  }, [goalMet, celebrate]);

  const action = (a: SessionCompleteProps["primary"], cls: string) =>
    a.href ? (
      <Link href={a.href} onClick={a.onClick} className={cls}>
        {a.label}
      </Link>
    ) : (
      <button type="button" onClick={a.onClick} className={cls}>
        {a.label}
      </button>
    );

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-5 pt-[max(2rem,env(safe-area-inset-top))] text-center">
        <Mascot mood={celebrate ? "cheer" : "happy"} size={140} />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col gap-1"
        >
          <h1 className="text-3xl font-extrabold text-gold-ink">{title}</h1>
          {subtitle && <p className="text-ink-2">{subtitle}</p>}
        </motion.div>

        {goalMet && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 18 }}
            className="flex items-center gap-3 rounded-2xl bg-orange-soft px-4 py-3 text-left"
          >
            <span className="text-orange">
              <Icon name="flame" size={36} />
            </span>
            <span>
              <span className="block font-extrabold text-orange-ink">Daily goal met!</span>
              <span className="text-sm text-orange-ink/80">
                {goalMet.streak > 1 ? `${goalMet.streak}-day streak` : "Your streak starts today"}
              </span>
            </span>
          </motion.div>
        )}

        <div className="grid w-full grid-cols-3 gap-3">
          {stats.map((s, i) => {
            const c = COLOR[s.color];
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.08, type: "spring", stiffness: 300, damping: 24 }}
                className={`overflow-hidden rounded-2xl border-2 ${c.box} ${c.head}`}
              >
                <p className={`px-1 py-1 text-xs font-extrabold uppercase tracking-wider ${c.label}`}>{s.label}</p>
                <div className={`flex items-center justify-center gap-1 rounded-t-xl bg-surface px-1 py-3 text-xl font-extrabold ${c.text}`}>
                  <Icon name={s.icon} size={18} />
                  <span>
                    <CountUp value={s.value} format={s.format} />
                    {s.suffix}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
        {children}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {action(primary, "btn btn-primary btn-block")}
        {secondary && action(secondary, "btn btn-secondary btn-block")}
      </div>
    </div>
  );
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
