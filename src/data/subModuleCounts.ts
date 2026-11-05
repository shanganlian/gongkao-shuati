import countsRaw from './submoduleCounts.json';

/**
 * 二级分类题量快照（构建期由 scripts/build-submodule-counts.cjs 生成）。
 *
 * 前端按需分片加载题目，全国「常识判断」就有 97 个分片 / 约 35MB，
 * 若等分片全部加载完再统计子类题数，chips 会长时间空白。
 * 这里把「范围 → 模块 → 子类」的题数提前打进包里，chips 首屏即可显示。
 *
 * 口径与 useQuestions 的筛选一致：
 *   - total：范围内全部题目（含 low 置信、未分类、申论/公基）；
 *   - subs ：仅统计 subModule_confidence != 'low' 的题目（即二级筛选能命中的题）。
 *   low 与未分类题仍留在「全部」里，只是不计入任何子类 chips。
 */
export interface SubModuleScopeSnapshot {
  total: number;
  subs?: Record<string, number>;
}

export interface SubModuleCountSnapshot {
  generatedAt: string;
  source?: {
    shards?: number;
    questions?: number;
    withSubModule?: number;
    lowConfidence?: number;
    subModuleHigh?: number;
    unclassified?: number;
  };
  scopes: Record<string, SubModuleScopeSnapshot>;
}

export interface ScopeModuleStats {
  /** 快照生成时间（用于排查数据滞后） */
  generatedAt: string;
  /** 当前「考试 + 省份」范围内的题目总数 */
  total: number;
  /** 模块 → 题目总数 */
  totalByModule: Record<string, number>;
  /** 模块 → 子类 → 可筛题数（不含 low 置信） */
  subsByModule: Record<string, Record<string, number>>;
  /** 是否命中快照；false 时调用方应回退到已加载题库现算 */
  hasSubCounts: boolean;
  /** 命中的范围键数量 */
  scopeKeys: number;
}

export const SUB_MODULE_COUNTS = countsRaw as unknown as SubModuleCountSnapshot;

/**
 * 范围键形如 `national-none-changshi` / `provincial-北京-changshi`。
 * 匹配规则与 useQuestions 完全一致：省份为「全部」时全收；选省时联考一起收；
 * 国考的范围键省份段为 `none`。
 */
function matchesScope(key: string, category: string, province: string): boolean {
  const [cat, prov] = key.split('-');
  if (category !== 'all' && cat !== category) return false;
  if (province === 'all') return true;
  if (prov === province) return true;
  if (category === 'national' && prov === 'none') return true;
  return prov === '联考';
}

/** 汇总当前「考试 + 省份」下的模块题量与子类题量 */
export function getScopeModuleStats(category: string, province: string): ScopeModuleStats {
  const totalByModule: Record<string, number> = {};
  const subsByModule: Record<string, Record<string, number>> = {};
  let total = 0;
  let scopeKeys = 0;

  for (const [key, entry] of Object.entries(SUB_MODULE_COUNTS.scopes)) {
    if (!matchesScope(key, category, province)) continue;
    const mod = key.split('-')[2];
    const scopeTotal = Number(entry.total) || 0;
    scopeKeys += 1;
    total += scopeTotal;
    totalByModule[mod] = (totalByModule[mod] || 0) + scopeTotal;

    if (!entry.subs) continue;
    const bucket = (subsByModule[mod] ||= {});
    for (const [sub, count] of Object.entries(entry.subs)) {
      bucket[sub] = (bucket[sub] || 0) + (Number(count) || 0);
    }
  }

  return {
    generatedAt: SUB_MODULE_COUNTS.generatedAt,
    total,
    totalByModule,
    subsByModule,
    hasSubCounts: Object.keys(subsByModule).length > 0,
    scopeKeys,
  };
}
