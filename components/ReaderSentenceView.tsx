"use client";

import type { ReaderSentence, ReaderToken, WordStatus } from "@/lib/reader";

interface ReaderSentenceViewProps {
  sentence: ReaderSentence;
  status: Map<string, WordStatus>;
  /** Words mined this session or before; still unlearned but no longer "new" to the eye. */
  mined: Set<string>;
  showPinyin: boolean;
  selected?: number | null;
  onTap: (token: ReaderToken, index: number) => void;
}

/**
 * A sentence as tappable words, pinyin above each one (ruby-style).
 *
 * Every word is a button, known or not: the plan's reader is "tap any word",
 * and a learner rereading a half-remembered word should not have to guess
 * whether it is tappable. Colour carries the status instead.
 */
export function ReaderSentenceView({
  sentence,
  status,
  mined,
  showPinyin,
  selected,
  onTap,
}: ReaderSentenceViewProps) {
  return (
    <p lang="zh-Hans" className="flex flex-wrap items-end justify-center gap-x-1 gap-y-3">
      {sentence.tokens.map((token, i) => {
        const tappable = Boolean(token.wordId || token.free);
        if (!tappable) {
          return (
            <span key={i} className="flex flex-col items-center">
              {showPinyin && <span className="text-xs leading-tight text-transparent">·</span>}
              <span className="text-3xl leading-tight text-neutral-400">{token.text}</span>
            </span>
          );
        }
        const s = token.wordId ? (status.get(token.wordId) ?? "new") : "known";
        const isNew = s === "new" && !mined.has(token.wordId ?? "");
        const tone = token.free
          ? "text-neutral-200"
          : isNew
            ? "text-sky-300 underline decoration-sky-400/70 decoration-2 underline-offset-8"
            : s === "new"
              ? "text-violet-300 underline decoration-violet-400/60 decoration-dotted underline-offset-8"
              : s === "learning"
                ? "text-neutral-100 underline decoration-neutral-600 decoration-dotted underline-offset-8"
                : "text-neutral-100";
        return (
          <button
            key={i}
            type="button"
            onClick={() => onTap(token, i)}
            className={`flex flex-col items-center rounded-lg px-0.5 transition-colors ${
              selected === i ? "bg-neutral-800" : "active:bg-neutral-800/70"
            }`}
          >
            {showPinyin && (
              <span className={`text-xs leading-tight ${isNew ? "text-sky-400" : "text-neutral-500"}`}>
                {token.pinyin}
              </span>
            )}
            <span className={`text-3xl leading-tight ${tone}`}>{token.text}</span>
          </button>
        );
      })}
    </p>
  );
}
