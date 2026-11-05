#!/usr/bin/env node
/** 临时：核对「material 夹带」是否= 前一题的题干/材料被后移 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const PROV = { 重庆: 'chongqing', 西藏: 'xizang', 内蒙古: 'neimenggu', 广西: 'guangxi', 河南: 'henan' };
const ARG = process.argv.slice(2); // id 列表
const all = new Map();
for (const [p, slug] of Object.entries(PROV)) {
  for (const f of fs.readdirSync(path.join(V2, p)).filter(f => /-none-[a-z]+-\d+\.json$/.test(f))) {
    for (const q of JSON.parse(fs.readFileSync(path.join(V2, p, f), 'utf8'))) all.set(q.id, q);
  }
}
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const L = [];
for (const id of ARG) {
  const q = all.get(id);
  if (!q) { L.push(`${id}: 未找到`); continue; }
  const prevId = id.replace(/-(\d+)(-2)?$/, (m, n, s2) => `-${Number(n) - 1}${s2 || ''}`);
  const prev = all.get(prevId);
  L.push(`== ${id} ==`);
  L.push(`  本题 material : ${cut(q.material, 90) || '(空)'}`);
  L.push(`  本题 stem     : ${cut(q.stem, 60)}`);
  if (prev) {
    L.push(`  前一题 ${prevId} material : ${cut(prev.material, 60) || '(空)'}`);
    L.push(`  前一题 stem   : ${cut(prev.stem, 60)}`);
    L.push(`  本题 material 含前一题 stem 开头: ${prev.stem && q.material.includes(prev.stem.trim().slice(0, 12)) ? '是' : '否'}`);
    L.push(`  两题 material 相同: ${prev.material === q.material ? '是' : '否'}`);
  } else L.push('  前一题: 不存在');
}
fs.writeFileSync(path.join(ROOT, '_mat-pair-check.txt'), L.join('\r\n') + '\r\n', 'utf8');
