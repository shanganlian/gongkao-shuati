import type { Question } from '../types';

/**
 * E09 前端渲染兜底判定，与 scripts/lib/e09-rule.cjs 保持同一口径。
 *
 * 命中后由 PracticeArena 渲染「本题数据整理中」占位，避免用户看到
 * “X / Y / Z 节目”这类缺图占位题。
 */

export interface E09Issue {
  code: 'E09-A' | 'E09-B';
  detail: string;
}

type CheckableQuestion = Partial<Question> & { moduleName?: string };

const SUBJECTIVE_MODULES = ['shenlun', 'gongji'];

const LETTER_OPTION_RE =
  /^(?:不?喜欢|最?喜欢|偏好|选择)?([A-Z])(?:节目|项目|类别|城市|地区|产品|品牌|方案|课程|活动)?$/;
const LETTER_NOUN_RE = /[A-Z](?:节目|项目|类别|城市|地区|产品|品牌|方案|课程|活动)/;
const CHART_REF_RE = /三角形|统计图|统计表|图表|下图|上图|图\s*[1-9一二三四五六七八九]|调查结果/;
const CITY_RE = /([甲乙丙丁戊])城/g;
const CITY_OPTION_RE = /^[甲乙丙丁戊]城$/;

function normalize(text: unknown): string {
  return String(text == null ? '' : text)
    .replace(/[\s\u3000\u00a0]+/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

function isSubjective(q: CheckableQuestion): boolean {
  return SUBJECTIVE_MODULES.includes(String(q.module || ''));
}

function isDataModule(q: CheckableQuestion): boolean {
  return String(q.module || '') === 'ziliao' || String(q.moduleName || '').includes('资料');
}

function optionTexts(q: CheckableQuestion): string[] {
  return (Array.isArray(q.options) ? q.options : []).map(option => normalize(option?.text));
}

function hasImage(q: CheckableQuestion): boolean {
  if (q.isImageQuestion === true) return true;
  if (typeof q.imageUrl === 'string' && q.imageUrl.trim() !== '') return true;
  const legacy = q as CheckableQuestion & { image?: string; images?: string[] };
  if (typeof legacy.image === 'string' && legacy.image.trim() !== '') return true;
  return Array.isArray(legacy.images) && legacy.images.length > 0;
}

function hasStructuredData(material: unknown): boolean {
  const text = String(material || '');
  if (/\|.*\|/.test(text) || /<table/i.test(text)) return true;

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const dataLines = lines.filter(line => (line.match(/\d+(?:\.\d+)?/g) || []).length >= 3);
  if (dataLines.length >= 2) return true;

  const numberCount = (text.match(/\d+(?:\.\d+)?/g) || []).length;
  return numberCount >= 8 && /[；;\t|]/.test(text);
}

function cityLabels(q: CheckableQuestion): string[] {
  const stem = normalize(q.stem);
  const options = optionTexts(q);
  const material = normalize(q.material);
  const text = `${stem}\n${options.join('\n')}\n${material}`;
  const labels = new Set<string>();
  for (const match of text.match(CITY_RE) || []) labels.add(match[0]);
  return [...labels];
}

/** 返回 E09 命中项；无命中返回空数组 */
export function getE09Issues(q: CheckableQuestion | null | undefined): E09Issue[] {
  if (!q || isSubjective(q) || hasImage(q)) return [];

  const stem = normalize(q.stem);
  const material = normalize(q.material);
  const options = optionTexts(q);
  const text = `${stem}\n${material}\n${options.join('\n')}`;

  const letterHits = options.filter(option => LETTER_OPTION_RE.test(option));
  const letters = new Set(letterHits.map(option => option.match(LETTER_OPTION_RE)?.[1] || ''));
  const letterOptions = letterHits.length >= 2 && letters.size >= 2;
  const letterNoun = LETTER_NOUN_RE.test(text);
  const chartRef = CHART_REF_RE.test(`${stem}\n${material}`);
  const structured = hasStructuredData(material);
  const issues: E09Issue[] = [];

  if (isDataModule(q) && letterOptions && letterNoun && chartRef && !structured) {
    issues.push({
      code: 'E09-A',
      detail: `选项为字母占位（${[...letters].filter(Boolean).join('/')}），依赖图表但未保留图片`,
    });
  }

  const labels = cityLabels(q);
  const cityOptions = options.filter(option => CITY_OPTION_RE.test(option)).length;
  const multiCity = labels.length >= 2 || cityOptions >= 3 || /五个城市|5个城市/.test(text);
  if (isDataModule(q) && chartRef && multiCity && letterNoun && !structured) {
    issues.push({
      code: 'E09-B',
      detail: `多城市对比依赖图表（${labels.join('/') || '城市选项'}），材料无完整数据/图片`,
    });
  }

  return issues;
}

/** 是否应渲染异常占位（E09 前端兜底） */
export function isE09Abnormal(q: CheckableQuestion | null | undefined): boolean {
  return getE09Issues(q).length > 0;
}
