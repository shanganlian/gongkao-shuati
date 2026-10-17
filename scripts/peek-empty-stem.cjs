/**
 * 查看 empty_stem.csv 中每条题目的 title / options / answer，便于判断能否从 title 拆分
 * 用法：node scripts/peek-empty-stem.cjs
 */
const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, '..', 'empty_stem.csv');
const OUT = path.join(__dirname, 'peek-empty-stem.txt');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const text = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
const header = parseCsvLine(lines[0]);
const rows = lines.slice(1).map(parseCsvLine);

const buf = [];
buf.push(`共 ${rows.length} 条`);
rows.forEach((r, i) => {
  const o = {};
  header.forEach((h, j) => (o[h] = r[j]));
  buf.push('==================================================');
  buf.push(`#${i + 1}  file=${o.file}  index=${o.index}  id=${o.id}  module=${o.module}`);
  buf.push(`title: ${o.title}`);
  buf.push(`stemRaw: ${o.stemRaw}`);
  buf.push(`optionsCount: ${o.optionsCount}`);
  buf.push(`options: ${o.optionsJson}`);
  buf.push(`answer: ${o.answer}`);
});
fs.writeFileSync(OUT, buf.join('\n'), 'utf8');
console.log('written', OUT, 'rows', rows.length);
