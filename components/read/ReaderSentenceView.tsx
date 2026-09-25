"use client";

import type { ReaderSentence, ReaderToken, WordStatus } from "@/lib/reader";

interface ReaderSentenceViewProps {
  sentence: ReaderSentence;
  status: Map<string, WordStatus>;
  /** Words already added to reviews: still unlearned, but no longer "new" to the eye. */
  mined: Set<string>;
  showPinyin: boolean;
  selected?: number | null;
  onTap: (token: ReaderToken, index: number) => void;
}

/**
 * A sentence as tappable words, pinyin above each (ruby-style).
 *
 * Every word is a button, known or not: the reader is "tap any word", and a
 * learner rereading a half-remembered word should not have to guess whether
 * it is tappable. Colour carries the status: blue for the new word, a dotted
 * underline for words still being learned.
 */
export function ReaderSentenceView({ sentence, status, mined, showPinyin, selected, onTap }: ReaderSentenceViewProps) {
  return (
    <p lang="zh-Hans" className="flex flex-wrap items-end justify-center gap-x-0.5 gap-y-4">
      {sentence.tokens.map((token, i) => {
        const tappable = Boolean(token.wordId || token.free);
        if (!tappable) {
          return (
            <span key={i} className="flex flex-col items-center">
              {showPinyin && <span className="text-sm leading-tight text-transparent">·</span>}
              <span className="text-4xl leading-tight text-ink-3">{token.text}</span>
            </span>
          );
        }
        const s = token.wordId ? (status.get(token.wordId) ?? "new") : "known";
        const fresh = s === "new" && !mined.has(token.wordId ?? "");
        const face = token.free
          ? "text-ink"
          : fresh
            ? "bg-blue-soft text-blue-ink"
            : s === "new"
              ? "bg-purple-soft text-purple-ink"
              : "text-ink";
        const underline =
          !token.free && s === "learning" ? "underline decoration-line-strong decoration-dotted decoration-2 underline-offset-[10px]" : "";
        return (
          <button
            key={i}
            type="button"
            onClick={() => onTap(token, i)}
            className={`flex flex-col items-center rounded-xl px-1 pb-0.5 transition-transform active:scale-95 ${face} ${
              selected === i ? "ring-2 ring-blue" : ""
            }`}
          >
            {showPinyin && (
              <span className={`text-sm font-semibold leading-tight ${fresh ? "text-blue-ink" : "text-ink-3"}`}>
                {token.pinyin}
              </span>
            )}
            <span className={`text-4xl leading-tight ${underline}`}>{token.text}</span>
          </button>
        );
      })}
    </p>
  );
}
