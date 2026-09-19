import type { FalseFriend, Word } from "@/lib/hanviet";
import { ToneBadge } from "./ToneBadge";

/**
 * How strongly we can claim the Vietnamese word is "the same word".
 *
 * These tiers are not interchangeable. An exact match is a word the learner
 * already knows; a tone variant differs by a diacritic, and Vietnamese tone is
 * phonemic, so a few of those are genuinely different morphemes (字 tự vs từ).
 * A contained match means the reading appears inside a longer Vietnamese
 * phrase. Overclaiming here is the same failure mode as a false friend, so
 * each tier gets its own wording.
 */
function claim(word: Word): { lead: string; tone: "strong" | "soft" } | null {
  if (!word.viGloss) return null;
  switch (word.cognateMatch) {
    case "exact":
      return { lead: "You already know this", tone: "strong" };
    case "toneVariant":
      return { lead: "Close to Vietnamese", tone: "soft" };
    case "contained":
      return { lead: "Related to Vietnamese", tone: "soft" };
    default:
      return null;
  }
}

/**
 * The bridge: shows the Sino-Vietnamese reading so a Vietnamese speaker can
 * recognise vocabulary they already half-know. A false friend overrides the
 * cognate framing entirely — asserting a cognate that has drifted is worse
 * than showing no hint at all.
 */
export function CognateHint({ word, falseFriend }: { word: Word; falseFriend?: FalseFriend }) {
  if (falseFriend) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm">
        <p className="font-medium text-rose-300">False friend — don&apos;t trust the Hán-Việt</p>
        <p className="mt-1 text-neutral-300">
          <span className="font-medium">{falseFriend.hanviet}</span> means{" "}
          <span className="italic">{falseFriend.vietnameseMeaning}</span> in Vietnamese, but{" "}
          {word.simplified} means <span className="font-medium">{falseFriend.mandarinMeaning}</span>{" "}
          in Mandarin.
        </p>
        {falseFriend.note ? <p className="mt-1 text-xs text-neutral-400">{falseFriend.note}</p> : null}
      </div>
    );
  }

  if (!word.hanviet) return null;

  const c = claim(word);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Hán-Việt</span>
        <ToneBadge confidence={word.toneConfidence} />
      </div>
      <p className="mt-1 text-lg font-medium text-amber-300">{word.hanviet}</p>
      {c ? (
        <p className={`mt-1 ${c.tone === "strong" ? "text-neutral-300" : "text-neutral-400"}`}>
          {c.lead}: <span className="italic">{word.viGloss}</span>
        </p>
      ) : word.viGloss ? (
        <p className="mt-1 text-neutral-400">{word.viGloss}</p>
      ) : null}
    </div>
  );
}
