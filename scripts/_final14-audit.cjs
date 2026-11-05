#!/usr/bin/env node
/** 临时：14 省 parser 类痕迹审计（竖线残留 / material 串题 / 题号整段跳号） */
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

function readArr(p) { const d = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(d) ? d : null; }

const out = [];
for (const province of Object.keys(SLUG)) {
  const dir = path.join(V2, province);
  const files = fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f)).sort();
  const qs = [];
  for (const f of files) for (const q of readArr(path.join(dir, f)) || []) qs.push(q);

  const pipeStem = qs.filter(q => /\S\s\|\s\S/.test(String(q.stem || '')));
  const pipeOpt = qs.filter(q => (q.options || []).some(o => /\s\|\s/.test(String(o?.text || ''))));
  const pipeMat = qs.filter(q => /\S\s\|\s\S/.test(String(q.material || '')));
  const matNonEmpty = qs.filter(q => q.module === 'yanyu' && String(q.material || '').trim() !== '' && !q.isPlaceholder);
  // 题号连续性：按 prov-<slug>-<year>-<label>-<num> 聚合
  const slug = SLUG[province];
  const papers = new Map();
  const re = new RegExp(`^prov-${slug}-(\\d{4})-(.+)-(\\d+)$`);
  let unknownId = 0;
  for (const q of qs) {
    const m = re.exec(String(q.id || ''));
    if (!m) { unknownId += 1; continue; }
    const key = `${m[1]}-${m[2]}`;
    if (!papers.has(key)) papers.set(key, new Set());
    papers.get(key).add(Number(m[3]));
  }
  const gaps = [];
  for (const [key, nums] of papers) {
    const arr = [...nums].sort((a, b) => a - b);
    for (let i = 1; i < arr.length; i += 1) {
      const d = arr[i] - arr[i - 1];
      if (d > 5) gaps.push(`${key}: ${arr[i - 1]}→${arr[i]}（缺 ${d - 1}）`);
    }
    if (arr.length && arr[0] > 5) gaps.push(`${key}: 起始于 ${arr[0]}`);
  }
  out.push({
    province,
    total: qs.length,
    pipeStem: pipeStem.slice(0, 3).map(q => `${q.id}:${String(q.stem).slice(0, 40)}`),
    pipeStemCount: pipeStem.length,
    pipeOptCount: pipeOpt.length,
    pipeMatCount: pipeMat.length,
    yanyuMaterialCount: matNonEmpty.length,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 12),
    unknownId,
  });
}
fs.writeFileSync(path.join(ROOT, '_final14-audit.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('written _final14-audit.json');
