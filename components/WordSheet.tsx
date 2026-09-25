"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import type { FalseFriend, Word } from "@/lib/hanviet";
import type { ReaderToken, WordStatus } from "@/lib/reader";
import { speak } from "@/lib/speak";
import { CognateHint } from "./CognateHint";

const STATUS_LABEL: Record<WordStatus, { label: string; cls: string }> = {
  new: { label: "New word", cls: "bg-sky-500/15 text-sky-300" },
  learning: { label: "Learning", cls: "bg-amber-500/15 text-amber-300" },
  known: { label: "Known", cls: "bg-emerald-500/15 text-emerald-300" },
};

/** First few senses only: CC-CEDICT lists a dozen for common words. */
function senses(gloss: string | null, n = 3): string {
  if (!gloss) return "";
  return gloss.split(/;\s*/).slice(0, n).join("; ");
}

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
  useEffect(() => {
    if (!token) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token, onClose]);

  return (
    <AnimatePresence>
      {token && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-label={`${token.text} details`}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-t-3xl border-t border-neutral-800 bg-neutral-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-neutral-700" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span lang="zh-Hans" className="text-4xl font-medium">
                  {token.text}
                </span>
                <span className="text-lg text-neutral-300">{token.pinyin}</span>
              </div>
              <button
                type="button"
                onClick={() => speak(token.text)}
                aria-label="Play pronunciation"
                className="rounded-full bg-neutral-800 px-4 py-2 text-sm active:bg-neutral-700"
              >
                ▶ Listen
              </button>
            </div>

            {token.free ? (
              <>
                <span className="self-start rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                  {token.free.kind === "name" ? "Name" : "Particle"} · not in the HSK deck
                </span>
                <p className="text-neutral-200">{token.free.gloss}</p>
              </>
            ) : word ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  {status && (
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_LABEL[status].cls}`}>
                      {STATUS_LABEL[status].label}
                    </span>
                  )}
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-400">
                    {word.level === "S" ? "Supplement" : `HSK ${word.level}`}
                  </span>
                  {word.simplified !== token.text && (
                    <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-400">
                      Dictionary form {word.simplified} · {word.pinyin}
                    </span>
                  )}
                </div>
                {word.enGloss && <p className="text-neutral-100">{senses(word.enGloss)}</p>}
                {word.viGloss && <p className="text-sm text-neutral-400">🇻🇳 {senses(word.viGloss)}</p>}
                <CognateHint word={word} falseFriend={falseFriend} />
                {status === "new" &&
                  (mined ? (
                    <p className="rounded-xl bg-emerald-950/50 px-4 py-3 text-center text-sm text-emerald-300">
                      Added. It comes up first in your next review.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={onMine}
                      className="rounded-xl bg-sky-600 px-4 py-3 font-medium text-white active:bg-sky-700"
                    >
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
