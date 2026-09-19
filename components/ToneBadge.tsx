import type { ToneConfidence } from "@/lib/hanviet";

const STYLES: Record<ToneConfidence, { cls: string; label: string; hint: string }> = {
  high: {
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    label: "reliable",
    hint: "The Hán-Việt tone rule predicts this tone correctly.",
  },
  medium: {
    cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    label: "check tone",
    hint: "The Hán-Việt tone rule misses here — learn the tone directly.",
  },
  low: {
    cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    label: "entering tone",
    hint: "Hán-Việt ends in -p/-t/-c/-ch. Mandarin lost the entering tone and redistributed it unpredictably, so the rule does not apply.",
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
