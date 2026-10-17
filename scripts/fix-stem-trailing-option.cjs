/**
 * 修复变体：stem 末尾粘着 A 选项。
 *
 * 三类处理策略：
 *   [REPAIR]   options 缺 A + stem 末尾有 A 标记 + 尾部像选项
 *              → 截出尾部作为 A 选项，插到 options 最前，stem 保留截断后的干净题干
 *   [CLEAN]    options 已含 A + stem 末尾有 A 标记 + 尾部像选项
 *              → 只清理 stem 尾部（重复残留），不动 options
 *   [MANUAL]   判断不了的（尾部过长/为空、选项数组混乱、选项 key 重复等）
 *              → 进人工清单，不改数据
 *
 * 边界防护（任一命中即判 MANUAL，不自动切）：
 *   1. 尾部长度 >= 100 字（多为 "A、B 两地" 这类正常引用）
 *   2. 尾部为空
 *   3. 尾部含后续选项标记（B、/C、/D、），说明是多题合并
 *   4. 尾部含题号（如 "17\n"），说明是多题合并
 *   5. options 的 key 有重复（如 [CDABCDABC]），说明是多题合并
 *   6. 尾部以标点/虚词开头，不像选项内容
 *
 * 用法：
 *   node scripts/fix-stem-trailing-option.cjs          # dry-run
 *   node scripts/fix-stem-trailing-option.cjs --apply  # 实际写回
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const APPLY = process.argv.includes('--apply');
const OUT_CSV = path.join(__dirname, '..', 'stem_trailing_option_fix_report.csv');
const OUT_MANUAL = path.join(__dirname, '..', 'stem_trailing_option_manual.csv');

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const SUBJECTIVE = ['shenlun', 'gongji'];

const TRAILING_A = /(?:^|[\s\n])([Aa])\s*[、.．\)）:：]\s*/g;
const LATER_OPT_MARK = /[\s\n][B-Db-d]\s*[、.．\)）:：]/;
const QUESTION_NO = /(?:^|[\s\n])\d{1,3}\s*(?:[、.．]|\n)/;
const MAX_TAIL_LEN = 100;

// 防护：截断后 stem 以连接词结尾 → 说明 A 是句中成分（如"坐在同一排的 A、B、C、D 五个座位"）
const DANGLING_END = /[的是为在和与及或、，,（(【\[“"‘'—\-]$/;
// 防护：截断后 stem 必须以句末标点结尾，才算语义完整
const SENTENCE_END = /[：:？?。！!；;…]$/;

const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

function findAMarks(stem) {
  if (!stem) return [];
  const out = [];
  TRAILING_A.lastIndex = 0;
  let m;
  while ((m = TRAILING_A.exec(stem)) !== null) {
    out.push({ start: m.index, contentStart: m.index + m[0].length });
  }
  return out;
}

/** 选项 key 是否有重复 */
function hasDupKeys(opts) {
  const keys = opts.map(o => String(o?.key || '').toUpperCase());
  return new Set(keys).size !== keys.length;
}

const seen = new Set();
const repair = [], clean = [], manual = [];

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      if (SUBJECTIVE.includes(q.module)) continue;

      const stem = q.stem || '';
      const opts = Array.isArray(q.options) ? q.options : [];
      const marks = findAMarks(stem);
      if (marks.length === 0) continue;

      const last = marks[marks.length - 1];
      const tail = stem.slice(last.contentStart).trim();
      const cleanStem = stem.slice(0, last.start).trim();
      const hasA = opts.some(o => String(o?.key || '').toUpperCase() === 'A');

      // ---- 边界防护 ----
      const reasons = [];
      if (tail.length === 0) reasons.push('尾部为空');
      if (tail.length >= MAX_TAIL_LEN) reasons.push(`尾部过长(${tail.length}字)`);
      if (LATER_OPT_MARK.test(tail)) reasons.push('尾部含后续选项标记');
      if (QUESTION_NO.test(tail)) reasons.push('尾部含题号');
      if (hasDupKeys(opts)) reasons.push(`选项key重复[${opts.map(o => o?.key).join('')}]`);
      if (!cleanStem) reasons.push('截断后题干为空');
      // 防护：截断后 stem 以连接词结尾 → A 是句中成分，不是选项
      if (cleanStem && DANGLING_END.test(cleanStem)) reasons.push('截断后题干以连接词结尾');
      // 防护：截断后 stem 不以句末标点结尾 → 语义不完整
      if (cleanStem && !SENTENCE_END.test(cleanStem)) reasons.push('截断后题干无句末标点');

      const rec = { id: q.id, file: f, key, module: q.module, answer: q.answer,
        optKeys: opts.map(o => o?.key).join(''), tail, cleanStem, stem, opts };

      if (reasons.length > 0) {
        manual.push({ ...rec, reasons });
      } else if (hasA) {
        clean.push(rec);
      } else {
        repair.push(rec);
      }
    }
  }
}

// ---- 报告 ----
const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

const rows = [['id', 'file', 'module', 'action', 'answer', 'opt_keys_before', 'opt_keys_after', 'tail_len', 'tail_text', 'stem_after']];
for (const r of repair) {
  rows.push([r.id, r.file, r.module, 'REPAIR', r.answer, r.optKeys, 'A' + r.optKeys, r.tail.length, r.tail.slice(0, 150), r.cleanStem.slice(-150)]);
}
for (const r of clean) {
  rows.push([r.id, r.file, r.module, 'CLEAN', r.answer, r.optKeys, r.optKeys, r.tail.length, r.tail.slice(0, 150), r.cleanStem.slice(-150)]);
}
for (const r of manual) {
  rows.push([r.id, r.file, r.module, 'MANUAL', r.answer, r.optKeys, r.optKeys, r.tail.length, r.tail.slice(0, 150), r.reasons.join('; ')]);
}
fs.writeFileSync(OUT_CSV, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');

const mrows = [['id', 'file', 'module', 'answer', 'opt_keys', 'reasons', 'tail_text', 'stem_tail']];
for (const r of manual) {
  mrows.push([r.id, r.file, r.module, r.answer, r.optKeys, r.reasons.join('; '), r.tail.slice(0, 200), r.stem.slice(-200)]);
}
fs.writeFileSync(OUT_MANUAL, '\uFEFF' + mrows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');

console.log('===== stem 末尾粘 A 选项：修复报告 =====\n');
console.log(`[REPAIR] 截出 A 选项重建 options: ${repair.length}`);
console.log(`[CLEAN]  仅清理 stem 尾部（A 已存在）: ${clean.length}`);
console.log(`[MANUAL] 进人工清单（不自动改）: ${manual.length}`);
console.log(`\n报告: ${OUT_CSV}`);
console.log(`人工清单: ${OUT_MANUAL}`);

console.log('\n-- REPAIR 样例（前 6 条）--');
for (const r of repair.slice(0, 6)) {
  console.log(`  ${r.id}  [${r.optKeys}] → [A${r.optKeys}]`);
  console.log(`    A 选项: ${JSON.stringify(r.tail.slice(0, 90))}`);
  console.log(`    stem 后: ${JSON.stringify(r.cleanStem.slice(-90))}`);
}

console.log('\n-- CLEAN 样例（前 4 条）--');
for (const r of clean.slice(0, 4)) {
  console.log(`  ${r.id}  [${r.optKeys}]`);
  console.log(`    移除尾部: ${JSON.stringify(r.tail.slice(0, 90))}`);
  console.log(`    stem 后: ${JSON.stringify(r.cleanStem.slice(-90))}`);
}

console.log('\n-- MANUAL 原因分布 --');
const reasonCount = {};
for (const r of manual) for (const x of r.reasons) reasonCount[x] = (reasonCount[x] || 0) + 1;
for (const [k, v] of Object.entries(reasonCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

if (!APPLY) {
  console.log('\n[dry-run] 未写入文件。加 --apply 执行实际修复。');
  process.exit(0);
}

// ---- 写回 ----
const repairById = new Map(repair.map(r => [r.id, r]));
const cleanById = new Map(clean.map(r => [r.id, r]));

let changedFiles = 0, changedQ = 0;
for (const f of Object.keys(cache)) {
  let dirty = false;
  for (const q of cache[f]) {
    const rp = repairById.get(q.id);
    if (rp) {
      q.stem = rp.cleanStem;
      q.options = [{ key: 'A', text: rp.tail }, ...(Array.isArray(q.options) ? q.options : [])];
      dirty = true; changedQ++;
      continue;
    }
    const cl = cleanById.get(q.id);
    if (cl) {
      q.stem = cl.cleanStem;
      dirty = true; changedQ++;
    }
  }
  if (dirty) {
    fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(cache[f], null, 2), 'utf8');
    changedFiles++;
  }
}
console.log(`\n[apply] 已修改 ${changedFiles} 个分片文件，${changedQ} 道题。`);
