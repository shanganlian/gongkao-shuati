#!/usr/bin/env node
/**
 * audit-v2-explanation-module.cjs —— 三省 v2 分片“模块 / 解析特征”错配扫描
 *
 * 只读扫描 public/data/questions-v2-provincial/{安徽,福建,浙江}/ 的分片，
 * 不修改任何题目数据。判定两类嫌疑：
 *   A. module=changshi，但 explanation 开头出现言语特征词；
 *   B. module=yanyu，但 explanation 开头出现资料特征词。
 *
 * 口径：
 *   - “开头”= 解析去掉空白后的前 WINDOW 个字符（默认 120）；
 *   - “核心命中”= 用户点名词（言语 5 词 / 资料 3 词）；
 *   - “扩展命中”= 核心词 + 高精度邻近词；
 *   - 同时给“记录级”和“模块内唯一 ID”两套计数，避免福建重复 ID 虚增。
 *
 * 输出：
 *   - guokao-reports/v2-解析错配-三省.md
 *   - guokao-reports/v2-解析错配-三省.csv
 *
 * 用法：
 *   node scripts/audit-v2-explanation-module.cjs
 *   node scripts/audit-v2-explanation-module.cjs --window 80
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const V2_ROOT = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const REPORT = path.join(ROOT, 'guokao-reports', 'v2-解析错配-三省.md');
const CSV_OUT = path.join(ROOT, 'guokao-reports', 'v2-解析错配-三省.csv');
const PROVINCES = ['安徽', '福建', '浙江'];
const SPECIAL_FILES = new Set(['index.json', 'idMap.json', 'questions.json']);
const WINDOW = (() => {
  const i = process.argv.indexOf('--window');
  const n = i >= 0 ? Number(process.argv[i + 1]) : 120;
  return Number.isFinite(n) && n > 0 ? n : 120;
})();

const YANYU_CORE = ['实词', '成语', '主旨', '细节理解', '混搭填空'];
const YANYU_EXT = [
  '逻辑填空', '选词填空', '词语辨析', '近义词', '实词辨析', '成语辨析',
  '意图判断', '主旨概括', '中心理解', '细节判断', '标题填入', '标题选择',
  '语句排序', '语句填空', '语句衔接', '下文推断', '接语选择', '态度理解',
  '词句理解', '代词指代', '篇章阅读', '病句', '歧义', '横线处', '第一空',
  '第二空', '划横线', '填入划横线', '文段',
];
const ZILIAO_CORE = ['增长率', '比重', '百分点'];
const ZILIAO_EXT = [
  '增长量', '同比', '环比', '基期', '现期', '资料分析', '材料中',
  '定位表格', '定位图形', '表格材料', '图表材料', '翻番', '平均数',
  '倍数', '进出口', '占全国', '增速',
];

/** 言语“强信号”：出现即基本可判定为言语解析，而不是常识正文顺带提到。 */
const YANYU_STRONG = [
  '实词', '混搭填空', '逻辑填空', '选词填空', '词语辨析', '近义词',
  '实词辨析', '成语辨析', '第一空', '第二空', '横线处', '划横线',
  '填入划横线', '细节判断', '中心理解', '主旨概括', '意图判断',
  '标题填入', '标题选择', '语句排序', '语句填空', '语句衔接',
  '下文推断', '接语选择', '态度理解', '词句理解', '代词指代',
  '篇章阅读', '病句', '歧义',
];
/** 资料解析“方法论强信号”：裸词“比重/增长率”不算，避免正文提及误报。 */
const DATA_STRONG = [
  '判定本题为', '可判定本题', '定位表格', '定位图形', '定位文字材料',
  '资料分析', '基期', '现期', '同比', '环比', '增长量', '比重问题',
  '平均数问题', '倍数问题', '根据公式',
];
/** 题干是否像言语题（用于区分“模块标错”与“解析挂错”）。 */
const STEM_YANYU_RE = /填入划横线|依次填入|最恰当的一项|没有语病|有语病|歧义|语句排序|排列组合|语序|下文推断|主要说明|意在说明|主旨|符合原文|细节判断|加点词语|划横线|衔接最恰当|填入|根据这段文字|这段文字|理解不正确|理解正确|最符合文意|最符合这段文字|最符合原文|最符合作者意图|符合文意|可以推出|作者意图|主要观点|意在强调|概括最准确|最适合做|最适合这则|最适合这段|作为标题/u;
/** 题干是否像数量题（用于识别 yanyu 里的数量题误标）。 */
const STEM_SHULIANG_RE = /概率|几何|圆锥|菱形|三角形|正方形|多少倍|排列|组合|路程|工程|利润|年龄|容斥|植树|牛吃草/u;

const MODULE_NAME = {
  changshi: '常识',
  yanyu: '言语',
  panduan: '判断',
  shuliang: '数量',
  ziliao: '资料',
  shenlun: '申论',
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function shardFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && !SPECIAL_FILES.has(f))
    .sort();
}

function arrayOfQuestions(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.questions)) return json.questions;
  if (Array.isArray(json?.items)) return json.items;
  return [];
}

/** 解析去空白，便于压制 OCR 空格（如“实 词”）。 */
function normalizeText(text) {
  return String(text || '')
    .replace(/[\s\u3000\u00a0]+/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

/** 从 source 提取卷名；退化时用 ID 前缀。 */
function paperName(q) {
  const src = String(q.source || '').trim();
  if (src) {
    const stripped = src
      .replace(/第\s*\d+(?:\s*[-—~～至]\s*\d+)?\s*题.*$/u, '')
      .trim();
    if (stripped) return stripped;
  }
  const id = String(q.id || '');
  const m = id.match(/^prov-[a-z]+-(.+)-\d+$/);
  return m ? m[1] : '(未知卷)';
}

/** 命中词：返回最早出现的关键词集合与首个位置。 */
function findTokens(opening, core, ext) {
  const all = [...core, ...ext.filter(t => !core.includes(t))];
  const hits = [];
  for (const token of all) {
    const pos = opening.indexOf(token);
    if (pos >= 0) hits.push({ token, pos, core: core.includes(token) });
  }
  hits.sort((a, b) => a.pos - b.pos || b.token.length - a.token.length);
  return {
    tokens: hits.map(h => h.token),
    coreTokens: hits.filter(h => h.core).map(h => h.token),
    firstPos: hits.length ? hits[0].pos : -1,
  };
}

function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const records = [];
const provinceStats = new Map();

for (const province of PROVINCES) {
  const dir = path.join(V2_ROOT, province);
  if (!fs.existsSync(dir)) {
    console.warn(`[audit-v2] 缺少目录，跳过：${dir}`);
    continue;
  }
  const files = shardFiles(dir);
  const stat = {
    province,
    files: files.length,
    records: 0,
    uniqueIds: new Set(),
    moduleRecords: {},
  };
  provinceStats.set(province, stat);

  for (const file of files) {
    const list = arrayOfQuestions(readJson(path.join(dir, file)));
    for (const q of list) {
      const id = String(q.id || '');
      const module = String(q.module || '');
      const explanation = typeof q.explanation === 'string' ? q.explanation : '';
      const full = normalizeText(explanation);
      const opening = full.slice(0, WINDOW);
      const paper = paperName(q);
      const row = {
        province,
        file,
        id,
        module,
        paper,
        source: q.source || '',
        stem: q.stem || '',
        explanation,
        full,
        opening,
      };
      records.push(row);
      stat.records++;
      stat.uniqueIds.add(id);
      stat.moduleRecords[module] = (stat.moduleRecords[module] || 0) + 1;
    }
  }

}

// ---- 逐条判定 ----
const hits = [];
for (const r of records) {
  let found = null;
  if (r.module === 'changshi') {
    const m = findTokens(r.opening, YANYU_CORE, YANYU_EXT);
    if (!m.tokens.length) continue;
    const stem = normalizeText(r.stem);
    const stemYanyu = STEM_YANYU_RE.test(stem);
    const strongTokens = m.tokens.filter(t => YANYU_STRONG.includes(t));
    let triage;
    if (strongTokens.length && stemYanyu) {
      triage = 'A2 题干/解析均言语，模块标错';
    } else if (strongTokens.length) {
      triage = 'A1 题干非典型言语+言语解析（待核对）';
    } else if (!stemYanyu) {
      triage = 'A3 仅正文提及言语词（非错配）';
    } else {
      triage = 'A4 言语题干+弱解析（待核）';
    }
    found = { type: 'changshi->yanyu', ...m, triage, stemYanyu, strongTokens, matchScope: 'opening' };
  } else if (r.module === 'yanyu') {
    // 用户口径是“解析含资料特征词”，因此这里按全文匹配；
    // 是否真错配再结合开头方法论强信号分层。
    const m = findTokens(r.full, ZILIAO_CORE, ZILIAO_EXT);
    if (!m.tokens.length) continue;
    const openingM = findTokens(r.opening, ZILIAO_CORE, ZILIAO_EXT);
    const dataStrong = DATA_STRONG.filter(t => r.opening.includes(t));
    const stem = normalizeText(r.stem);
    let triage;
    if (dataStrong.length && STEM_SHULIANG_RE.test(stem)) {
      triage = 'B3 数量题误标为言语';
    } else if (dataStrong.length) {
      triage = 'B1 资料解析误标为言语';
    } else if (m.coreTokens.length) {
      triage = 'B2 言语解析正文提及资料词（非错配）';
    } else {
      triage = 'B4 扩展词正文提及（非错配）';
    }
    found = {
      type: 'yanyu->ziliao', ...m, triage, dataStrong,
      openingTokens: openingM.tokens, openingCoreTokens: openingM.coreTokens,
      matchScope: 'full',
    };
  }
  if (!found) continue;
  const hit = { ...r, ...found, level: found.coreTokens.length ? 'core' : 'extended' };
  hits.push(hit);
}

// ---- 按类型 / 卷聚合 ----
const byType = new Map();
const byPaper = new Map();
for (const h of hits) {
  if (!byType.has(h.type)) {
    byType.set(h.type, { type: h.type, records: 0, ids: new Set(), papers: new Set(), coreRecords: 0 });
  }
  const t = byType.get(h.type);
  t.records++;
  t.ids.add(`${h.module}|${h.id}`);
  t.papers.add(`${h.province}|${h.paper}`);
  if (h.level === 'core') t.coreRecords++;

  const pkey = `${h.province}|${h.type}|${h.paper}`;
  if (!byPaper.has(pkey)) {
    byPaper.set(pkey, {
      province: h.province,
      type: h.type,
      paper: h.paper,
      records: 0,
      ids: new Set(),
      coreRecords: 0,
      tokens: new Map(),
      triages: new Map(),
      samples: [],
    });
  }
  const p = byPaper.get(pkey);
  p.records++;
  p.ids.add(h.id);
  if (h.level === 'core') p.coreRecords++;
  for (const token of h.tokens) p.tokens.set(token, (p.tokens.get(token) || 0) + 1);
  p.triages.set(h.triage, (p.triages.get(h.triage) || 0) + 1);
  if (p.samples.length < 3) p.samples.push(h.id);
}

// ---- ID 重复 / 跨模块重复旁证 ----
const idInfo = new Map();
for (const r of records) {
  const key = `${r.province}|${r.id}`;
  if (!idInfo.has(key)) idInfo.set(key, { province: r.province, id: r.id, records: 0, modules: new Set(), papers: new Set() });
  const x = idInfo.get(key);
  x.records++;
  x.modules.add(r.module);
  x.papers.add(r.paper);
}
const dupStats = new Map();
const crossPairs = new Map();
for (const x of idInfo.values()) {
  if (x.records <= 1) continue;
  if (!dupStats.has(x.province)) {
    dupStats.set(x.province, {
      province: x.province,
      dupIds: 0,
      dupRecords: 0,
      sameModule: 0,
      crossModule: 0,
    });
  }
  const s = dupStats.get(x.province);
  s.dupIds++;
  s.dupRecords += x.records;
  if (x.modules.size > 1) {
    s.crossModule++;
    const pair = [...x.modules].sort().join('+');
    const pkey = `${x.province}|${pair}|${[...x.papers].join(' / ')}`;
    if (!crossPairs.has(pkey)) {
      crossPairs.set(pkey, { province: x.province, pair, paper: [...x.papers].join(' / '), ids: 0, sample: x.id });
    }
    crossPairs.get(pkey).ids++;
  } else {
    s.sameModule++;
  }
}

// ---- Markdown / CSV 输出 ----
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const mdCell = value => String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const total = {
  files: 0,
  records: 0,
  uniqueIds: new Set(),
  changshi: 0,
  yanyu: 0,
};
for (const stat of provinceStats.values()) {
  total.files += stat.files;
  total.records += stat.records;
  for (const id of stat.uniqueIds) total.uniqueIds.add(`${stat.province}|${id}`);
  total.changshi += stat.moduleRecords.changshi || 0;
  total.yanyu += stat.moduleRecords.yanyu || 0;
}

const lines = [];
lines.push('# 三省 v2「模块 / 解析特征」错配扫描报告');
lines.push('');
lines.push('- 模式：**只读扫描（未修改任何题目数据）**');
lines.push(`- 生成时间：${new Date().toISOString()}`);
lines.push('- 数据源：`public/data/questions-v2-provincial/{安徽,福建,浙江}/` 的题目分片（排除 `questions.json` / `index.json` / `idMap.json`）');
lines.push(`- 解析开头窗口：解析去掉空白后的前 **${WINDOW}** 字`);
lines.push(`- 言语核心词：${YANYU_CORE.join(' / ')}`);
lines.push(`- 资料核心词：${ZILIAO_CORE.join(' / ')}`);
lines.push('- 计数口径：**记录级** = 按分片记录逐条计；**模块内唯一 ID** = 同一 `module + id` 只计一次。扩展命中含核心；主表括号内为占该模块记录的比例。');
lines.push('');
lines.push('## 1. 总览');
lines.push('');
lines.push('| 省份 | 分片 | 总记录 | 唯一 ID | 常识记录 | 常识→言语（核心 / 扩展） | 言语记录 | 言语→资料（核心 / 扩展） |');
lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const province of PROVINCES) {
  const s = provinceStats.get(province);
  if (!s) continue;
  const cs = s.moduleRecords.changshi || 0;
  const yy = s.moduleRecords.yanyu || 0;
  const csHits = hits.filter(h => h.province === province && h.type === 'changshi->yanyu');
  const yyHits = hits.filter(h => h.province === province && h.type === 'yanyu->ziliao');
  const csCore = csHits.filter(h => h.level === 'core').length;
  const yyCore = yyHits.filter(h => h.level === 'core').length;
  lines.push(
    `| ${province} | ${s.files} | ${s.records} | ${s.uniqueIds.size} | ${cs} | ` +
    `${csCore} / ${csHits.length}（${pct(csCore, cs)} / ${pct(csHits.length, cs)}） | ${yy} | ` +
    `${yyCore} / ${yyHits.length}（${pct(yyCore, yy)} / ${pct(yyHits.length, yy)}） |`
  );
}
lines.push(
  `| **合计** | **${total.files}** | **${total.records}** | **${total.uniqueIds.size}** | **${total.changshi}** | ` +
  `**${hits.filter(h => h.type === 'changshi->yanyu' && h.level === 'core').length} / ` +
  `${hits.filter(h => h.type === 'changshi->yanyu').length}** | **${total.yanyu}** | ` +
  `**${hits.filter(h => h.type === 'yanyu->ziliao' && h.level === 'core').length} / ` +
  `${hits.filter(h => h.type === 'yanyu->ziliao').length}** |`
);
lines.push('');
lines.push('> 说明：上表“核心 / 扩展”是记录级；同一 ID 若在多个分片重复，会在记录级重复出现。去重后的模块内唯一 ID 见第 2 节。');
lines.push('');
lines.push('## 2. 按错配类型');
lines.push('');
lines.push('| 类型 | 记录级（核心 / 扩展） | 模块内唯一 ID（核心 / 扩展） | 涉及卷 |');
lines.push('|---|---:|---:|---:|');
for (const type of ['changshi->yanyu', 'yanyu->ziliao']) {
  const t = byType.get(type) || { records: 0, ids: new Set(), papers: new Set(), coreRecords: 0 };
  const typeHits = hits.filter(h => h.type === type);
  const coreIds = new Set(typeHits.filter(h => h.level === 'core').map(h => `${h.module}|${h.id}`));
  const label = type === 'changshi->yanyu' ? '常识 → 言语特征' : '言语 → 资料特征';
  lines.push(
    `| ${label} | ${t.coreRecords} / ${t.records} | ${coreIds.size} / ${t.ids.size} | ${t.papers.size} |`
  );
}
lines.push('');
lines.push('### 2.1 按省份拆分');
lines.push('');
lines.push('| 省份 | 类型 | 记录级（核心 / 扩展） | 模块内唯一 ID（核心 / 扩展） | 涉及卷 |');
lines.push('|---|---|---:|---:|---:|');
for (const province of PROVINCES) {
  for (const type of ['changshi->yanyu', 'yanyu->ziliao']) {
    const typeHits = hits.filter(h => h.province === province && h.type === type);
    if (!typeHits.length) continue;
    const core = typeHits.filter(h => h.level === 'core').length;
    const coreIds = new Set(typeHits.filter(h => h.level === 'core').map(h => `${h.module}|${h.id}`));
    const ids = new Set(typeHits.map(h => `${h.module}|${h.id}`));
    const papers = new Set(typeHits.map(h => h.paper));
    const label = type === 'changshi->yanyu' ? '常识 → 言语特征' : '言语 → 资料特征';
    lines.push(`| ${province} | ${label} | ${core} / ${typeHits.length} | ${coreIds.size} / ${ids.size} | ${papers.size} |`);
  }
}
lines.push('');

lines.push('### 2.2 分层判定（人工复核口径）');
lines.push('');
lines.push('关键词命中不等于真错配。结合“题干是否像言语题”“解析开头是否像资料分析”做二次判定：');
lines.push('');
lines.push('| 类型 | 判定 | 记录 | 模块内唯一 ID | 含义 |');
lines.push('|---|---|---:|---:|---|');
const TRIAGE_NOTE = {
  'A1 题干非典型言语+言语解析（待核对）': '题干不是典型言语，解析是言语；Q11 已确认解析挂错，本批记录均与同 ID 的 yanyu 记录并存',
  'A2 题干/解析均言语，模块标错': '题干和解析都像言语题，可确认模块/分片归错',
  'A3 仅正文提及言语词（非错配）': '常识正文顺带出现“成语/主旨/文段”，不构成错配',
  'A4 言语题干+弱解析（待核）': '题干像言语但解析信号弱，需人工看',
  'B1 资料解析误标为言语': '解析开头是资料分析口径，真候选',
  'B2 言语解析正文提及资料词（非错配）': '解析本身是言语题，只是正文提到经济数据',
  'B3 数量题误标为言语': '题干/解析是数量关系，属邻类模块错标',
  'B4 扩展词正文提及（非错配）': '仅命中“材料中/倍数”等宽泛词，非错配',
};
const triageOrder = Object.keys(TRIAGE_NOTE);
for (const type of ['changshi->yanyu', 'yanyu->ziliao']) {
  for (const triage of triageOrder) {
    const rows = hits.filter(h => h.type === type && h.triage === triage);
    if (!rows.length) continue;
    const ids = new Set(rows.map(h => `${h.module}|${h.id}`));
    const label = type === 'changshi->yanyu' ? '常识 → 言语特征' : '言语 → 资料特征';
    lines.push(`| ${label} | ${triage} | ${rows.length} | ${ids.size} | ${TRIAGE_NOTE[triage]} |`);
  }
}
lines.push('');
lines.push('> 真候选 = `A1 + A2 + B1 + B3`；`A3 / B2 / B4` 是关键词误报，不能计入修复量。');
lines.push('');

lines.push('## 3. 按卷分布');
lines.push('');
lines.push('> 常识按“解析开头”匹配；言语按“解析全文”匹配（用户口径）。下表按“扩展命中”列卷；`核心` 列是其中命中用户点名核心词的记录数。同一卷内同一 ID 只计一次唯一 ID。');
lines.push('');

function paperRows(type) {
  return [...byPaper.values()]
    .filter(p => p.type === type)
    .sort((a, b) =>
      b.records - a.records ||
      a.province.localeCompare(b.province, 'zh-CN') ||
      a.paper.localeCompare(b.paper, 'zh-CN')
    );
}

function tokenSummary(p) {
  return [...p.tokens.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 6)
    .map(([token, n]) => `${token}×${n}`)
    .join('、');
}

function triageSummary(p) {
  return [...p.triages.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 4)
    .map(([triage, n]) => `${triage.split(' ')[0]}×${n}`)
    .join('、');
}

for (const type of ['changshi->yanyu', 'yanyu->ziliao']) {
  const label = type === 'changshi->yanyu' ? '常识 → 言语特征' : '言语 → 资料特征';
  const rows = paperRows(type);
  lines.push(`### 3.${type === 'changshi->yanyu' ? '1' : '2'} ${label}`);
  lines.push('');
  if (!rows.length) {
    lines.push('无命中。');
    lines.push('');
    continue;
  }
  lines.push('| 省份 | 卷 | 命中记录 | 唯一 ID | 其中核心 | 判定（记录数） | 命中词（次数） | 样例 ID |');
  lines.push('|---|---|---:|---:|---:|---|---|---|');
  for (const p of rows) {
    lines.push(
      `| ${p.province} | ${mdCell(p.paper)} | ${p.records} | ${p.ids.size} | ${p.coreRecords} | ` +
      `${mdCell(triageSummary(p))} | ${mdCell(tokenSummary(p))} | ${mdCell(p.samples.join('、'))} |`
    );
  }
  lines.push('');
}

lines.push('## 4. 典型样本 / 福建 2011 联考 Q11 复核');
lines.push('');
const q11Changshi = hits.find(h => h.id === 'prov-fujian-2011-联考-11' && h.module === 'changshi');
const q11Yanyu = records.find(r => r.id === 'prov-fujian-2011-联考-11' && r.module === 'yanyu');
const q11FixedChangshi = records.find(r => r.id === 'prov-fujian-2011-917联考-11' && r.module === 'changshi');
const q11FixedYanyu = records.find(r => r.id === 'prov-fujian-2011-424联考-11' && r.module === 'yanyu');
if (q11Changshi) {
  lines.push('`prov-fujian-2011-联考-11` 同时存在 changshi 与 yanyu 两条记录：');
  lines.push('');
  lines.push('| 记录 | 模块 | 题干（截断） | 解析开头（截断） | 命中 |');
  lines.push('|---|---|---|---|---|');
  lines.push(
    `| changshi | ${q11Changshi.module} | ${mdCell(String(q11Changshi.stem).slice(0, 70))} | ` +
    `${mdCell(q11Changshi.opening.slice(0, 90))} | ${mdCell(q11Changshi.tokens.join('、'))} |`
  );
  if (q11Yanyu) {
    lines.push(
      `| yanyu | ${q11Yanyu.module} | ${mdCell(String(q11Yanyu.stem).slice(0, 70))} | ` +
      `${mdCell(q11Yanyu.opening.slice(0, 90))} | —（解析与题干自洽） |`
    );
  }
  lines.push('');
  lines.push('**判断**：这条不是单纯的 `module` 标错。changshi 记录的题干是“下列选项正确的是：”，选项为黎族/朝鲜族/傣族/高山族习俗，解析却是 yanyu Q11 的“实词和成语辨析的混搭填空”；yanyu 记录的题干（中国古代官员读书）、选项、解析自洽。更像是**同一 ID 下混入了两条不同题，且 changshi 记录的解析挂错**。修法应先做解析归属核对，不宜直接把 changshi 全量改判成 yanyu。');
  lines.push('');
} else if (q11FixedChangshi && q11FixedYanyu) {
  lines.push('旧 ID `prov-fujian-2011-联考-11` 已在 2026-10-19 的福建 v2 修复中按 424/917 两套卷拆分：');
  lines.push('');
  lines.push('| 新记录 | 模块 | 题干（截断） | 解析开头（截断） |');
  lines.push('|---|---|---|---|');
  lines.push(
    `| ${q11FixedChangshi.id} | ${q11FixedChangshi.module} | ${mdCell(String(q11FixedChangshi.stem).slice(0, 70))} | ` +
    `${mdCell(normalizeText(q11FixedChangshi.explanation).slice(0, 90))} |`
  );
  lines.push(
    `| ${q11FixedYanyu.id} | ${q11FixedYanyu.module} | ${mdCell(String(q11FixedYanyu.stem).slice(0, 70))} | ` +
    `${mdCell(normalizeText(q11FixedYanyu.explanation).slice(0, 90))} |`
  );
  lines.push('');
  lines.push('**判断**：修复后两条记录 ID 不同、模块正确；917 常识 Q11 使用 917 自己的常识解析，424 言语 Q11 使用 424 自己的言语解析，不再互相串挂。');
  lines.push('');
} else {
  lines.push('本次扫描未命中 `prov-fujian-2011-联考-11`（可能窗口/关键词口径变化），请结合 CSV 复核。');
  lines.push('');
}

function sampleRows(type, n) {
  const rows = hits
    .filter(h => h.type === type)
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'core' ? -1 : 1;
      return a.id.localeCompare(b.id, 'zh-CN');
    });
  const q11 = rows.find(h => h.id === 'prov-fujian-2011-联考-11');
  const out = q11 ? [q11] : [];
  for (const h of rows) {
    if (out.length >= n) break;
    if (h === q11) continue;
    out.push(h);
  }
  return out;
}

for (const type of ['changshi->yanyu', 'yanyu->ziliao']) {
  const label = type === 'changshi->yanyu' ? '常识 → 言语特征' : '言语 → 资料特征';
  const rows = sampleRows(type, 8);
  lines.push(`### 4.${type === 'changshi->yanyu' ? '1' : '2'} ${label}样本`);
  lines.push('');
  if (!rows.length) {
    lines.push('无命中。');
    lines.push('');
    continue;
  }
  lines.push('| ID | 省份 | 模块 | 卷 | 级别 | 判定 | 命中词 | 解析开头（截断） |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const h of rows) {
    lines.push(
      `| ${mdCell(h.id)} | ${h.province} | ${h.module} | ${mdCell(h.paper)} | ${h.level === 'core' ? '核心' : '扩展'} | ` +
      `${mdCell(h.triage)} | ${mdCell(h.tokens.join('、'))} | ${mdCell(h.opening.slice(0, 100))} |`
    );
  }
  lines.push('');
}

lines.push('## 5. ID 重复旁证（影响计数口径）');
lines.push('');
lines.push('| 省份 | 总记录 | 唯一 ID | 重复 ID 数 | 重复 ID 覆盖记录 | 多出的重复记录 | 同模块重复 ID | 跨模块重复 ID |');
lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const province of PROVINCES) {
  const s = provinceStats.get(province);
  if (!s) continue;
  const d = dupStats.get(province) || { dupIds: 0, dupRecords: 0, sameModule: 0, crossModule: 0 };
  lines.push(
    `| ${province} | ${s.records} | ${s.uniqueIds.size} | ${d.dupIds} | ${d.dupRecords} | ` +
    `${s.records - s.uniqueIds.size} | ${d.sameModule} | ${d.crossModule} |`
  );
}
lines.push('');
if (crossPairs.size) {
  lines.push('跨模块同 ID 分组：');
  lines.push('');
  lines.push('| 省份 | 模块对 | 卷 | 重复 ID 数 | 样例 |');
  lines.push('|---|---|---|---:|---|');
  const pairRows = [...crossPairs.values()].sort((a, b) =>
    b.ids - a.ids || a.province.localeCompare(b.province, 'zh-CN') || a.paper.localeCompare(b.paper, 'zh-CN')
  );
  for (const p of pairRows) {
    lines.push(`| ${p.province} | ${p.pair} | ${mdCell(p.paper)} | ${p.ids} | ${mdCell(p.sample)} |`);
  }
  lines.push('');
}
lines.push('> 记录级命中会把重复 ID 重复计数；第 2 节的“模块内唯一 ID”更适合作为修复工作量基线。福建 240 条重复中，85 个 ID 跨模块（如 2011 联考 81–92），需与解析错配合并排查，不能重复算作两类问题。');
lines.push('');
lines.push('### 5.1 邻类旁证（未计入上表）');
lines.push('');
lines.push('人工抽查还发现 `yanyu` 中有不属于“资料特征词”口径的模块错标，建议另开邻类扫描：');
lines.push('');
lines.push('- `prov-anhui-2025-未标注-40`、`prov-anhui-2025-未标注-45`：题干为概率/圆锥几何，解析以“根据公式”开头，更像数量关系题误标为言语。');
lines.push('- `prov-zhejiang-2020-选调-22`：题干为“以下哪项如果为真”的削弱题，解析为“找论点/论据”，更像判断推理题误标为言语。');
lines.push('');

lines.push('## 6. 结论与建议');
lines.push('');
const csAll = hits.filter(h => h.type === 'changshi->yanyu');
const yyAll = hits.filter(h => h.type === 'yanyu->ziliao');
const csCoreAll = csAll.filter(h => h.level === 'core');
const yyCoreAll = yyAll.filter(h => h.level === 'core');
const triageCount = triage => hits.filter(h => h.triage === triage).length;
lines.push(`1. **范围**：三省共扫描 ${total.files} 个分片、${total.records} 条记录（${total.uniqueIds.size} 个唯一 ID）。`);
lines.push(`2. **关键词命中（用户口径）**：常识→言语核心 **${csCoreAll.length}** 条 / 扩展 **${csAll.length}** 条；言语→资料核心 **${yyCoreAll.length}** 条 / 扩展 **${yyAll.length}** 条（言语为全文匹配）。`);
lines.push(
  `3. **分层后真候选**：常识侧 **${triageCount('A1 题干非典型言语+言语解析（待核对）') + triageCount('A2 题干/解析均言语，模块标错')}** 条。` +
  `A2 **${triageCount('A2 题干/解析均言语，模块标错')}** 条集中在 2010 春季，可确认“整段言语题归错模块”；` +
  `A1 **${triageCount('A1 题干非典型言语+言语解析（待核对）')}** 条集中在 2011 联考，均与同 ID 的 yanyu 记录并存，Q11 已复核确认解析挂错。言语→资料真候选 **${triageCount('B1 资料解析误标为言语')}** 条。`
);
lines.push(
  `4. **误报**：常识侧 A3 纯正文提及 **${triageCount('A3 仅正文提及言语词（非错配）')}** 条；言语侧 B2 正文提及资料词 **${triageCount('B2 言语解析正文提及资料词（非错配）')}** 条、B4 宽泛扩展词 **${triageCount('B4 扩展词正文提及（非错配）')}** 条，均不应计入修复量。`
);
lines.push('5. **性质判断**：Q11 证明“常识题干 + 言语解析”确实存在，但它是**解析挂错/串题**，不是题目本身属于言语；2010 春季则相反，是整段言语题被归到 changshi。两类问题修法不同，不能按关键字批量改 `module`。');
lines.push('6. **建议修法顺序**：先按“同一 ID / 同一卷题号”核对题干、选项、解析是否属于同一题，把问题分成「解析挂错」「模块标错」「题干本身错位」三类；确认三类数量后再分别出修复方案。');
lines.push('7. **当前状态**：本报告只读扫描，未修改 `public/data/questions-v2-provincial/` 或线上 `public/data/questions/` 任何数据。');
lines.push('');

fs.writeFileSync(REPORT, `\ufeff${lines.join('\n')}`, 'utf8');

const csvHeader = [
  'province', 'file', 'id', 'module', 'paper', 'mismatch_type', 'level', 'triage',
  'match_scope', 'core_tokens', 'opening_core_tokens', 'tokens', 'data_strong',
  'first_pos', 'opening', 'stem', 'source',
];
const csvRows = hits
  .sort((a, b) =>
    a.province.localeCompare(b.province, 'zh-CN') ||
    a.type.localeCompare(b.type) ||
    a.paper.localeCompare(b.paper, 'zh-CN') ||
    a.id.localeCompare(b.id, 'zh-CN')
  )
  .map(h => [
    h.province, h.file, h.id, h.module, h.paper, h.type, h.level, h.triage,
    h.matchScope, h.coreTokens.join('、'),
    (h.openingCoreTokens || []).join('、'), h.tokens.join('、'),
    (h.dataStrong || []).join('、'), h.firstPos, h.opening, h.stem, h.source,
  ].map(csvCell).join(','));
fs.writeFileSync(CSV_OUT, `\ufeff${[csvHeader.join(','), ...csvRows].join('\r\n')}\r\n`, 'utf8');

console.log('===== v2 模块 / 解析特征错配扫描 =====');
for (const province of PROVINCES) {
  const s = provinceStats.get(province);
  if (!s) continue;
  const csHits = hits.filter(h => h.province === province && h.type === 'changshi->yanyu');
  const yyHits = hits.filter(h => h.province === province && h.type === 'yanyu->ziliao');
  console.log(
    `${province}: 记录 ${s.records} / 唯一 ${s.uniqueIds.size} | ` +
    `常识→言语 ${csHits.filter(h => h.level === 'core').length}/${csHits.length}（核心/扩展） | ` +
    `言语→资料 ${yyHits.filter(h => h.level === 'core').length}/${yyHits.length}（核心/扩展）`
  );
}
console.log(`报告：${REPORT}`);
console.log(`明细：${CSV_OUT}`);
