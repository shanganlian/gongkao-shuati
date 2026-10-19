/**
 * E07 判定：题干里是否残留"选项标记"（选项被粘进题干）。
 *
 * 背景
 * ----
 * 原规则是一条正则：`(?:^|[\s\n])[A-Da-d]\s*[、.．)）:：]\s*\S`。
 * 它会把数量关系/判断推理题干里的「变量枚举」当成选项标记，典型误报：
 *   - "某单位共有 A、B、C 三个部门……"
 *   - "将一张纸片分成 a、b、c、d 四个部分……"
 *   - "甲、乙两车从 A、B 两地相向开出……"
 *
 * 放宽策略（2026-10-19）
 * --------------------
 * 只有当题干里**所有**选项标记后面紧跟的都是「另一个字母 + 分隔符/空白」时，
 * 才判定为变量枚举并放行；只要有一处标记后面跟着正文（如 "D、某市畜牧兽医局……"），
 * 仍按 E07 报错——那种情况往往是"上一题的选项 D 粘进题干 + 下一题合并"。
 *
 * 另外必须叠加"题目已有独立选项"（options.length >= 2）这一前提：
 * 图片题丢失选项后，题干里会残留 "A、\n\nB、\n\nC、\n\nD、" 这样的标记，
 * 它们同样是"字母链"，但属于真实的内容缺口，不能放行。
 */

/** 题干中的选项标记：行首/空白后的 A、/A./A．/A)/A：，且后面紧跟内容 */
const STEM_OPTION_MARK = /(?:^|[\s\n])[A-Da-d]\s*[、.．\)）:：]\s*\S/;

/** 逐个抓取标记及其后 2 个字符，用于判断是否全部为字母枚举 */
const STEM_MARK_SCAN = /(?:^|[\s\n])([A-Da-d])\s*([、.．\)）:：])\s*([\s\S]{0,2})/g;

/** 标记后紧跟的是"另一个字母 + 分隔符/空白/行尾" */
const LETTER_CHAIN = /^[A-Fa-f](?:[、,，]|\s|$)/;

/** 题干里出现的选项标记是否全部为字母枚举（至少命中一处） */
function isLetterEnumerationOnly(stem) {
  if (typeof stem !== 'string' || stem === '') return false;
  STEM_MARK_SCAN.lastIndex = 0;
  let matched = false;
  let m;
  while ((m = STEM_MARK_SCAN.exec(stem)) !== null) {
    matched = true;
    if (!LETTER_CHAIN.test(m[3])) return false;
  }
  return matched;
}

/**
 * 是否应报 E07。
 * @param {string} stem 题干
 * @param {Array|undefined} options 题目已有的选项
 */
function hasStemOptionMark(stem, options) {
  if (typeof stem !== 'string' || !STEM_OPTION_MARK.test(stem)) return false;
  const opts = Array.isArray(options) ? options : [];
  const letterEnum = opts.length >= 2 && isLetterEnumerationOnly(stem);
  return !letterEnum;
}

/** 返回首个标记位置，用于错误提示（找不到返回 -1） */
function firstMarkPos(stem) {
  if (typeof stem !== 'string') return -1;
  const m = stem.match(STEM_OPTION_MARK);
  return m ? stem.indexOf(m[0]) : -1;
}

module.exports = {
  STEM_OPTION_MARK,
  LETTER_CHAIN,
  isLetterEnumerationOnly,
  hasStemOptionMark,
  firstMarkPos,
};
