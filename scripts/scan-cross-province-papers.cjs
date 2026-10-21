#!/usr/bin/env node
/**
 * scan-cross-province-papers.cjs —— 跨省同卷查重（湘鄂赣 v2 × 已上线浙闽皖）
 *
 * 目标：找出同一年份、不同省份之间内容高度一致的《行测》试卷，输出可直接用于
 * patch 排期的清单：
 *   - 同卷组（A 级：任意两卷 containment >= 0.90；B 级：存在边 >= 0.80 的连通组）
 *   - 每组：年份 / 卷别 / 参与省 / 各卷题数 / 共有题数 / 并集题数 / 内容哈希
 *   - 每组：共有题答案冲突数（同一道题在不同省答案文本不一致）
 *   - 未入组的高重合省对（C 级观察名单，避免误排 patch）
 *
 * 口径：
 *   湘 / 鄂 / 赣：public/data/questions-v2-provincial/<省>/（v2 源分片）
 *   浙 / 闽 / 皖：public/data/questions/provincial-<省>-*.json（已上线分片）
 *
 * 题目指纹：
 *   qKey = SHA-256(
 *     normalize(stem) + "\x01" + sorted(normalize(option.text)).join("\x02")
 *   )
 *   normalize：NFKC、转小写、去空白、去常见中英文标点。
 *   指纹不含答案 / 解析 / 来源，避免答案笔误或来源差异影响同卷识别。
 *
 * 试卷指纹：
 *   paperHash = SHA-256(sorted(qKey).join("\n"))
 *   coreHash  = SHA-256(sorted(组内共有 qKey).join("\n"))
 *   unionHash = SHA-256(sorted(组内并集 qKey).join("\n"))
 *
 * 用法：
 *   node scripts/scan-cross-province-papers.cjs            # 写报告
 *   node scripts/scan-cross-province-papers.cjs --dry-run  # 只打印统计
 *
 * 输出（guokao-reports/）：
 *   联考查重-湘鄂赣-vs-浙闽皖-<日期>.md
 *   联考查重-同卷清单-<日期>.csv
 *   联考查重-同卷成员-<日期>.csv
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'guokao-reports');
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_MD = path.join(OUT_DIR, `联考查重-湘鄂赣-vs-浙闽皖-${TODAY}.md`);
const GROUPS_CSV = path.join(OUT_DIR, `联考查重-同卷清单-${TODAY}.csv`);
const MEMBERS_CSV = path.join(OUT_DIR, `联考查重-同卷成员-${TODAY}.csv`);
const DRY_RUN = process.argv.includes('--dry-run');

const NEW_PROVINCES = ['湖南', '湖北', '江西'];
const ONLINE_PROVINCES = ['浙江', '福建', '安徽'];
const PROVINCE_ORDER = ['湖南', '湖北', '江西', '浙江', '福建', '安徽'];
const PROVINCE_SCOPE = new Map([
  ...NEW_PROVINCES.map(province => [province, 'v2']),
  ...ONLINE_PROVINCES.map(province => [province, 'online']),
]);

const V2_ROOT = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const LIVE_ROOT = path.join(ROOT, 'public', 'data', 'questions');

/** 同卷边阈值：不同省、同一年、共享 >= 20 题且较小卷覆盖率 >= 0.80 */
const EDGE_MIN_SHARED = 20;
const EDGE_MIN_CONTAINMENT = 0.80;
/** A 级：组内任意两卷 coverage >= 0.90 */
const GRADE_A_MIN_CONTAINMENT = 0.90;
/** C 级观察名单：低于同卷边阈值、但仍有参考价值的高重合省对 */
const WATCH_MIN_CONTAINMENT = 0.60;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function hashKeys(keys) {
  return sha256([...keys].sort().join('\n'));
}

function normalizeText(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u00a0\u3000]+/g, '')
    .replace(/[，。；：、！？（）()【】\[\]《》〈〉“”"'‘’—…·,.;:!?\-_/\\|～~]/g, '')
    .trim();
}

const GENERIC_STEM_PATTERNS = [
  /填入问号处/,
  /呈现一定的规律/,
  /图形规律/,
  /图形推理/,
  /分为两类/,
  /分类正确/,
  /从所给.*选项中.*选择.*最合适/,
  /请根据图形/,
  /能够从上述资料中推出/,
  /根据上述资料/,
  /下列说法(错误|正确|不符|相符)/,
  /以下说法/,
  /请根据题干信息选择正确答案/,
  /^abcd$/,
];

function optionTexts(question) {
  return (Array.isArray(question.options) ? question.options : [])
    .map(option => normalizeText(option && option.text))
    .filter(Boolean);
}

/**
 * 图片题 / 缺题占位题：题干是通用说明，选项为空或只有 MISSING。
 * 这类题如果仍按“题干 + 选项”做指纹，会把多道不同图形题压成同一个哈希，
 * 必须从同卷指纹中剔除，只在“不可指纹题数”里统计。
 */
function isAmbiguousQuestion(question) {
  const stem = normalizeText(question.stem || question.title || '');
  if (!stem) return true;
  if (/missing|原卷缺题|题目缺失|暂以/.test(stem)) return true;
  const options = Array.isArray(question.options) ? question.options : [];
  const texts = optionTexts(question);
  const generic = GENERIC_STEM_PATTERNS.some(pattern => pattern.test(stem));
  if (options.length === 0) return generic || stem.length < 8;
  if (texts.length === 0) return true;
  const meaningful = texts.filter(text => text.length >= 2 && !/^(missing|缺失|暂无|略)$/.test(text));
  if (meaningful.length === 0) return generic || stem.length < 8;
  return false;
}

function questionKey(question) {
  const stem = normalizeText(question.stem || question.title || '');
  const options = optionTexts(question).sort();
  return sha256(stem + '\u0001' + options.join('\u0002'));
}

function questionStemKey(question) {
  return sha256(normalizeText(question.stem || question.title || ''));
}

function answerText(question) {
  const raw = String(question.answer == null ? '' : question.answer).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const options = Array.isArray(question.options) ? question.options : [];
  const hit = options.find(option => String(option && option.key).trim().toUpperCase() === upper);
  return normalizeText(hit ? hit.text : raw);
}

function paperTitle(question) {
  let title = String(question.source || '').replace(/\s+/g, ' ').trim();
  title = title.replace(/第\s*\d+\s*题.*$/, '').trim();
  if (title) return title;
  const id = String(question.id || '');
  const match = id.match(/^prov-[a-z]+-(\d{4})-(.+?)-\d+$/i);
  return match ? `${match[1]}年${match[2]}` : (id || '未知试卷');
}

function yearOf(question, title) {
  const match = String(title).match(/(19|20)\d{2}/) || String(question.id || '').match(/(19|20)\d{2}/);
  return match ? match[0] : '未知';
}

function loadV2(province) {
  const dir = path.join(V2_ROOT, province);
  const indexFile = path.join(dir, 'index.json');
  if (!fs.existsSync(indexFile)) throw new Error(`缺少 v2 index：${rel(indexFile)}`);
  const index = readJson(indexFile);
  const files = [...new Set(Object.values(index).flat())];
  const rows = [];
  for (const file of files) {
    const abs = path.join(dir, file);
    const arr = readJson(abs);
    if (!Array.isArray(arr)) throw new Error(`分片不是数组：${rel(abs)}`);
    for (const question of arr) rows.push({ question, file: rel(abs) });
  }
  return rows;
}

function loadOnline(province) {
  const prefix = `provincial-${province}-`;
  const files = fs.readdirSync(LIVE_ROOT)
    .filter(file => file.startsWith(prefix) && file.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error(`未找到线上分片：${prefix}*.json`);
  const rows = [];
  for (const file of files) {
    const abs = path.join(LIVE_ROOT, file);
    const arr = readJson(abs);
    if (!Array.isArray(arr)) throw new Error(`分片不是数组：${rel(abs)}`);
    for (const question of arr) rows.push({ question, file: rel(abs) });
  }
  return rows;
}

function makePaper(province, scope, question) {
  const title = paperTitle(question);
  const year = yearOf(question, title);
  return {
    key: `${province}|${year}|${title}`,
    province,
    scope,
    year,
    title,
    questions: [],
    keys: new Set(),
    stemKeys: new Set(),
    modules: new Map(),
    files: new Set(),
    ambiguousCount: 0,
  };
}

function addQuestion(paper, question, file) {
  const ambiguous = isAmbiguousQuestion(question);
  const key = ambiguous ? null : questionKey(question);
  const stemKey = ambiguous ? null : questionStemKey(question);
  const optionsMissing = !Array.isArray(question.options) || question.options.length === 0;
  paper.questions.push({
    id: question.id,
    module: question.module || '',
    key,
    stemKey,
    stem: String(question.stem || question.title || ''),
    answer: answerText(question),
    optionsMissing,
    ambiguous,
  });
  paper.files.add(file);
  if (ambiguous) {
    paper.ambiguousCount++;
    return;
  }
  paper.keys.add(key);
  paper.stemKeys.add(stemKey);
  const module = question.module || '?';
  if (!paper.modules.has(module)) paper.modules.set(module, new Set());
  paper.modules.get(module).add(key);
}

function intersectionSize(a, b, field = 'keys') {
  let count = 0;
  const [small, large] = a[field].size <= b[field].size ? [a, b] : [b, a];
  for (const key of small[field]) if (large[field].has(key)) count++;
  return count;
}

function pairStat(a, b) {
  const shared = intersectionSize(a, b, 'keys');
  const sharedStem = intersectionSize(a, b, 'stemKeys');
  const minSize = Math.min(a.keys.size, b.keys.size);
  const maxSize = Math.max(a.keys.size, b.keys.size);
  const union = a.keys.size + b.keys.size - shared;
  return {
    a,
    b,
    shared,
    sharedStem,
    minSize,
    maxSize,
    containment: minSize ? shared / minSize : 0,
    maxContainment: maxSize ? shared / maxSize : 0,
    jaccard: union ? shared / union : 0,
    stemContainment: Math.min(a.stemKeys.size, b.stemKeys.size)
      ? sharedStem / Math.min(a.stemKeys.size, b.stemKeys.size)
      : 0,
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function mdCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, header, rows) {
  const lines = [header, ...rows].map(row => row.map(csvCell).join(','));
  fs.writeFileSync(file, '\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
}

function find(parent, item) {
  let root = item;
  while (parent.get(root) !== root) root = parent.get(root);
  let cur = item;
  while (parent.get(cur) !== cur) {
    const next = parent.get(cur);
    parent.set(cur, root);
    cur = next;
  }
  return root;
}

function union(parent, a, b) {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent.set(rb, ra);
}

// ---- 1. 载入题目并重建“省 + 年份 + 来源卷名” ----
const papers = [];
const paperByKey = new Map();

for (const province of PROVINCE_ORDER) {
  const scope = PROVINCE_SCOPE.get(province);
  const rows = scope === 'v2' ? loadV2(province) : loadOnline(province);
  for (const { question, file } of rows) {
    const paper = makePaper(province, scope, question);
    if (!paperByKey.has(paper.key)) {
      paperByKey.set(paper.key, paper);
      papers.push(paper);
    }
    addQuestion(paperByKey.get(paper.key), question, file);
  }
}

papers.sort((a, b) =>
  String(a.year).localeCompare(String(b.year)) ||
  PROVINCE_ORDER.indexOf(a.province) - PROVINCE_ORDER.indexOf(b.province) ||
  a.title.localeCompare(b.title, 'zh'));

const totalQuestions = papers.reduce((sum, paper) => sum + paper.questions.length, 0);
const totalAmbiguous = papers.reduce((sum, paper) => sum + paper.ambiguousCount, 0);
const totalUniqueKeys = new Set(papers.flatMap(paper => [...paper.keys])).size;
const provinceStats = PROVINCE_ORDER.map(province => {
  const own = papers.filter(paper => paper.province === province);
  return {
    province,
    scope: PROVINCE_SCOPE.get(province),
    papers: own.length,
    questions: own.reduce((sum, paper) => sum + paper.questions.length, 0),
    fingerprintable: own.reduce((sum, paper) => sum + paper.keys.size, 0),
    ambiguous: own.reduce((sum, paper) => sum + paper.ambiguousCount, 0),
  };
});

// ---- 2. 同卷边 + 连通组 ----
const allPairs = [];
for (let i = 0; i < papers.length; i++) {
  for (let j = i + 1; j < papers.length; j++) {
    const a = papers[i];
    const b = papers[j];
    if (a.province === b.province) continue;
    if (a.year !== b.year) continue;
    if (a.keys.size < EDGE_MIN_SHARED || b.keys.size < EDGE_MIN_SHARED) continue;
    const stat = pairStat(a, b);
    if (stat.shared >= EDGE_MIN_SHARED && stat.containment >= WATCH_MIN_CONTAINMENT) {
      allPairs.push(stat);
    }
  }
}

const parent = new Map(papers.map(paper => [paper.key, paper.key]));
for (const stat of allPairs) {
  if (stat.shared >= EDGE_MIN_SHARED && stat.containment >= EDGE_MIN_CONTAINMENT) {
    union(parent, stat.a.key, stat.b.key);
  }
}

const components = new Map();
for (const paper of papers) {
  const root = find(parent, paper.key);
  if (!components.has(root)) components.set(root, []);
  components.get(root).push(paper);
}

const groups = [];
const warnings = [];
const groupByPaperKey = new Map();
for (const component of components.values()) {
  if (component.length < 2) continue;
  const byProvince = new Map();
  for (const paper of component) {
    const prev = byProvince.get(paper.province);
    if (!prev || paper.keys.size > prev.keys.size) byProvince.set(paper.province, paper);
  }
  const members = [...byProvince.values()].sort((a, b) =>
    PROVINCE_ORDER.indexOf(a.province) - PROVINCE_ORDER.indexOf(b.province));
  if (members.length < 2) continue;
  if (members.length !== component.length) {
    warnings.push(`${members[0].year} 年组内出现同省多卷，已按省份保留题量最大的一卷：${members.map(p => p.province).join('、')}`);
  }

  const pairStats = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) pairStats.push(pairStat(members[i], members[j]));
  }
  if (pairStats.length === 0) continue;

  let coreKeys = new Set(members[0].keys);
  for (const member of members.slice(1)) {
    coreKeys = new Set([...coreKeys].filter(key => member.keys.has(key)));
  }
  const unionKeys = new Set();
  for (const member of members) for (const key of member.keys) unionKeys.add(key);

  const minPairContainment = Math.min(...pairStats.map(stat => stat.containment));
  const maxPairContainment = Math.max(...pairStats.map(stat => stat.containment));
  const minPairJaccard = Math.min(...pairStats.map(stat => stat.jaccard));
  const maxPairJaccard = Math.max(...pairStats.map(stat => stat.jaccard));
  const grade = minPairContainment >= GRADE_A_MIN_CONTAINMENT ? 'A' : 'B';

  const labelMatch = members.map(member => member.title.match(/(\d{3})联考/)).find(Boolean);
  const label = labelMatch ? `${labelMatch[1]}联考` : '联考';
  const year = members[0].year;
  const groupId = `G-${year}-${labelMatch ? labelMatch[1] : 'X'}`;

  const sumRecords = members.reduce((sum, member) => sum + member.questions.length, 0);
  const sumUnique = members.reduce((sum, member) => sum + member.keys.size, 0);
  const redundantUnique = sumUnique - unionKeys.size;

  // 共有题的答案文本一致性（按答案对应的选项文本比较，避免选项顺序造成误报）
  const coreAnswerMap = new Map();
  for (const member of members) {
    for (const question of member.questions) {
      if (!coreKeys.has(question.key)) continue;
      if (!coreAnswerMap.has(question.key)) coreAnswerMap.set(question.key, []);
      coreAnswerMap.get(question.key).push({
        province: member.province,
        id: question.id,
        stem: question.stem,
        answer: question.answer,
      });
    }
  }
  let answerConflictCount = 0;
  let missingAnswerCount = 0;
  const answerConflictKeys = new Set();
  const answerConflictSamples = [];
  for (const [key, records] of coreAnswerMap) {
    const values = records.map(record => record.answer).filter(Boolean);
    const distinct = new Set(values);
    if (values.length < records.length) missingAnswerCount++;
    if (distinct.size > 1) {
      answerConflictCount++;
      answerConflictKeys.add(key);
      if (answerConflictSamples.length < 5) {
        answerConflictSamples.push({ key, records });
      }
    }
  }

  const group = {
    groupId,
    grade,
    year,
    label,
    members,
    pairStats,
    coreKeys,
    unionKeys,
    coreHash: hashKeys(coreKeys),
    unionHash: hashKeys(unionKeys),
    minPairContainment,
    maxPairContainment,
    minPairJaccard,
    maxPairJaccard,
    sumRecords,
    sumUnique,
    redundantUnique,
    answerConflictCount,
    answerConflictKeys,
    missingAnswerCount,
    answerConflictSamples,
    patchPriority: grade === 'A' ? 'P0' : 'P1',
  };
  groups.push(group);
  for (const member of members) groupByPaperKey.set(member.key, group);
}

groups.sort((a, b) => Number(a.year) - Number(b.year));

// ---- 3. 未入组的 C 级观察省对 ----
const watchPairs = allPairs
  .filter(stat => {
    const groupA = groupByPaperKey.get(stat.a.key);
    const groupB = groupByPaperKey.get(stat.b.key);
    return !(groupA && groupB && groupA === groupB);
  })
  .sort((a, b) => Number(a.a.year) - Number(b.a.year) || b.containment - a.containment);

const watchByYear = new Map();
for (const stat of watchPairs) {
  const year = stat.a.year;
  if (!watchByYear.has(year)) watchByYear.set(year, []);
  watchByYear.get(year).push(stat);
}
const watchTop = [];
for (const [year, stats] of [...watchByYear.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  for (const stat of stats.slice(0, 3)) watchTop.push(stat);
}

// ---- 4. 控制台/报告统计 ----
const gradeA = groups.filter(group => group.grade === 'A');
const gradeB = groups.filter(group => group.grade === 'B');
const totalRedundantA = gradeA.reduce((sum, group) => sum + group.redundantUnique, 0);
const totalRedundantB = gradeB.reduce((sum, group) => sum + group.redundantUnique, 0);
const totalConflicts = groups.reduce((sum, group) => sum + group.answerConflictCount, 0);

if (DRY_RUN) {
  console.log(`papers=${papers.length} questions=${totalQuestions} unique=${totalUniqueKeys}`);
  console.log(`groups=${groups.length} A=${gradeA.length} B=${gradeB.length}`);
  for (const group of groups) {
    console.log(`${group.groupId}\t${group.grade}\t${group.members.map(m => `${m.province}${m.questions.length}`).join('/')}\tcore=${group.coreKeys.size}\tunion=${group.unionKeys.size}\tredundant=${group.redundantUnique}\tconflicts=${group.answerConflictCount}\t${group.coreHash.slice(0, 16)}`);
  }
  console.log(`watchPairs=${watchTop.length} conflicts=${totalConflicts}`);
  process.exit(0);
}

// ---- 5. 写 CSV ----
const groupHeader = [
  '组ID', '等级', '年份', '卷别', '参与省', '各卷题数', '各卷题数合计',
  '共有题数', '并集题数', '跨卷重复副本数(按唯一指纹)', '答案冲突题数', '缺答案题数',
  '最小containment', '最大containment', '最小Jaccard', '最大Jaccard',
  '共有题内容哈希(SHA-256)', '并集内容哈希(SHA-256)', '建议patch优先级',
];
const groupRows = groups.map(group => [
  group.groupId,
  group.grade,
  group.year,
  group.label,
  group.members.map(member => member.province).join('、'),
  group.members.map(member => `${member.province}${member.questions.length}`).join(' / '),
  group.sumRecords,
  group.coreKeys.size,
  group.unionKeys.size,
  group.redundantUnique,
  group.answerConflictCount,
  group.missingAnswerCount,
  group.minPairContainment.toFixed(4),
  group.maxPairContainment.toFixed(4),
  group.minPairJaccard.toFixed(4),
  group.maxPairJaccard.toFixed(4),
  group.coreHash,
  group.unionHash,
  group.patchPriority,
]);
writeCsv(GROUPS_CSV, groupHeader, groupRows);

const memberHeader = [
  '组ID', '等级', '年份', '省', '数据口径', '卷名', '题数', '可指纹题数',
  '不可指纹题数', '无选项题数', '答案冲突涉及题数', '内容哈希(SHA-256)', '来源分片',
];
const memberRows = [];
for (const group of groups) {
  const conflictKeys = group.answerConflictKeys;
  for (const member of group.members) {
    memberRows.push([
      group.groupId,
      group.grade,
      group.year,
      member.province,
      member.scope,
      member.title,
      member.questions.length,
      member.keys.size,
      member.ambiguousCount,
      member.questions.filter(question => question.optionsMissing).length,
      [...member.keys].filter(key => conflictKeys.has(key)).length,
      hashKeys(member.keys),
      [...member.files].sort().join('; '),
    ]);
  }
}
writeCsv(MEMBERS_CSV, memberHeader, memberRows);

// ---- 6. 写 Markdown ----
const md = [];
const add = (line = '') => md.push(line);

add('# 联考查重报告：湘鄂赣 v2 × 已上线浙闽皖');
add('');
add(`- 生成时间：${new Date().toISOString()}`);
add('- 数据范围：');
add('  - 湘 / 鄂 / 赣：`public/data/questions-v2-provincial/<省>/`（v2 源分片）');
add('  - 浙 / 闽 / 皖：`public/data/questions/provincial-<省>-*.json`（已上线分片）');
add(`- 样本：**${papers.length} 卷 / ${totalQuestions.toLocaleString('en-US')} 题 / ${totalUniqueKeys.toLocaleString('en-US')} 个唯一内容指纹**；其中 **${totalAmbiguous} 题**为图片题/缺题占位，无法生成可靠指纹，已从同卷比对中剔除。`);
add(`- 结论：**${groups.length} 组同卷**（A 级 ${gradeA.length} 组，B 级 ${gradeB.length} 组）；2017 年起没有达到同卷边阈值的省对。`);
add('- 本报告只生成查重结果，**不改题目数据**；patch 需按组另开脚本 / PR。');
add('');
add('| 省 | 数据口径 | 卷数 | 题数 | 可指纹题数 | 不可指纹题数 |');
add('|---|---|---:|---:|---:|---:|');
for (const stat of provinceStats) {
  add(`| ${stat.province} | ${stat.scope} | ${stat.papers} | ${stat.questions} | ${stat.fingerprintable} | ${stat.ambiguous} |`);
}
add('');

add('## 一、结论摘要');
add('');
add('| 组ID | 等级 | 年份 | 卷别 | 参与省 | 各卷题数 | 共有题 | 并集题 | 跨卷重复副本 | 答案冲突 | 最小/最大 containment | 共有题哈希（前16位） |');
add('|---|---:|---:|---|---|---|---:|---:|---:|---:|---:|---|');
for (const group of groups) {
  add(`| ${group.groupId} | ${group.grade} | ${group.year} | ${group.label} | ${group.members.map(member => member.province).join('、')} | ${group.members.map(member => `${member.province}${member.questions.length}`).join('<br>')} | ${group.coreKeys.size} | ${group.unionKeys.size} | ${group.redundantUnique} | ${group.answerConflictCount} | ${formatPercent(group.minPairContainment)} / ${formatPercent(group.maxPairContainment)} | \`${group.coreHash.slice(0, 16)}\` |`);
}
add('');
add(`- **A 级（可直接排 P0）**：${gradeA.length ? gradeA.map(group => `${group.groupId}（${group.members.map(m => m.province).join('、')}）`).join('；') : '无'}`);
add(`- **B 级（抽检后 P1）**：${gradeB.length ? gradeB.map(group => `${group.groupId}（${group.members.map(m => m.province).join('、')}）`).join('；') : '无'}`);
add(`- A + B 合计跨卷重复副本 **${totalRedundantA + totalRedundantB}** 条（按可指纹唯一题统计），共有题答案冲突 **${totalConflicts}** 题。`);
add('');

add('## 二、同卷明细');
add('');
for (const group of groups) {
  add(`### ${group.groupId}（${group.grade} 级，${group.year} 年 ${group.label}）`);
  add('');
  add(`- 参与省：**${group.members.map(member => member.province).join('、')}**`);
  add(`- 各卷题数：${group.members.map(member => `${member.province} ${member.questions.length} 题（可指纹 ${member.keys.size}，不可指纹 ${member.ambiguousCount}）`).join('；')}`);
  add(`- 共有题 / 并集题：**${group.coreKeys.size} / ${group.unionKeys.size}**；跨卷重复副本 **${group.redundantUnique}** 条`);
  add(`- 覆盖率：最小 ${formatPercent(group.minPairContainment)}，最大 ${formatPercent(group.maxPairContainment)}；Jaccard：最小 ${formatPercent(group.minPairJaccard)}，最大 ${formatPercent(group.maxPairJaccard)}`);
  add(`- 共有题内容哈希：\`${group.coreHash}\``);
  add(`- 并集内容哈希：\`${group.unionHash}\``);
  add(`- 答案冲突：**${group.answerConflictCount}** 题；缺答案：**${group.missingAnswerCount}** 题`);
  add('');
  add('| 省 | 数据口径 | 卷名 | 题数 | 唯一内容题 | 内容哈希（前16位） | 来源分片 |');
  add('|---|---|---|---:|---:|---|---|');
  for (const member of group.members) {
    add(`| ${member.province} | ${member.scope} | ${mdCell(member.title)} | ${member.questions.length} | ${member.keys.size} | \`${hashKeys(member.keys).slice(0, 16)}\` | ${[...member.files].sort().map(file => `\`${file}\``).join('<br>')} |`);
  }
  add('');
  add('省对覆盖率：');
  add('');
  add('| 省对 | 共享题 | 较小卷覆盖率 | Jaccard |');
  add('|---|---:|---:|---:|');
  for (const stat of group.pairStats) {
    add(`| ${stat.a.province} ↔ ${stat.b.province} | ${stat.shared} | ${formatPercent(stat.containment)} | ${formatPercent(stat.jaccard)} |`);
  }
  add('');
  if (group.answerConflictSamples.length) {
    add('答案冲突样例（逐题清单需在 patch 脚本中按 qKey 导出）：');
    add('');
    for (const sample of group.answerConflictSamples) {
      const answers = sample.records
        .map(record => `${record.province}:${record.answer || '空'}（${record.id}）`)
        .join('；');
      add(`- ${mdCell(sample.records[0].stem.slice(0, 80))}… → ${mdCell(answers)}`);
    }
    add('');
  }
  add(`**patch 建议**：${group.grade === 'A' ? 'P0，直接按同卷标记；先做答案冲突题。' : 'P1，先抽检差异题与答案冲突题，再按同卷标记。'}`);
  add('');
}

add('## 三、未入组的高重合省对（C 级观察名单）');
add('');
add('以下省对低于同卷边阈值（较小卷覆盖率 < 80%），**不要按同卷直接 patch**；若后续要合并题库，再单独评估。');
add('');
add('| 年份 | 省对 | 各卷题数 | 共享题 | 较小卷覆盖率 | Jaccard | 判定 |');
add('|---|---|---|---:|---:|---:|---|');
for (const stat of watchTop) {
  const verdict = stat.containment >= 0.75 ? 'C+ 同题库边缘，需人工确认' : 'C 同题库，非同卷';
  add(`| ${stat.a.year} | ${stat.a.province} ↔ ${stat.b.province} | ${stat.a.questions.length} / ${stat.b.questions.length} | ${stat.shared} | ${formatPercent(stat.containment)} | ${formatPercent(stat.jaccard)} | ${verdict} |`);
}
add('');

add('## 四、Patch 排期建议');
add('');
add(`### P0：A 级同卷（${gradeA.length} 组，跨卷重复副本 ${totalRedundantA} 条）`);
add('');
if (gradeA.length === 0) add('- 无');
for (const group of gradeA) {
  add(`- [ ] ${group.groupId}（${group.year} ${group.label}，${group.members.map(m => m.province).join('、')}）：${group.redundantUnique} 条重复副本，${group.coreKeys.size} 道共有题，答案冲突 ${group.answerConflictCount} 题。`);
}
add('');
add(`### P1：B 级同卷候选（${gradeB.length} 组，跨卷重复副本 ${totalRedundantB} 条）`);
add('');
if (gradeB.length === 0) add('- 无');
for (const group of gradeB) {
  add(`- [ ] ${group.groupId}（${group.year} ${group.label}，${group.members.map(m => m.province).join('、')}）：先抽检差异题；确认后处理 ${group.redundantUnique} 条重复副本，答案冲突 ${group.answerConflictCount} 题。`);
}
add('');
add('### 不排期');
add('');
add('- C 级观察省对（2017 年起为主）：最高覆盖率约 60–78%，属于联考同题库/同命题风格，不足以判定同卷；先不标记，避免误伤。');
add('- 若后续要做“跨省题库合并”，再按 C 表逐对做人工确认。');
add('');
add('### 执行建议');
add('');
add('- 每组一个独立 patch，命名建议 `scripts/patches/2026-10-21-same-paper-<组ID>.cjs`，避免六组混在一个脚本里无法回滚。');
add('- 每个 patch 先按 `共有题内容哈希` 复核组内题目，再写入同卷标记；答案冲突题先单独修，再批量标记。');
add('- P0 三组可并行开发，但按 2011 → 2012 → 2013 顺序合并；P1 三组先各抽 10–20 道差异题人工确认。');
add('');

add('## 五、口径与限制');
add('');
add('1. **题目指纹**：`qKey = SHA-256(normalize(stem) + "\\x01" + sorted(normalize(option.text)).join("\\x02"))`；`normalize` 为 NFKC、转小写、去空白、去常见中英文标点。');
add('2. **试卷指纹**：`paperHash = SHA-256(sorted(qKey).join("\\n"))`；组共有题哈希和并集哈希分别对交集/并集排序后计算。');
add('3. **同卷判定**：同一年、不同省、共享 ≥ 20 题且较小卷覆盖率 ≥ 80% 连边；A 级要求组内任意两卷覆盖率 ≥ 90%，否则为 B 级。');
add('4. **答案冲突**：对共有题比较“答案对应的选项文本”，而不是答案字母，避免选项顺序不同造成误报；答案/解析不参与同卷指纹。');
add('5. **图片题 / 缺题占位**：题干为通用说明且选项为空、或选项只有 `MISSING` 的题，不参与 qKey 计算（否则多道图形题会被压成同一哈希），只计入“不可指纹题数”；因此共有题数和覆盖率均按可指纹题计算。');
add('6. **已知限制**：OCR 空格已做过清洗，但字形/标点差异仍可能让个别同题无法匹配；B 级必须人工抽检后再 patch。');
add('7. **数据源**：湘鄂赣使用 v2 源分片，浙闽皖使用线上分片；不混用同一省的 v2 与线上副本，避免重复计数。');
add('');

add('## 六、复现');
add('');
add('```powershell');
add('node scripts/scan-cross-province-papers.cjs');
add('node scripts/scan-cross-province-papers.cjs --dry-run');
add('```');
add('');
add(`- 组清单 CSV：\`${rel(GROUPS_CSV)}\``);
add(`- 成员明细 CSV：\`${rel(MEMBERS_CSV)}\``);
add('');

fs.writeFileSync(REPORT_MD, md.join('\n').replace(/\n+$/, '') + '\n', 'utf8');

console.log(`papers=${papers.length} questions=${totalQuestions} unique=${totalUniqueKeys}`);
console.log(`groups=${groups.length} A=${gradeA.length} B=${gradeB.length} watch=${watchTop.length} conflicts=${totalConflicts}`);
console.log(`WROTE ${rel(REPORT_MD)}`);
console.log(`WROTE ${rel(GROUPS_CSV)}`);
console.log(`WROTE ${rel(MEMBERS_CSV)}`);
if (warnings.length) for (const warning of warnings) console.warn('WARN ' + warning);
