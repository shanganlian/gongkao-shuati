#!/usr/bin/env node
/**
 * E09 全库扫描 / 隔离（v1 线上库 / v2 国考池 / v2p 省考源池）。
 *
 * 用法：
 *   node scripts/scan-e09.cjs                 # 只读扫描 + 出报告
 *   node scripts/scan-e09.cjs --apply         # 命中题写 isAbnormal: true
 *
 * 只写 isAbnormal，不改题干、选项、答案、解析、模块。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getE09Issues } = require('./lib/e09-rule.cjs');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = [
  path.join(ROOT, 'public', 'data', 'questions'),
  path.join(ROOT, 'public', 'data', 'questions-v2'),
  path.join(ROOT, 'public', 'data', 'questions-v2-provincial'),
];
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const DATE = new Date().toLocaleDateString('sv-SE');
const REPORT_JSON = path.join(REPORT_DIR, `E09-扫描-${DATE}.json`);
const REPORT_CSV = path.join(REPORT_DIR, `E09-扫描-${DATE}.csv`);
const REPORT_MD = path.join(REPORT_DIR, `E09-扫描-${DATE}.md`);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(abs);
  }
}

function readArray(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

const files = [];
for (const root of ROOTS) walk(root, files);

/** id -> { q, locations:Set<string> } */
const records = new Map();
for (const file of files) {
  const list = readArray(file);
  if (!list) continue;
  for (const q of list) {
    if (!q || !q.id) continue;
    const id = String(q.id);
    if (!records.has(id)) records.set(id, { q, locations: new Set() });
    records.get(id).locations.add(relative(file));
  }
}

const hits = [];
for (const [id, record] of records) {
  const issues = getE09Issues(record.q);
  if (!issues.length) continue;
  hits.push({
    id,
    module: record.q.module,
    moduleName: record.q.moduleName,
    isAbnormal: record.q.isAbnormal === true,
    source: record.q.source,
    title: record.q.title,
    stem: String(record.q.stem || ''),
    material: String(record.q.material || ''),
    options: (record.q.options || []).map(option => `${option.key}.${option.text}`),
    issues,
    locations: [...record.locations],
  });
}
hits.sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-CN'));

const byCode = {};
for (const hit of hits) {
  for (const issue of hit.issues) byCode[issue.code] = (byCode[issue.code] || 0) + 1;
}

let marked = 0;
let alreadyMarked = 0;
const changedFiles = [];
if (APPLY && hits.length > 0) {
  const targetIds = new Set(hits.map(hit => hit.id));
  for (const file of files) {
    const list = readArray(file);
    if (!list) continue;
    let dirty = false;
    for (const q of list) {
      if (!q || !targetIds.has(String(q.id))) continue;
      if (q.isAbnormal === true) {
        alreadyMarked++;
        continue;
      }
      q.isAbnormal = true;
      marked++;
      dirty = true;
    }
    if (dirty) {
      changedFiles.push(relative(file));
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    }
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  apply: APPLY,
  scannedQuestions: records.size,
  scannedFiles: files.length,
  hits: hits.length,
  byCode,
  marked,
  alreadyMarked,
  changedFiles,
  samples: hits.slice(0, 30),
  all: hits,
};
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

const csvRows = [
  ['id', 'module', 'moduleName', 'isAbnormal', 'rule', 'detail', 'stem', 'material', 'options', 'locations'],
];
for (const hit of hits) {
  for (const issue of hit.issues) {
    csvRows.push([
      hit.id,
      hit.module,
      hit.moduleName,
      hit.isAbnormal ? 'true' : '',
      issue.code,
      issue.detail,
      hit.stem.replace(/\s+/g, ' ').slice(0, 300),
      hit.material.replace(/\s+/g, ' ').slice(0, 300),
      hit.options.join(' | '),
      hit.locations.join(' | '),
    ]);
  }
}
fs.writeFileSync(
  REPORT_CSV,
  `\uFEFF${csvRows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
  'utf8'
);

const md = [];
md.push(`# E09 扫描（${DATE}）`);
md.push('');
md.push(`- 扫描题目：**${records.size}**（去重 ID）`);
md.push(`- 扫描文件：**${files.length}**`);
md.push(`- 命中：**${hits.length}** 题`);
md.push(`- 命中代码：${Object.entries(byCode).map(([code, count]) => `${code} ${count}`).join('，') || '—'}`);
md.push(
  `- 写入状态：${
    APPLY
      ? `新写 ${marked} 处，已存在 ${alreadyMarked} 处，改动 ${changedFiles.length} 个文件`
      : '只读（未写 isAbnormal）'
  }`
);
md.push('');
md.push('## 命中明细');
md.push('');
md.push('| ID | 模块 | 命中 | 题干 | 位置 |');
md.push('|---|---|---|---|---|');
for (const hit of hits) {
  md.push(
    `| ${hit.id} | ${hit.moduleName || hit.module} | ${hit.issues
      .map(issue => issue.code)
      .join(' / ')} | ${String(hit.stem).replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 120)} | ${hit.locations.join('<br>')} |`
  );
}
md.push('');
md.push('## 判定口径');
md.push('');
md.push('- E09-A：选项出现 >=2 个字母占位（X / Y / Z 或“不喜欢 X 节目”），依赖图表、材料无完整数据、无图片。');
md.push('- E09-B：题干/选项出现多城市（甲城/乙城/…/五个城市）对比，材料引用图表，但无图片、无完整表格数据。');
md.push('- 已补 `imageUrl` 或 `isImageQuestion` 的题不再命中。');
md.push('');
fs.writeFileSync(REPORT_MD, md.join('\n'), 'utf8');

console.log('===== E09 全库扫描 =====');
console.log(`题目: ${records.size}  文件: ${files.length}  命中: ${hits.length}`);
console.log(`按代码: ${JSON.stringify(byCode)}`);
if (APPLY) console.log(`[apply] 新写 ${marked} 处，已存在 ${alreadyMarked} 处，改动 ${changedFiles.length} 个文件`);
else console.log('[dry-run] 未写入。加 --apply 执行隔离。');
console.log(`报告: ${path.relative(ROOT, REPORT_MD)}`);

