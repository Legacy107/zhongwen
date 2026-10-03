/**
 * Practice that is not an SRS review: tone drills answered, sentences read,
 * and lessons finished, the unit the daily goal is now counted in.
 *
 * Stored in the synced settings table under one key per day per device, so
 * two devices on the same day never overwrite each other's counts (settings
 * merge last-write-wins per key); a day's total is the sum across devices.
 */
import { db, putSetting } from './db/local';
import { getDeviceId } from './device';
import { dayKey } from './streak';

const PREFIX = 'activity:';

export type ActivityKind = 'tones' | 'read' | 'lesson';

type Counts = Partial<Record<ActivityKind, number>>;

/** Writes run one at a time: two read-then-write increments racing would lose one. */
let queue: Promise<void> = Promise.resolve();

export function recordActivity(kind: ActivityKind, n = 1, now = new Date()): Promise<void> {
  queue = queue.then(async () => {
    const key = `${PREFIX}${dayKey(now)}:${getDeviceId()}`;
    const current = ((await db.settings.get(key))?.value as Counts | undefined) ?? {};
    await putSetting(key, { ...current, [kind]: (current[kind] ?? 0) + n });
  }).catch(() => {});
  return queue;
}

/** Activity of the given kinds per local day (YYYY-MM-DD), summed across devices. */
export async function activityByDay(kinds: ActivityKind[] = ['tones', 'read']): Promise<Map<string, number>> {
  const rows = await db.settings.where('key').startsWith(PREFIX).toArray();
  const out = new Map<string, number>();
  for (const row of rows) {
    const day = row.key.slice(PREFIX.length, PREFIX.length + 10);
    const counts = (row.value as Counts | null) ?? {};
    const n = kinds.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
    if (n) out.set(day, (out.get(day) ?? 0) + n);
  }
  return out;
}
