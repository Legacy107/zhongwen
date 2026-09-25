"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { CognateHint } from "@/components/review/CognateHint";
import { SpeakButton } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { glossEn, glossVi } from "@/lib/gloss";
import type { FalseFriend, Word } from "@/lib/hanviet";
import type { ReaderToken, WordStatus } from "@/lib/reader";
import { speak } from "@/lib/speak";

const STATUS_LABEL: Record<WordStatus, { label: string; cls: string }> = {
  new: { label: "New word", cls: "bg-blue-soft text-blue-ink" },
  learning: { label: "Learning", cls: "bg-gold-soft text-gold-ink" },
  known: { label: "Known", cls: "bg-green-soft text-green-ink" },
};

interface WordSheetProps {
  token: ReaderToken | null;
  word?: Word;
  status?: WordStatus;
  mined: boolean;
  falseFriend?: FalseFriend;
  onMine: () => void;
  onClose: () => void;
}

/**
 * The popup gloss for a tapped word, as a bottom sheet: thumb-reachable on a
 * phone, and it leaves the sentence visible above it.
 */
export function WordSheet({ token, word, status, mined, falseFriend, onMine, onClose }: WordSheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const open = token !== null;

  // Modal while open: Escape closes it, focus moves in (and back out after),
  // and the page behind stops scrolling under the thumb.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {token && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            ref={sheet}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`${token.text} details`}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] max-w-xl flex-col gap-4 overflow-y-auto rounded-t-[1.75rem] border-2 border-b-0 border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
          >
            <div className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-line-strong" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span lang="zh-Hans" className="text-5xl font-medium leading-tight text-ink">
                  {token.text}
                </span>
                <span className="text-xl font-bold text-ink-2">{token.pinyin}</span>
              </div>
              <SpeakButton onClick={() => speak(token.text)} size="md" label="Play pronunciation" />
            </div>

            {token.free ? (
              <>
                <span className="self-start rounded-full bg-surface-3 px-3 py-1 text-xs font-bold text-ink-2">
                  {token.free.kind === "name" ? "Name" : "Particle"} · not in the HSK deck
                </span>
                <p className="text-lg text-ink">{token.free.gloss}</p>
              </>
            ) : word ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  {status && (
                    <span className={`rounded-full px-3 py-1 ${STATUS_LABEL[status].cls}`}>{STATUS_LABEL[status].label}</span>
                  )}
                  <span className="rounded-full bg-surface-3 px-3 py-1 text-ink-2">
                    {word.level === "S" ? "Supplement" : `HSK ${word.level}`}
                  </span>
                  {word.simplified !== token.text && (
                    <span className="rounded-full bg-surface-3 px-3 py-1 text-ink-2">
                      Dictionary form <span lang="zh-Hans">{word.simplified}</span> · {word.pinyin}
                    </span>
                  )}
                </div>
                {glossEn(word) && <p className="text-lg font-semibold text-ink">{glossEn(word)}</p>}
                {glossVi(word) && <p className="text-ink-2">🇻🇳 {glossVi(word)}</p>}
                <CognateHint word={word} falseFriend={falseFriend} showVi={false} />
                {status === "new" &&
                  (mined ? (
                    <p className="flex items-center justify-center gap-2 rounded-2xl bg-green-soft px-4 py-3 font-bold text-green-ink">
                      <Icon name="check" size={20} strokeWidth={3} />
                      Added. It&apos;s the next new word in your reviews.
                    </p>
                  ) : (
                    <button type="button" onClick={onMine} className="btn btn-info btn-block">
                      <Icon name="plus" size={20} strokeWidth={3} />
                      Add to reviews
                    </button>
                  ))}
              </>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
