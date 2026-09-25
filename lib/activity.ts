/**
 * Practice that is not an SRS review but should still count toward the daily
 * goal: tone drills answered and sentences read.
 *
 * Stored in the synced settings table under one key per day per device, so
 * two devices on the same day never overwrite each other's counts (settings
 * merge last-write-wins per key); a day's total is the sum across devices.
 */
import { db, putSetting } from './db/local';
import { getDeviceId } from './device';
import { dayKey } from './streak';

const PREFIX = 'activity:';

export type ActivityKind = 'tones' | 'read';

type Counts = Partial<Record<ActivityKind, number>>;

export async function recordActivity(kind: ActivityKind, n = 1, now = new Date()): Promise<void> {
  const key = `${PREFIX}${dayKey(now)}:${getDeviceId()}`;
  const current = ((await db.settings.get(key))?.value as Counts | undefined) ?? {};
  await putSetting(key, { ...current, [kind]: (current[kind] ?? 0) + n });
}

/** Activity per local day (YYYY-MM-DD), summed across devices and kinds. */
export async function activityByDay(): Promise<Map<string, number>> {
  const rows = await db.settings.where('key').startsWith(PREFIX).toArray();
  const out = new Map<string, number>();
  for (const row of rows) {
    const day = row.key.slice(PREFIX.length, PREFIX.length + 10);
    const counts = (row.value as Counts | null) ?? {};
    const n = (counts.tones ?? 0) + (counts.read ?? 0);
    out.set(day, (out.get(day) ?? 0) + n);
  }
  return out;
}
