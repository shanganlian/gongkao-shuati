/**
 * 扫描变体：stem 末尾粘着第一个选项（A 选项），options 里只剩 B/C/D。
 *
 * 判定条件（满足任一即计入）：
 *   1. stem 末尾出现 "A、" / "A." / "A．" / "A)" 等标记
 *   2. options 存在但 options[0].key !== 'A'（缺 A）
 *   3. options 存在但缺少 key === 'A' 的项
 *
 * 输出：
 *   - 控制台样例清单
 *   - stem_trailing_option_scan.csv（全量明细）
 *
 * 用法：node scripts/scan-stem-trailing-option.cjs [样例数]
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT_CSV = path.join(__dirname, '..', 'stem_trailing_option_scan.csv');
const SAMPLE_N = parseInt(process.argv[2] || '10', 10);

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const SUBJECTIVE = ['shenlun', 'gongji'];

// stem 末尾的 A 选项标记（允许前面有空格/换行）
const TRAILING_A = /(?:^|[\s\n])([Aa])\s*[、.．\)）:：]\s*/g;

const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

/** 找出 stem 中所有 A 标记的位置 */
function findAMarks(stem) {
  if (!stem || typeof stem !== 'string') return [];
  const out = [];
  TRAILING_A.lastIndex = 0;
  let m;
  while ((m = TRAILING_A.exec(stem)) !== null) {
    out.push({ start: m.index, contentStart: m.index + m[0].length });
  }
  return out;
}

const seen = new Set();
const hits = [];

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      if (SUBJECTIVE.includes(q.module)) continue;

      const stem = q.stem || '';
      const opts = Array.isArray(q.options) ? q.options : [];
      const aMarks = findAMarks(stem);

      const hasTrailingA = aMarks.length > 0;
      const firstKeyNotA = opts.length > 0 && String(opts[0]?.key || '').toUpperCase() !== 'A';
      const missingA = opts.length > 0 && !opts.some(o => String(o?.key || '').toUpperCase() === 'A');

      if (!hasTrailingA && !firstKeyNotA && !missingA) continue;

      // 分类：stem 末尾 A 标记是否在最后一段
      let tailLen = 0;
      let tailText = '';
      if (hasTrailingA) {
        const last = aMarks[aMarks.length - 1];
        tailText = stem.slice(last.contentStart).trim();
        tailLen = tailText.length;
      }

      hits.push({
        id: q.id,
        file: f,
        key,
        module: q.module,
        answer: q.answer,
        optKeys: opts.map(o => o?.key).join(''),
        optCount: opts.length,
        hasTrailingA,
        firstKeyNotA,
        missingA,
        tailLen,
        tailText,
        stem
      });
    }
  }
}

// 统计
const stat = {
  total: hits.length,
  onlyTrailingA: hits.filter(h => h.hasTrailingA && !h.firstKeyNotA && !h.missingA).length,
  onlyMissingA: hits.filter(h => !h.hasTrailingA && (h.firstKeyNotA || h.missingA)).length,
  both: hits.filter(h => h.hasTrailingA && (h.firstKeyNotA || h.missingA)).length,
  tailShort: hits.filter(h => h.hasTrailingA && h.tailLen > 0 && h.tailLen < 100).length,
  tailLong: hits.filter(h => h.hasTrailingA && h.tailLen >= 100).length,
  tailEmpty: hits.filter(h => h.hasTrailingA && h.tailLen === 0).length
};

console.log('===== 扫描：stem 末尾粘着 A 选项 =====\n');
console.log(`命中总数: ${stat.total}`);
console.log(`  仅 stem 末尾有 A 标记: ${stat.onlyTrailingA}`);
console.log(`  仅 options 缺 A: ${stat.onlyMissingA}`);
console.log(`  两者都有: ${stat.both}`);
console.log('');
console.log(`  A 标记后内容 < 100 字（像选项）: ${stat.tailShort}`);
console.log(`  A 标记后内容 >= 100 字（可疑）: ${stat.tailLong}`);
console.log(`  A 标记后无内容: ${stat.tailEmpty}`);

console.log(`\n-- 样例（前 ${SAMPLE_N} 条）--`);
for (const h of hits.slice(0, SAMPLE_N)) {
  console.log('='.repeat(70));
  console.log(`id=${h.id}  module=${h.module}  answer=${JSON.stringify(h.answer)}`);
  console.log(`options keys=[${h.optKeys}] (${h.optCount} 个)`);
  console.log(`stem 末尾 A 标记: ${h.hasTrailingA}  尾部长度: ${h.tailLen}`);
  console.log(`stem: ${JSON.stringify(h.stem.slice(-160))}`);
  if (h.hasTrailingA) console.log(`尾部: ${JSON.stringify(h.tailText.slice(0, 120))}`);
}

// CSV
const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = [['id', 'file', 'module', 'answer', 'opt_keys', 'opt_count', 'has_trailing_A', 'first_key_not_A', 'missing_A', 'tail_len', 'tail_text', 'stem_tail']];
for (const h of hits) {
  rows.push([h.id, h.file, h.module, h.answer, h.optKeys, h.optCount, h.hasTrailingA, h.firstKeyNotA, h.missingA, h.tailLen, h.tailText.slice(0, 200), h.stem.slice(-200)]);
}
fs.writeFileSync(OUT_CSV, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');
console.log(`\n明细已写入: ${OUT_CSV}`);
