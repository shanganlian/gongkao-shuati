/**
 * 年份筛选工具
 *
 * 题库数据没有独立的年份字段，年份只写在 source 里
 * （如「2015年国家公务员考试《行测》副省级第1题」）。
 * 因此「某道题属于哪一年」在运行时从 source 解析；
 * 下拉选项则固定为 2000–2025 全区间，随题库分片加载不会忽多忽少。
 */

/** 年份筛选支持区间（含端点）：2000–2025 */
export const QUESTION_YEAR_MIN = 2000;
export const QUESTION_YEAR_MAX = 2025;

/** 年份下拉选项：2025 → 2000 倒序，最新真题排在最前 */
export const QUESTION_YEAR_OPTIONS: number[] = Array.from(
  { length: QUESTION_YEAR_MAX - QUESTION_YEAR_MIN + 1 },
  (_, index) => QUESTION_YEAR_MAX - index
);

/** source 中第一个 19xx / 20xx 四位数字即试卷年份 */
const YEAR_TOKEN = /(?:19|20)\d{2}/;

/**
 * 从题目 source 解析试卷年份。
 * 解析不到、或落在筛选区间外（如题号里出现的 1998 等）统一返回 null。
 */
export function parseQuestionYear(source?: string | null): number | null {
  if (!source) return null;
  const matched = source.match(YEAR_TOKEN);
  if (!matched) return null;
  const year = Number(matched[0]);
  if (!Number.isInteger(year)) return null;
  if (year < QUESTION_YEAR_MIN || year > QUESTION_YEAR_MAX) return null;
  return year;
}

/**
 * 年份筛选判定：'all' 与非法值都视为不限，其余按 source 解析出的年份精确比对。
 * 抽成纯函数，便于筛选语义单测与冒烟脚本覆盖。
 */
export function matchesQuestionYear(
  source: string | null | undefined,
  activeYear: string
): boolean {
  if (activeYear === 'all') return true;
  const targetYear = Number(activeYear);
  if (!Number.isInteger(targetYear)) return true;
  return parseQuestionYear(source) === targetYear;
}

/** 年份空结果提示所需的最小题目形状：只读 source */
export interface YearCountableQuestion {
  source?: string | null;
}

/** 年份筛选是否生效（'all'、空串、非法值都视为不限年份） */
export function isQuestionYearActive(activeYear: string): boolean {
  if (!activeYear || activeYear === 'all') return false;
  return Number.isInteger(Number(activeYear));
}

/**
 * 统计给定题目集合中落在指定年份的题量。
 * 未启用年份筛选时返回集合总数，便于「不限年份共 N 题」的题量标注。
 */
export function countQuestionsInYear(
  questions: ReadonlyArray<YearCountableQuestion>,
  activeYear: string
): number {
  if (!isQuestionYearActive(activeYear)) return questions.length;
  const targetYear = Number(activeYear);
  let count = 0;
  for (const question of questions) {
    if (parseQuestionYear(question?.source) === targetYear) count += 1;
  }
  return count;
}

/** 年份筛选的题量标注，如「2015 年 · 128 题」；未启用年份筛选时返回 null */
export function formatYearCountLabel(activeYear: string, count: number): string | null {
  if (!isQuestionYearActive(activeYear)) return null;
  return `${Number(activeYear)} 年 · ${count} 题`;
}

export interface YearEmptyStateCopy {
  title: string;
  detail: string;
}

/**
 * 年份筛选空结果文案：当前范围有题、但所选年份 0 题时给出题量标注与出口建议。
 * 未启用年份筛选、当前范围本身无题（交由通用空文案）、或该年份已有命中题时返回 null。
 */
export function describeYearEmptyState(
  activeYear: string,
  scopeTotal: number,
  matchedCount: number
): YearEmptyStateCopy | null {
  if (!isQuestionYearActive(activeYear)) return null;
  if (scopeTotal <= 0 || matchedCount > 0) return null;
  const targetYear = Number(activeYear);
  return {
    title: `${targetYear} 年在当前范围暂无题目`,
    detail:
      `当前筛选范围不限年份共 ${scopeTotal} 题，其中 ${targetYear} 年 0 题。` +
      '可换一个年份，或切换到收录了该年真题的国考卷。',
  };
}
