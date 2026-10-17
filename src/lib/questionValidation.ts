import { Question } from '../types';

/**
 * 题目数据校验工具
 *
 * 题库分片中存在少量脏数据，渲染前统一校验：
 *   - 致命问题（题干为空、选项为空等）→ 直接跳过，不渲染
 *   - 可降级问题（多题合并、选项 key 重复等）→ 渲染「本题数据整理中」占位
 *
 * 多题合并类脏数据由 scripts/mark-abnormal-merged.cjs 预先打上 isAbnormal: true，
 * 前端再做一次兜底校验，防止新导入数据漏标。
 */

/** 主观题模块（无固定选项） */
const SUBJECTIVE_MODULES = ['shenlun', 'gongji'];

/** 题号串：1~3 位数字 + 、，其后紧跟汉字（如 "83、下列"） */
const QUESTION_NO_MERGED = /(?<![0-9])[0-9]{1,3}\s*、\s*[\u4e00-\u9fa5]/;

/** 单题 stem + options 总长度上限，超过视为异常 */
const MAX_TOTAL_LENGTH = 500;

/** 是否为无固定选项的主观题 */
export function isSubjectiveQuestion(q: Partial<Question> | null | undefined): boolean {
  if (!q) return false;
  if (SUBJECTIVE_MODULES.includes(String(q.module))) return true;
  // 兼容历史数据里可能存在的 type 字段
  return (q as { type?: string }).type === '主观题';
}

/** 题干是否有效（存在且 trim 后非空） */
export function hasValidStem(q: Partial<Question> | null | undefined): boolean {
  return !!q && typeof q.stem === 'string' && q.stem.trim() !== '';
}

/** 选项是否有效（至少 2 个，且每个选项文本 trim 后非空） */
export function hasValidOptions(q: Partial<Question> | null | undefined): boolean {
  if (!q || !Array.isArray(q.options) || q.options.length < 2) return false;
  return q.options.every(
    opt => opt && typeof opt.text === 'string' && opt.text.trim() !== ''
  );
}

/** 是否为图片题（选项为图片，文本化时丢失） */
export function isImageQuestion(q: Partial<Question> | null | undefined): boolean {
  return !!q && (q as { isImageQuestion?: boolean }).isImageQuestion === true;
}

/** 是否已被标记为异常（多题合并等） */
export function isMarkedAbnormal(q: Partial<Question> | null | undefined): boolean {
  return !!q && (q as { isAbnormal?: boolean }).isAbnormal === true;
}

/** 选项 key 是否有重复（如 [A,A,A,A] / [CDABCDABC]） */
export function hasDuplicateOptionKeys(q: Partial<Question> | null | undefined): boolean {
  if (!q || !Array.isArray(q.options) || q.options.length === 0) return false;
  const keys = q.options.map(o => String(o?.key ?? '').toUpperCase());
  return new Set(keys).size !== keys.length;
}

/** 题干或选项文本中是否含题号串（多题合并特征） */
export function hasMergedQuestionNo(q: Partial<Question> | null | undefined): boolean {
  if (!q) return false;
  if (typeof q.stem === 'string' && QUESTION_NO_MERGED.test(q.stem)) return true;
  if (Array.isArray(q.options)) {
    return q.options.some(o => typeof o?.text === 'string' && QUESTION_NO_MERGED.test(o.text));
  }
  return false;
}

/** stem + options 总长度是否异常 */
export function hasAbnormalLength(q: Partial<Question> | null | undefined): boolean {
  if (!q) return false;
  const stemLen = typeof q.stem === 'string' ? q.stem.length : 0;
  const optLen = Array.isArray(q.options)
    ? q.options.reduce((sum, o) => sum + String(o?.text ?? '').length, 0)
    : 0;
  return stemLen + optLen > MAX_TOTAL_LENGTH;
}

/**
 * 是否为「多题合并」异常题。
 *
 * 判定与 scripts/mark-abnormal-merged.cjs 保持一致：
 *   a. 选项 key 重复
 *   b. 题干或选项含题号串
 *   c. 总长 > 500（仅作 a/b 的佐证，单独命中不算）
 */
export function isMergedAbnormal(q: Partial<Question> | null | undefined): boolean {
  if (!q || isSubjectiveQuestion(q)) return false;
  if (isMarkedAbnormal(q)) return true;
  const dupKey = hasDuplicateOptionKeys(q);
  const mergedNo = hasMergedQuestionNo(q);
  if (!dupKey && !mergedNo) return false;
  // c 仅作佐证，不影响判定结果
  return true;
}

/**
 * 题目是否可渲染：
 * - 题干必须有效
 * - 主观题、图片题允许无选项
 * - 其余客观题必须有有效选项
 *
 * 注意：多题合并题仍返回 true（渲染占位卡片），由调用方用 isMergedAbnormal 判断展示方式。
 */
export function isValidQuestion(q: Partial<Question> | null | undefined): boolean {
  if (!q || typeof q !== 'object') return false;
  if (!hasValidStem(q)) return false;
  if (isSubjectiveQuestion(q) || isImageQuestion(q)) return true;
  return hasValidOptions(q);
}

/** 返回不合格原因（用于日志），合格返回 null */
export function getInvalidReason(q: Partial<Question> | null | undefined): string | null {
  if (!q || typeof q !== 'object') return '题目对象为空';
  if (!hasValidStem(q)) return '题干为空';
  if (!isSubjectiveQuestion(q) && !isImageQuestion(q)) {
    if (!Array.isArray(q.options) || q.options.length === 0) return '缺少选项';
    if (q.options.length < 2) return `选项数量不足（${q.options.length}）`;
    const emptyKeys = q.options
      .filter(opt => !opt || typeof opt.text !== 'string' || opt.text.trim() === '')
      .map(opt => opt?.key ?? '?');
    if (emptyKeys.length > 0) return `选项文本为空（${emptyKeys.join('/')}）`;
  }
  return null;
}

/** 过滤出可渲染的题目，并输出跳过统计 */
export function filterValidQuestions<T extends Partial<Question>>(list: T[]): T[] {
  if (!Array.isArray(list)) return [];
  const skipped: string[] = [];
  const valid = list.filter(q => {
    const reason = getInvalidReason(q);
    if (reason) {
      skipped.push(`${q?.id ?? '(无id)'}: ${reason}`);
      return false;
    }
    return true;
  });
  if (skipped.length > 0) {
    console.warn(`[题库校验] 已跳过 ${skipped.length} 道异常题目`, skipped.slice(0, 20));
  }
  return valid;
}
