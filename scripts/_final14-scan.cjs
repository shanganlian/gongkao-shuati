#!/usr/bin/env node
/** 临时：收尾批次 14 省数据盘点（v2 源分片 vs 线上旧分片） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const DST = path.join(ROOT, 'public', 'data', 'questions');
const PROVINCES = ['重庆', '广西', '广州', '贵州', '河南', '吉林', '江苏', '辽宁', '内蒙古', '青海', '山东', '四川', '西藏', '新疆'];
const SUBJECTIVE = new Set(['shenlun', 'gongji']);

function readArr(p) {
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(d) ? d : null;
}

function renderStats(qs) {
  const s = { total: qs.length, ok: 0, image: 0, subjective: 0, noStem: 0, tooFew: 0, emptyOpt: 0, placeholder: 0 };
  for (const q of qs) {
    if (typeof q?.stem !== 'string' || q.stem.trim() === '') { s.noStem += 1; continue; }
    if (SUBJECTIVE.has(String(q?.module || ''))) { s.subjective += 1; s.ok += 1; continue; }
    if (q?.isImageQuestion === true) { s.image += 1; s.ok += 1; continue; }
    const opts = Array.isArray(q?.options) ? q.options : [];
    if (opts.length < 2) { s.tooFew += 1; continue; }
    if (opts.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) { s.emptyOpt += 1; continue; }
    s.ok += 1;
  }
  return s;
}

const out = [];
for (const province of PROVINCES) {
  const dir = path.join(V2, province);
  const row = { province, exists: fs.existsSync(dir) };
  if (row.exists) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    row.shards = files.filter(f => /-none-[a-z]+-\d+\.json$/.test(f));
    row.hasIndex = files.includes('index.json');
    row.hasAggregate = files.includes('questions.json');
    row.other = files.filter(f => !row.shards.includes(f) && f !== 'index.json' && f !== 'questions.json');
    let qs = [];
    for (const f of row.shards) qs = qs.concat(readArr(path.join(dir, f)) || []);
    row.srcTotal = qs.length;
    row.aggTotal = row.hasAggregate ? (readArr(path.join(dir, 'questions.json')) || []).length : null;
    row.render = renderStats(qs);
    row.modules = {};
    for (const q of qs) row.modules[q.module] = (row.modules[q.module] || 0) + 1;
  }
  const oldShards = fs.readdirSync(DST).filter(f => /^provincial-/.test(f) && f.includes(`-${province}-`));
  row.oldShards = oldShards.length;
  let oldQ = 0;
  for (const f of oldShards) oldQ += (readArr(path.join(DST, f)) || []).length;
  row.oldTotal = oldQ;
  out.push(row);
}
fs.writeFileSync(path.join(ROOT, '_final14.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('written _final14.json');
