import type { ToneConfidence } from "@/lib/hanviet";

/**
 * Measured against the emitted dataset (see data/REPORT.md):
 *   high   96.2% of tone predictions correct
 *   low    77.3% — entering-tone syllables, where the rule formally breaks
 *          down but still lands right more often than not
 *   medium 40.6% — the rule genuinely disagrees with the real tone
 *
 * Note "low" outranks "medium" on accuracy: it flags a *category* (Hán-Việt
 * ending in -p/-t/-c/-ch) rather than a reliability score. The labels below
 * describe what each one actually means so the ordering isn't misread as a
 * single scale.
 */
const STYLES: Record<ToneConfidence, { cls: string; label: string; hint: string }> = {
  high: {
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    label: "tone follows",
    hint: "The Hán-Việt tone predicts the Mandarin tone here. Reliable about 96% of the time.",
  },
  medium: {
    cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    label: "tone differs",
    hint: "The Hán-Việt tone does not predict this one — learn the Mandarin tone directly.",
  },
  low: {
    cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    label: "entering tone",
    hint: "Hán-Việt ends in -p/-t/-c/-ch. Mandarin lost the entering tone and redistributed it, so the rule has no guarantee here — though it still lands right about 77% of the time.",
  },
};

export function ToneBadge({ confidence }: { confidence: ToneConfidence }) {
  const s = STYLES[confidence];
  return (
    <span
      title={s.hint}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
