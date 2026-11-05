#!/usr/bin/env node
/**
 * evaluate-submodule-sample.cjs —— 计算人工核对抽样的分类准确率
 *
 * 用法：
 *   node scripts/evaluate-submodule-sample.cjs --file "guokao-reports/submodule-北京-changshi-xxx-review-sample.csv"
 *
 * 需要先填写 CSV 的「人工判定」列（填标准子类名）；「是否正确」列可留空。
 * 准确率 = 人工判定与模型子类完全一致 / 已填写人工判定的题数。
 * 阈值 90%，低于阈值 exit=1。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ARGV = process.argv.slice(2);
const FILE = (() => {
  for (let i = 0; i < ARGV.length; i += 1) {
    if (ARGV[i] === '--file' && ARGV[i + 1]) return ARGV[i + 1];
    if (ARGV[i].startsWith('--file=')) return ARGV[i].slice(9);
  }
  return ARGV[0] || '';
})();

if (!FILE || FILE === '--help') {
  console.log('用法：node scripts/evaluate-submodule-sample.cjs --file <review-sample.csv>');
  process.exit(FILE ? 0 : 1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

const full = path.resolve(FILE);
if (!fs.existsSync(full)) {
  console.error(`文件不存在：${full}`);
  process.exit(1);
}
const rows = parseCsv(fs.readFileSync(full, 'utf8'));
if (rows.length < 2) {
  console.error('CSV 没有数据行');
  process.exit(1);
}
const header = rows[0].map(s => s.trim());
const idx = name => header.indexOf(name);
const modelIdx = idx('模型子类');
const humanIdx = idx('人工判定');
const idIdx = idx('id');
const moduleIdx = idx('模块');
const stemIdx = idx('题干');
if (modelIdx < 0 || humanIdx < 0) {
  console.error('CSV 缺少「模型子类」或「人工判定」列');
  process.exit(1);
}

const judged = [];
const pending = [];
for (const row of rows.slice(1)) {
  const model = String(row[modelIdx] || '').trim();
  const human = String(row[humanIdx] || '').trim();
  if (!human) {
    pending.push(row);
    continue;
  }
  judged.push({
    id: idIdx >= 0 ? row[idIdx] : '',
    module: moduleIdx >= 0 ? row[moduleIdx] : '',
    stem: stemIdx >= 0 ? row[stemIdx] : '',
    model,
    human,
    ok: model === human
  });
}

const correct = judged.filter(item => item.ok).length;
const accuracy = judged.length ? correct / judged.length : 0;
console.log(`[submodule-eval] 文件：${full}`);
console.log(`[submodule-eval] 已核对 ${judged.length} 题 / 待核对 ${pending.length} 题`);
console.log(`[submodule-eval] 正确 ${correct} 题，准确率 ${(accuracy * 100).toFixed(2)}%`);
if (judged.length < 50) {
  console.log(`[submodule-eval] 提醒：当前只核对了 ${judged.length} 题，建议至少 50 题再决定是否全量。`);
}
if (accuracy < 0.9) {
  console.log('[submodule-eval] 未达到 90% 阈值，不建议立即全量。');
  process.exitCode = 1;
} else {
  console.log('[submodule-eval] 已达到 90% 阈值。');
}

const errors = judged.filter(item => !item.ok);
if (errors.length) {
  console.log('\n[submodule-eval] 错分清单：');
  for (const item of errors) {
    console.log(`- ${item.id}｜模型=${item.model}｜人工=${item.human}｜${String(item.stem).slice(0, 80)}`);
  }
}
