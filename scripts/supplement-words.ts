/**
 * Vocabulary the app needs that HSK 3.0 omits.
 *
 * HSK carries 中国 but not 美国/日本/越南, so a learner cannot say where they
 * are from or what language they speak. Countries, nationalities and languages
 * are high-utility for daily conversation and are among the first things
 * Duolingo teaches, so the deck is incomplete without them.
 *
 * Emitted as level "S" (supplementary) so it is distinguishable from real HSK
 * bands in progress tracking.
 */
export const SUPPLEMENT_WORDS: string[] = [
  // Countries — the learner's own, where they live, and common in Melbourne
  "越南",
  "美国",
  "日本",
  "韩国",
  "英国",
  "澳大利亚",
  "法国",
  "德国",
  "泰国",
  "新加坡",
  "加拿大",
  "马来西亚",
  "印度",
  "印度尼西亚",
  "新西兰",
  // Nationalities
  "中国人",
  "越南人",
  "美国人",
  "日本人",
  "韩国人",
  "英国人",
  "澳大利亚人",
  "法国人",
  "德国人",
  // Languages
  "汉语",
  "中文",
  "英语",
  "英文",
  "越南语",
  "日语",
  "日文",
  "韩语",
  "法语",
  "德语",
  // Cities that come up locally
  "北京",
  "上海",
  "香港",
  "台湾",
  "河内",
  "悉尼",
  "墨尔本",
];

/**
 * Glosses for compounds the dictionaries omit. Both are transparent
 * country + 人 formations that CC-CEDICT and CVDICT simply do not enumerate.
 */
/**
 * Hán-Việt for names that are phonetic transliterations rather than
 * Sino-Vietnamese compounds. Composing these per character produces nonsense
 * (墨尔本 -> "Mặc Nể Bản"), so the bridge is suppressed with null or given the
 * established Vietnamese form where one exists.
 */
export const SUPPLEMENT_HANVIET: Record<string, string | null> = {
  美国: "Mỹ Quốc",
  澳大利亚: null,
  新加坡: null,
  加拿大: null,
  马来西亚: null,
  印度尼西亚: null,
  新西兰: null,
  墨尔本: null,
  悉尼: null,
  印度: "Ấn Độ",
  泰国: "Thái Quốc",
  德国: "Đức Quốc",
  法国: "Pháp Quốc",
  英国: "Anh Quốc",
  韩国: "Hàn Quốc",
  澳大利亚人: null,
};

export const SUPPLEMENT_GLOSSES: Record<string, { en: string; vi: string }> = {
  越南人: { en: "Vietnamese person", vi: "người Việt Nam" },
  澳大利亚人: { en: "Australian person", vi: "người Úc" },
};
