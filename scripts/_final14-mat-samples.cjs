#!/usr/bin/env node
/** 临时：抽查 material 夹带选项的记录全文，判断是「真丢选项」还是「材料重复/例题」 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const PROVINCES = ['重庆', '广西', '广州', '贵州', '河南', '吉林', '江苏', '辽宁', '内蒙古', '青海', '山东', '四川', '西藏', '新疆'];
const MARKS = /(?:^|[\s\n])([ABCD])[、.．]/g;
const has4 = t => {
  const s = new Set();
  let m;
  MARKS.lastIndex = 0;
  while ((m = MARKS.exec(t))) s.add(m[1]);
  return s.size >= 4;
};
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const out = [];
for (const province of PROVINCES) {
  const dir = path.join(V2, province);
  const hits = [];
  for (const f of fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f))) {
    const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const q of arr) {
      if (q.material && has4(q.material)) hits.push(q);
      if (hits.length >= 2) break;
    }
    if (hits.length >= 2) break;
  }
  for (const q of hits) {
    out.push({
      id: q.id,
      optionsCount: (q.options || []).length,
      optionTexts: (q.options || []).map(o => cut(o.text, 40)),
      stem: cut(q.stem, 160),
      material: cut(q.material, 700),
      answer: q.answer,
    });
  }
}
fs.writeFileSync(path.join(ROOT, '_final14-mat-samples.json'), JSON.stringify(out, null, 2), 'utf8');
