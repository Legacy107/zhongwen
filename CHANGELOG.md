# Changelog

What changed in each version, newest first. Settings → About → What's new shows this file in the app.

Add an entry in the commit that bumps `version` in `package.json` (see README, Versioning). A test fails if the newest entry isn't the current version.

## 1.4.0 — 2026-10-10

- Settings → Sound → Voice opens a screen listing every voice this browser offers, each with a play button. Pick the one that sounds best; the choice is saved per device, since phones and browsers name their voices differently.
- If a voice fails to speak, that screen says which one and why.

## 1.3.0 — 2026-10-10

- Words are spoken with Microsoft's natural voice (Xiaoxiao) in Edge, on Android as well as desktop. Offline, or if that voice fails, the device's own voice takes over.
- Speech is a little slower by default. Settings → Sound has a speaking speed (slow, relaxed, natural) and a voice picker that shows which voice is in use.
- A turtle button replays slowly on every step where you listen: lessons, sentence building, reading and tone drills.

## 1.2.0 — 2026-10-03

- What's new: this changelog, in Settings → About.

## 1.1.0 — 2026-10-03

- Lessons replace separate review and sentence building. Each lesson warms up with words that are due, teaches about 5 new words, then practises them several ways: pick by picture, meaning or sound, matching pairs, listen and type, and build phrases and sentences from words you already know. Mistakes come back at the end.
- About 3,900 short phrases and sentences, plus emoji pictures for 326 words, written for HSK 1–2 lessons.
- The daily goal is counted in lessons, with a lesson length setting (short, normal, long). Your streak carried over.
- The Hán-Việt card asks for the pinyin from the English meaning. Hán-Việt readings show as a side note on every word card instead.
- Review, sentence building and tone drills moved under Practice, for catching up.
- The lesson button on the path sits centred in its ring.

## 1.0.0 — 2026-09-26

The first versioned release, live at zhongwenn.vercel.app.

- Spaced repetition (FSRS) for HSK 1–6, with Hán-Việt readings, cognate hints and false-friend warnings.
- Tone drills weighted to the mistakes Vietnamese speakers tend to make.
- Sentence building from word tiles, gap-fill for particles and measure words, and typing whole sentences from memory, with hints when the word order follows Vietnamese.
- A graded reader of Tatoeba sentences, with tap-to-look-up and words saved into review.
- Daily goal, streak, and a progress dashboard.
- Works offline, and syncs between devices after signing in with the passphrase.
- The version, commit and build time in Settings.
