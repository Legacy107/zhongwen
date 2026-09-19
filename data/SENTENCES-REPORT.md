# Sentence pipeline report

Generated 2026-09-19T13:32:26.668Z by `yarn sentences:generate --level=1`.

All numbers below are computed from the emitted dataset, not estimated.

## Dataset

| | |
| --- | --- |
| Target level | HSK 1 |
| Grammar points | 48 |
| Sentences requested | 288 |
| Sentences returned | 288 |
| **Passed validation** | **279** (96.9%) |
| Rejected | 9 (3.1%) |
| Flagged for review | 18 |
| Tagged `viContrast` | 42 |

Model: `claude-sonnet-5`, via the Batch API with structured output (tool use).

**These sentences are LLM-generated, not native-written.** Every one passed the
machine checks below; none has been read by a native speaker. The checks verify
*structure* — that tiles rejoin, that no vocabulary escapes the level, that
nothing was truncated. They cannot verify that a sentence is idiomatic, that the
Vietnamese gloss is natural, or that the sentence actually teaches the grammar
point it was generated for. Those remain open.

## Validation

Every sentence must pass all of these before it is written. Failures are
reported with the offending sentence rather than dropped silently.

1. **Tiles rejoin** — concatenating every tile's text reproduces the hanzi exactly.
2. **Level cap** — no character and no multi-character tile above HSK 1.
   The allowed set is built from `words.json`, plus the content words of the
   level's own grammar points.
3. **Pinyin length** — syllable count equals hanzi character count. This is the
   cheap detector for a truncated or hallucinated sentence.
4. **No duplicates** — compared on the hanzi string across the whole corpus.
5. **Length bounds** — 4–12 characters.

## Rejections

### `duplicate` — 9

The same hanzi string was produced twice, wasting a card.

- `外边下雨了。` (gp 22) — duplicate of S1-001-3 (grammar point 1)
- `我是越南人。` (gp 24) — duplicate of S1-005-1 (grammar point 5)
- `你喝茶还是喝水？` (gp 33) — duplicate of S1-019-2 (grammar point 19)
- `这些水果多少钱？` (gp 33) — duplicate of S1-004-2 (grammar point 4)
- `我们一起去吃饭吧。` (gp 34) — duplicate of S1-005-5 (grammar point 5)

## Coverage per grammar point

6 sentences were requested per point.

| # | Grammar point | Valid | Rejected | |
| --- | --- | --- | --- | --- |
| 1 | 名词 › 方位名词 | 6 | 0 | |
| 2 | 动词 › 能愿动词 | 6 | 0 | |
| 3 | 动词 › 能愿动词 | 6 | 0 | |
| 4 | 代词 › 疑问代词 | 6 | 0 | |
| 5 | 代词 › 人称代词 | 6 | 0 | |
| 6 | 代词 › 指示代词 | 6 | 0 | |
| 7 | 数词 › 一、二/两、三、四、五、六、七、八、九、零；十、百；半 | 6 | 0 | |
| 8 | 量词 › 名量词 | 6 | 0 | |
| 9 | 副词 › 程度副词 | 6 | 0 | |
| 10 | 副词 › 范围、协同副词 | 6 | 0 | |
| 11 | 副词 › 时间副词 | 6 | 0 | |
| 12 | 副词 › 频率、重复副词 | 6 | 0 | |
| 13 | 副词 › 关联副词 | 6 | 0 | |
| 14 | 副词 › 否定副词 | 6 | 0 | |
| 15 | 介词 › 引出时间、处所 | 6 | 0 | |
| 16 | 介词 › 引出时间、处所 | 6 | 0 | |
| 17 | 介词 › 引出对象 | 6 | 0 | |
| 18 | 介词 › 引出对象 | 6 | 0 | |
| 19 | 连词 › 连接词或词组 | 6 | 0 | |
| 20 | 助词 › 结构助词 | 6 | 0 | |
| 21 | 助词 › 动态助词 | 6 | 0 | |
| 22 | 助词 › 语气助词 | 5 | 1 | |
| 23 | 结构类型 › 其他结构类型 | 6 | 0 | |
| 24 | 主语 › 名词、代词或名词性短语作主语 | 5 | 1 | |
| 25 | 谓语 › 动词或动词性短语、形容词或形容词性短语作谓语 | 6 | 0 | |
| 26 | 宾语 › 名词、代词或名词性短语作宾语 | 6 | 0 | |
| 27 | 定语 › 名词性词语、形容词性词语、数量短语作定语 | 6 | 0 | |
| 28 | 状语 › 副词、形容词作状语； 
表示时间、处所的词语作状语 | 6 | 0 | |
| 29 | 句型 › 单句 | 6 | 0 | |
| 30 | 句型 › 单句 | 6 | 0 | |
| 31 | 句型 › 单句 | 6 | 0 | |
| 32 | 句类 › 陈述句 | 6 | 0 | |
| 33 | 句类 › 疑问句 | 4 | 2 | |
| 34 | 句类 › 祈使句 | 4 | 2 | |
| 35 | 句类 › 感叹句 | 6 | 0 | |
| 36 | 特殊句型 › “是”字句 | 5 | 1 | |
| 37 | 特殊句型 › “有”字句 | 6 | 0 | |
| 38 | 特殊句型 › 比较句 | 6 | 0 | |
| 39 | 复句 › 并列复句 | 6 | 0 | |
| 40 | 动作的态 › 变化态 | 6 | 0 | |
| 41 | 动作的态 › 完成态 | 6 | 0 | |
| 42 | 动作的态 › 进行态 | 6 | 0 | |
| 43 | 数的表示法 › 钱数表示法 | 6 | 0 | |
| 44 | 时间表示法 › （1）年、月、日、星期表示法（2）钟点表示法 | 6 | 0 | |
| 45 | 用“吗”提问 ›  | 6 | 0 | |
| 46 | 用“多、多少、几、哪、哪儿、哪里、哪些、什么、谁、怎么”提问 ›  | 4 | 2 | |
| 47 | 用“还是”提问 ›  | 6 | 0 | |
| 48 | 用正反疑问形式提问 ›  | 6 | 0 | |

_Every grammar point has at least one valid sentence._



## Vietnamese word-order contrast

42 sentences carry a `viContrast` tag, so a wrong tile order that
follows Vietnamese head-first order gets a specific correction instead of a
generic "incorrect".

Detection is structural and deliberately conservative — only 的-phrases with a
pronoun modifier, and nationality/language compounds built on a known place
name. Adjective+noun without 的 and relative clauses are **not** tagged, because
a wrong tag teaches a rule that does not exist, while a missing tag merely
falls back to the generic message.

| Sentence | Vietnamese order | Chinese order |
| --- | --- | --- |
| `我的手机在桌子上。` | <danh từ> của tôi | 我的手机 |
| `我会说一点儿汉语。` | tiếng Hán | 汉语 |
| `你会做越南菜吗？` | món ăn Việt Nam | 越南菜 |
| `我想学中文。` | tiếng Trung | 中文 |
| `我是越南人。` | người Việt Nam | 越南人 |
| `她们都是我的同学。` | <danh từ> của tôi | 我的同学 |
| `他的爸爸是中国人。` | <danh từ> của anh ấy | 他的爸爸 |
| `这是我的电脑。` | <danh từ> của tôi | 我的电脑 |

## False-friend flags

18 sentences contain a word from `false-friends.json`.
These are **not** rejected — a false friend in context is often exactly what
should be drilled — but they are the sentences most likely to mislead a
Vietnamese reader through Hán-Việt transfer, so they need a human first.

| Sentence | False friend | Vietnamese gloss |
| --- | --- | --- |
| `您是老师吗？` | 老师 | Thầy là giáo viên ạ? |
| `有的学生没来上课。` | 学生 | Một số học sinh không đến lớp. |
| `那家商店很有名。` | 有名 | Cửa hàng đó nổi tiếng lắm. |
| `我们都是学生。` | 学生 | Chúng tôi đều là học sinh. |
| `我妹妹也在墨尔本工作。` | 工作 | Em gái tôi cũng làm việc ở Melbourne. |
| `我在墨尔本工作。` | 工作 | Tôi làm việc ở Melbourne. |
| `我想跟老师说话。` | 老师 | Tôi muốn nói chuyện với cô giáo. |
| `他和他弟弟都是学生。` | 学生 | Anh ấy và em trai đều là học sinh. |
| `她是一个很好的老师。` | 老师 | Cô ấy là một giáo viên rất tốt. |
| `我的朋友在墨尔本工作。` | 工作 | Bạn tôi làm việc ở Melbourne. |
| `我认识那个老师。` | 老师 | Tôi biết cô giáo đó. |
| `他是我们学校的老师。` | 老师 | Thầy ấy là giáo viên của trường tôi. |
| `这是一家很有名的饭店。` | 有名 | Đây là một quán ăn rất nổi tiếng. |
| `老师教我们写汉字。` | 老师 | Cô giáo dạy tụi tôi viết chữ Hán. |
| `老师好，再见。` | 老师 | Chào cô. Tạm biệt cô. |
| `她是我的汉语老师。` | 老师 | Cô ấy là giáo viên tiếng Trung của tôi. |
| `他不是老师，是学生。` | 老师, 学生 | Anh ấy không phải giáo viên, mà là học sinh. |
| `他是老师还是学生？` | 老师, 学生 | Anh ấy là giáo viên hay học sinh? |

## Limitations

Stated plainly, because the numbers above can only speak to structure:

- **No native review.** Naturalness, register and idiom are unverified. The
  prompt asks for everyday speech; whether it got it is unknown.
- **Vietnamese glosses are model output too**, and are the least checked field
  in the dataset — nothing validates them at all. They are the learner's native
  language, so an unnatural gloss is more damaging here than an unnatural
  English one.
- **"Exercises the grammar point" is unverified.** Nothing checks that a
  sentence generated for point 1 actually uses that
  construction rather than merely containing one of its words.
- **Level-capping is lexical, not grammatical.** A sentence can use only HSK 1
  words and still be grammatically far beyond HSK 1.
- **Tone sandhi is not represented.** Pinyin comes from `pinyin-pro` per
  sentence, which applies 不/一 sandhi but writes third-tone sandhi in its
  underlying form — correct for reading, not a pronunciation guide.
- **Segmentation follows the deck, not a parser.** Tiles are longest-match
  against `words.json`, so a string that happens to contain a longer deck word
  splits along that word even when the sentence does not mean it.
