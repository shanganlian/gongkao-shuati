#!/usr/bin/env node
/** 临时：按 publish 语义算出 14 省将被删除的旧分片文件名 + 题数（--drop-uncovered） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const DST = path.join(ROOT, 'public', 'data', 'questions');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const LIST = [['重庆', 'chongqing'], ['广西', 'guangxi'], ['广州', 'guangzhou'], ['贵州', 'guizhou'], ['河南', 'henan'], ['吉林', 'jilin'], ['江苏', 'jiangsu'], ['辽宁', 'liaoning'], ['内蒙古', 'neimenggu'], ['青海', 'qinghai'], ['山东', 'shandong'], ['四川', 'sichuan'], ['西藏', 'xizang'], ['新疆', 'xinjiang']];
const L = ['province\tfile\t题数\t模块'];
let totalFiles = 0;
let totalQ = 0;
for (const [province, slug] of LIST) {
  const oldFiles = fs.readdirSync(DST).filter(f => f.startsWith(`provincial-${province}-`));
  const newTargets = new Set(
    fs.readdirSync(path.join(V2, province))
      .filter(f => new RegExp(`^${slug}-none-[a-z]+-\\d+\\.json$`).test(f))
      .map(f => `provincial-${province}-${f.slice(slug.length + 6)}`)
  );
  for (const f of oldFiles) {
    if (newTargets.has(f)) continue;
    const arr = JSON.parse(fs.readFileSync(path.join(DST, f), 'utf8'));
    const module = f.replace(/^provincial-[^-]+-/, '').replace(/-\d+\.json$/, '');
    L.push([province, f, Array.isArray(arr) ? arr.length : 0, module].join('\t'));
    totalFiles += 1;
    totalQ += Array.isArray(arr) ? arr.length : 0;
  }
}
L.push('');
L.push(`TOTAL\t${totalFiles} 个文件\t${totalQ} 题`);
fs.writeFileSync(path.join(ROOT, '_drop-ledger2.txt'), L.join('\r\n') + '\r\n', 'utf8');
