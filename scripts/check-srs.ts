import { newCard, grade, previewIntervals, seedKnownCard, sortForReview, Rating, State } from '../lib/srs';

const now = new Date('2026-09-19T09:00:00Z');
const days = (a: Date, b: Date) => ((a.getTime() - b.getTime()) / 86400000).toFixed(2);

let c = newCard('w-cha', 'recognition', now);
console.log('new card state:', State[c.state], 'due now?', c.due <= now);

const p = previewIntervals(c, now);
console.log('previews from new: again=%sd hard=%sd good=%sd easy=%sd',
  days(p[Rating.Again], now), days(p[Rating.Hard], now), days(p[Rating.Good], now), days(p[Rating.Easy], now));

// simulate four consecutive "Good" reviews, advancing time to each due date
let t = now;
for (let i = 1; i <= 4; i++) {
  const r = grade(c, Rating.Good, t);
  console.log(`rep ${i}: state=${State[r.card.state]} stability=${r.card.stability.toFixed(2)} interval=${days(r.card.due, t)}d`);
  c = r.card;
  t = c.due;
}

// a lapse should shorten things materially
const lapsed = grade(c, Rating.Again, t);
console.log('after Again: state=%s lapses=%d interval=%sd', State[lapsed.card.state], lapsed.card.lapses, days(lapsed.card.due, t));

// seeded known word should not be due today
const seeded = seedKnownCard('w-kafei', 'recognition', 3, now);
console.log('seeded: state=%s due in %sd (should be ~3)', State[seeded.state], days(seeded.due, now));

// ordering: due cards before new ones
const order = sortForReview([newCard('new1','recognition',now), c, seeded], t);
console.log('review order:', order.map(x => `${x.wordId}/${State[x.state]}`).join(' -> '));
