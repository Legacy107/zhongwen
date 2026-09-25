"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { glossVi } from "@/lib/gloss";
import { isEnteringTone, normalizeVietnamese, stripTones, type FalseFriend, type Word } from "@/lib/hanviet";

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
function claim(word: Word): { lead: string; strong: boolean } | null {
  if (!word.viGloss) return null;
  switch (word.cognateMatch) {
    case "exact":
      return { lead: "You already know this", strong: true };
    case "toneVariant":
      return { lead: "Close to Vietnamese", strong: false };
    case "contained":
      return { lead: "Related to Vietnamese", strong: false };
    default:
      return null;
  }
}

/** The Vietnamese sense the cognate match was made on, rather than whichever sense happens to come first. */
function matchingSense(word: Word): string {
  const senses = (word.viGloss ?? "").split(/[;/]/).map((s) => s.trim()).filter(Boolean);
  const target = normalizeVietnamese(word.hanviet ?? "");
  const bare = stripTones(target);
  const hit =
    senses.find((s) => normalizeVietnamese(s) === target) ??
    senses.find((s) => stripTones(normalizeVietnamese(s)) === bare) ??
    senses.find((s) => ` ${normalizeVietnamese(s)} `.includes(` ${target} `));
  const sense = hit ?? senses[0] ?? "";
  // CVDICT marks bound forms with a hyphen ("bất-"): say so instead of showing it.
  return /^-|-$/.test(sense) ? `${sense.replace(/^-|-$/g, "")} (in compounds)` : sense;
}

type BadgeKind = "follows" | "differs" | "entering" | "neutral";

/**
 * Measured against the emitted dataset (see data/REPORT.md): the rule is right
 * 96.2% of the time when it "follows", 40.6% when it "differs", and 77.3% on
 * entering-tone syllables. A word whose tones are all neutral (了 le) has
 * nothing to predict, which the data model also files under "low", so it gets
 * its own label instead of being called an entering tone.
 */
function badgeKind(word: Word): BadgeKind {
  if (word.toneConfidence === "high") return "follows";
  if (word.toneConfidence === "medium") return "differs";
  if (word.hanviet && isEnteringTone(word.hanviet)) return "entering";
  return "neutral";
}

const BADGE: Record<BadgeKind, { label: string; cls: string; why: string }> = {
  follows: {
    label: "Tone follows",
    cls: "bg-green-soft text-green-ink",
    why: "The Hán-Việt tone predicts the Mandarin one here: ngang → 1, huyền → 2, hỏi/ngã → 3, sắc/nặng → 4. Right about 96% of the time.",
  },
  differs: {
    label: "Tone differs",
    cls: "bg-red-soft text-red-ink",
    why: "The Hán-Việt tone points the wrong way for this word. Learn the Mandarin tone on its own.",
  },
  entering: {
    label: "Entering tone",
    cls: "bg-surface-3 text-ink-2",
    why: "The Hán-Việt ends in -p, -t, -c or -ch. Mandarin lost that tone class and scattered it, so the rule isn't guaranteed, though it still lands about 77% of the time.",
  },
  neutral: {
    label: "Neutral tone",
    cls: "bg-surface-3 text-ink-2",
    why: "Said light and short, with no tone of its own, so the Hán-Việt tone has nothing to predict.",
  },
};

export function ToneBadge({ word }: { word: Word }) {
  const [open, setOpen] = useState(false);
  const b = BADGE[badgeKind(word)];
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-bold ${b.cls}`}
      >
        {b.label}
        <Icon name="info" size={14} strokeWidth={2.5} />
      </button>
      {open && <span className="max-w-60 text-right text-xs font-semibold text-ink-2">{b.why}</span>}
    </span>
  );
}

/**
 * The bridge: the Sino-Vietnamese reading, so a Vietnamese speaker can
 * recognise vocabulary they already half-know. A false friend overrides the
 * cognate framing entirely: asserting a cognate that has drifted is worse than
 * showing no hint at all. It is purple, not red: it is a warning about the
 * word, never a verdict on the answer.
 */
export function CognateHint({
  word,
  falseFriend,
  showVi = true,
}: {
  word: Word;
  falseFriend?: FalseFriend;
  /** Off where the Vietnamese gloss is already on screen, so it is not shown twice. */
  showVi?: boolean;
}) {
  if (falseFriend) {
    return (
      <div className="rounded-2xl border-2 border-purple/40 bg-purple-soft p-4">
        <p className="flex items-center gap-2 font-extrabold text-purple-ink">
          <Icon name="alert" size={20} />
          Watch out: false friend
        </p>
        <p className="mt-1.5 text-ink">
          <span className="font-bold">{falseFriend.hanviet}</span> means{" "}
          <span className="italic">{falseFriend.vietnameseMeaning}</span> in Vietnamese, but{" "}
          <span lang="zh-Hans">{word.simplified}</span> means{" "}
          <span className="font-bold">{falseFriend.mandarinMeaning}</span> in Mandarin.
        </p>
        {falseFriend.note ? <p className="mt-1.5 text-sm text-ink-2">{falseFriend.note}</p> : null}
      </div>
    );
  }

  if (!word.hanviet) return null;
  const c = claim(word);

  return (
    <div className="rounded-2xl border-2 border-gold/50 bg-gold-soft p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-gold-ink">Hán-Việt</span>
          <p className="text-2xl font-extrabold text-gold-ink">{word.hanviet}</p>
        </div>
        <ToneBadge word={word} />
      </div>
      {c ? (
        <p className={c.strong ? "text-ink" : "text-ink-2"}>
          {c.lead}: <span className="font-bold">{matchingSense(word)}</span>
        </p>
      ) : showVi && glossVi(word, 2) ? (
        <p className="text-ink-2">🇻🇳 {glossVi(word, 2)}</p>
      ) : null}
    </div>
  );
}
