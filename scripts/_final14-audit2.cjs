#!/usr/bin/env node
/** 临时：14 省 material 里是否夹带 A、B、 选项（表格选项串题痕迹） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const SLUG = {
  重庆: 'chongqing', 广西: 'guangxi', 广州: 'guangzhou', 贵州: 'guizhou', 河南: 'henan',
  吉林: 'jilin', 江苏: 'jiangsu', 辽宁: 'liaoning', 内蒙古: 'neimenggu', 青海: 'qinghai',
  山东: 'shandong', 四川: 'sichuan', 西藏: 'xizang', 新疆: 'xinjiang',
};
const readArr = p => { const d = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(d) ? d : null; };
const out = [];
for (const province of Object.keys(SLUG)) {
  const dir = path.join(V2, province);
  const files = fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f));
  const qs = [];
  for (const f of files) for (const q of readArr(path.join(dir, f)) || []) qs.push(q);
  const matOpt = qs.filter(q => /(^|\n)\s*[ABCD][、.．]/.test(String(q.material || '')));
  const placeholder = qs.filter(q => q.isPlaceholder);
  const phSample = placeholder[0] ? `${placeholder[0].id} :: ${String(placeholder[0].stem).slice(0, 50)}` : '';
  out.push({
    province,
    total: qs.length,
    matWithOptions: matOpt.length,
    matWithOptionsSample: matOpt.slice(0, 3).map(q => `${q.id} :: ${String(q.material).replace(/\n/g, ' / ').slice(0, 80)}`),
    placeholders: placeholder.length,
    phSample,
  });
}
fs.writeFileSync(path.join(ROOT, '_final14-audit2.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(out.map(r => `${r.province}\t${r.total}\tmatOpt=${r.matWithOptions}\tph=${r.placeholders}`).join('\n'));
