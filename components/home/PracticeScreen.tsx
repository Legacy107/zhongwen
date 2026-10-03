"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/Controls";
import { Icon, type IconName } from "@/components/ui/Icon";
import { loadFalseFriends, loadWords } from "@/lib/data";
import { db } from "@/lib/db/local";
import { drillableCards } from "@/lib/intake";
import { unlockAudio } from "@/lib/sound";
import { State } from "@/lib/srs";

interface Counts {
  words: number;
  sentences: number;
}

async function readCounts(): Promise<Counts> {
  const [words, falseFriends, cards] = await Promise.all([loadWords(), loadFalseFriends(), db.cards.toArray()]);
  const now = Date.now();
  const due = drillableCards(cards, words, falseFriends).filter(
    (c) => c.state !== State.New && !c.suspended && c.due.getTime() <= now,
  );
  return {
    words: due.filter((c) => c.cardType !== "sentence").length,
    sentences: due.filter((c) => c.cardType === "sentence").length,
  };
}

function Option({ href, icon, title, detail }: { href: string; icon: IconName; title: string; detail: string }) {
  return (
    <Link
      href={href}
      onClick={unlockAudio}
      className="card card-raised flex items-center gap-4 px-4 py-4 transition-transform active:translate-y-1 active:shadow-none"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-purple text-white shadow-[0_4px_0_var(--purple-lip)]">
        <Icon name={icon} size={26} strokeWidth={2.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-ink">{title}</span>
        <span className="block text-sm font-semibold text-ink-3">{detail}</span>
      </span>
      <Icon name="chevronRight" size={22} className="text-ink-3" />
    </Link>
  );
}

/**
 * Catching up outside lessons: the old flashcard review and sentence
 * building, for a backlog a few lessons' warm-ups would take too long to clear.
 */
export function PracticeScreen() {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    let cancelled = false;
    readCounts()
      .then((c) => !cancelled && setCounts(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col pb-10">
      <PageHeader title="Practice" back="/" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4">
        <p className="px-1 text-sm font-semibold text-ink-3">
          Lessons already review what&apos;s due. These are for catching up when a lot has piled up.
        </p>
        <Option
          href="/review"
          icon="cards"
          title="Review words"
          detail={counts ? (counts.words ? `${counts.words} due now` : "Nothing due right now") : "Flashcards"}
        />
        <Option
          href="/build"
          icon="blocks"
          title="Build sentences"
          detail={counts ? (counts.sentences ? `${counts.sentences} due now` : "Practise your saved sentences") : "From tiles"}
        />
        <Option href="/tones" icon="wave" title="Tone drills" detail="Hear the difference between tones" />
      </div>
    </div>
  );
}
