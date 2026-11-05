#!/usr/bin/env node
/** 临时：14 省「真实缺陷跳过」成因归类 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const PROVINCES = ['重庆', '广西', '广州', '贵州', '河南', '吉林', '江苏', '辽宁', '内蒙古', '青海', '山东', '四川', '西藏', '新疆'];
const PH_STD = /原卷此题在 Word 文本层缺失/;
const PH_OTHER = /全力以赴征集|本题暂缺|暂未收录|敬请期待|后续补录/;
const CAT = ['图形/图片题（题干只剩标号）', '源文本截断（选项未进文本）', '选项粘连/空选项', '版块说明误当题干', '其他占位文案'];
const rows = [];
const totals = Object.fromEntries(CAT.map(c => [c, 0]));
for (const province of PROVINCES) {
  const dir = path.join(V2, province);
  const stat = Object.fromEntries(CAT.map(c => [c, 0]));
  const sample = Object.fromEntries(CAT.map(c => [c, []]));
  for (const f of fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f))) {
    for (const q of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      const stem = typeof q.stem === 'string' ? q.stem.trim() : '';
      if (PH_STD.test(stem)) continue;
      const opts = Array.isArray(q.options) ? q.options : [];
      const module = String(q.module || '');
      let bad = false;
      if (!stem) bad = true;
      else if (module === 'shenlun' || module === 'gongji') bad = false;
      else if (q.isImageQuestion === true) bad = false;
      else if (opts.length < 2) bad = true;
      else if (opts.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) bad = true;
      if (!bad) continue;
      let cat;
      if (PH_OTHER.test(stem)) cat = CAT[4];
      else if (/^[ABCD\s|、.．]+$/.test(stem)) cat = CAT[0];
      else if (opts.length >= 2) cat = CAT[2];
      else if (/^(一|二|三|四|五|六)、/.test(stem) && /共\s*\d+\s*题/.test(stem)) cat = CAT[3];
      else cat = CAT[1];
      stat[cat] += 1;
      totals[cat] += 1;
      if (sample[cat].length < 3) sample[cat].push(q.id);
    }
  }
  rows.push({ province, stat, sample });
}
const L = ['province\t' + CAT.join('\t')];
for (const r of rows) L.push([r.province, ...CAT.map(c => r.stat[c])].join('\t'));
L.push(['TOTAL', ...CAT.map(c => totals[c])].join('\t'));
L.push('');
for (const r of rows) {
  const parts = CAT.filter(c => r.stat[c]).map(c => `${c}:${r.stat[c]}(${r.sample[c].join(' ')})`);
  if (parts.length) L.push(`${r.province} 样例 — ${parts.join(' | ')}`);
}
fs.writeFileSync(path.join(ROOT, '_skip-defect-cats.json'), JSON.stringify({ rows, totals }, null, 2), 'utf8');
fs.writeFileSync(path.join(ROOT, '_skip-defect-cats.txt'), L.join('\r\n') + '\r\n', 'utf8');
