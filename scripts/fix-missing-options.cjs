/**
 * 修复"缺少选项"的题目：
 *   A. 能从 stem 中拆出选项的（约 58 道）→ 重建 options，stem 回填剩余部分
 *   B. 拆不出的（约 1158 道，多为图形推理题，选项为图片）→ 标记 isImageQuestion: true
 *
 * 用法：
 *   node scripts/fix-missing-options.cjs          # dry-run，只出报告
 *   node scripts/fix-missing-options.cjs --apply  # 实际写回分片文件
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const APPLY = process.argv.includes('--apply');
const OUT_CSV = path.join(__dirname, '..', 'missing_options_fix_report.csv');

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const SUBJECTIVE = ['shenlun', 'gongji'];

// 选项标记：A、/A./A．/A)/A）/A:/A：，允许前面有空格；兼容小写 a-d
const OPT_SPLIT = /(?:^|[\s\n])([A-Da-d])\s*[、.．\)）:：]\s*/g;

// 选项文本中不应出现的"下一题"痕迹：如 "5、" "6." 等题号
const NEXT_QUESTION = /(?:^|[\s\n])\d{1,3}\s*[、.．]/;
// 选项文本中残留的选项标记（说明拆分不完整）
const RESIDUAL_MARK = /[\s\n][A-Da-d]\s*[、.．\)）:：]/;

/**
 * 从文本中拆出选项。
 * 返回 { stem, options } 或 null（拆不出 >=2 个选项）
 */
function splitOptions(text) {
  if (!text || typeof text !== 'string') return null;

  // 收集所有标记位置
  const marks = [];
  OPT_SPLIT.lastIndex = 0;
  let m;
  while ((m = OPT_SPLIT.exec(text)) !== null) {
    marks.push({ key: m[1], start: m.index, contentStart: m.index + m[0].length });
  }
  if (marks.length < 2) return null;

  // 只保留从 A 开始、且 key 递增的连续序列（统一转大写比较）
  const seq = [];
  let expected = 'A';
  for (const mk of marks) {
    const k = mk.key.toUpperCase();
    if (k === expected) {
      seq.push({ ...mk, key: k });
      expected = String.fromCharCode(expected.charCodeAt(0) + 1);
    }
  }
  if (seq.length < 2) return null;

  const stem = text.slice(0, seq[0].start).trim();
  if (!stem) return null;

  const options = [];
  for (let i = 0; i < seq.length; i++) {
    const end = i + 1 < seq.length ? seq[i + 1].start : text.length;
    const optText = text.slice(seq[i].contentStart, end).trim();
    if (!optText) return null; // 有空选项，视为拆分失败
    // 防护1：选项里混入了下一题的题号（如 "5、"），说明题干拼接了多道题
    if (NEXT_QUESTION.test(optText)) return null;
    // 防护2：选项里残留未识别的选项标记，说明拆分不完整
    if (RESIDUAL_MARK.test(optText)) return null;
    options.push({ key: seq[i].key, text: optText });
  }

  return { stem, options };
}

const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

const seen = new Set();
const repaired = [];   // 可修复
const imageMarked = []; // 标记为图片题
const failed = [];     // 修复失败

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      if (SUBJECTIVE.includes(q.module)) continue;
      if (Array.isArray(q.options) && q.options.length >= 2) continue;

      const r = splitOptions(q.stem);
      if (r) {
        repaired.push({ file: f, key, q, stem: r.stem, options: r.options });
      } else {
        imageMarked.push({ file: f, key, q });
      }
    }
  }
}

// 写 CSV 报告
const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = [['id', 'file', 'module', 'action', 'stem_preview', 'options_preview', 'answer']];
for (const r of repaired) {
  rows.push([r.q.id, r.file, r.q.module, 'repaired', r.stem.slice(0, 80),
    r.options.map(o => `${o.key}.${o.text}`).join(' | ').slice(0, 120), r.q.answer]);
}
for (const r of imageMarked) {
  rows.push([r.q.id, r.file, r.q.module, 'marked_image', (r.q.stem || '').slice(0, 80), '', r.q.answer]);
}
fs.writeFileSync(OUT_CSV, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');

console.log('===== 缺选项题修复报告 =====');
console.log(`可修复（从 stem 拆出选项）: ${repaired.length}`);
console.log(`标记为图片题: ${imageMarked.length}`);
console.log(`修复失败: ${failed.length}`);
console.log(`报告: ${OUT_CSV}`);

console.log('\n-- 可修复样本（前 8 条）--');
for (const r of repaired.slice(0, 8)) {
  console.log(`  ${r.q.id}`);
  console.log(`    stem: ${JSON.stringify(r.stem.slice(0, 90))}`);
  console.log(`    opts: ${r.options.map(o => `${o.key}.${o.text}`).join(' | ').slice(0, 140)}`);
}

if (!APPLY) {
  console.log('\n[dry-run] 未写入文件。加 --apply 执行实际修复。');
  process.exit(0);
}

// ===== 实际写回 =====
const repairedById = new Map(repaired.map(r => [r.q.id, r]));
const imageIds = new Set(imageMarked.map(r => r.q.id));

let changedFiles = 0, changedQuestions = 0;
for (const f of Object.keys(cache)) {
  let dirty = false;
  for (const q of cache[f]) {
    const r = repairedById.get(q.id);
    if (r) {
      q.stem = r.stem;
      q.options = r.options;
      dirty = true;
      changedQuestions++;
    } else if (imageIds.has(q.id)) {
      q.isImageQuestion = true;
      dirty = true;
      changedQuestions++;
    }
  }
  if (dirty) {
    fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(cache[f], null, 2), 'utf8');
    changedFiles++;
  }
}

console.log(`\n[apply] 已修改 ${changedFiles} 个分片文件，${changedQuestions} 道题。`);
