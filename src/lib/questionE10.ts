import type { Question } from '../types';

/**
 * E10 前端渲染兜底判定，与 scripts/lib/e10-rule.cjs 保持同一口径。
 *
 * 命中后不直接过滤题目，而是由 PracticeArena 渲染「本题数据整理中」占位，
 * 避免用户看到无材料 / 选项跳号的坏题。
 */

export interface E10Issue {
  code: 'E10-A' | 'E10-B';
  detail: string;
}

const SUBJECTIVE_MODULES = ['shenlun', 'gongji'];

const DATA_TERM_RE =
  /顺差额|贸易顺差|贸易逆差|顺差|逆差|增长量|增长率|增幅|降幅|增速|增量|比重|占比|平均数|平均值|倍数|翻番|基期|现期|同比|环比|进出口|出口额|进口额|出口总值|进口总值|百分点|统计图|统计表/;

const MATERIAL_REF_RE =
  /根据(?:上述|以下|下列|所给|下面)?(?:的)?(?:材料|资料|表格|图表|统计图|统计表|下图|下表|柱状图|折线图|饼图)|(?:上述|以下|下列|所给|下面)(?:材料|资料|表格|图表)|(?:上述|该|所给)(?:材料|资料|表格|图表)(?:中|显示|表明)|(?:材料|资料|表格|图表)(?:中|里)(?:给出|显示|表明|数据)/;

const YEAR_RANGE_RE =
  /(^|[^\d])((?:19|20)\d{2})\s*(?:[～~—–\-－至到]|年\s*[-—–－至到]\s*)\s*((?:19|20)\d{2})(?!\d)/g;

const YEAR_RE = /(^|[^\d])((?:19|20)\d{2})(?!\d)/g;

const PURE_NUMBER_OPTION_RE =
  /^([+-]?\d{1,6})(?:\s*(年|%|％|亿元|万元|亿|万|元|吨|人|个|倍|百分点|公里|千米))?$/;

type CheckableQuestion = Partial<Question> & { isImageQuestion?: boolean };

function normalize(text: unknown): string {
  return String(text == null ? '' : text)
    .replace(/[\s\u3000\u00a0]+/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

function isSubjective(q: CheckableQuestion): boolean {
  return SUBJECTIVE_MODULES.includes(String(q.module || ''));
}

function stripNonDataNumbers(text: unknown): string {
  return String(text == null ? '' : text)
    .replace(/\[\[IMG\]\]/gi, ' ')
    .replace(/(^|[^\d])(?:19|20)\d{2}(?!\d)/g, '$1 ')
    .replace(/(?:图|表|第)\s*\d+\s*(?:题|章|节|幅|个|张|页)?/g, ' ');
}

function hasNumericData(text: unknown): boolean {
  const source = stripNonDataNumbers(text);
  const numbers = source.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numbers.length >= 2) return true;
  return (
    numbers.length === 1 &&
    /\d+(?:[.,]\d+)?\s*(?:%|％|亿元|万元|亿|万|元|吨|人|个|倍|百分点|公里|千米|平方米|平方公里)/.test(source)
  );
}

function extractYears(text: unknown): number[] {
  const out: number[] = [];
  const re = new RegExp(YEAR_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text || ''))) !== null) out.push(Number(match[2]));
  return out;
}

function extractYearRanges(text: unknown): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = new RegExp(YEAR_RANGE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text || ''))) !== null) {
    const start = Number(match[2]);
    const end = Number(match[3]);
    if (end > start && end - start <= 12) out.push([start, end]);
  }
  return out;
}

function optionTexts(q: CheckableQuestion): string[] {
  return (Array.isArray(q.options) ? q.options : []).map(option => normalize(option?.text));
}

function detectYearGap(stem: string, texts: string[]): string | null {
  if (texts.length < 3) return null;
  // 只有“纯年份选项”才按年份序列处理；整句选项里的年份不算
  if (!texts.every(text => /^(?:19|20)\d{2}年?$/.test(text))) return null;
  const optionYears = texts.map(text => extractYears(text));
  if (optionYears.some(years => years.length !== 1)) return null;

  const unique = [...new Set(optionYears.map(years => years[0]))].sort((a, b) => a - b);
  if (unique.length < 3) return null;

  // 只有选项同时覆盖区间首尾、且只缺 1 个中间年份时才算缺口
  for (const [start, end] of extractYearRanges(stem)) {
    if (!unique.includes(start) || !unique.includes(end)) continue;
    const missing: number[] = [];
    for (let year = start; year <= end; year++) {
      if (!unique.includes(year)) missing.push(year);
    }
    if (missing.length === 1) {
      return `选项年份 ${unique.join('/')} 在题干区间 ${start}-${end} 内缺 ${missing.join('/')}`;
    }
  }

  // 无区间时：只有题干明确要求按年份排序，才继续判断序列缺口
  if (!hasSequenceContext(stem)) return null;

  const span = unique[unique.length - 1] - unique[0];
  if (unique.length >= 3 && span <= 8) {
    const diffs = unique.slice(1).map((year, index) => year - unique[index]);
    const step = Math.min(...diffs);
    const doubled = diffs.filter(diff => diff === step * 2).length;
    if (
      step >= 1 &&
      doubled === 1 &&
      diffs.every(diff => diff === step || diff === step * 2)
    ) {
      const missing: number[] = [];
      for (let index = 0; index < diffs.length; index++) {
        if (diffs[index] === step * 2) missing.push(unique[index] + step);
      }
      return `选项年份序列 ${unique.join('/')} 跳号，缺 ${missing.join('/')}`;
    }
  }
  return null;
}

function detectNumberGap(texts: string[]): string | null {
  if (texts.length < 4) return null;
  const parsed: Array<{ value: number; unit: string }> = [];
  for (const text of texts) {
    const match = text.match(PURE_NUMBER_OPTION_RE);
    if (!match) return null;
    parsed.push({ value: Number(match[1]), unit: match[2] || '' });
  }
  const units = new Set(parsed.map(item => item.unit));
  if (units.size !== 1) return null;
  const unit = parsed[0].unit;
  // 无单位的 1/2/3/5 多是大题选项值，不是“序列”本身；只对带统一单位的数字序列判缺口
  if (!unit || unit === '%' || unit === '％') return null;

  const values = parsed.map(item => item.value);
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length !== values.length || unique.length < 4) return null;

  const diffs = unique.slice(1).map((value, index) => value - unique[index]);
  const step = Math.min(...diffs);
  if (
    step < 1 ||
    diffs.some(diff => diff % step !== 0) ||
    !diffs.some(diff => diff === step * 2) ||
    diffs.some(diff => diff > step * 2)
  ) {
    return null;
  }

  const missing: number[] = [];
  for (let index = 0; index < diffs.length; index++) {
    if (diffs[index] === step * 2) missing.push(unique[index] + step);
  }
  return `选项数字序列 ${unique.join('/')} 跳号，缺 ${missing.join('/')}`;
}

function hasSequenceContext(stem: string): boolean {
  return /选项(?:年份|数字|数值)?(?:依次|按|排序|顺序|序列)|下列(?:年份|数字|数值|选项)按|按(?:年份|数字|数值)(?:排序|排列)|从小到大|从大到小|年份序列|数字序列/.test(
    stem
  );
}

function detectOptionSequenceGap(q: CheckableQuestion): string | null {
  const texts = optionTexts(q);
  if (texts.length < 3) return null;
  const stem = String(q.stem || '');
  const yearGap = detectYearGap(stem, texts);
  if (yearGap) return yearGap;
  // 普通数值选项（1人/2人/3人/5人、30个/35个/40个/50个）不是序列，只有题干明确要求排序时才判缺口
  return hasSequenceContext(stem) ? detectNumberGap(texts) : null;
}

function isDataContext(q: CheckableQuestion, stem: string): boolean {
  const optionText = optionTexts(q).join(' ');
  const material = String(q.material || '');
  const hasRef = MATERIAL_REF_RE.test(stem) || MATERIAL_REF_RE.test(material);
  const hasTerm = DATA_TERM_RE.test(stem) || DATA_TERM_RE.test(optionText);
  const hasRange = extractYearRanges(stem).length > 0;
  const hasNumberInOptions = /\d/.test(optionText);

  if (String(q.module) === 'ziliao') {
    return hasRef || hasTerm || hasRange || hasNumberInOptions;
  }
  return hasRef || (hasTerm && hasRange);
}

/** 返回 E10 命中项；无命中返回空数组 */
export function getE10Issues(q: CheckableQuestion | null | undefined): E10Issue[] {
  if (!q || isSubjective(q) || q.isImageQuestion === true) return [];

  const stem = String(q.stem || '');
  const issues: E10Issue[] = [];

  const material = String(q.material || '');
  if (isDataContext(q, stem) && !hasNumericData(material) && !hasNumericData(stem)) {
    issues.push({
      code: 'E10-A',
      detail: material.trim()
        ? '材料只有占位语/无有效数字，题干未自带数据'
        : '材料为空，题干未自带数据',
    });
  }

  const gap = detectOptionSequenceGap(q);
  if (gap) issues.push({ code: 'E10-B', detail: gap });

  return issues;
}

/** 是否应渲染异常占位（E10 前端兜底） */
export function isE10Abnormal(q: CheckableQuestion | null | undefined): boolean {
  return getE10Issues(q).length > 0;
}
