"use client";

import { LayoutGroup, motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { tileGloss } from "@/lib/gloss";
import { orderHintFor } from "@/lib/orderHints";
import type { Sentence, SentenceTile } from "@/lib/sentences";
import { playCorrect, playTilePlace, playTileRemove, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";
import { LookupLine, TappableSentence, type GlossFor } from "./WordLookup";

/** A tile plus a stable key, since the same word can appear twice in a sentence. */
interface Slot {
  key: string;
  tile: SentenceTile;
}

/** Deterministic shuffle is wrong here: the learner would memorise positions. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type TileResult = "correct" | "wrong";

const TILE_SPRING = { type: "spring", stiffness: 620, damping: 38, mass: 0.8 } as const;

/** A sentence tile's slot key, shared by the bank and the tappable correct answer. */
const tileKey = (i: number, tile: SentenceTile) => `${i}:${tile.text}`;

/** Tile height: the hanzi, plus a line each for pinyin and meaning when shown. */
const tileHeight = (pinyin: boolean, meaning: boolean) => 52 + (pinyin ? 10 : 0) + (meaning ? 16 : 0);

function TileFace({ tile, showPinyin, meaning }: { tile: SentenceTile; showPinyin: boolean; meaning?: string }) {
  return (
    <>
      {showPinyin && (
        <span className="mb-1 text-xs font-bold leading-none text-ink-3">{tile.pinyin || " "}</span>
      )}
      <span lang="zh-Hans" className="text-[1.625rem] leading-none">
        {tile.text}
      </span>
      {meaning !== undefined && (
        <span className="mt-1 max-w-[8.5rem] truncate text-[11px] font-bold leading-tight text-ink-3">
          {meaning || " "}
        </span>
      )}
    </>
  );
}

interface TileBuilderProps {
  sentence: Sentence;
  /** Short meaning for a tile: on every tile with `showMeaning`, and on tap after a wrong answer. */
  glossFor?: GlossFor;
  /** Wrong tiles mixed into the bank. */
  distractors?: SentenceTile[];
  /** Speak each tile as it is tapped, and the sentence once checked. */
  speech?: boolean;
  showPinyin?: boolean;
  /** Each tile's meaning under its word, before the answer is checked as well as after. */
  showMeaning?: boolean;
  /** Swap to typing this sentence instead; shown until the answer is checked. */
  onUseKeyboard?: () => void;
  onDone: (result: TileResult) => void;
}

/**
 * Word-tile ordering, laid out the way Duolingo does it: the answer builds on
 * ruled lines, and a picked tile leaves a grey ghost in the bank so the bank
 * never reflows under the thumb. Tiles fly between the two through a shared
 * layout id.
 */
export function TileBuilder({
  sentence,
  glossFor,
  distractors = [],
  speech = true,
  showPinyin = true,
  showMeaning = false,
  onUseKeyboard,
  onDone,
}: TileBuilderProps) {
  // Slots are built once per sentence and are the single source of identity
  // for both areas; the parent remounts on sentence change, so initialising
  // from useState is safe.
  const [bank] = useState<Slot[]>(() =>
    shuffle([
      ...sentence.tiles.map((tile, i) => ({ key: tileKey(i, tile), tile })),
      ...distractors.map((tile, i) => ({ key: `x${i}:${tile.text}`, tile })),
    ]),
  );
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState<TileResult | null>(null);
  // The slot looked up after a wrong answer.
  const [peek, setPeek] = useState<string | null>(null);
  const done = useRef(false);

  const byKey = useMemo(() => new Map(bank.map((s) => [s.key, s])), [bank]);
  const target = useMemo(() => sentence.tiles.map((t) => t.text), [sentence]);
  const answer = placed.map((k) => byKey.get(k)!.tile.text);

  const peeked = peek ? byKey.get(peek) : undefined;

  // Tap already means place or return, so meanings before checking come from
  // a toggle, as pinyin does, rather than a gesture.
  const meaningOn = showMeaning && glossFor !== undefined;
  const meaningOf = (tile: SentenceTile) => (meaningOn ? tileGloss(glossFor(tile) ?? "") : undefined);
  const tileH = tileHeight(showPinyin, meaningOn);
  const rowH = tileH + 10;

  const pick = useCallback(
    (slot: Slot) => {
      if (checked) return;
      // A fast double tap must not place the same tile twice.
      setPlaced((p) => (p.includes(slot.key) ? p : [...p, slot.key]));
      // Hearing the word as you place it ties sound to character; with
      // speech off, a rising note per tile stands in.
      if (speech) speak(slot.tile.text);
      else playTilePlace(placed.length);
    },
    [checked, speech, placed.length],
  );

  const unpick = useCallback(
    (slot: Slot) => {
      if (checked) return;
      playTileRemove();
      setPlaced((p) => p.filter((k) => k !== slot.key));
    },
    [checked],
  );

  /** After a wrong answer every tile is a lookup: the ones misplaced, and the ones never used. */
  const lookup = useCallback(
    (key: string, text: string) => {
      setPeek(key);
      if (speech) speak(text);
    },
    [speech],
  );

  const check = useCallback(() => {
    if (checked) return;
    const result: TileResult = answer.join("") === target.join("") ? "correct" : "wrong";
    setChecked(result);
    if (result === "correct") playCorrect();
    else playWrong();
    if (speech) speak(sentence.hanzi);
  }, [checked, answer, target, sentence.hanzi, speech]);

  const finish = () => {
    if (done.current || !checked) return;
    done.current = true;
    onDone(checked);
  };

  // A wrong answer that follows Vietnamese order gets the specific correction
  // for the mistake actually made. The tag set at build time is the fallback.
  const hint = useMemo(
    () => (checked === "wrong" ? orderHintFor(sentence, answer, answer.join("")) : null),
    [checked, sentence, answer],
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">Write this in Chinese</h2>

      <MascotBubble mood={checked === "wrong" ? "sad" : checked === "correct" ? "cheer" : "think"}>
        <p className="text-lg font-semibold leading-snug text-ink">{sentence.enGloss}</p>
      </MascotBubble>

      <LayoutGroup>
        <motion.div
          animate={checked === "wrong" ? { x: [0, -10, 10, -7, 7, -3, 0] } : { x: 0 }}
          transition={{ duration: 0.42 }}
          className="flex flex-wrap content-start gap-x-2 gap-y-[10px] pt-[5px]"
          style={{
            // Two rows of ruled lines, each just under a row of tiles.
            minHeight: rowH * 2 + 2,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${rowH - 2}px, var(--line) ${rowH - 2}px, var(--line) ${rowH}px)`,
          }}
          aria-label="Your answer"
        >
          {placed.map((key, i) => {
            const slot = byKey.get(key)!;
            return (
              <motion.button
                key={key}
                layoutId={key}
                type="button"
                onClick={() => (checked === "wrong" ? lookup(slot.key, slot.tile.text) : unpick(slot))}
                transition={TILE_SPRING}
                animate={
                  checked === "correct" ? { y: [0, -8, 0], transition: { delay: i * 0.035, duration: 0.35 } } : undefined
                }
                className={`tile px-3.5 ${checked === "correct" ? "tile-correct" : checked === "wrong" ? "tile-wrong" : ""}`}
                style={{ height: tileH }}
              >
                <TileFace tile={slot.tile} showPinyin={showPinyin} meaning={meaningOf(slot.tile)} />
              </motion.button>
            );
          })}
        </motion.div>

        <div className="flex flex-wrap justify-center gap-2" aria-label="Word bank">
          {bank.map((slot) =>
            placed.includes(slot.key) ? (
              // The ghost keeps the slot's size by rendering the face invisibly.
              <span
                key={slot.key}
                aria-hidden
                className="inline-flex flex-col items-center justify-center rounded-[0.9rem] bg-surface-3 px-3.5 [&>*]:invisible"
                style={{ height: tileH }}
              >
                <TileFace tile={slot.tile} showPinyin={showPinyin} meaning={meaningOf(slot.tile)} />
              </span>
            ) : (
              <motion.button
                key={slot.key}
                layoutId={slot.key}
                type="button"
                onClick={() => (checked === "wrong" ? lookup(slot.key, slot.tile.text) : pick(slot))}
                disabled={checked === "correct"}
                transition={TILE_SPRING}
                className="tile px-3.5"
                style={{ height: tileH }}
              >
                <TileFace tile={slot.tile} showPinyin={showPinyin} meaning={meaningOf(slot.tile)} />
              </motion.button>
            ),
          )}
        </div>
      </LayoutGroup>

      {onUseKeyboard && checked === null && (
        <button type="button" onClick={onUseKeyboard} className="btn btn-ghost btn-sm self-center">
          <Icon name="keyboard" size={18} />
          Type it instead
        </button>
      )}

      <SessionFooter>
        <ActionBar
          tone={checked === null ? "idle" : checked}
          title={checked === "correct" ? "Nicely done!" : checked === "wrong" ? "Correct answer:" : undefined}
          actions={
            checked === null ? (
              <button type="button" className="btn btn-primary btn-block" disabled={placed.length === 0} onClick={check}>
                Check
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-block ${checked === "correct" ? "btn-primary" : "btn-danger"}`}
                onClick={finish}
                autoFocus
              >
                Continue
              </button>
            )
          }
        >
          {checked && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {checked === "wrong" &&
                  (glossFor ? (
                    <TappableSentence
                      hanzi={sentence.hanzi}
                      tiles={sentence.tiles}
                      selected={sentence.tiles.findIndex((t, i) => tileKey(i, t) === peek)}
                      onTap={(i) => lookup(tileKey(i, sentence.tiles[i]), sentence.tiles[i].text)}
                    />
                  ) : (
                    <p lang="zh-Hans" className="text-2xl text-ink">
                      {sentence.hanzi}
                    </p>
                  ))}
                <p className="font-bold">{sentence.pinyin}</p>
                {sentence.viGloss && <p className="text-sm font-semibold opacity-80">🇻🇳 {sentence.viGloss}</p>}
                {hint && (
                  <p className="mt-2 flex gap-2 rounded-xl bg-surface/80 px-3 py-2 text-sm font-semibold text-ink">
                    <Icon name="lightbulb" size={18} className="mt-0.5 shrink-0 text-gold" />
                    <span>
                      {hint.note}{" "}
                      <span lang="zh-Hans" className="whitespace-nowrap text-base font-bold text-green-ink">
                        {hint.chinese}
                      </span>
                    </span>
                  </p>
                )}
                {checked === "wrong" && glossFor && (
                  <div className="mt-2">
                    <LookupLine
                      tile={peeked?.tile ?? null}
                      glossFor={glossFor}
                      showPinyin
                      placeholder="Tap any word or tile to see what it means."
                      onPanel
                    />
                  </div>
                )}
              </div>
              <SpeakButton onClick={() => speak(sentence.hanzi)} size="sm" label="Replay sentence" />
            </div>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
