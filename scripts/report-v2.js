#!/usr/bin/env node
/**
 * 汇总 guokao-reports/summary.json + all-issues.csv，生成人工可读报告
 * 用法：node scripts/report-v2.js [--dir=guokao-reports]
 * 输出：控制台摘要 + guokao-reports/summary.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argDir = process.argv.find(a => a.startsWith('--dir='));
const DIR = path.resolve(ROOT, argDir ? argDir.slice(6) : path.join('guokao-reports'));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);
  return rows;
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const LABEL_ORDER = ['副省级', '地市级', '行政执法', 'A卷', 'B卷', '一卷', '二卷', '未标注'];
const KIND_ORDER = ['行测', '申论'];

const summary = JSON.parse(fs.readFileSync(path.join(DIR, 'summary.json'), 'utf8'));
const issueTable = parseCsv(fs.readFileSync(path.join(DIR, 'all-issues.csv'), 'utf8'));
issueTable.shift();
const issues = issueTable
  .filter(r => r.length >= 7)
  .map(r => ({ paper: r[0], level: r[1], code: r[2], num: r[3], id: r[4], module: r[5], detail: r[6] }));

const papers = summary.papers.slice().sort((a, b) => {
  const [ya, la, ka] = String(a.paper).split('-');
  const [yb, lb, kb] = String(b.paper).split('-');
  return Number(ya) - Number(yb)
    || LABEL_ORDER.indexOf(la) - LABEL_ORDER.indexOf(lb)
    || KIND_ORDER.indexOf(ka) - KIND_ORDER.indexOf(kb);
});

const codeStats = new Map();
const paperStats = new Map();
for (const it of issues) {
  const cs = codeStats.get(it.code) || { level: it.level, count: 0, papers: new Set() };
  cs.count++;
  cs.papers.add(it.paper);
  codeStats.set(it.code, cs);

  if (!paperStats.has(it.paper)) paperStats.set(it.paper, new Map());
  const pm = paperStats.get(it.paper);
  pm.set(it.code, (pm.get(it.code) || 0) + 1);
}

const totalAnswer = papers.reduce((s, p) => s + (p.withAnswer || 0), 0);
const totalAnalysis = papers.reduce((s, p) => s + (p.withAnalysis || 0), 0);
const totalImage = papers.reduce((s, p) => s + (p.imageQuestions || 0), 0);
const totalMaterial = papers.reduce((s, p) => s + (p.withMaterial || 0), 0);
const totalErrors = issues.filter(i => i.level === 'ERROR').length;
const totalWarns = issues.filter(i => i.level === 'WARN').length;
const noAnswerPapers = papers.filter(p => p.questionCount > 0 && p.withAnswer / p.questionCount < 0.5);

const md = [];
md.push('# 国考真题转换汇总报告', '');
md.push(`- 生成时间：${summary.generatedAt}`);
md.push(`- 卷数：${papers.length}（行测 ${papers.filter(p => p.paper.endsWith('行测')).length} / 申论 ${papers.filter(p => p.paper.endsWith('申论')).length}）`);
md.push(`- 题目：${summary.totalQuestions} 道 | 答案 ${totalAnswer}（${pct(totalAnswer, summary.totalQuestions)}）| 解析 ${totalAnalysis}（${pct(totalAnalysis, summary.totalQuestions)}）`);
md.push(`- 图片题：${totalImage} | 带材料：${totalMaterial}`);
md.push(`- ERROR：${totalErrors} | WARN：${totalWarns} | 未配对文件：${(summary.unpaired || []).length}`);
md.push('');
md.push('## 逐卷统计', '');
md.push('| 年份 | 卷别 | 类型 | 题数 | 答案 | 解析 | 图片题 | 材料题 | ERROR | WARN |');
md.push('|---|---|---|---|---|---|---|---|---|---|');
for (const p of papers) {
  const [year, label, kind] = String(p.paper).split('-');
  md.push(`| ${year} | ${label} | ${kind} | ${p.questionCount} | ${p.withAnswer} (${pct(p.withAnswer, p.questionCount)}) | ${p.withAnalysis} (${pct(p.withAnalysis, p.questionCount)}) | ${p.imageQuestions} | ${p.withMaterial} | ${p.errors} | ${p.warnings} |`);
}
md.push('');
md.push('## 异常类型统计', '');
md.push('| 级别 | 代码 | 数量 | 涉及卷数 |');
md.push('|---|---|---|---|');
for (const [code, st] of [...codeStats.entries()].sort((a, b) => b[1].count - a[1].count)) {
  md.push(`| ${st.level} | ${code} | ${st.count} | ${st.papers.size} |`);
}
md.push('');
md.push('## 逐卷异常清单', '');
for (const p of papers) {
  const pm = paperStats.get(p.paper);
  if (!pm) continue;
  const parts = [...pm.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code}×${n}`);
  md.push(`- **${p.paper}**（${p.questionCount} 题）：${parts.join('、')}`);
}
for (const it of issues.filter(i => i.code === 'EXTRACT_FAIL')) {
  md.push(`- **${it.paper}**：EXTRACT_FAIL（${it.detail}）`);
}
md.push('');
md.push('## 未配对 / 未使用文件', '');
if (!(summary.unpaired || []).length) md.push('（无）');
for (const u of summary.unpaired || []) {
  md.push(`- ${u.year ?? '年份未知'} ${u.label} | ${u.file} → ${u.reason}`);
}
md.push('');

const text = md.join('\n');
fs.writeFileSync(path.join(DIR, 'summary.md'), text, 'utf8');

console.log('===== 全量汇总 =====');
console.log(`卷数 ${papers.length} | 题目 ${summary.totalQuestions} | 答案 ${pct(totalAnswer, summary.totalQuestions)} | 解析 ${pct(totalAnalysis, summary.totalQuestions)} | 图片题 ${totalImage}`);
console.log(`ERROR ${totalErrors} | WARN ${totalWarns} | 未配对文件 ${(summary.unpaired || []).length}`);
console.log('\n异常类型（TOP 15）:');
for (const [code, st] of [...codeStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15)) {
  console.log(`  [${st.level}] ${code}: ${st.count}（${st.papers.size} 卷）`);
}
console.log('\n缺答案卷（答案率 <50%）:');
for (const p of noAnswerPapers) console.log(`  ${p.paper}: ${p.withAnswer}/${p.questionCount}（${pct(p.withAnswer, p.questionCount)}）`);
console.log(`\n明细报告: ${path.join(DIR, 'summary.md')}`);
