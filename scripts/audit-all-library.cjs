#!/usr/bin/env node
/**
 * 全库语义体检 + 异常隔离。
 *
 * 覆盖：
 *   v1  public/data/questions            线上全库（33 省 + 广州/深圳 + 联考 + 国考）
 *   v2  public/data/questions-v2         国考新库
 *   v2p public/data/questions-v2-provincial/<省>/questions.json + 分片
 *
 * 四道扫描：
 *   1. 答案分布（按卷：有效答案 >=20，最大字母占比 >=55%）
 *   2. 解析特征（解析开头 120 字与模块不符，高置信 / 弱命中）
 *   3. E07（题干残留选项标记）
 *   4. E10（资料材料缺失 / 选项年份、数字序列跳号）
 *
 * 隔离口径：
 *   - E10 全部命中
 *   - E07 全部命中
 *   - 解析特征仅隔离高置信（弱命中只报告）
 *   - 答案分布仅隔离“异常卷”内的全部客观题
 *   - 统一写 isAbnormal: true，不改题干/选项/答案/解析
 *
 * 用法：
 *   node scripts/audit-all-library.cjs            # 只读 + 出报告
 *   node scripts/audit-all-library.cjs --apply    # 写 isAbnormal 并出报告
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getE10Issues } = require('./lib/e10-rule.cjs');
const {
  paperName,
  answerDistribution,
  scanE07,
  scanExplanationModules,
} = require('./audit-provincial-semantics.cjs');

const ROOT = path.resolve(__dirname, '..');
const V1 = path.join(ROOT, 'public', 'data', 'questions');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2');
const V2P = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const DATE = new Date().toLocaleDateString('sv-SE');
const REPORT_MD = path.join(REPORT_DIR, `全库语义扫描-${DATE}.md`);
const REPORT_JSON = path.join(REPORT_DIR, `全库语义扫描-${DATE}.json`);
const REPORT_E10_CSV = path.join(REPORT_DIR, `全库语义扫描-E10-${DATE}.csv`);
const REPORT_HITS_CSV = path.join(REPORT_DIR, `全库语义扫描-命中明细-${DATE}.csv`);

const SUBJECTIVE = ['shenlun', 'gongji'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isSubjective(q) {
  return SUBJECTIVE.includes(String(q && q.module));
}

function provinceFromKey(key) {
  const part = String(key).split('-')[1] || 'none';
  return part === 'none' ? '国考' : part;
}

function uniqueFiles(index) {
  return [...new Set(Object.values(index).flat())];
}

function fileProvinceMap(index) {
  const map = new Map();
  for (const [key, files] of Object.entries(index)) {
    for (const file of files) {
      if (!map.has(file)) map.set(file, provinceFromKey(key));
    }
  }
  return map;
}

function loadIndexDataset(name, dir, defaultProvince) {
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  const index = readJson(indexPath);
  const provinceMap = fileProvinceMap(index);
  const questions = [];
  const locations = [];
  const seen = new Set();
  const files = uniqueFiles(index);

  for (const file of files) {
    const abs = path.join(dir, file);
    const list = readJson(abs);
    for (let position = 0; position < list.length; position++) {
      const q = list[position];
      locations.push({ id: String(q.id || ''), file: abs, position });
      if (!q.id || seen.has(q.id)) continue;
      seen.add(q.id);
      questions.push({
        q,
        province: q.province || provinceMap.get(file) || defaultProvince || '未知',
      });
    }
  }
  return { name, dir, questions, locations, files };
}

function loadProvinceDataset() {
  if (!fs.existsSync(V2P)) return null;
  const questions = [];
  const locations = [];
  const files = [];
  const seen = new Set();

  for (const entry of fs.readdirSync(V2P, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(V2P, entry.name);
    const aggregate = path.join(dir, 'questions.json');
    const indexPath = path.join(dir, 'index.json');
    const shardFiles = fs.existsSync(indexPath) ? uniqueFiles(readJson(indexPath)) : [];

    // 汇总 questions.json 是省考源池的权威全量；分片也登记位置，保证两边同步隔离
    const scanLists = [];
    if (fs.existsSync(aggregate)) {
      const list = readJson(aggregate);
      scanLists.push({ file: aggregate, list });
      files.push(aggregate);
    }
    for (const file of shardFiles) {
      const abs = path.join(dir, file);
      const list = readJson(abs);
      files.push(abs);
      if (!fs.existsSync(aggregate)) scanLists.push({ file: abs, list });
    }

    for (const { file, list } of scanLists) {
      for (let position = 0; position < list.length; position++) {
        const q = list[position];
        locations.push({ id: String(q.id || ''), file, position });
        if (!q.id || seen.has(q.id)) continue;
        seen.add(q.id);
        questions.push({ q, province: q.province || entry.name });
      }
    }

    // 汇总文件已存在时，分片位置也要登记，但不重复加入题目
    if (fs.existsSync(aggregate)) {
      for (const file of shardFiles) {
        const abs = path.join(dir, file);
        const list = readJson(abs);
        for (let position = 0; position < list.length; position++) {
          locations.push({ id: String(list[position].id || ''), file: abs, position });
        }
      }
    }
  }

  return { name: 'v2p', dir: V2P, questions, locations, files };
}

function scanDataset(source) {
  const list = source.questions.map(item => item.q);
  const distributions = answerDistribution(list);
  const e07Rows = scanE07(list);
  const explanation = scanExplanationModules(list);
  const e10Rows = [];
  const paperQuestions = new Map();
  const idProvince = new Map();
  const idSubjective = new Map();

  for (const item of source.questions) {
    const { q, province } = item;
    idProvince.set(q.id, province);
    idSubjective.set(q.id, isSubjective(q));
    if (isSubjective(q)) continue;
    const paper = paperName(q);
    if (!paperQuestions.has(paper)) paperQuestions.set(paper, []);
    paperQuestions.get(paper).push(q);

    const issues = getE10Issues(q);
    if (issues.length > 0) {
      e10Rows.push({
        id: q.id,
        province,
        module: q.module,
        paper,
        issues,
        stem: String(q.stem || '').slice(0, 240),
        material: String(q.material || '').slice(0, 240),
        options: (q.options || []).map(option => `${option?.key}.${String(option?.text || '').slice(0, 80)}`),
      });
    }
  }

  const answerAnomalyPapers = distributions.filter(row => row.anomaly);
  const answerAnomalyIds = new Set();
  for (const paper of answerAnomalyPapers) {
    for (const q of paperQuestions.get(paper.paper) || []) {
      if (q.id) answerAnomalyIds.add(q.id);
    }
  }

  const e07Ids = new Set(
    e07Rows.map(row => row.id).filter(id => id && !idSubjective.get(id))
  );
  const explanationStrongIds = new Set(
    explanation.strong.map(row => row.id).filter(id => id && !idSubjective.get(id))
  );
  const e10Ids = new Set(e10Rows.map(row => row.id).filter(Boolean));
  const isolationIds = new Set([
    ...answerAnomalyIds,
    ...e07Ids,
    ...explanationStrongIds,
    ...e10Ids,
  ]);

  return {
    name: source.name,
    questions: list.length,
    provinceCount: new Set(source.questions.map(item => item.province)).size,
    distributions,
    e07Rows,
    explanation,
    e10Rows,
    answerAnomalyIds,
    e07Ids,
    explanationStrongIds,
    e10Ids,
    isolationIds,
    idProvince,
    idSubjective,
  };
}

function provinceStats(source, scan) {
  const rows = new Map();
  const getRow = province => {
    if (!rows.has(province)) {
      rows.set(province, {
        province,
        questions: 0,
        total: 0,
        e10: 0,
        e07: 0,
        explanation: 0,
        answerAnomaly: 0,
      });
    }
    return rows.get(province);
  };

  for (const item of source.questions) {
    if (isSubjective(item.q)) continue;
    getRow(item.province).questions++;
  }
  const add = (ids, key) => {
    for (const id of ids) {
      const province = scan.idProvince.get(id);
      if (!province || scan.idSubjective.get(id)) continue;
      getRow(province)[key]++;
    }
  };
  add(scan.e10Ids, 'e10');
  add(scan.e07Ids, 'e07');
  add(scan.explanationStrongIds, 'explanation');
  add(scan.answerAnomalyIds, 'answerAnomaly');
  add(scan.isolationIds, 'total');

  return [...rows.values()].sort((a, b) => b.total - a.total || b.questions - a.questions);
}

function applyIsolation(source, scan) {
  const byFile = new Map();
  for (const location of source.locations) {
    if (!scan.isolationIds.has(location.id)) continue;
    if (!byFile.has(location.file)) byFile.set(location.file, []);
    byFile.get(location.file).push(location);
  }

  let marked = 0;
  let alreadyMarked = 0;
  const changedFiles = [];

  for (const [file, locations] of byFile) {
    const list = readJson(file);
    let dirty = false;
    for (const location of locations) {
      const q = list[location.position];
      if (!q || String(q.id || '') !== location.id) continue;
      if (q.isAbnormal === true) {
        alreadyMarked++;
      } else {
        q.isAbnormal = true;
        marked++;
        dirty = true;
      }
    }
    if (dirty) {
      changedFiles.push(path.relative(ROOT, file));
      if (APPLY) fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    }
  }

  return { marked, alreadyMarked, changedFiles };
}

function mdCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function writeCsv(file, header, rows) {
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  fs.writeFileSync(file, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

function percentage(part, total) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

function sumBy(list, fn) {
  return list.reduce((sum, item) => sum + fn(item), 0);
}

const sources = [
  loadIndexDataset('v1', V1),
  loadIndexDataset('v2', V2, '国考'),
  loadProvinceDataset(),
].filter(Boolean);

const scans = sources.map(source => ({ source, scan: scanDataset(source) }));
const stats = scans.map(({ source, scan }) => ({ source, scan, provinces: provinceStats(source, scan) }));
const applyResults = scans.map(({ source, scan }) => ({ source, scan, result: applyIsolation(source, scan) }));

const datasetRows = stats.map(({ source, scan }) => {
  const apply = applyResults.find(item => item.source === source).result;
  return {
    name: source.name,
    questions: scan.questions,
    provinces: scan.provinceCount,
    answerAnomalyPapers: scan.distributions.filter(row => row.anomaly).length,
    answerAnomalyQuestions: scan.answerAnomalyIds.size,
    e07: scan.e07Ids.size,
    explanationStrong: scan.explanationStrongIds.size,
    explanationWeak: scan.explanation.weak.length,
    e10: scan.e10Ids.size,
    e10A: scan.e10Rows.filter(row => row.issues.some(issue => issue.code === 'E10-A')).length,
    e10B: scan.e10Rows.filter(row => row.issues.some(issue => issue.code === 'E10-B')).length,
    isolation: scan.isolationIds.size,
    marked: apply.marked,
    alreadyMarked: apply.alreadyMarked,
    changedFiles: apply.changedFiles.length,
  };
});

const totals = {
  questions: sumBy(datasetRows, row => row.questions),
  answerAnomalyPapers: sumBy(datasetRows, row => row.answerAnomalyPapers),
  answerAnomalyQuestions: sumBy(datasetRows, row => row.answerAnomalyQuestions),
  e07: sumBy(datasetRows, row => row.e07),
  explanationStrong: sumBy(datasetRows, row => row.explanationStrong),
  explanationWeak: sumBy(datasetRows, row => row.explanationWeak),
  e10: sumBy(datasetRows, row => row.e10),
  e10A: sumBy(datasetRows, row => row.e10A),
  e10B: sumBy(datasetRows, row => row.e10B),
  isolation: sumBy(datasetRows, row => row.isolation),
  marked: sumBy(datasetRows, row => row.marked),
  alreadyMarked: sumBy(datasetRows, row => row.alreadyMarked),
  changedFiles: datasetRows.reduce((sum, row) => sum + row.changedFiles, 0),
};

const v1Stats = stats.find(item => item.source.name === 'v1');
const v2pStats = stats.find(item => item.source.name === 'v2p');
const v2Stats = stats.find(item => item.source.name === 'v2');
const v1Scan = scans.find(item => item.source.name === 'v1');
const v2pScan = scans.find(item => item.source.name === 'v2p');
const e10Rows = scans.flatMap(({ source, scan }) => scan.e10Rows.map(row => ({ dataset: source.name, ...row })));
const e10BRows = e10Rows.filter(row => row.issues.some(issue => issue.code === 'E10-B'));
const answerAnomalyRows = scans.flatMap(({ source, scan }) =>
  scan.distributions.filter(row => row.anomaly).map(row => ({ dataset: source.name, ...row }))
);

const summary = {
  generatedAt: new Date().toISOString(),
  apply: APPLY,
  scope: datasetRows,
  totals,
  top10: {
    v1: (v1Stats ? v1Stats.provinces.slice(0, 10) : []),
    v2p: (v2pStats ? v2pStats.provinces.slice(0, 10) : []),
    v2: (v2Stats ? v2Stats.provinces.slice(0, 10) : []),
  },
  answerAnomalyPapers: answerAnomalyRows,
  e10B: e10BRows,
  e10: e10Rows,
};

function provinceOnly(rows) {
  return rows.filter(row => !['国考', '联考'].includes(row.province));
}

function topTable(rows) {
  const lines = [
    '| 排名 | 省份/类别 | 命中题数 | 题量 | 命中率 | E10 | E07 | 解析高置信 | 答案异常题 |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  rows.forEach((row, index) => {
    lines.push(
      `| ${index + 1} | ${mdCell(row.province)} | ${row.total} | ${row.questions} | ${percentage(row.total, row.questions)} | ` +
      `${row.e10} | ${row.e07} | ${row.explanation} | ${row.answerAnomaly} |`
    );
  });
  return lines;
}

function buildMarkdown() {
  const lines = [];
  lines.push(`# 全库语义扫描与异常隔离报告（${DATE}）`);
  lines.push('');
  lines.push(`- 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  lines.push(`- 执行入口：\`node scripts/audit-all-library.cjs${APPLY ? ' --apply' : ''}\``);
  lines.push(`- 数据范围：v1 线上全库、v2 国考新库、v2p 省考源池（33 省 + 广州/深圳 + 联考）`);
  lines.push(`- 写入状态：**${APPLY ? '已写入 isAbnormal' : '只读预演，未写入'}**`);
  lines.push('');
  lines.push('## 1. 口径');
  lines.push('');
  lines.push('- 答案分布：按“解析来源卷”聚合，仅统计 A-D 有效答案；单卷有效答案 ≥20 且最大字母占比 ≥55% 记为失衡，≥65% 或字母缺项为严重失衡。');
  lines.push('- 解析特征：解析开头 120 字内出现跨模块强特征词，且题干不像目标模块；只隔离高置信，弱命中仅报告。');
  lines.push('- E07：题干残留 `A、`/`B.` 等选项标记，排除纯字母变量枚举。');
  lines.push('- E10：资料语境下材料为空/无有效数字且题干未自带数据（E10-A）；纯年份选项在题干区间内首尾齐全但只缺 1 个年份，或带单位数字序列跳号（E10-B）。');
  lines.push('- 隔离：E10/E07 全部命中、解析高置信、答案异常卷内全部客观题，统一写 `isAbnormal: true`；不改题干、选项、答案、解析。');
  lines.push('- 申论/公基主观题不参与 E10 与题干/解析扫描；题量仍计入数据集总量。');
  lines.push('');
  lines.push('## 2. 总览');
  lines.push('');
  lines.push('| 数据集 | 题量 | 省/类别 | 答案异常卷 | 答案异常题 | E07 | 解析高置信 | 解析弱 | E10 | E10-A | E10-B | 隔离题数 | 新写标记 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of datasetRows) {
    lines.push(
      `| ${row.name} | ${row.questions} | ${row.provinces} | ${row.answerAnomalyPapers} | ${row.answerAnomalyQuestions} | ` +
      `${row.e07} | ${row.explanationStrong} | ${row.explanationWeak} | ${row.e10} | ${row.e10A} | ${row.e10B} | ${row.isolation} | ${row.marked} |`
    );
  }
  lines.push(
    `| **合计（按数据集相加）** | **${totals.questions}** | — | **${totals.answerAnomalyPapers}** | **${totals.answerAnomalyQuestions}** | ` +
    `**${totals.e07}** | **${totals.explanationStrong}** | **${totals.explanationWeak}** | **${totals.e10}** | **${totals.e10A}** | **${totals.e10B}** | **${totals.isolation}** | **${totals.marked}** |`
  );
  lines.push('');
  lines.push(`> v1 与 v2p 存在同 ID 重叠，合计题量不是去重后的独立题数；隔离数按数据集分别计数。`);
  lines.push(`> 已存在标记 ${totals.alreadyMarked} 处；本次${APPLY ? '新写' : '预计新写'} ${totals.marked} 处，涉及 ${totals.changedFiles} 个文件。`);
  lines.push('> v2p 的“新写标记”包含 `questions.json` 与分片双写，因此会大于隔离题数。');
  lines.push('');
  lines.push('## 3. 各省命中数 TOP10');
  lines.push('');
  lines.push('### 3.1 线上全库 v1（内测实际加载）');
  lines.push('');
  const v1ProvinceRows = v1Stats ? provinceOnly(v1Stats.provinces).slice(0, 10) : [];
  if (v1ProvinceRows.length) lines.push(...topTable(v1ProvinceRows));
  else lines.push('无数据。');
  lines.push('');
  lines.push('> 国考/联考为单列类别，不参与省份排名；国考见 3.3。');
  lines.push('');
  lines.push('### 3.2 省考源池 v2p（后续修复按此榜逐个回源）');
  lines.push('');
  const v2pProvinceRows = v2pStats ? provinceOnly(v2pStats.provinces).slice(0, 10) : [];
  if (v2pProvinceRows.length) lines.push(...topTable(v2pProvinceRows));
  else lines.push('无数据。');
  lines.push('');
  lines.push('### 3.3 国考新库 v2');
  lines.push('');
  if (v2Stats && v2Stats.provinces.length) lines.push(...topTable(v2Stats.provinces.slice(0, 10)));
  else lines.push('无数据。');
  lines.push('');
  lines.push('## 4. E10-B 选项序列缺口（强证据）');
  lines.push('');
  if (e10BRows.length === 0) {
    lines.push('无命中。');
  } else {
    lines.push('| # | 数据集 | 省份 | 题ID | 判定 |');
    lines.push('|---:|---|---|---|---|');
    e10BRows.forEach((row, index) => {
      const detail = row.issues.filter(issue => issue.code === 'E10-B').map(issue => issue.detail).join('；');
      lines.push(`| ${index + 1} | ${row.dataset} | ${mdCell(row.province)} | ${mdCell(row.id)} | ${mdCell(detail)} |`);
    });
  }
  lines.push('');
  lines.push('## 5. E10 样例（前 15 条）');
  lines.push('');
  lines.push('| # | 数据集 | 省份 | 题ID | 代码 | 判定 | 题干 |');
  lines.push('|---:|---|---|---|---|---|---|');
  e10Rows.slice(0, 15).forEach((row, index) => {
    const codes = [...new Set(row.issues.map(issue => issue.code))].join('/');
    const detail = row.issues.map(issue => issue.detail).join('；');
    lines.push(
      `| ${index + 1} | ${row.dataset} | ${mdCell(row.province)} | ${mdCell(row.id)} | ${codes} | ${mdCell(detail)} | ${mdCell(row.stem).slice(0, 80)} |`
    );
  });
  lines.push('');
  lines.push('## 6. 答案分布异常卷');
  lines.push('');
  if (answerAnomalyRows.length === 0) {
    lines.push('本次未发现达到阈值的异常卷。');
    lines.push('');
    lines.push('> 0 异常卷不等于答案全对；覆盖率低/串卷仍需单独核对。');
  } else {
    lines.push('| 数据集 | 卷 | 有效答案 | A | B | C | D | 最大占比 | 判定 |');
    lines.push('|---|---|---:|---:|---:|---:|---:|---:|---|');
    for (const row of answerAnomalyRows) {
      lines.push(
        `| ${row.dataset} | ${mdCell(row.paper)} | ${row.total} | ${row.counts.A} | ${row.counts.B} | ${row.counts.C} | ${row.counts.D} | ` +
        `${(row.maxShare * 100).toFixed(1)}% | ${mdCell(row.status)} |`
      );
    }
  }
  lines.push('');
  lines.push('## 7. 结论与下一步');
  lines.push('');
  const topProvinces = v1Stats
    ? provinceOnly(v1Stats.provinces).slice(0, 3).map(row => `${row.province}(${row.total})`).join('、')
    : '—';
  lines.push(`- 线上全库脏数据最集中的前 3 个省份（不含国考/联考）：${topProvinces}；后续修复优先按此顺序回源。`);
  lines.push(`- E10-A 是当前最大缺口（${totals.e10A} 条按数据集计），主要是材料为空/只有占位语；需要按省补材料，不能靠前端修。`);
  lines.push(`- E10-B 共 ${totals.e10B} 条，属于选项年份跳号的强证据；逐条回源核对缺失年份是否漏项。`);
  lines.push(`- E07 ${totals.e07} 条、解析高置信 ${totals.explanationStrong} 条已隔离；解析弱命中 ${totals.explanationWeak} 条只报告，不扩大隔离面。`);
  lines.push(`- 已隔离 ${totals.isolation} 题（按数据集计）。需要恢复某题时，删除该题 \`isAbnormal\` 字段即可。`);
  lines.push('');
  lines.push('## 8. 产物');
  lines.push('');
  lines.push(`- 人读报告：\`${path.relative(ROOT, REPORT_MD)}\``);
  lines.push(`- 汇总 JSON：\`${path.relative(ROOT, REPORT_JSON)}\``);
  lines.push(`- E10 明细 CSV：\`${path.relative(ROOT, REPORT_E10_CSV)}\``);
  lines.push(`- 全部命中明细 CSV：\`${path.relative(ROOT, REPORT_HITS_CSV)}\``);
  lines.push('');
  return lines.join('\n');
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(REPORT_MD, buildMarkdown(), 'utf8');
fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), 'utf8');

const e10CsvRows = [];
for (const { source, scan } of scans) {
  for (const row of scan.e10Rows) {
    for (const issue of row.issues) {
      e10CsvRows.push([
        source.name,
        row.province,
        row.id,
        row.module,
        row.paper,
        issue.code,
        issue.detail,
        row.stem,
        row.material,
        row.options.join(' | '),
      ]);
    }
  }
}
writeCsv(
  REPORT_E10_CSV,
  ['dataset', 'province', 'id', 'module', 'paper', 'code', 'detail', 'stem', 'material', 'options'],
  e10CsvRows
);

const hitCsvRows = [];
for (const { source, scan } of scans) {
  for (const row of scan.e10Rows) {
    for (const issue of row.issues) {
      hitCsvRows.push([
        source.name, row.province, row.id, row.module, issue.code, issue.detail, row.paper, row.stem,
      ]);
    }
  }
  for (const row of scan.e07Rows) {
    hitCsvRows.push([
      source.name, scan.idProvince.get(row.id) || '', row.id, row.module, 'E07', row.excerpt, row.paper, '',
    ]);
  }
  for (const row of scan.explanation.strong) {
    hitCsvRows.push([
      source.name, scan.idProvince.get(row.id) || '', row.id, row.module, 'EXPLANATION_STRONG',
      `${row.triage}；命中词：${row.tokens.join('、')}`, row.paper, row.stem,
    ]);
  }
  for (const row of scan.distributions.filter(item => item.anomaly)) {
    hitCsvRows.push([
      source.name, '', '', '', 'ANSWER_ANOMALY',
      `${row.status}；A=${row.counts.A},B=${row.counts.B},C=${row.counts.C},D=${row.counts.D}；最大占比=${(row.maxShare * 100).toFixed(1)}%`,
      row.paper, '',
    ]);
  }
}
writeCsv(
  REPORT_HITS_CSV,
  ['dataset', 'province', 'id', 'module', 'rule', 'detail', 'paper', 'stem'],
  hitCsvRows
);

console.log('===== 全库语义扫描与异常隔离 =====');
console.log(`题量: ${totals.questions}（按数据集相加）`);
console.log(`答案异常卷: ${totals.answerAnomalyPapers}  E07: ${totals.e07}  解析高置信: ${totals.explanationStrong}  解析弱: ${totals.explanationWeak}`);
console.log(`E10: ${totals.e10}（A=${totals.e10A}, B=${totals.e10B}）  隔离: ${totals.isolation}`);
console.log(`[${APPLY ? 'apply' : 'dry-run'}] 新写标记 ${totals.marked} 处，已存在 ${totals.alreadyMarked} 处，改动 ${totals.changedFiles} 个文件`);
console.log(`报告: ${REPORT_MD}`);
