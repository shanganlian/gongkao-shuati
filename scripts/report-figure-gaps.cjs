#!/usr/bin/env node
/**
 * 生成「图推配图补录清单」（docs/图推配图补录清单-<日期>.md）
 *
 * 口径：
 *   - 范围：国考 2000–2010、subModule=图形推理 的全部题目（按需扩展年份见 YEAR_MIN/YEAR_MAX）；
 *   - 缺口题 = 没有 imageUrl 的题；
 *   - 缺失原因分三类：docx 无位图（矢量形状）/ docx 整节缺失 / 图已抽出但整卷对账未通过；
 *   - 每卷一行汇总 + 逐题明细（卷、题号、题干前 20 字、缺失原因、建议处理方式）。
 *
 * 数据来源：
 *   - public/data/questions/*.json（题目分片，读 subModule/imageUrl/stem）
 *   - scripts/out/figure-extract-*.report.json（判断该题是否已有合格候选图但未落盘）
 *
 * 用法：node scripts/report-figure-gaps.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions');
const OUT_DIR = path.join(ROOT, 'docs');
const REPORT_OUT = path.join(ROOT, 'scripts', 'out');
const DATE = new Date().toLocaleDateString('sv-SE');
const YEAR_MIN = 2000;
const YEAR_MAX = 2010;

const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json', 'submoduleCounts.json']);

const PAPER_ORDER = { 未标注: 0, 一卷: 1, 二卷: 2, A卷: 1, B卷: 2 };

/** key = "<年>|<卷>" → 统一卷名 */
function labelOf(key) {
  const [year, paper] = String(key).split('|');
  return paper === '未标注' ? `国考 ${year}《行测》` : `国考 ${year}《行测》${paper}`;
}

const REASONS = {
  CANDIDATE: '配图已抽出（报告有产出、质检通过），但同卷仍有缺图，整卷对账未通过 → 未落盘',
  VECTOR: 'docx 该段只有 Word 矢量形状（v:shape/w:pict），media 里没有对应位图',
  SECTION_MISSING: 'docx 整节缺失：题号从 15 直接跳到 26，题干与配图都不在文档里',
};

const ADVICE = {
  CANDIDATE: '跑 extract --apply --only <题号> 逐题放行落盘，再用 apply-figure-image-urls.cjs --report … 写回 imageUrl',
  VECTOR: '从原卷 PDF/题库截图，命名 gk-<年>-<卷>-<题号>.webp（≤100KB），再走 apply-figure-image-urls.cjs --map 写回',
  SECTION_MISSING: '需换来源（原卷 PDF/题库）补题干+配图；先补题干再补图，二者缺一都不要落 imageUrl',
};


/** 逐题特殊分类（按 id），未命中的走按卷默认分类 */
const SPECIAL_REASON = {};
const PAPER_DEFAULT_REASON = {
  '2002|B卷': 'VECTOR',
  '2003|B卷': 'SECTION_MISSING',
  '2004|B卷': 'VECTOR',
  '2006|二卷': 'VECTOR',
};

const rows = [];
for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.json') || SPECIAL.has(file)) continue;
  const arr = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  if (!Array.isArray(arr)) continue;
  for (const q of arr) {
    if (!q || typeof q.id !== 'string' || !q.id.startsWith('gk-')) continue;
    if (q.subModule !== '图形推理') continue;
    const m = /^gk-(\d{4})-(.+)-(\d+)$/.exec(q.id);
    if (!m) continue;
    const year = Number(m[1]);
    if (year < YEAR_MIN || year > YEAR_MAX) continue;
    rows.push({
      id: q.id,
      key: `${year}|${m[2]}`,
      year,
      paper: m[2],
      number: Number(m[3]),
      stem: String(q.stem || '').replace(/\s+/g, ' ').trim().slice(0, 20),
      hasImageUrl: Boolean(q.imageUrl),
      imageUrl: q.imageUrl || null,
      file,
    });
  }
}

/** 抽取报告里的产出候选：wrote=false 说明图抽到了但没落盘 */
const candidates = new Map();
for (const name of fs.readdirSync(REPORT_OUT)) {
  if (!name.startsWith('figure-extract-') || !name.endsWith('.report.json')) continue;
  const report = JSON.parse(fs.readFileSync(path.join(REPORT_OUT, name), 'utf8'));
  for (const item of report.produced || []) {
    if (item && item.id) candidates.set(item.id, { report: name, wrote: item.wrote === true });
  }
}

const pending = rows
  .filter((row) => !row.hasImageUrl)
  .sort((a, b) => a.year - b.year || a.paper.localeCompare(b.paper) || a.number - b.number);

for (const row of pending) {
  const candidate = candidates.get(row.id);
  if (SPECIAL_REASON[row.id]) row.reasonKey = SPECIAL_REASON[row.id];
  else if (candidate && candidate.wrote === false) row.reasonKey = 'CANDIDATE';
  else row.reasonKey = PAPER_DEFAULT_REASON[row.key] || 'VECTOR';
  row.reason = REASONS[row.reasonKey];
  row.advice = ADVICE[row.reasonKey];
  row.candidate = candidate && candidate.wrote === false ? candidate.report : null;
}

const byPaper = new Map();
for (const row of rows) {
  if (!byPaper.has(row.key)) byPaper.set(row.key, []);
  byPaper.get(row.key).push(row);
}

const summary = [...byPaper.entries()]
  .map(([key, list]) => ({
    key,
    label: labelOf(key),
    total: list.length,
    withUrl: list.filter((row) => row.hasImageUrl).length,
    missing: list.filter((row) => !row.hasImageUrl).length,
  }))
  .sort((a, b) => {
    const [ya, pa] = a.key.split('|');
    const [yb, pb] = b.key.split('|');
    return Number(ya) - Number(yb) || (PAPER_ORDER[pa] || 0) - (PAPER_ORDER[pb] || 0);
  });

const candidateRows = pending.filter((row) => row.candidate);
const missingTotal = pending.length;
const urlTotal = rows.length - missingTotal;

const lines = [];
lines.push('# 图推配图补录清单（' + DATE + '）');
lines.push('');
lines.push('- 范围：国考 ' + YEAR_MIN + '–' + YEAR_MAX + '《行测》图形推理题（' + summary.length + ' 卷）');
lines.push('- 统计：图推题 ' + rows.length + ' 题；已配图 ' + urlTotal + ' 题；缺口 ' + missingTotal + ' 题');
lines.push('- 处理口径：本清单只登记缺口，不改题库字段；缺口题前端保持 `MissingFigurePlaceholder` 占位卡');
lines.push('');
lines.push('## 一、按卷汇总');
lines.push('');
lines.push('| 卷 | 图推题数 | 已配图 | 缺口 |');
lines.push('|---|---|---|---|');
for (const item of summary) {
  lines.push('| ' + item.label + ' | ' + item.total + ' | ' + item.withUrl + ' | ' + item.missing + ' |');
}
lines.push('');
lines.push('## 二、缺口明细（' + missingTotal + ' 题）');
lines.push('');
lines.push('| 卷 | 题号 | 题干前 20 字 | 缺失原因 | 建议处理方式 |');
lines.push('|---|---|---|---|---|');
for (const row of pending) {
  const label = labelOf(row.key);
  const stem = row.stem || '（无题干文本）';
  lines.push('| ' + label + ' | ' + row.number + ' | ' + stem + ' | ' + row.reason + ' | ' + row.advice + ' |');
}
lines.push('');
if (candidateRows.length) {
  lines.push('## 三、已抽出但未落盘（' + candidateRows.length + ' 题）');
  lines.push('');
  lines.push('这些题的配图已经从 docx 抽出并通过质检，只是同卷还有缺图，按「整卷对账」策略没有写盘：');
  lines.push('');
  lines.push('| 卷 | 题号 | 候选配图 |');
  lines.push('|---|---|---|');
  for (const row of candidateRows) {
    const name = 'gk-' + row.year + '-' + (row.paper === '一卷' ? '1' : row.paper === '二卷' ? '2' : row.paper.replace('卷', '')) + '-' + row.number;
    lines.push('| ' + labelOf(row.key) + ' | ' + row.number + ' | ' + name + '（见 ' + row.candidate + '） |');
  }
  lines.push('');
}
lines.push('## 三、后续操作');
lines.push('');
lines.push('```');
lines.push('# 1) 逐题放行：对已抽出、只是同卷还有缺图的卷，只落盘名单内的题（其余保持 error）');
lines.push('node scripts/extract-figure-images.cjs --year 2002 --paper B卷 --docx B卷 --tag B --apply --only 96,97,98,104,105');
lines.push('node scripts/apply-figure-image-urls.cjs --report scripts/out/figure-extract-2002-B.report.json --apply');
lines.push('');
lines.push('# 2) 人工补图后写回：先做 <年>-<卷>-<题号> 命名的 webp（≤100KB），再');
lines.push('node scripts/apply-figure-image-urls.cjs --map <清单.json> --apply');
lines.push('');
lines.push('# 3) 原图超 100KB：先转 webp（sharp，白名单 3 题），再按 report 写回');
lines.push('node scripts/convert-oversize-figure-images.cjs --apply');
lines.push('```');
lines.push('');
lines.push('> 说明：`scripts/out/figure-extract-*.report.json` 每次重跑都会覆盖，只有当前卷的结果可信；');
lines.push(candidateRows.length
  ? '> 清单里的「候选配图」以报告中的 produced[] 为准，重跑后需重新生成本清单。'
  : '> 本清单每次重跑都按题库 imageUrl + 最新报告重算，可随时再执行 `node scripts/report-figure-gaps.cjs` 刷新。');
lines.push('');

lines.push('## 四、备注');
lines.push('');
lines.push('- 2026-11-16 收口：2002 B卷 96/97/98/104/105、2006 一卷 51–60、2006 二卷 76/77/78/84 共 19 题已落盘并写回 imageUrl；');
lines.push('  其中 2006 一卷的 #52/#54 是「一段两题号」（docx 段落文本「51.      52」「53.      54」），');
lines.push('  已按版面横向位置拆图：内联图靠左归 51/53，浮图（positionH ≈ 8.6cm）靠右归 52/54，');
lines.push('  与解析口径一致（#51 黑点递减 / #52 头身脚 / #53 三角形翻转 / #54 对角线错切）；');
lines.push('- 缺口现状：2002 B卷 100–103、2003 B卷 16–25、2004 B卷 51–60、2006 二卷 80–83/85，');
lines.push('  全部属于「docx 该段只有矢量形状」或「整节缺失」，只能换图源（原卷 PDF/题库截图），靠 docx 抽取已无解；');
lines.push('- 题干质量（已落盘但题干待修，不在本清单范围）：2006 一卷 57–60 的 stem 是解析文本（「【解析】C。…」）、');
lines.push('  55 混入小节头「（二）左边的图形由若干个…」，2002 B卷 98 的 stem 是「.」；');
lines.push('- 题干口径：其余缺口题的 stem 多为同代占位写法「请根据图形规律，从四个选项中选出最合适的一项。」（2026-11-16 已统一）；');
lines.push('- 占位卡：缺口题前端走 `MissingFigurePlaceholder`，不显示空白图位，等 imageUrl 落库后自动切换；');
lines.push('- 范围外：2011–2025 另有约 306 道图推题无图，需先确认 docx/图源再另立批次。');
lines.push('');
fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, '图推配图补录清单-' + DATE + '.md');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');

console.log('== 图推配图补录清单 ==');
console.log('范围    : gk ' + YEAR_MIN + '-' + YEAR_MAX + '，' + summary.length + ' 卷');
console.log('题数    : ' + rows.length + ' 题（已配图 ' + urlTotal + '，缺口 ' + missingTotal + '）');
for (const item of summary) {
  if (item.missing) console.log('  ' + item.label.padEnd(22) + item.total + ' 题 / 已配图 ' + item.withUrl + ' / 缺 ' + item.missing);
}
console.log('已抽出未落盘: ' + candidateRows.length + ' 题');
console.log('清单    : ' + path.relative(ROOT, outFile).replace(/\\/g, '/'));

for (const name of fs.readdirSync(REPORT_OUT)) {
  if (!name.startsWith('figure-extract-') || !name.endsWith('.report.json')) continue;
  const report = JSON.parse(fs.readFileSync(path.join(REPORT_OUT, name), 'utf8'));
  for (const item of report.produced || []) {
    if (item && item.id) candidates.set(item.id, { report: name, wrote: item.wrote === true });
  }
}
