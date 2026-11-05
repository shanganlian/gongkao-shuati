#!/usr/bin/env node
/** 临时：收尾批次 14 省精简汇总（每省一行 + 旧分片清单） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const DST = path.join(ROOT, 'public', 'data', 'questions');
const PROVINCES = ['重庆', '广西', '广州', '贵州', '河南', '吉林', '江苏', '辽宁', '内蒙古', '青海', '山东', '四川', '西藏', '新疆'];
const SUBJECTIVE = new Set(['shenlun', 'gongji']);

const readArr = p => { const d = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(d) ? d : null; };

function renderStats(qs) {
  const s = { ok: 0, image: 0, noStem: 0, tooFew: 0, emptyOpt: 0, placeholder: 0, subjective: 0 };
  for (const q of qs) {
    if (q?.isPlaceholder) s.placeholder += 1;
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

const lines = [];
lines.push('province\tsrcTotal\tok\tskip\tskip%\timage\ttooFew\temptyOpt\tplaceholder\tnoStem\toldFiles\toldTotal\toldUncovered');
const detail = [];
for (const province of PROVINCES) {
  const dir = path.join(V2, province);
  const files = fs.readdirSync(dir).filter(f => /-none-[a-z]+-\d+\.json$/.test(f)).sort();
  let qs = [];
  for (const f of files) qs = qs.concat(readArr(path.join(dir, f)) || []);
  const st = renderStats(qs);
  const skip = qs.length - st.ok;
  const oldShards = fs.readdirSync(DST).filter(f => /^provincial-/.test(f) && f.includes(`-${province}-`));
  let oldQ = 0;
  for (const f of oldShards) oldQ += (readArr(path.join(DST, f)) || []).length;
  const srcModules = new Set(files.map(f => (/-none-([a-z]+)-\d+\.json$/.exec(f) || [])[1]).filter(Boolean));
  const oldUncovered = oldShards.filter(f => {
    const m = /^provincial-.+?-([a-z]+)-\d+\.json$/.exec(f);
    return m ? !srcModules.has(m[1]) : true;
  });
  lines.push([
    province, qs.length, st.ok, skip, ((skip / qs.length) * 100).toFixed(2) + '%',
    st.image, st.tooFew, st.emptyOpt, st.placeholder, st.noStem,
    oldShards.length, oldQ, oldUncovered.join('|') || '-',
  ].join('\t'));
  detail.push({ province, files, oldShards, oldUncovered });
}
fs.writeFileSync(path.join(ROOT, '_final14.txt'), lines.join('\n'), 'utf8');
fs.writeFileSync(path.join(ROOT, '_final14-detail.json'), JSON.stringify(detail, null, 2), 'utf8');
console.log(lines.join('\n'));
