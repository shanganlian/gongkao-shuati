#!/usr/bin/env node
/** 临时：抓取 14 省计划书里所有含「删除」的行，确认 --drop-uncovered 的删除清单格式与内容 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'guokao-reports');
const LIST = [['重庆', 'chongqing'], ['广西', 'guangxi'], ['广州', 'guangzhou'], ['贵州', 'guizhou'], ['河南', 'henan'], ['吉林', 'jilin'], ['江苏', 'jiangsu'], ['辽宁', 'liaoning'], ['内蒙古', 'neimenggu'], ['青海', 'qinghai'], ['山东', 'shandong'], ['四川', 'sichuan'], ['西藏', 'xizang'], ['新疆', 'xinjiang']];
const L = [];
for (const [province, slug] of LIST) {
  const md = fs.readFileSync(path.join(REPORTS, `publish-${slug}-plan.md`), 'utf8');
  const hits = md.split(/\r?\n/).filter(l => l.includes('删除') && l.includes('provincial-'));
  L.push(`== ${province} ==`);
  if (!hits.length) L.push('  (无 provincial-* 删除行)');
  for (const h of hits) L.push('  ' + h.trim());
}
fs.writeFileSync(path.join(ROOT, '_drop-ledger.txt'), L.join('\r\n') + '\r\n', 'utf8');
