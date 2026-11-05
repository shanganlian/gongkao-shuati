/**
 * E09 判定：资料题的“字母占位 / 图表缺失”。
 *
 * 背景
 * ----
 * 2000 国考第 81–85 题共用一张“三角形”图：
 *   stem: "甲城中学生与丁城中学生共同特点是（ ）。"
 *   options: 不喜欢 X 节目 / 不喜欢 Y 节目 / 不喜欢 Z 节目 / 没有共同点
 *   material: 只写了“下面的三角形表示甲、乙、丙、丁、戊五个城市……”，
 *             并给了甲、丙两城的示例数据，乙/丁/戊的数据只在图里。
 * 题目没有 isImageQuestion，也没有图片字段，用户无法作答。
 *
 * 判定口径
 * --------
 * E09-A：选项里出现 >=2 个“字母占位”（X / Y / Z，或“不喜欢 X 节目”这类
 *        字母+事物），且题目依赖图表、材料没有完整数据、也没有图片。
 * E09-B：题干/选项出现多城市（甲城/乙城/…/五个城市）对比，材料引用三角形/
 *        统计图/图表，但没有图片、也没有完整表格数据。
 *
 * 只读判定，不修改题目；扫描脚本负责写 isAbnormal。
 */
'use strict';

const SUBJECTIVE_MODULES = ['shenlun', 'gongji'];

/** 选项中的字母占位：X / Y / Z / 不喜欢 X 节目 / 最喜欢 Y 项目 */
const LETTER_OPTION_RE =
  /^(?:不?喜欢|最?喜欢|偏好|选择)?([A-Z])(?:节目|项目|类别|城市|地区|产品|品牌|方案|课程|活动)?$/;

/** 题干/材料里的“字母+事物”，用来确认字母不是普通代数变量 */
const LETTER_NOUN_RE = /[A-Z](?:节目|项目|类别|城市|地区|产品|品牌|方案|课程|活动)/;

/** 引用图表 */
const CHART_REF_RE =
  /三角形|统计图|统计表|图表|下图|上图|图\s*[1-9一二三四五六七八九]|调查结果/;

/** 甲城/乙城/…/戊城 */
const CITY_RE = /([甲乙丙丁戊])城/g;
const CITY_OPTION_RE = /^[甲乙丙丁戊]城$/;

function normalize(text) {
  return String(text == null ? '' : text)
    .replace(/[\s\u3000\u00a0]+/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

function isSubjective(q) {
  return !!q && SUBJECTIVE_MODULES.includes(String(q.module || ''));
}

function isDataModule(q) {
  const module = String((q && q.module) || '');
  const moduleName = String((q && q.moduleName) || '');
  return module === 'ziliao' || moduleName.includes('资料');
}

function optionTexts(q) {
  return (Array.isArray(q && q.options) ? q.options : []).map(option => normalize(option && option.text));
}

/** 题目是否已经有可渲染/可识别的图片 */
function hasImage(q) {
  if (!q) return false;
  if (q.isImageQuestion === true) return true;
  if (typeof q.imageUrl === 'string' && q.imageUrl.trim() !== '') return true;
  if (typeof q.image === 'string' && q.image.trim() !== '') return true;
  if (Array.isArray(q.images) && q.images.length > 0) return true;
  return false;
}

/**
 * 材料里是否已有完整表格数据（避免把“材料自带表格”的正常资料题误判为缺图）。
 * 判据：markdown/HTML 表格；或 >=2 行、每行 >=3 个数字；或 8 个以上数字且有分号/制表符。
 */
function hasStructuredData(material) {
  const text = String(material || '');
  if (/\|.*\|/.test(text) || /<table/i.test(text)) return true;

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const dataLines = lines.filter(line => (line.match(/\d+(?:\.\d+)?/g) || []).length >= 3);
  if (dataLines.length >= 2) return true;

  const numberCount = (text.match(/\d+(?:\.\d+)?/g) || []).length;
  return numberCount >= 8 && /[；;\t|]/.test(text);
}

function cityLabels(q) {
  const stem = normalize(q && q.stem);
  const options = optionTexts(q);
  const material = normalize(q && q.material);
  const text = `${stem}\n${options.join('\n')}\n${material}`;
  const labels = new Set();
  for (const match of text.match(CITY_RE) || []) labels.add(match[0]);
  return labels;
}

/**
 * 返回 E09 全部命中项；无命中返回 []。
 * @returns {Array<{code:string, detail:string}>}
 */
function getE09Issues(q) {
  if (!q || isSubjective(q) || hasImage(q)) return [];

  const stem = normalize(q.stem);
  const material = normalize(q.material);
  const options = optionTexts(q);
  const text = `${stem}\n${material}\n${options.join('\n')}`;
  const dataModule = isDataModule(q);

  const letterHits = options.filter(option => LETTER_OPTION_RE.test(option));
  const letters = new Set(letterHits.map(option => option.match(LETTER_OPTION_RE)[1]));
  const letterOptions = letterHits.length >= 2 && letters.size >= 2;
  const letterNoun = LETTER_NOUN_RE.test(text);
  const chartRef = CHART_REF_RE.test(`${stem}\n${material}`);
  const structured = hasStructuredData(material);

  const issues = [];

  // E09-A：选项本身就是 X / Y / Z 或“不喜欢 X 节目”这类占位
  if (dataModule && letterOptions && letterNoun && chartRef && !structured) {
    issues.push({
      code: 'E09-A',
      detail: `选项为字母占位（${[...letters].join('/')}），依赖图表但未保留图片`,
    });
  }

  // E09-B：多城市对比 + 图表引用 + 没有完整数据/图片
  const labels = cityLabels(q);
  const cityOptions = options.filter(option => CITY_OPTION_RE.test(option)).length;
  const multiCity = labels.size >= 2 || cityOptions >= 3 || /五个城市|5个城市/.test(text);
  if (dataModule && chartRef && multiCity && letterNoun && !structured) {
    issues.push({
      code: 'E09-B',
      detail: `多城市对比依赖图表（${[...labels].join('/') || '城市选项'}），材料无完整数据/图片`,
    });
  }

  return issues;
}

module.exports = {
  CHART_REF_RE,
  CITY_RE,
  LETTER_NOUN_RE,
  LETTER_OPTION_RE,
  getE09Issues,
  hasImage,
  hasStructuredData,
  isDataModule,
};
