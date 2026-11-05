#!/usr/bin/env node
/** 临时：按 publish 同口径复算每省跳过构成（占位题 vs 真实缺陷） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const PROVINCES = ['重庆', '广西', '广州', '贵州', '河南', '吉林', '江苏', '辽宁', '内蒙古', '青海', '山东', '四川', '西藏', '新疆'];
const PH = '原卷此题在 Word 文本层缺失';
const rows = [];
for (const province of PROVINCES) {
  const dir = path.join(V2, province);
  let total = 0, skip = 0, ph = 0, phNoOpt = 0, defect = 0;
  let defectSample = [];
  for (const f of fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f))) {
    for (const q of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      total += 1;
      const stem = typeof q.stem === 'string' ? q.stem.trim() : '';
      const isPh = stem.includes(PH);
      if (isPh) ph += 1;
      const opts = Array.isArray(q.options) ? q.options : [];
      const module = String(q.module || '');
      let bad = false;
      if (!stem) bad = true;
      else if (module === 'shenlun' || module === 'gongji') bad = false;
      else if (q.isImageQuestion === true) bad = false;
      else if (opts.length < 2) bad = true;
      else if (opts.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) bad = true;
      if (bad) {
        skip += 1;
        if (isPh) phNoOpt += 1;
        else {
          defect += 1;
          if (defectSample.length < 3) defectSample.push(q.id);
        }
      }
    }
  }
  rows.push({
    province, total, skip,
    skipRate: ((skip / total) * 100).toFixed(2) + '%',
    placeholderSkipped: phNoOpt, placeholderAll: ph,
    defect, defectRate: ((defect / total) * 100).toFixed(2) + '%', defectSample,
  });
}
fs.writeFileSync(path.join(ROOT, '_skip-breakdown.json'), JSON.stringify(rows, null, 2), 'utf8');
const L = ['province\ttotal\tskip\tskip%\t占位跳过\t占位总数\t真实缺陷\t缺陷%'];
for (const r of rows) L.push([r.province, r.total, r.skip, r.skipRate, r.placeholderSkipped, r.placeholderAll, r.defect, r.defectRate].join('\t'));
L.push('');
L.push(`TOTALS\t${rows.reduce((a, r) => a + r.total, 0)}\t${rows.reduce((a, r) => a + r.skip, 0)}\t\t${rows.reduce((a, r) => a + r.placeholderSkipped, 0)}\t${rows.reduce((a, r) => a + r.placeholderAll, 0)}\t${rows.reduce((a, r) => a + r.defect, 0)}`);
fs.writeFileSync(path.join(ROOT, '_skip-breakdown.txt'), L.join('\r\n') + '\r\n', 'utf8');
