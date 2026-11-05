#!/usr/bin/env node
/** 临时：14 省 material 夹带选项的严格口径统计
 *  matOpt4      material 内含完整 A/B/C/D 四个选项标记（夹带）
 *  matOptBroken material 夹带选项且本题自身选项不足 2 项（真正受损）
 */
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
const MARKS = /(?:^|[\s\n])([ABCD])[、.．]/g;
function marks(text) {
  const s = new Set();
  let m;
  MARKS.lastIndex = 0;
  while ((m = MARKS.exec(text))) s.add(m[1]);
  return s;
}
const rows = [];
for (const province of Object.keys(SLUG)) {
  const dir = path.join(V2, province);
  const qs = [];
  for (const f of fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f))) {
    for (const q of readArr(path.join(dir, f)) || []) qs.push(q);
  }
  const mat4 = [];
  const broken = [];
  const notOwn = [];
  const gluedList = [];
  for (const q of qs) {
    const mat = String(q.material || '');
    if (!mat) continue;
    const s = marks(mat);
    if (s.size < 4) continue;
    mat4.push(q);
    const opts = Array.isArray(q.options) ? q.options : [];
    const usable = opts.filter(o => o && typeof o.text === 'string' && o.text.trim() !== '').length;
    if (usable < 2) broken.push(q);
    // 选项粘连：某项文本内又出现其他选项标记（A/B/C/D），前端会少显示选项
    if (usable >= 2) {
      const glued = opts.some(o => {
        const t = String(o?.text || '');
        const ms = marks(t);
        return ms.size >= 2;
      });
      if (glued) gluedList.push(q);
    }
    // 本题选项与 material 选项块重复（选项被复制进材料）
    if (usable >= 2) {
      const firstOpt = String(opts[0]?.text || '').trim().slice(0, 8);
      if (firstOpt && mat.includes(firstOpt)) notOwn.push(q);
    }
  }
  rows.push({
    province,
    total: qs.length,
    matOpt4: mat4.length,
    rate: ((mat4.length / qs.length) * 100).toFixed(2) + '%',
    broken: broken.length,
    brokenSample: broken.slice(0, 5).map(q => q.id),
    dupOptions: notOwn.length,
    dupSample: notOwn.slice(0, 3).map(q => q.id),
    glued: gluedList.length,
    gluedSample: gluedList.slice(0, 3).map(q => q.id),
  });
}
fs.writeFileSync(path.join(ROOT, '_final14-audit3.json'), JSON.stringify(rows, null, 2), 'utf8');
const lines = ['province\ttotal\tmatOpt4\trate\tbroken\tglued\tdupOptions'];
for (const r of rows) lines.push([r.province, r.total, r.matOpt4, r.rate, r.broken, r.glued, r.dupOptions].join('\t'));
fs.writeFileSync(path.join(ROOT, '_final14-audit3.txt'), lines.join('\r\n') + '\r\n', 'utf8');
