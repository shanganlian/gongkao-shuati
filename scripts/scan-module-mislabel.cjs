#!/usr/bin/env node
/**
 * 资料分析模块错标扫描。
 *
 * 口径（用户指定）：
 *   module=资料分析（ziliao / moduleName 含“资料”）
 *   且题干不含计算特征词：增长 / 比重 / 平均 / 顺差 / 总额
 *   且题干含判断特征词：共同特点 / 规律 / 符合 / 推出
 *   → 疑似应为判断推理。
 *
 * 为避免误伤：
 *   - 材料有图表引用、完整表格、单位/百分数、数值选项、年份区间 → 有数据证据，不改；
 *   - E09（缺图/字母占位）、E10（材料缺失/选项跳号）、已 isAbnormal → 不改；
 *   - 只改高置信候选，并同步 moduleName / title 前缀。
 *
 * 用法：
 *   node scripts/scan-module-mislabel.cjs            # 只读清单
 *   node scripts/scan-module-mislabel.cjs --apply    # 批量改 module
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getE10Issues } = require('./lib/e10-rule.cjs');
const { getE09Issues, hasImage, hasStructuredData, CHART_REF_RE } = require('./lib/e09-rule.cjs');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = [
  path.join(ROOT, 'public', 'data', 'questions'),
  path.join(ROOT, 'public', 'data', 'questions-v2'),
  path.join(ROOT, 'public', 'data', 'questions-v2-provincial'),
];
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const DATE = new Date().toLocaleDateString('sv-SE');
const REPORT_JSON = path.join(REPORT_DIR, `模块错标扫描-${DATE}.json`);
const REPORT_CSV = path.join(REPORT_DIR, `模块错标扫描-${DATE}.csv`);
const REPORT_MD = path.join(REPORT_DIR, `模块错标扫描-${DATE}.md`);

const CALC_RE = /增长|比重|平均|顺差|总额/;
const JUDGE_RE = /共同特点|规律|符合|推出/;
const UNIT_RE = /%|％|亿元|万元|亿|万|元|吨|人|个|倍|百分点|公里|千米|平方米|平方公里/;
const YEAR_RANGE_RE = /(?:19|20)\d{2}\s*[～~—–\-－至到]\s*(?:19|20)\d{2}/;
const DATA_CONTEXT_RE = /资料|上图|下图|上表|下表|图表|统计图|统计表|调查结果|数据/;
const DEFAULT_TARGET = { module: 'panduan', moduleName: '判断推理', titlePrefix: '判断·' };
/** 人工复核后的改标目标；未列出的候选按用户口径改为判断推理 */
const MODULE_OVERRIDES = new Map([
  ['gk-2024-副省级-115', DEFAULT_TARGET],
  ['prov-shanghai-2019-A卷-108', { module: 'changshi', moduleName: '常识判断', titlePrefix: '常识·' }],
  ['prov-shanghai-2019-A卷-121', { module: 'changshi', moduleName: '常识判断', titlePrefix: '常识·' }],
]);

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

function isDataModule(q) {
  return String(q.module || '') === 'ziliao' || String(q.moduleName || '').includes('资料');
}

function hasDataEvidence(q) {
  const stem = String(q.stem || '');
  const material = String(q.material || '');
  const options = Array.isArray(q.options) ? q.options : [];
  const optionText = options.map(option => String((option && option.text) || '')).join(' ');

  return (
    hasImage(q) ||
    CHART_REF_RE.test(material) ||
    hasStructuredData(material) ||
    UNIT_RE.test(material) ||
    /\d/.test(optionText) ||
    YEAR_RANGE_RE.test(stem) ||
    DATA_CONTEXT_RE.test(`${stem}\n${material}`)
  );
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

const candidates = [];
for (const [id, record] of records) {
  const q = record.q;
  if (!isDataModule(q)) continue;
  const stem = String(q.stem || '');
  if (!JUDGE_RE.test(stem) || CALC_RE.test(stem)) continue;
  if (q.isAbnormal === true) continue;
  if (hasDataEvidence(q)) continue;
  if (getE09Issues(q).length > 0 || getE10Issues(q).length > 0) continue;

  const suggested = MODULE_OVERRIDES.get(id) || DEFAULT_TARGET;
  candidates.push({
    id,
    module: q.module,
    moduleName: q.moduleName,
    title: q.title,
    stem,
    material: String(q.material || ''),
    options: (q.options || []).map(option => `${option.key}.${option.text}`),
    source: q.source,
    suggestedModule: suggested.module,
    suggestedModuleName: suggested.moduleName,
    locations: [...record.locations],
  });
}
candidates.sort((a, b) => String(a.id).localeCompare(String(b.id), 'zh-CN'));
let changedModule = 0;
let changedModuleName = 0;
let changedTitle = 0;
let changedLocations = 0;
const changedFiles = [];
if (APPLY && candidates.length > 0) {
  const targetIds = new Set(candidates.map(candidate => candidate.id));
  for (const file of files) {
    const list = readArray(file);
    if (!list) continue;
    let dirty = false;
    for (const q of list) {
      if (!q || !targetIds.has(String(q.id))) continue;
      const suggested = MODULE_OVERRIDES.get(String(q.id)) || DEFAULT_TARGET;
      let changed = false;

      if (q.module !== suggested.module) {
        q.module = suggested.module;
        changedModule++;
        changed = true;
      }
      if (typeof q.moduleName === 'string' && q.moduleName.trim() !== '' && q.moduleName !== suggested.moduleName) {
        q.moduleName = suggested.moduleName;
        changedModuleName++;
        changed = true;
      }
      if (typeof q.title === 'string' && /^资料(?:分析)?[·・]/.test(q.title)) {
        q.title = q.title.replace(/^资料(?:分析)?[·・]/, suggested.titlePrefix);
        changedTitle++;
        changed = true;
      }
      if (changed) {
        changedLocations++;
        dirty = true;
      }
    }
    if (dirty) {
      changedFiles.push(relative(file));
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    }
  }
}

// 写入后只复扫本次改动的 ID，确认已不再是资料分析候选
const remaining = new Set();
if (APPLY && candidates.length > 0) {
  const targetIds = new Set(candidates.map(candidate => candidate.id));
  for (const file of files) {
    const list = readArray(file);
    if (!list) continue;
    for (const q of list) {
      if (!q || !targetIds.has(String(q.id))) continue;
      if (!isDataModule(q)) continue;
      const stem = String(q.stem || '');
      if (!JUDGE_RE.test(stem) || CALC_RE.test(stem)) continue;
      if (q.isAbnormal === true || hasDataEvidence(q)) continue;
      if (getE09Issues(q).length > 0 || getE10Issues(q).length > 0) continue;
      remaining.add(String(q.id));
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  apply: APPLY,
  scannedQuestions: records.size,
  scannedFiles: files.length,
  candidates: candidates.length,
  changedModule,
  changedModuleName,
  changedTitle,
  changedLocations,
  changedFiles,
  remaining: [...remaining],
  all: candidates,
};
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

const csvRows = [
  ['id', 'module', 'moduleName', 'suggestedModule', 'suggestedModuleName', 'title', 'stem', 'material', 'options', 'source', 'locations'],
];
for (const candidate of candidates) {
  csvRows.push([
    candidate.id,
    candidate.module,
    candidate.moduleName,
    candidate.suggestedModule,
    candidate.suggestedModuleName,
    candidate.title,
    candidate.stem,
    candidate.material.replace(/\s+/g, ' ').slice(0, 300),
    candidate.options.join(' | '),
    candidate.source,
    candidate.locations.join(' | '),
  ]);
}
fs.writeFileSync(
  REPORT_CSV,
  `\uFEFF${csvRows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
  'utf8'
);

const md = [];
md.push(`# 资料分析模块错标扫描（${DATE}）`);
md.push('');
md.push(`- 扫描题目：**${records.size}**（去重 ID）`);
md.push(`- 扫描文件：**${files.length}**`);
md.push(`- 高置信候选：**${candidates.length}** 题`);
md.push(
  `- 写入状态：${
    APPLY
      ? `改 module ${changedModule} 处、moduleName ${changedModuleName} 处、title 前缀 ${changedTitle} 处，涉及 ${changedFiles.length} 个文件；复扫残留 ${remaining.size}`
      : '只读（未改 module）'
  }`
);
md.push('');
md.push('## 口径');
md.push('');
md.push('- 资料分析模块：`module=ziliao` 或 `moduleName` 含“资料”。');
md.push('- 不含计算特征词：增长 / 比重 / 平均 / 顺差 / 总额。');
md.push('- 含判断特征词：共同特点 / 规律 / 符合 / 推出。');
md.push('- 排除：有图表/表格/单位/数值选项/年份区间（说明仍是资料题）、E09/E10 命中、已 isAbnormal。');
md.push('');
md.push('## 清单');
md.push('');
md.push('| ID | 原模块 | 改标 | 题干 | 位置 |');
md.push('|---|---|---|---|---|');
for (const candidate of candidates) {
  md.push(
    `| ${candidate.id} | ${candidate.moduleName || candidate.module} | ${candidate.suggestedModuleName} | ${String(candidate.stem)
      .replace(/\|/g, '\\|')
      .replace(/\s+/g, ' ')
      .slice(0, 160)} | ${candidate.locations.join('<br>')} |`
  );
}
md.push('');
md.push('> 人工复核：`gk-2024-副省级-115` 是逻辑推理，改判断推理；上海 2019 A 卷 108/121 是常识题，改常识判断（不强行改成判断推理，避免产生新的错标）。');
md.push('');
fs.writeFileSync(REPORT_MD, md.join('\n'), 'utf8');

console.log('===== 资料分析模块错标扫描 =====');
console.log(`题目: ${records.size}  文件: ${files.length}  候选: ${candidates.length}`);
if (APPLY) {
  console.log(
    `[apply] 改 module ${changedModule} 处、moduleName ${changedModuleName} 处、title ${changedTitle} 处，改动 ${changedFiles.length} 个文件；复扫残留 ${remaining.size}`
  );
} else {
  console.log('[dry-run] 未改 module。加 --apply 执行。');
}
console.log(`报告: ${path.relative(ROOT, REPORT_MD)}`);

