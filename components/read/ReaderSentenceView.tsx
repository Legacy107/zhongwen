"use client";

import type { ReaderSentence, ReaderToken, WordStatus } from "@/lib/reader";

type Mark = "new" | "added" | "learning";

/** How a token is marked, or null for known words, names, particles and punctuation. */
function markOf(token: ReaderToken, status: Map<string, WordStatus>, mined: Set<string>): Mark | null {
  if (!token.wordId) return null;
  const s = status.get(token.wordId) ?? "new";
  if (s === "new") return mined.has(token.wordId) ? "added" : "new";
  return s === "learning" ? "learning" : null;
}

/**
 * A key to the marks, listing only the ones this sentence uses, so there is
 * never an unexplained colour and never a legend entry with nothing to match.
 */
export function ReaderLegend({ sentence, status, mined }: Pick<ReaderSentenceViewProps, "sentence" | "status" | "mined">) {
  const present = new Set(sentence.tokens.map((t) => markOf(t, status, mined)).filter(Boolean) as Mark[]);
  if (present.size === 0) return null;
  const items: Array<{ mark: Mark; label: string; swatch: string }> = [
    { mark: "new", label: "new", swatch: "rounded bg-blue-soft ring-2 ring-blue/50" },
    { mark: "added", label: "added to reviews", swatch: "rounded bg-purple-soft ring-2 ring-purple/50" },
    { mark: "learning", label: "still learning", swatch: "border-b-2 border-dotted border-line-strong" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold text-ink-3">
      {items
        .filter((i) => present.has(i.mark))
        .map((i) => (
          <span key={i.mark} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-4 ${i.swatch}`} aria-hidden />
            {i.label}
          </span>
        ))}
    </div>
  );
}

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
          // Closing marks hug the word before them, opening marks the word after.
          const hug = /^[。，！？、；：”’）》…]/.test(token.text) ? "-ml-1.5" : /^[“‘（《]/.test(token.text) ? "-mr-1.5" : "";
          return (
            <span key={i} className={`flex flex-col items-center ${hug}`}>
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
