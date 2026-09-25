"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, Loading, PageHeader } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { glossEn } from "@/lib/gloss";
import { mineWord } from "@/lib/mining";
import { planReading } from "@/lib/reader";
import { loadReadingLibrary, type ReadingLibrary } from "@/lib/readingLibrary";
import { playMined, unlockAudio } from "@/lib/sound";
import { speak } from "@/lib/speak";

export function ReadHub() {
  const [library, setLibrary] = useState<ReadingLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    loadReadingLibrary()
      .then((l) => !cancelled && setLibrary(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load reading"));
    return () => {
      cancelled = true;
    };
  }, []);

  const plan = useMemo(() => (library ? planReading(library.sentences, library.status) : null), [library]);

  const add = useCallback(async (wordId: string) => {
    unlockAudio();
    await mineWord(wordId);
    playMined();
    setAdded((a) => new Set(a).add(wordId));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!library || !plan) return <Loading label="Finding sentences you can read…" />;

  const available = plan.onePlus.length + plan.easy.length + plan.twoPlus.length;
  const unlockers = plan.unlockers.filter((u) => !library.mined.has(u.wordId)).slice(0, 8);

  return (
    <div className="flex flex-col pb-28">
      <PageHeader title="Read" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4">
        <section className="overflow-hidden rounded-3xl border-2 border-blue-lip/40 bg-blue text-white shadow-[0_4px_0_var(--blue-lip)]">
          <div className="flex items-center gap-3 p-5 pb-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-white/80">Real sentences</p>
              <h2 className="mt-1 text-2xl font-extrabold leading-tight">One new word at a time</h2>
              <p className="mt-1 text-sm font-semibold text-white/85">
                Every sentence uses words you&apos;ve studied, plus at most one you haven&apos;t. Tap any word.
              </p>
            </div>
            <Mascot mood="happy" size={84} className="shrink-0" />
          </div>
          <div className="grid grid-cols-2 gap-px bg-white/20">
            <div className="bg-blue px-5 py-3">
              <p className="text-2xl font-extrabold tabular-nums">{plan.onePlus.length.toLocaleString()}</p>
              <p className="text-xs font-bold text-white/80">with one new word</p>
            </div>
            <div className="bg-blue px-5 py-3">
              <p className="text-2xl font-extrabold tabular-nums">{plan.easy.length.toLocaleString()}</p>
              <p className="text-xs font-bold text-white/80">you can read now</p>
            </div>
          </div>
          <div className="p-4">
            {available > 0 ? (
              <Link href="/read/session" onClick={unlockAudio} className="btn btn-secondary btn-block !text-blue">
                Start reading
              </Link>
            ) : (
              <Link href="/review" className="btn btn-secondary btn-block !text-blue">
                Learn a few words first
              </Link>
            )}
          </div>
        </section>

        {unlockers.length > 0 && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-ink">Unlock more reading</h2>
              <p className="text-sm text-ink-2">
                Each word is the only new one in that many sentences. Add one and it&apos;s the next new word in your reviews.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {unlockers.map(({ wordId, sentences }) => {
                const w = library.words.get(wordId);
                if (!w) return null;
                const isAdded = added.has(wordId);
                return (
                  <li key={wordId} className="card flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => speak(w.simplified)}
                      aria-label={`Play ${w.simplified}`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span lang="zh-Hans" className="min-w-12 whitespace-nowrap text-center text-3xl text-ink">
                        {w.simplified}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-bold text-ink">
                          {w.pinyin}
                          {w.hanviet && <span className="ml-2 text-sm font-bold text-gold-ink">{w.hanviet}</span>}
                        </span>
                        <span className="truncate text-sm text-ink-2">{glossEn(w, 1)}</span>
                      </span>
                    </button>
                    <span className="shrink-0 rounded-full bg-blue-soft px-2.5 py-1 text-xs font-extrabold text-blue-ink">
                      +{sentences}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      {isAdded ? (
                        <motion.span
                          key="done"
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          className="grid size-10 shrink-0 place-items-center rounded-xl bg-green text-white"
                          aria-label="Added"
                        >
                          <Icon name="check" size={22} strokeWidth={3.5} />
                        </motion.span>
                      ) : (
                        <motion.button
                          key="add"
                          type="button"
                          onClick={() => void add(wordId)}
                          aria-label={`Add ${w.simplified} to reviews`}
                          className="btn btn-info btn-sm btn-icon size-10 shrink-0"
                        >
                          <Icon name="plus" size={22} strokeWidth={3.5} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-ink-3">
          {library.sentences.length.toLocaleString()} sentences from HSK {library.levels[0]}–
          {library.levels[library.levels.length - 1]}, from{" "}
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer" className="underline">
            Tatoeba
          </a>{" "}
          (CC BY 2.0 FR)
        </p>
      </div>
    </div>
  );
}
