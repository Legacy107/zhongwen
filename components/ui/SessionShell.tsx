"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { ProgressBar } from "./ProgressBar";

/**
 * Where a card renders its bottom bar. A card owns its CHECK/CONTINUE state,
 * but the bar lives outside the scrolling content, full width, pinned to the
 * bottom edge; a portal lets the card render there while the shell (and its
 * animated progress bar) stays mounted across cards.
 */
const FooterSlot = createContext<HTMLElement | null>(null);

export function SessionFooter({ children }: { children: ReactNode }) {
  const slot = useContext(FooterSlot);
  return slot ? createPortal(children, slot) : null;
}

interface SessionShellProps {
  /** 0..1 */
  progress: number;
  /** Consecutive correct answers; a badge appears from 3. */
  combo?: number;
  /** Right side of the top bar, e.g. a sound toggle. */
  actions?: ReactNode;
  children: ReactNode;
  exitHref?: string;
}

/**
 * Full-screen frame for a practice session: a close button, the session's
 * progress, and the content, with the primary action pinned to the bottom
 * within thumb reach. No tab bar here, on purpose: a session is a focused
 * mode you leave with the X.
 */
export function SessionShell({
  progress,
  combo = 0,
  actions,
  children,
  exitHref = "/",
}: SessionShellProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 bg-bg/95 pt-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pb-2">
          <Link
            href={exitHref}
            aria-label="Close and go home"
            className="-ml-2 grid size-11 place-items-center rounded-xl text-ink-3 transition-colors hover:text-ink-2 active:bg-surface-2"
          >
            <Icon name="x" size={26} strokeWidth={3} />
          </Link>
          <div className="relative flex-1">
            <ProgressBar value={progress} label="Session progress" />
            <AnimatePresence>
              {combo >= 3 && (
                <motion.span
                  key={combo >= 10 ? "10" : combo >= 5 ? "5" : "3"}
                  initial={{ opacity: 0, y: 6, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="absolute -top-6 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-xs font-extrabold uppercase tracking-wider text-orange"
                >
                  <Icon name="bolt" size={14} />
                  {combo} in a row
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {actions}
        </div>
      </header>

      <FooterSlot.Provider value={slot}>
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-6 pt-4">{children}</main>
      </FooterSlot.Provider>

      <div ref={setSlot} className="sticky bottom-0 z-30" />
    </div>
  );
}

type Tone = "idle" | "correct" | "wrong" | "almost" | "info";

const TONE_STYLE: Record<Exclude<Tone, "idle">, { panel: string; title: string; badge: string; icon: "check" | "x" | "info" | "alert" }> = {
  correct: { panel: "bg-green-soft", title: "text-green-ink", badge: "bg-green text-white", icon: "check" },
  wrong: { panel: "bg-red-soft", title: "text-red-ink", badge: "bg-red text-white", icon: "x" },
  almost: { panel: "bg-gold-soft", title: "text-gold-ink", badge: "bg-gold text-white", icon: "alert" },
  info: { panel: "bg-surface-2", title: "text-ink", badge: "bg-blue text-white", icon: "info" },
};

interface ActionBarProps {
  tone: Tone;
  title?: string;
  children?: ReactNode;
  /** Buttons along the bottom edge. */
  actions: ReactNode;
}

/**
 * The bottom bar. Idle it holds the CHECK button above a hairline; once an
 * answer is in it becomes the coloured result panel, sliding its content up
 * from the bottom edge.
 */
export function ActionBar({ tone, title, children, actions }: ActionBarProps) {
  const style = tone === "idle" ? null : TONE_STYLE[tone];
  return (
    <div
      className={`border-t-2 transition-colors duration-200 ${
        style ? `${style.panel} border-transparent` : "border-line bg-bg"
      }`}
    >
      <div className="mx-auto w-full max-w-xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {style && (
            <motion.div
              key={`${tone}:${title}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="mb-4 flex items-start gap-3"
              role="status"
              aria-live="polite"
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${style.badge}`}>
                <Icon name={style.icon} size={20} strokeWidth={3.5} />
              </span>
              <div className="min-w-0 flex-1">
                {title && <p className={`text-xl font-extrabold ${style.title}`}>{title}</p>}
                {children && <div className={`mt-0.5 ${style.title}`}>{children}</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-3">{actions}</div>
      </div>
    </div>
  );
}
