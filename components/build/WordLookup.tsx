"use client";

import type { SentenceTile } from "@/lib/sentences";

/** A tile's short meaning, or undefined when the deck has none. */
export type GlossFor = (tile: SentenceTile) => string | undefined;

/**
 * The answer to "what does this word mean?": the word tapped and its meaning,
 * or a placeholder saying how to ask. It keeps its height either way, so
 * tapping words never moves the layout.
 */
export function LookupLine({
  tile,
  glossFor,
  showPinyin,
  placeholder,
  onPanel = false,
}: {
  tile: SentenceTile | null;
  glossFor: GlossFor;
  showPinyin: boolean;
  placeholder?: string;
  /** Inside a coloured result panel rather than on the page. */
  onPanel?: boolean;
}) {
  const gloss = tile ? glossFor(tile) : undefined;
  if (!tile && !placeholder) return null;
  return (
    <p className={`flex min-h-8 items-center ${onPanel ? "" : "justify-center text-center"}`} aria-live="polite">
      {tile ? (
        <span
          className={`rounded-xl px-3 py-1.5 text-sm font-bold ${onPanel ? "bg-surface/80 text-ink" : "bg-ink text-bg"}`}
        >
          <span lang="zh-Hans" className="text-base">
            {tile.text}
          </span>
          {/* Pinyin stands in for a meaning the deck lacks, rather than show the word alone. */}
          {(showPinyin || !gloss) && tile.pinyin ? ` ${tile.pinyin}` : ""}
          {gloss ? ` · ${gloss}` : ""}
        </span>
      ) : (
        <span className={`text-xs font-bold ${onPanel ? "opacity-80" : "text-ink-3"}`}>{placeholder}</span>
      )}
    </p>
  );
}

/**
 * A sentence with each word tappable, underlined with dots the way Duolingo
 * marks the words that have hints. Punctuation is kept as text, held against
 * the word before it, since a gap before 。 or ， reads as a stray mark.
 */
export function TappableSentence({
  hanzi,
  tiles,
  selected,
  onTap,
}: {
  hanzi: string;
  tiles: SentenceTile[];
  /** Index into `tiles` of the word being looked up. */
  selected: number | null;
  onTap: (index: number) => void;
}) {
  const words: Array<{ tile: SentenceTile; index: number; trail: string }> = [];
  let lead = "";
  let pos = 0;
  tiles.forEach((tile, index) => {
    const at = hanzi.indexOf(tile.text, pos);
    if (at > pos) {
      const between = hanzi.slice(pos, at);
      if (words.length) words[words.length - 1].trail += between;
      else lead += between;
    }
    words.push({ tile, index, trail: "" });
    if (at !== -1) pos = at + tile.text.length;
  });
  if (pos < hanzi.length && words.length) words[words.length - 1].trail += hanzi.slice(pos);

  return (
    <p lang="zh-Hans" className="flex flex-wrap items-baseline gap-x-1 text-2xl text-ink">
      {lead && <span>{lead}</span>}
      {words.map(({ tile, index, trail }) => (
        <span key={`${index}:${tile.text}`} className="inline-flex items-baseline">
          <button
            type="button"
            onClick={() => onTap(index)}
            className={`rounded-md px-0.5 underline decoration-current/40 decoration-dotted decoration-2 underline-offset-[6px] ${
              selected === index ? "bg-surface/80" : ""
            }`}
          >
            {tile.text}
          </button>
          {trail && <span>{trail}</span>}
        </span>
      ))}
    </p>
  );
}
