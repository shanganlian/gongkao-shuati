/**
 * 抽样查看"缺少选项"的题目，确认选项藏在哪个字段。
 * 用法：node scripts/peek-missing-options.cjs [数量]
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const LIMIT = parseInt(process.argv[2] || '8', 10);

const SUBJECTIVE = ['shenlun', 'gongji'];
const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

const samples = [];
const seen = new Set();
for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      if (SUBJECTIVE.includes(q.module)) continue;
      if (Array.isArray(q.options) && q.options.length >= 2) continue;
      samples.push({ key, file: f, q });
    }
  }
}

console.log(`缺少选项的题目总数: ${samples.length}\n`);
for (const { key, file, q } of samples.slice(0, LIMIT)) {
  console.log('='.repeat(70));
  console.log(`key=${key}  file=${file}`);
  console.log(`id=${q.id}  module=${q.module}  answer=${JSON.stringify(q.answer)}`);
  console.log(`options=${JSON.stringify(q.options)}`);
  console.log(`title=${JSON.stringify(q.title)}`);
  console.log(`stem=${JSON.stringify(q.stem)}`);
  console.log(`material=${JSON.stringify((q.material || '').slice(0, 120))}`);
}
