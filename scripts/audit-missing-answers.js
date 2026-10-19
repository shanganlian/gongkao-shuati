#!/usr/bin/env node
/**
 * 无官方答案总账
 *
 * 读取 guokao-reports/summary.json（由 convert-guokao.js 生成），统计：
 *   - 总题数 / 有官方答案题数 / 无官方答案题数
 *   - 逐卷缺失数、答案率、缺失分类
 *   - 2026 年源数据文件数量（按约定，源数据缺失则忽略）
 *
 * 输出：
 *   guokao-reports/missing-answers.csv
 *   guokao-reports/missing-answers.json
 *
 * 运行：node scripts/audit-missing-answers.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const SRC_ROOT = path.join(ROOT, 'source-data', '国考真题（2000--2026)');
const SUMMARY_FILE = path.join(REPORT_DIR, 'summary.json');

const KNOWN_GAP_RE = [
  /^2021-副省级-行测$/,
  /^2022-地市级-行测$/,
  /^2025-.*-申论$/,
  /^2008-.*-申论$/,
  /^2003-A卷-行测$/,
  /^2005-.*-行测$/,
];

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const body = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  fs.writeFileSync(file, `\uFEFF${body}`, 'utf8');
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function classify(paper, questionCount, missingAnswers, rate) {
  if (questionCount === 0) return '未解析出题目（覆盖缺口）';
  if (missingAnswers === 0) return '无缺失';
  if (KNOWN_GAP_RE.some(re => re.test(paper))) return '已登记答案空洞';
  if (rate < 0.5) return '低答案率历史卷';
  return '其他缺失';
}

if (!fs.existsSync(SUMMARY_FILE)) {
  console.error(`未找到 ${path.relative(ROOT, SUMMARY_FILE)}，请先运行全量 dry-run。`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
const papers = Array.isArray(summary.papers) ? summary.papers : [];

const rows = papers.map((p) => {
  const questionCount = Number(p.questionCount) || 0;
  const withAnswer = Number.isFinite(p.withAnswer) ? Number(p.withAnswer) : 0;
  const missingAnswers = Number.isFinite(p.missingAnswers)
    ? Number(p.missingAnswers)
    : Math.max(0, questionCount - withAnswer);
  const rate = questionCount ? withAnswer / questionCount : 0;
  return {
    paper: p.paper,
    questionCount,
    withAnswer,
    missingAnswers,
    answerRate: Number(rate.toFixed(4)),
    category: classify(p.paper, questionCount, missingAnswers, rate),
    source: p.source || '',
    report: p.report || '',
  };
}).sort((a, b) => a.paper.localeCompare(b.paper, 'zh-CN', { numeric: true }));

const totalQuestions = rows.reduce((s, r) => s + r.questionCount, 0);
const totalWithAnswer = rows.reduce((s, r) => s + r.withAnswer, 0);
const totalMissing = rows.reduce((s, r) => s + r.missingAnswers, 0);
const papersWithMissing = rows.filter(r => r.missingAnswers > 0);
const zeroQuestionPapers = rows.filter(r => r.questionCount === 0);
const overallRate = totalQuestions ? totalWithAnswer / totalQuestions : 0;

const source2026 = walkFiles(SRC_ROOT).filter(f => /2026/.test(path.basename(f)));

const result = {
  generatedAt: new Date().toISOString(),
  summaryGeneratedAt: summary.generatedAt || null,
  filter: summary.filter || null,
  totalPapers: rows.length,
  totalQuestions,
  totalWithAnswer,
  totalMissingAnswers: totalMissing,
  overallAnswerRate: Number(overallRate.toFixed(4)),
  papersWithMissingAnswers: papersWithMissing.length,
  qnoGapCount: Number(summary.qnoGapCount) || 0,
  qnoGapPapers: Number(summary.qnoGapPapers) || 0,
  zeroQuestionPapers: zeroQuestionPapers.map(r => r.paper),
  source2026FileCount: source2026.length,
  source2026Files: source2026.map(f => path.relative(ROOT, f)),
  papers: rows,
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(path.join(REPORT_DIR, 'missing-answers.json'), JSON.stringify(result, null, 2), 'utf8');
writeCsv(path.join(REPORT_DIR, 'missing-answers.csv'), [
  ['paper', 'questionCount', 'withAnswer', 'missingAnswers', 'answerRate', 'category', 'source'],
  ...rows.map(r => [r.paper, r.questionCount, r.withAnswer, r.missingAnswers, r.answerRate, r.category, r.source]),
]);

console.log('===== 无官方答案总账 =====');
if (!summary.filter || summary.filter.all !== true) {
  console.log('注意：summary.json 不是 --all 全量结果，以下为当前筛选范围。');
}
console.log(`卷数: ${rows.length}`);
console.log(`总题数: ${totalQuestions}`);
console.log(`有官方答案: ${totalWithAnswer}`);
console.log(`无官方答案题数: ${totalMissing} (${(overallRate * 100).toFixed(1)}% 有答案)`);
console.log(`涉及缺失的卷数: ${papersWithMissing.length}`);
console.log(`QNO_GAP: ${result.qnoGapCount}（涉及 ${result.qnoGapPapers} 卷）`);
console.log('');
console.log('按卷明细（仅列缺失 > 0）：');
for (const r of papersWithMissing) {
  console.log(`- ${r.paper}: ${r.missingAnswers}/${r.questionCount} 题无答案（${r.category}）`);
}
if (zeroQuestionPapers.length) {
  console.log('');
  console.log('未解析出题目的卷：');
  for (const r of zeroQuestionPapers) console.log(`- ${r.paper}（${r.category}）`);
}
console.log('');
if (source2026.length === 0) {
  console.log('2026 源文件: 0 个（源数据缺失，按约定忽略）');
} else {
  console.log(`2026 源文件: ${source2026.length} 个`);
  for (const f of source2026) console.log(`- ${path.relative(ROOT, f)}`);
}
console.log('');
console.log(`明细已写入: ${path.relative(ROOT, path.join(REPORT_DIR, 'missing-answers.csv'))}`);
console.log(`JSON 已写入: ${path.relative(ROOT, path.join(REPORT_DIR, 'missing-answers.json'))}`);
