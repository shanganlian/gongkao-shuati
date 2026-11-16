#!/usr/bin/env node
/**
 * 2000–2010 国考图形推理配图批量抽取（逐卷对账，不通过就停）
 *
 * 用法：
 *   node scripts/figure-extract-batch.cjs            # 全卷 dry-run 对账（不写文件）
 *   node scripts/figure-extract-batch.cjs --apply    # 只对「dry-run 对账通过」的卷落盘，其余跳过并报出
 *
 * 纪律（对应用户口径）：
 *   - 逐卷跑 scripts/extract-figure-images.cjs，产出数必须等于该卷图形推理题数；
 *   - 对账不通过的卷绝不 --apply（脚本自身也会在 ERROR 时不写 figure-map.json，但图片是按题逐张落盘的，
 *     所以必须先 dry-run 判定，避免半套图）；
 *   - 单卷失败不影响其它卷的判定，但会在汇总表里标 FAIL，并在退出码上体现（1）。
 *
 * 产出：
 *   scripts/out/figure-extract-<年>[-<标签>].report.json   逐卷对账明细（extract 脚本自己写）
 *   scripts/out/figure-extract-batch-<日期>.md             汇总表
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'scripts', 'out');
const APPLY = process.argv.includes('--apply');
const DATE = new Date().toLocaleDateString('sv-SE');

/** 2000–2010 国考行测各卷：paper/docx 为 null 表示该年只有一卷，按需自动选中 */
const PAPERS = [
  { year: 2000 },
  { year: 2001 },
  { year: 2002, paper: 'A卷', docx: 'A卷' },
  { year: 2002, paper: 'B卷', docx: 'B卷' },
  { year: 2003, paper: 'A卷', docx: 'A卷' },
  { year: 2003, paper: 'B卷', docx: 'B卷' },
  { year: 2004, paper: 'A卷', docx: 'A卷' },
  { year: 2004, paper: 'B卷', docx: 'B卷' },
  { year: 2005, paper: '一卷', docx: '（一）' },
  { year: 2005, paper: '二卷', docx: '（二）' },
  { year: 2006, paper: '一卷', docx: '（一）' },
  { year: 2006, paper: '二卷', docx: '（二）' },
  { year: 2007 },
  { year: 2008 },
  { year: 2009 },
  { year: 2010 },
];

function runOne(entry, apply) {
  const args = [path.join('scripts', 'extract-figure-images.cjs'), '--year', String(entry.year), '--json'];
  if (entry.paper) args.push('--paper', entry.paper);
  if (entry.docx) args.push('--docx', entry.docx);
  if (apply) args.push('--apply');
  const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const stdout = res.stdout || '';
  let report = null;
  try {
    report = JSON.parse(stdout);
  } catch {
    report = null;
  }
  return { status: res.status, stdout, stderr: res.stderr || '', report };
}

function summarize(entry, result) {
  const report = result.report;
  if (!report) {
    return {
      label: entry.paper ? `${entry.year}-${entry.paper}` : String(entry.year),
      frozen: false,
      expected: 0,
      produced: 0,
      matched: false,
      errors: [`抽取脚本未返回 JSON（exit=${result.status}）：${result.stderr.trim().split('\n').slice(-3).join(' / ')}`],
      warnings: [],
      reportFile: null,
    };
  }
  const v = report.verification || {};
  return {
    label: report.dataSide ? `${entry.year}${report.tag ? `-${report.tag}` : ''} ${report.dataSide.paper}` : `${entry.year}`,
    frozen: true,
    expected: v.expectedFigures ?? 0,
    produced: v.producedImages ?? 0,
    matched: v.countMatched === true,
    highConfidence: v.allHighConfidence === true,
    numbers: report.dataSide ? report.dataSide.numbers : [],
    errors: (report.errors || []).slice(),
    warnings: (report.warnings || []).slice(),
    reportFile: `scripts/out/figure-extract-${entry.year}${report.tag ? `-${report.tag}` : ''}.report.json`,
  };
}

const rows = [];
let failed = 0;

for (const entry of PAPERS) {
  const dry = runOne(entry, false);
  const row = summarize(entry, dry);
  row.applied = false;
  if (APPLY && row.matched && !row.errors.length) {
    const applied = runOne(entry, true);
    const after = summarize(entry, applied);
    row.applied = after.matched && !after.errors.length;
    row.expected = after.expected;
    row.produced = after.produced;
    row.matched = after.matched;
    row.errors = after.errors;
    row.warnings = after.warnings;
    row.reportFile = after.reportFile;
  }
  if (!row.matched || row.errors.length) failed += 1;
  if (APPLY && !row.applied) row.skipped = true;
  rows.push(row);
  console.log(
    `${row.matched && !row.errors.length ? 'PASS' : 'FAIL'}  ${row.label}  ` +
      `题数 ${row.expected} / 产出 ${row.produced}  ` +
      `${row.errors.length ? `ERROR ${row.errors.length}` : ''}${APPLY ? (row.applied ? '  已落盘' : '  未落盘') : ''}`,
  );
  if ((!row.matched || row.errors.length) && row.errors.length) {
    row.errors.slice(0, 6).forEach((item) => console.log(`      ✗ ${item}`));
    if (row.errors.length > 6) console.log(`      … 其余 ${row.errors.length - 6} 条见 report`);
  }
}

const lines = [];
lines.push(`# 2000–2010 国考图形推理配图抽取汇总（${DATE}）`);
lines.push('');
lines.push(`- 模式：${APPLY ? 'apply（仅对 dry-run 通过的卷落盘）' : 'dry-run（不写文件）'}`);
lines.push(`- 卷数：${rows.length}；通过：${rows.length - failed}；未通过：${failed}`);
lines.push('');
lines.push('| 卷 | 图形推理题数 | 产出图数 | 对账 | 落盘 | ERROR |');
lines.push('|---|---:|---:|---|---|---:|');
for (const row of rows) {
  lines.push(
    `| ${row.label} | ${row.expected} | ${row.produced} | ${row.matched && !row.errors.length ? '✓' : '✗'} | ` +
      `${row.applied ? '已写' : (row.skipped ? '跳过' : '—')} | ${row.errors.length} |`,
  );
}
lines.push('');
for (const row of rows) {
  if (row.matched && !row.errors.length) continue;
  lines.push(`## ${row.label}`);
  lines.push('');
  for (const item of row.errors) lines.push(`- ${item}`);
  lines.push('');
}
lines.push('## 逐卷报告');
lines.push('');
for (const row of rows) lines.push(`- ${row.label} → ${row.reportFile || '(无)'}`);
lines.push('');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const summaryFile = path.join(REPORT_DIR, `figure-extract-batch-${DATE}.md`);
fs.writeFileSync(summaryFile, lines.join('\n'), 'utf8');
console.log('');
console.log(`汇总：${path.relative(ROOT, summaryFile).replace(/\\/g, '/')}`);
console.log(`通过 ${rows.length - failed} / ${rows.length}${APPLY ? `，已落盘 ${rows.filter((r) => r.applied).length} 卷` : ''}`);
process.exit(failed ? 1 : 0);
