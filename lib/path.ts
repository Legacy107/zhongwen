/**
 * The learning path on the home screen: a level's words cut into units, in
 * the order new cards actually arrive (see lib/intake.ts), so the path is a
 * picture of the review queue rather than a separate curriculum.
 *
 * A unit is done once every word in it has been studied at least once. That is
 * a deliberately low bar: "known" (every card graduated) takes weeks, and a
 * path that never moves is no motivation at all. The Progress screen carries
 * the stricter measure.
 */
import type { Word } from './hanviet';
import type { WordStatus } from './reader';

export const UNIT_SIZE = 15;

export type UnitState = 'done' | 'current' | 'locked';

export interface PathUnit {
  /** 0-based within the level. */
  index: number;
  wordIds: string[];
  started: number;
  known: number;
  state: UnitState;
}

export interface LevelPath {
  level: string;
  units: PathUnit[];
  /** Index of the current unit, or units.length when the level is finished. */
  current: number;
}

const levelOf = (w: Word) => (w.level === 'S' ? '1' : w.level);

export function buildPath(
  words: Map<string, Word>,
  frequency: Record<string, number>,
  status: Map<string, WordStatus>,
  level: string,
  unitSize = UNIT_SIZE,
): LevelPath {
  const ids = [...words.values()]
    .filter((w) => levelOf(w) === level)
    .map((w) => w.id)
    .sort((a, b) => (frequency[b] ?? 0) - (frequency[a] ?? 0) || a.localeCompare(b));

  const units: PathUnit[] = [];
  for (let i = 0; i < ids.length; i += unitSize) {
    const wordIds = ids.slice(i, i + unitSize);
    let started = 0;
    let known = 0;
    for (const id of wordIds) {
      const s = status.get(id) ?? 'new';
      if (s !== 'new') started++;
      if (s === 'known') known++;
    }
    units.push({ index: units.length, wordIds, started, known, state: 'locked' });
  }

  let current = units.findIndex((u) => u.started < u.wordIds.length);
  if (current === -1) current = units.length;
  for (const u of units) u.state = u.index < current ? 'done' : u.index === current ? 'current' : 'locked';
  return { level, units, current };
}

/** The slice of the path worth drawing: one finished unit for context, then what's ahead. */
export function pathWindow(path: LevelPath, before = 1, after = 4): PathUnit[] {
  const from = Math.max(0, path.current - before);
  return path.units.slice(from, Math.min(path.units.length, path.current + after + 1));
}
