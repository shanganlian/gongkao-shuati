/**
 * E07 规则回归测试
 *
 * 目的：确认放宽后的 E07（变量枚举豁免）没有把真实缺陷一起放行。
 *
 * 用法：
 *   node scripts/test-e07-rule.cjs                        # 默认校验 questions-v2
 *   node scripts/test-e07-rule.cjs --dir public/data/questions-v2
 *
 * 校验四条不变量：
 *   1. 新规则命中的题目，必须是旧规则命中的子集（规则只能放宽，不能凭空扩大）
 *   2. 被放行的题目，必须同时满足：已有 >=2 个选项，且题干中的标记全为字母枚举
 *   3. 旧规则命中且**没有选项**的题目（图片题/真缺口），新规则必须依然命中
 *   4. 有选项但标记后跟正文的题目（如选项 D 粘进题干），新规则必须依然命中
 *
 * 退出码：有违反 → 1；全部通过 → 0
 */
const fs = require('fs');
const path = require('path');

const { isLetterEnumerationOnly, hasStemOptionMark } = require('./lib/stem-option-mark.cjs');

const DIR_IDX = process.argv.indexOf('--dir');
const DATA_DIR = DIR_IDX > -1
  ? path.resolve(process.argv[DIR_IDX + 1])
  : path.join(__dirname, '..', 'public', 'data', 'questions-v2');

/** 旧规则（2026-10-19 之前），冻结在此，作为对照基准 */
const OLD_STEM_OPTION_MARK = /(?:^|[\s\n])[A-Da-d]\s*[、.．\)）:：]\s*\S/;

const INDEX_FILE = path.join(DATA_DIR, 'index.json');
if (!fs.existsSync(INDEX_FILE)) {
  console.error(`[致命] 未找到 index.json: ${INDEX_FILE}`);
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

const violations = [];
const exempted = [];
const seen = new Set();
let total = 0;
let oldHits = 0;
let newHits = 0;

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      total++;

      const stem = typeof q.stem === 'string' ? q.stem : '';
      const opts = Array.isArray(q.options) ? q.options : [];
      const oldHit = OLD_STEM_OPTION_MARK.test(stem);
      const newHit = hasStemOptionMark(stem, opts);
      if (oldHit) oldHits++;
      if (newHit) newHits++;

      // 不变量 1：不得凭空扩大
      if (newHit && !oldHit) {
        violations.push({ rule: 1, id: q.id, why: '新规则命中但旧规则未命中' });
      }

      if (oldHit && !newHit) {
        exempted.push({ id: q.id, optCount: opts.length, chain: isLetterEnumerationOnly(stem) });

        // 不变量 2：放行条件必须成立
        if (!(opts.length >= 2 && isLetterEnumerationOnly(stem))) {
          violations.push({
            rule: 2, id: q.id,
            why: `被放行但不满足豁免条件（optCount=${opts.length}, chain=${isLetterEnumerationOnly(stem)}）`,
          });
        }
      }

      // 不变量 3：无选项的真缺口不得放行
      if (oldHit && opts.length === 0 && !newHit) {
        violations.push({ rule: 3, id: q.id, why: '无选项（图片题/真缺口）被放行' });
      }

      // 不变量 4：标记后跟正文的有选项题目不得放行
      if (oldHit && opts.length > 0 && !isLetterEnumerationOnly(stem) && !newHit) {
        violations.push({ rule: 4, id: q.id, why: '标记后跟正文（疑似选项粘连/串题）被放行' });
      }
    }
  }
}

const optDist = {};
for (const e of exempted) {
  const k = `optCount=${e.optCount}`;
  optDist[k] = (optDist[k] || 0) + 1;
}

console.log('===== E07 规则回归测试 =====\n');
console.log(`数据集: ${DATA_DIR}`);
console.log(`题目总数: ${total}`);
console.log(`旧规则命中: ${oldHits}`);
console.log(`新规则命中: ${newHits}`);
console.log(`本次放行（变量枚举）: ${exempted.length}`);
console.log('放行题目选项数分布:', JSON.stringify(optDist), '\n');

if (exempted.length > 0) {
  console.log('放行清单:');
  for (const e of exempted) console.log(`  ${e.id}  optCount=${e.optCount}  chain=${e.chain}`);
  console.log('');
}

if (violations.length > 0) {
  console.error(`[FAIL] 违反 ${violations.length} 条不变量：`);
  for (const v of violations) console.error(`  规则${v.rule} ${v.id}: ${v.why}`);
  process.exit(1);
}

console.log('[PASS] 四条不变量全部通过：无真错漏网，无凭空扩大。');
