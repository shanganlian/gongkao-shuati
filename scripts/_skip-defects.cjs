#!/usr/bin/env node
/** 临时：真实缺陷跳过样例（每省前 4 条）明细，判断成因 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const PROVINCES = ['重庆', '广西', '广州', '贵州', '河南', '吉林', '江苏', '辽宁', '内蒙古', '青海', '山东', '四川', '西藏', '新疆'];
const PH = '原卷此题在 Word 文本层缺失';
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const out = [];
for (const province of PROVINCES) {
  const dir = path.join(V2, province);
  let taken = 0;
  for (const f of fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f))) {
    for (const q of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (taken >= 4) break;
      const stem = typeof q.stem === 'string' ? q.stem.trim() : '';
      if (stem.includes(PH)) continue;
      const opts = Array.isArray(q.options) ? q.options : [];
      const module = String(q.module || '');
      let bad = false;
      if (!stem) bad = true;
      else if (module === 'shenlun' || module === 'gongji') bad = false;
      else if (q.isImageQuestion === true) bad = false;
      else if (opts.length < 2) bad = true;
      else if (opts.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) bad = true;
      if (!bad) continue;
      taken += 1;
      out.push({
        id: q.id,
        module: q.module,
        optionsCount: opts.length,
        optionTexts: opts.map(o => cut(o.text, 45)),
        stem: cut(stem, 130),
        material: cut(q.material, 160),
      });
    }
    if (taken >= 4) break;
  }
}
fs.writeFileSync(path.join(ROOT, '_skip-defects.json'), JSON.stringify(out, null, 2), 'utf8');
