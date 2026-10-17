/**
 * 分析"缺少选项"题目的构成，判断哪些可修复、哪些是源数据缺失。
 * 用法：node scripts/analyze-missing-options.cjs
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT = path.join(__dirname, 'missing-options-analysis.txt');
const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));

const SUBJECTIVE = ['shenlun', 'gongji'];
const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

// 选项标记：A、/A./A．/A) 等变体
const OPT_MARK = /(?:^|[\s\n])([A-D])\s*[、.．\)）:：]/g;

const lines = [];
const log = s => { lines.push(s); console.log(s); };

const seen = new Set();
const stats = {
  total: 0,
  noAnswer: 0,
  hasAnswer: 0,
  stemHasOptions: 0,   // stem 里能拆出 >=2 个选项
  titleHasOptions: 0,  // title 里能拆出 >=2 个选项
  noOptionsAnywhere: 0 // 哪里都拆不出
};
const byModule = {};
const fixable = [];
const unfixable = [];

function countMarks(text) {
  if (!text) return 0;
  const m = text.match(OPT_MARK);
  return m ? new Set(m.map(x => x.trim()[0])).size : 0;
}

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      if (SUBJECTIVE.includes(q.module)) continue;
      if (Array.isArray(q.options) && q.options.length >= 2) continue;

      stats.total++;
      byModule[q.module] = (byModule[q.module] || 0) + 1;
      if (!q.answer || String(q.answer).trim() === '') stats.noAnswer++;
      else stats.hasAnswer++;

      const stemMarks = countMarks(q.stem);
      const titleMarks = countMarks(q.title);
      if (stemMarks >= 2) { stats.stemHasOptions++; fixable.push({ q, from: 'stem', marks: stemMarks }); }
      else if (titleMarks >= 2) { stats.titleHasOptions++; fixable.push({ q, from: 'title', marks: titleMarks }); }
      else { stats.noOptionsAnywhere++; unfixable.push(q); }
    }
  }
}

log('===== "缺少选项"题目构成分析 =====\n');
log(`总数: ${stats.total}`);
log(`  有答案: ${stats.hasAnswer}`);
log(`  无答案: ${stats.noAnswer}`);
log('');
log(`  stem 中可拆出选项: ${stats.stemHasOptions}`);
log(`  title 中可拆出选项: ${stats.titleHasOptions}`);
log(`  任何字段都拆不出选项: ${stats.noOptionsAnywhere}`);
log('');
log('按模块分布:');
for (const [m, c] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) {
  log(`  ${m.padEnd(10)} ${c}`);
}

log('\n-- 可修复样本（前 5 条）--');
for (const { q, from, marks } of fixable.slice(0, 5)) {
  log(`  [${from} 标记数=${marks}] ${q.id}`);
  log(`    stem=${JSON.stringify((q.stem || '').slice(0, 150))}`);
  log(`    title=${JSON.stringify((q.title || '').slice(0, 150))}`);
}

log('\n-- 不可修复样本（前 5 条）--');
for (const q of unfixable.slice(0, 5)) {
  log(`  ${q.id}  answer=${JSON.stringify(q.answer)}`);
  log(`    stem=${JSON.stringify((q.stem || '').slice(0, 150))}`);
}

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('\n报告已写入:', OUT);
