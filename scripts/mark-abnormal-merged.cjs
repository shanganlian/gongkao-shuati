/**
 * 给「多题合并」脏数据打 isAbnormal: true 标记。
 *
 * 判定逻辑与 scan-abnormal-merged.cjs 完全一致：
 *   a. options 存在重复 key
 *   b. stem 或任一 option.text 内匹配 /[0-9]{1,3}、/ 且其后紧跟汉字
 *   c. stem + options 总长 > 500（仅作 a/b 的佐证，单独命中不标记）
 *
 * 只写 isAbnormal 字段，不改动 stem / options / answer 内容。
 *
 * 用法：
 *   node scripts/mark-abnormal-merged.cjs           # dry-run
 *   node scripts/mark-abnormal-merged.cjs --apply   # 实际写入
 *   node scripts/mark-abnormal-merged.cjs --clear --apply   # 清除标记
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const APPLY = process.argv.includes('--apply');
const CLEAR = process.argv.includes('--clear');

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const SUBJECTIVE = ['shenlun', 'gongji'];
const QUESTION_NO_MERGED = /(?<![0-9])[0-9]{1,3}\s*、\s*[\u4e00-\u9fa5]/g;
const MAX_TOTAL_LEN = 500;

const hasDupKeys = opts => {
  const keys = opts.map(o => String(o?.key || '').toUpperCase());
  return new Set(keys).size !== keys.length;
};

const hasQuestionNo = text => {
  if (!text || typeof text !== 'string') return false;
  QUESTION_NO_MERGED.lastIndex = 0;
  return QUESTION_NO_MERGED.test(text);
};

/** 判定单题是否为多题合并 */
function isMerged(q) {
  const stem = typeof q.stem === 'string' ? q.stem : '';
  const opts = Array.isArray(q.options) ? q.options : [];

  const dupKey = opts.length > 0 && hasDupKeys(opts);
  const noSignal = hasQuestionNo(stem) || opts.some(o => hasQuestionNo(o?.text));
  if (!dupKey && !noSignal) return false;

  // c 仅作佐证，不影响判定结果
  return true;
}

// 收集所有分片文件（去重）
const files = new Set();
for (const key of Object.keys(index)) for (const f of index[key]) files.add(f);

let marked = 0;
let cleared = 0;
let changedFiles = 0;
const byModule = {};
const byExam = {};

for (const f of files) {
  const p = path.join(DATA_DIR, f);
  const list = JSON.parse(fs.readFileSync(p, 'utf8'));
  let dirty = false;

  for (const q of list) {
    if (SUBJECTIVE.includes(q.module)) continue;

    if (CLEAR) {
      if (q.isAbnormal === true) {
        delete q.isAbnormal;
        cleared++;
        dirty = true;
      }
      continue;
    }

    if (isMerged(q)) {
      if (q.isAbnormal !== true) {
        q.isAbnormal = true;
        marked++;
        dirty = true;
      }
      const parts = f.split('-');
      byExam[parts[0]] = (byExam[parts[0]] || 0) + 1;
      byModule[q.module] = (byModule[q.module] || 0) + 1;
    }
  }

  if (dirty) {
    changedFiles++;
    if (APPLY) fs.writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
  }
}

console.log('===== 多题合并标记 =====\n');
if (CLEAR) {
  console.log(`[${APPLY ? 'apply' : 'dry-run'}] 清除 isAbnormal: ${cleared} 道，涉及 ${changedFiles} 个分片`);
} else {
  console.log(`[${APPLY ? 'apply' : 'dry-run'}] 新标记 isAbnormal: ${marked} 道，涉及 ${changedFiles} 个分片`);
  console.log('\n-- 按考试 --');
  for (const [k, v] of Object.entries(byExam).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log('\n-- 按模块 --');
  for (const [k, v] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`);
}
if (!APPLY) console.log('\n[dry-run] 未写入文件。加 --apply 执行实际写入。');
