# Data pipeline report

Generated 2026-09-19T08:03:42.957Z by `yarn build:data`.

All numbers below are computed from the emitted dataset, not estimated.

## Dataset

| File | Contents |
| --- | --- |
| `words.json` | 5456 HSK 3.0 words, levels 1-6 |
| `chars.json` | 1800 unique characters |
| `false-friends.json` | 73 curated false friends |
| `grammar.json` | 573 HSK grammar points |

Words per level: L1 500, L2 772, L3 973, L4 1000, L5 1071, L6 1140.

## Cognate rate by HSK level

A word counts as a cognate when its Hán-Việt reading, after orthographic
normalization, relates to one of its Vietnamese glosses in CVDICT. Three rules
are applied, strongest first, and the rule that fired is recorded per word in
`cognateMatch` so the UI can phrase its hint honestly:

| `cognateMatch` | Meaning | Count |
| --- | --- | --- |
| `exact` | The reading **is** a gloss. Safe to claim identity. | 749 |
| `toneVariant` | Same letters, different tone marks (tri/trí, trường/trưởng). | 63 |
| `contained` | The reading is a whole word inside a longer gloss (bắc ⊂ phía bắc). | 383 |
| `none` | Vietnamese uses an unrelated native word. | 4261 |

| Level | Words | Exact | All cognates | Rate |
| --- | --- | --- | --- | --- |
| HSK 1 | 500 | 43 (8.6%) | 102 | **20.4%** |
| HSK 2 | 772 | 116 (15%) | 185 | **24%** |
| HSK 3 | 973 | 200 (20.6%) | 288 | **29.6%** |
| HSK 4 | 1000 | 138 (13.8%) | 213 | **21.3%** |
| HSK 5 | 1071 | 134 (12.5%) | 213 | **19.9%** |
| HSK 6 | 1140 | 118 (10.4%) | 194 | **17%** |
| **All** | **5456** | **749** | **1195** | **21.9%** |

### On the ~45% figure

This does not reproduce the ~45% "partially pre-known" figure, and the gap is
methodological rather than a defect on either side. That figure came from a
hand-curated, frequency-ranked cognate list — a looser and differently
constructed measure. The number above is stricter: it requires the Hán-Việt
reading to actually line up with a CVDICT gloss.

The honest reading of this dataset is the **exact** column. Tone-variant and
contained matches are real teaching value but are not identity, and a UI that
presents all three the same way would overclaim. Split them.

The shape of the curve is the durable finding: cognate density is lowest at
HSK 1 and peaks in the middle levels. HSK 1 is dominated by native Chinese
function words and everyday verbs (的, 是, 不, 吃, 看) that never entered
Vietnamese as loans, while the Sino-Vietnamese layer sits in the abstract,
bookish, two-character compounds that arrive from HSK 3 onward. The bridge is
therefore *more* valuable to an intermediate learner than to a beginner —
which is the opposite of how such a feature is usually pitched, and worth
knowing before building onboarding around it.

### Caveat on tone-variant matches

Tone-insensitive matching admits a small number of false positives, because
Vietnamese tone is phonemic: 字 has the Hán-Việt reading "tự" and the gloss
"từ", which are related but genuinely distinct morphemes. These are counted as
`toneVariant` rather than `exact` precisely so the UI can hedge ("close to
Vietnamese …") instead of asserting the words are the same.

## Tone-rule accuracy

The rule under test: ngang→T1, huyền→T2, hỏi→T3, ngã→T3, sắc→T4, nặng→T4.
Measured per syllable across every word with a Hán-Việt reading, excluding
Mandarin neutral-tone syllables (which no Hán-Việt reading could predict).

| Cohort | Syllables | Correct | Accuracy |
| --- | --- | --- | --- |
| Non-entering tone | 8252 | 6672 | **80.9%** |
| Entering tone (-p -t -c -ch) | 1524 | 626 | **41.1%** |

Breakdown of the non-entering cohort by Vietnamese tone:

| Vietnamese tone | Syllables | Correct | Accuracy |
| --- | --- | --- | --- |
| sắc/nặng | 3006 | 2655 | **88.3%** |
| ngang | 2573 | 1714 | **66.6%** |
| hỏi/ngã | 1607 | 1406 | **87.5%** |
| huyền | 1066 | 897 | **84.1%** |

### What this means for the confidence badges

The entering-tone cohort scores far below the non-entering one, which is the
expected result and the reason those syllables are hard-coded to `"low"`
confidence rather than being scored. Middle Chinese entering-tone syllables
ended in an unreleased -p/-t/-k stop; Vietnamese kept those codas (-p, -t, -c,
-ch) while Mandarin lost the tone category entirely and scattered its
syllables across all four modern tones. học→xué (T2), quốc→guó (T2), nhất→yī
(T1) and mục→mù (T4) all start from the same Middle Chinese tone and land in
three different places. No rule recovers that, so the badge correctly declines
to guess.

### The ngang asymmetry — ngang is the weakest prediction

The per-tone breakdown is not uniform, and the difference is large enough to
act on. Marked tones predict well (sắc/nặng and hỏi/ngã both around 88%,
huyền around 83%), but **ngang — the unmarked, no-diacritic case — is far
worse**. That matters because ngang is also one of the largest cohorts, so its
errors dominate the mistakes a learner actually meets.

The cause is structural: ngang is the default state of a Vietnamese syllable,
carrying no diacritic, so it is where every reading with no other tone signal
lands. It is less a positive prediction than an absence of evidence, and it
collects syllables whose Middle Chinese tone category left no Vietnamese trace.

**UI recommendation:** do not show ngang→T1 with the same confidence as
sắc→T4. Either soften ngang to `"medium"` outright, or badge it distinctly.
As implemented, `getToneConfidence` scores ngang the same as any other tone,
so a word can currently be marked `"high"` on the strength of a prediction
that is right only about two-thirds of the time. That is the single weakest
point in the confidence badges and the one most likely to erode trust.

Confidence distribution across the corpus: high 2787, medium 1233, low 1436.

## Coverage gaps

| Metric | Count | Share |
| --- | --- | --- |
| Words missing `viGloss` | 50 | 0.9% |
| Words missing `enGloss` | 50 | 0.9% |
| Words missing `hanviet` | 0 | 0.0% |
| Characters missing `hanviet` | 0 | 0.0% |

Missing Hán-Việt by level: L1 0, L2 0, L3 0, L4 0, L5 0, L6 0.

Unresolved characters: _None — every character in HSK 1-6 resolved to a Hán-Việt reading._

Hán-Việt coverage is complete. The 50 words missing glosses
are not lookup failures but **HSK notation artifacts**: the wordlist encodes
reduplication and disambiguation inline, so the headword is not a dictionary
form. They fall into four shapes:

- `爸爸|爸`, `哥哥|哥` — a reduplicated form with its single-character variant
- `第（第二）`, `家（科学家）` — a bound morpheme with a usage example in brackets
- `面1`, `面2`, `称1` — a homograph disambiguated by an index digit
- `…极了`, `…分之…` — a construction template with elision marks

These need the headword normalising (splitting on `|`, stripping bracketed
examples and trailing digits) before a dictionary lookup will hit. That is a
worthwhile follow-up but is deliberately not done here: guessing which side of
`爸爸|爸` the learner should see is a content decision, not a parsing one.

## Data-quality problems encountered

### 1. Unihan's `kVietnamese` is attached to traditional forms only

This is the largest issue found, and it is invisible until you check. The
simplified characters 学 (U+5B66) and 国 (U+56FD) carry **no** `kVietnamese`
field at all — only their traditional counterparts 學 (U+5B78) and 國 (U+570B)
do. Since the HSK wordlist is simplified, a naive lookup silently loses
roughly 44% of characters (786 of the 1,800 in HSK 1-6). The pipeline resolves
this by falling back through `kTraditionalVariant`.

### 2. Unihan's `kVietnamese` is incomplete even after that fallback

Following the traditional-variant chain still left **348 HSK 1-6 characters**
with no reading, and they are not rare ones: 儿, 面, 电, 以, 量, 爱, 问, 办,
题, 这 and 就 are among the highest-frequency characters in the language.
Unpatched, about one in six HSK 1-4 words would have had no Hán-Việt bridge at
all — measured at 83.8% / 82.1% / 86.1% / 80.5% full resolvability for L1-L4.

CVDICT cannot fill this gap: it supplies Vietnamese *meanings* ("sử dụng",
"nhưng"), not Hán-Việt *readings*, so the readings are not recoverable from
any of the four sources. They are supplied by a hand-written table in
`scripts/hanviet-supplement.ts`.

**This is a maintenance liability worth naming:** the flagship feature is not
purely derivable from public data. A curated component is load-bearing, and it
will need extending if the wordlist grows beyond HSK 6.

Reading provenance across all word-character lookups: supplement 1265, unihan 6316, unihan-trad 2551, unihan-ambiguous 0.

### 3. `kVietnamese` mixes Hán-Việt with Nôm readings, unordered

A character's `kVietnamese` field may list several readings, and they are
**not** ordered with the Sino-Vietnamese one first — the field interleaves
Hán-Việt readings with Nôm (vernacular) ones. 每 is listed as
"hỏi mỏi mọi mỗi mủ mủi mũi", where the Hán-Việt reading "mỗi" is fourth;
百 is "bá bách trăm", where "trăm" is the native numeral and not a
Sino-Vietnamese reading at all; and 年 resolves to the vernacular "nên"
rather than "niên".

Taking the first token produced readings like 半年 → "bán nên" instead of
"bán niên". 138 characters overall and 32 within HSK 1-6 are affected; each
of those 32 is pinned to its correct Hán-Việt reading in the curated table,
and any multi-reading character outside that set is tracked as
`unihan-ambiguous` in the provenance counts below.

### 4. Orthographic variants make or break cognate detection

Vietnamese has two live conventions for i/y after certain initials (lý/lí,
kỹ/kĩ, hy/hi, mỹ/mĩ, sĩ/sỹ, tỷ/tỉ). Unihan and CVDICT made different choices,
so cognate matching collapses without normalization. The variants are folded
as **whole-syllable** rewrites rather than substring replacements — a
substring rewrite of "hi"→"hy" would corrupt unrelated syllables such as
"hiểu" into "hyểu" and destroy genuine matches.

Tone diacritics are deliberately **not** stripped during normalization. They
are phonemic in Vietnamese, and folding them would manufacture false cognates
between unrelated words.

### 5. Surname senses hijack common characters

Both dictionaries list surname senses, and for many common characters the
surname is a **separate entry** whose capitalised pinyin sorts first: 白 has
both `[Bai2] /họ [Bai2]/` and `[bai2] /trắng/…`. Selecting the first entry
therefore taught "白 = surname Bai" instead of "white". Measured before the
fix, this hit 13.1% of single-character words (148 of 1,126), including 白,
车, 高, 东, 百 and 国 — all common HSK vocabulary, all materially wrong.

Two guards are applied: surname-only entries are deprioritised during entry
selection, and surname glosses are dropped from the gloss list whenever a real
sense remains. The bracketed-pinyin form (`họ [Bai2]`) is matched explicitly.
Surname senses survive only where the surname is the sole meaning.

This also depressed the cognate rate, since a surname gloss essentially never
matches the Hán-Việt reading. The figures above are post-fix.

### 6. Homographs

Both dictionaries list several entries per headword, including surname-only
senses ("họ [He2]" for 何). The pipeline skips proper-noun-only entries and
prefers the entry whose tones match the HSK pinyin, so 行 in 银行 resolves to
háng/hàng rather than xíng/hành. Compounds where per-character composition
still gives the wrong reading are corrected by a word-level override table.

### 7. Gloss separators cannot be split naively

CC-CEDICT and CVDICT both use `/` as the gloss separator, but glosses
legitimately contain `/` inside measure-word annotations — `LT:杯[bei1],壺|壶[hu2]`
in CVDICT and `CL:個|个[ge4]` in CC-CEDICT. The parser therefore splits the
headword at the first ` /` and only then divides the remainder, dropping
measure-word annotations from user-facing glosses.

## Attribution

- Chinese-English dictionary data from CC-CEDICT, published by MDBG, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). https://www.mdbg.net/chinese/dictionary?page=cc-cedict
- Chinese-Vietnamese dictionary data from CVDICT by Phong Phan, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). https://github.com/ph0ngp/CVDICT
- Han character readings from the Unihan Database, © Unicode, Inc., used under the Unicode License. https://www.unicode.org/charts/unihan.html
- HSK 3.0 wordlist and grammar points from ivankra/hsk30, MIT licensed. https://github.com/ivankra/hsk30
