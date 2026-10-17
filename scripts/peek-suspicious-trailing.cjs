/**
 * 查看可疑样本：
 *   A. 尾部 >= 100 字的（可能是正常引用 "A、B 两地"）
 *   B. options 已含 A 但 stem 末尾仍有 A 标记（重复残留）
 *   C. 尾部为空的
 *
 * 用法：node scripts/peek-suspicious-trailing.cjs
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const SUBJECTIVE = ['shenlun', 'gongji'];
const TRAILING_A = /(?:^|[\s\n])([Aa])\s*[、.．\)）:：]\s*/g;

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

const seen = new Set();
const longTail = [], dupA = [], emptyTail = [];

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
      const hasA = opts.some(o => String(o?.key || '').toUpperCase() === 'A');

      if (tail.length >= 100) longTail.push({ q, tail });
      else if (tail.length === 0) emptyTail.push({ q });
      else if (hasA) dupA.push({ q, tail });
    }
  }
}

const show = (title, list, n = 6) => {
  console.log(`\n${'='.repeat(70)}\n${title}  共 ${list.length} 条\n${'='.repeat(70)}`);
  for (const it of list.slice(0, n)) {
    const q = it.q;
    console.log(`id=${q.id}  answer=${JSON.stringify(q.answer)}  optKeys=[${(q.options || []).map(o => o?.key).join('')}]`);
    console.log(`  stem 尾部: ${JSON.stringify((q.stem || '').slice(-220))}`);
    if (it.tail !== undefined) console.log(`  截出尾部(${it.tail.length}字): ${JSON.stringify(it.tail.slice(0, 160))}`);
  }
};

show('A. 尾部 >= 100 字（疑似正常引用，需人工判断）', longTail);
show('B. options 已含 A，但 stem 末尾仍有 A 标记（重复残留）', dupA);
show('C. A 标记后无内容', emptyTail);
