/**
 * E10 判定：题干要求使用资料数据，但数据材料缺失；或选项年份/数字序列出现缺口。
 *
 * 背景
 * ----
 * 北京 2008 应届第 116 题：
 *   stem: "2002～2006 年，我国的贸易顺差额（出口额－进口额）最小的年份是："
 *   material: "（一）\n根据下列统计资料回答问题。"   ← 只有占位语，没有任何数字
 *   options: 2002 / 2003 / 2004 / 2006               ← 缺 2005
 * 题目既没有可计算的数据，选项又跳号，用户无法作答。
 *
 * 判定口径
 * --------
 * A. 材料缺失（E10-A）
 *    - 题目处于资料分析语境：module=ziliao，或题干明确写“根据材料/下表/图表”，
 *      或题干同时含年份区间与计算词；
 *    - material 为空，或 material 中没有任何有效数据（年份、图号、题号不算数据）；
 *    - 且 stem 自身也没有足够数据（避免误伤“题干已经给全数据”的自洽题）。
 *
 * B. 选项序列缺口（E10-B）
 *    - 选项为单一年份，题干给出年份区间，区间内缺年份；或
 *    - 选项为连续年份/纯整数，步长一致且恰好缺一个中间值。
 *
 * 只读判定，不修改题目。入库校验与前端渲染校验都复用同一套口径。
 */
'use strict';

const SUBJECTIVE_MODULES = ['shenlun', 'gongji'];

/** 资料分析计算词/统计词 */
const DATA_TERM_RE =
  /顺差额|贸易顺差|贸易逆差|顺差|逆差|增长量|增长率|增幅|降幅|增速|增量|比重|占比|平均数|平均值|倍数|翻番|基期|现期|同比|环比|进出口|出口额|进口额|出口总值|进口总值|百分点|统计图|统计表/;

/** 明确引用材料/图表 */
const MATERIAL_REF_RE =
  /根据(?:上述|以下|下列|所给|下面)?(?:的)?(?:材料|资料|表格|图表|统计图|统计表|下图|下表|柱状图|折线图|饼图)|(?:上述|以下|下列|所给|下面)(?:材料|资料|表格|图表)|(?:上述|该|所给)(?:材料|资料|表格|图表)(?:中|显示|表明)|(?:材料|资料|表格|图表)(?:中|里)(?:给出|显示|表明|数据)/;

/** 年份区间：2002～2006 / 2002-2006 / 2002 年至 2006 年 */
const YEAR_RANGE_RE =
  /(^|[^\d])((?:19|20)\d{2})\s*(?:[～~—–\-－至到]|年\s*[-—–－至到]\s*)\s*((?:19|20)\d{2})(?!\d)/g;

/** 单个年份（排除 5 位以上数字） */
const YEAR_RE = /(^|[^\d])((?:19|20)\d{2})(?!\d)/g;

/** 纯整数选项：10 / 200 / 3000，允许相同单位后缀 */
const PURE_NUMBER_OPTION_RE =
  /^([+-]?\d{1,6})(?:\s*(年|%|％|亿元|万元|亿|万|元|吨|人|个|倍|百分点|公里|千米))?$/;

function normalize(text) {
  return String(text == null ? '' : text)
    .replace(/[\s\u3000\u00a0]+/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

function isSubjective(q) {
  return !!q && SUBJECTIVE_MODULES.includes(String(q.module || ''));
}

function isImageQuestion(q) {
  return !!q && q.isImageQuestion === true;
}

/** 去掉年份、图号、题号等“非数据数字”，避免把“图1”当成材料有数据 */
function stripNonDataNumbers(text) {
  return String(text == null ? '' : text)
    .replace(/\[\[IMG\]\]/gi, ' ')
    .replace(/(^|[^\d])(?:19|20)\d{2}(?!\d)/g, '$1 ')
    .replace(/(?:图|表|第)\s*\d+\s*(?:题|章|节|幅|个|张|页)?/g, ' ');
}

/** 文本中是否有有效数据：>=2 个数字，或 1 个带单位/小数的数字 */
function hasNumericData(text) {
  const source = stripNonDataNumbers(text);
  const numbers = source.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numbers.length >= 2) return true;
  return (
    numbers.length === 1 &&
    /\d+(?:[.,]\d+)?\s*(?:%|％|亿元|万元|亿|万|元|吨|人|个|倍|百分点|公里|千米|平方米|平方公里)/.test(source)
  );
}

function extractYears(text) {
  const out = [];
  const re = new RegExp(YEAR_RE.source, 'g');
  let match;
  while ((match = re.exec(String(text || ''))) !== null) out.push(Number(match[2]));
  return out;
}

function extractYearRanges(text) {
  const out = [];
  const re = new RegExp(YEAR_RANGE_RE.source, 'g');
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    const start = Number(match[2]);
    const end = Number(match[3]);
    if (end > start && end - start <= 12) out.push([start, end]);
  }
  return out;
}

function optionTexts(q) {
  return (Array.isArray(q && q.options) ? q.options : []).map(option => normalize(option && option.text));
}

/** 选项年份序列缺口 */
function detectYearGap(stem, texts) {
  if (texts.length < 3) return null;
  // 只有“纯年份选项”才按年份序列处理；整句选项里的年份不算
  if (!texts.every(text => /^(?:19|20)\d{2}年?$/.test(text))) return null;
  const optionYears = texts.map(text => extractYears(text));
  if (optionYears.some(years => years.length !== 1)) return null;

  const years = optionYears.map(years => years[0]);
  const unique = [...new Set(years)].sort((a, b) => a - b);
  if (unique.length < 3) return null;

  // 优先用题干明确给出的年份区间判断：
  // 只有选项同时覆盖区间首尾、且只缺 1 个中间年份时才算缺口；
  // 选项只取区间中的若干年份（如“哪一年最高”只给 4 个候选年）是正常命题。
  for (const [start, end] of extractYearRanges(stem)) {
    if (!unique.includes(start) || !unique.includes(end)) continue;
    const missing = [];
    for (let year = start; year <= end; year++) {
      if (!unique.includes(year)) missing.push(year);
    }
    if (missing.length === 1) {
      return {
        kind: 'year-range',
        values: unique,
        range: [start, end],
        missing,
        detail: `选项年份 ${unique.join('/')} 在题干区间 ${start}-${end} 内缺 ${missing.join('/')}`,
      };
    }
  }

  // 无区间时：只有题干明确要求按年份排序，才继续判断序列缺口
  if (!hasSequenceContext(stem)) return null;

  // 连续年份中恰好跳过一个中间值（只允许一个 2 倍步长）
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
      const missing = [];
      for (let index = 0; index < diffs.length; index++) {
        if (diffs[index] === step * 2) missing.push(unique[index] + step);
      }
      return {
        kind: 'year-sequence',
        values: unique,
        missing,
        detail: `选项年份序列 ${unique.join('/')} 跳号，缺 ${missing.join('/')}`,
      };
    }
  }
  return null;
}

/** 选项纯整数序列缺口（不处理百分数，避免把 10%/20%/40% 这类设计值误判） */
function detectNumberGap(texts) {
  if (texts.length < 4) return null;
  const parsed = [];
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

  const missing = [];
  for (let index = 0; index < diffs.length; index++) {
    if (diffs[index] === step * 2) missing.push(unique[index] + step);
  }
  return {
    kind: 'number-sequence',
    values: unique,
    missing,
    unit,
    detail: `选项数字序列 ${unique.join('/')} 跳号，缺 ${missing.join('/')}`,
  };
}

/** 题干是否明确要求“序列/排序”，用于抑制普通数值选项误判 */
function hasSequenceContext(stem) {
  return /选项(?:年份|数字|数值)?(?:依次|按|排序|顺序|序列)|下列(?:年份|数字|数值|选项)按|按(?:年份|数字|数值)(?:排序|排列)|从小到大|从大到小|年份序列|数字序列/.test(
    String(stem || '')
  );
}

/** 选项年份/数字序列缺口 */
function detectOptionSequenceGap(q) {
  const texts = optionTexts(q);
  if (texts.length < 3) return null;
  const stem = String((q && q.stem) || '');
  const yearGap = detectYearGap(stem, texts);
  if (yearGap) return yearGap;
  // 普通数值选项（1人/2人/3人/5人、30个/35个/40个/50个）不是序列，只有题干明确要求排序时才判缺口
  return hasSequenceContext(stem) ? detectNumberGap(texts) : null;
}

/** 题干是否处于资料分析语境（防止把误标为 ziliao 的普通常识题算进来） */
function isDataContext(q, stem) {
  const optionText = optionTexts(q).join(' ');
  const material = String((q && q.material) || '');
  const hasRef = MATERIAL_REF_RE.test(stem) || MATERIAL_REF_RE.test(material);
  const hasTerm = DATA_TERM_RE.test(stem) || DATA_TERM_RE.test(optionText);
  const hasRange = extractYearRanges(stem).length > 0;
  const hasNumberInOptions = /\d/.test(optionText);

  if (String(q && q.module) === 'ziliao') {
    return hasRef || hasTerm || hasRange || hasNumberInOptions;
  }
  return hasRef || (hasTerm && hasRange);
}

/**
 * 返回 E10 全部命中项；无命中返回 []。
 * @returns {Array<{code:string, detail:string}>}
 */
function getE10Issues(q) {
  if (!q || isSubjective(q) || isImageQuestion(q)) return [];

  const stem = String(q.stem || '');
  const issues = [];

  // A. 材料缺失：资料语境 + 材料无数据 + 题干自身也没有数据
  const material = String(q.material || '');
  if (isDataContext(q, stem) && !hasNumericData(material) && !hasNumericData(stem)) {
    issues.push({
      code: 'E10-A',
      detail: material.trim()
        ? '材料只有占位语/无有效数字，题干未自带数据'
        : '材料为空，题干未自带数据',
    });
  }

  // B. 选项年份/数字序列缺口
  const gap = detectOptionSequenceGap(q);
  if (gap) {
    issues.push({ code: 'E10-B', detail: gap.detail });
  }

  return issues;
}

module.exports = {
  DATA_TERM_RE,
  MATERIAL_REF_RE,
  isDataContext,
  hasNumericData,
  extractYears,
  extractYearRanges,
  detectOptionSequenceGap,
  getE10Issues,
};
