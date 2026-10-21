#!/usr/bin/env node
/**
 * publish-merge-provinces.cjs —— 湘 / 鄂 / 赣 v2 分片并入线上数据目录
 *
 * 与 publish-merge-anhui.cjs（安徽）同构，复用同一套方案 A 检查口径：
 *   1) 读取 public/data/questions-v2-provincial/<省>/ 的 <slug>-none-*.json；
 *   2) 映射为前端可识别的 provincial-<省>-<module>-<chunk>.json；
 *   3) 覆盖 public/data/questions/ 下同名旧省分片，删除多余旧省分片；
 *   4) 按目录内实际文件全量重建 index.json 与 idMap.json；
 *   5) 执行越界、增减守恒、index / idMap 一致性检查。
 *
 * 旧分片 provincial-<省>-* 全部按全量替换处理；加 --drop-uncovered 时，
 * v2 未覆盖的旧 shenlun / gongji 分片也会删除（湘、赣各有一个旧申论分片）。
 *
 * 用法：
 *   node scripts/publish-merge-provinces.cjs --province 湖南 --drop-uncovered
 *   node scripts/publish-merge-provinces.cjs --province 湖南 --apply --drop-uncovered
 *   node scripts/publish-merge-provinces.cjs --province 湖北 --apply --drop-uncovered
 *   node scripts/publish-merge-provinces.cjs --province 江西 --apply --drop-uncovered
 *
 * 退出码：0 成功；1 前置检查失败（失败时不会写任何题目数据）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROVINCES = {
  湖南: { slug: 'hunan', expectedSrcTotal: 2239, oldIdPrefix: 'prov-湖南-' },
  湖北: { slug: 'hubei', expectedSrcTotal: 2414, oldIdPrefix: 'prov-湖北-' },
  江西: { slug: 'jiangxi', expectedSrcTotal: 3164, oldIdPrefix: 'prov-江西-' },
};

let TAG = '[publish-province]';
function fail(msg) {
  console.error(`${TAG} 前置检查失败：${msg}`);
  process.exit(1);
}

function readProvinceArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--province') return argv[i + 1] || '';
    if (arg.startsWith('--province=')) return arg.slice('--province='.length);
  }
  return '';
}

const ARGV = process.argv.slice(2);
const PROVINCE = readProvinceArg(ARGV);
if (!PROVINCE) fail(`必须指定 --province（${Object.keys(PROVINCES).join(' / ')}）`);
const CFG = PROVINCES[PROVINCE];
if (!CFG) fail(`不支持的省份：${PROVINCE}（可选 ${Object.keys(PROVINCES).join(' / ')}）`);

const SLUG = CFG.slug;
const EXPECTED_SRC_TOTAL = CFG.expectedSrcTotal;
const OLD_ID_PREFIX = CFG.oldIdPrefix;
const NEW_ID_PREFIX = `prov-${SLUG}-`;
TAG = `[publish-${SLUG}]`;

const ROOT = process.env.PUBLISH_ROOT
  ? path.resolve(process.env.PUBLISH_ROOT)
  : path.resolve(__dirname, '..');
const TARGET_PREFIX = `provincial-${PROVINCE}-`;
const SRC = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', PROVINCE);
const DST = path.join(ROOT, 'public', 'data', 'questions');
const REPORT = path.join(ROOT, 'guokao-reports', `publish-${SLUG}-plan.md`);
const APPLY = ARGV.includes('--apply');
const DROP_UNCOVERED = ARGV.includes('--drop-uncovered');

/** 主观题模块：允许无选项 */
const SUBJECTIVE = new Set(['shenlun', 'gongji']);
/** 源分片命名：<slug>-none-<module>-<chunk>.json */
const SOURCE_RE = new RegExp(`^${SLUG}-none-([a-z]+)-(\\d+)\\.json$`);
/** 目标分片命名：<category>-<province>-<module>-<chunk>.json */
const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;
const SPECIAL_FILES = new Set(['index.json', 'idMap.json', 'questions.json']);

function listJson(dir) {
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort();
}

function listShards(dir) {
  return listJson(dir).filter(f => !SPECIAL_FILES.has(f));
}

function readJson(dir, name) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  } catch (err) {
    throw new Error(`${name} 解析失败：${err.message}`);
  }
  return data;
}

function readShard(dir, name) {
  const data = readJson(dir, name);
  if (!Array.isArray(data)) throw new Error(`${name} 不是题目数组`);
  return data;
}

function parseShardName(name) {
  const m = SHARD_RE.exec(name);
  if (!m) return null;
  return {
    category: m[1],
    province: m[2],
    module: m[3],
    chunk: Number(m[4]),
    key: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

/** 前端可渲染性预检（与 src/lib/questionValidation.ts 同口径） */
function renderStats(questions) {
  const stat = {
    total: questions.length,
    ok: 0,
    image: 0,
    noStem: 0,
    tooFewOptions: 0,
    emptyOptionText: 0,
    subjective: 0,
  };
  for (const q of questions) {
    if (typeof q?.stem !== 'string' || q.stem.trim() === '') {
      stat.noStem += 1;
      continue;
    }
    const module = String(q?.module || '');
    if (SUBJECTIVE.has(module)) {
      stat.subjective += 1;
      stat.ok += 1;
      continue;
    }
    if (q?.isImageQuestion === true) {
      stat.image += 1;
      stat.ok += 1;
      continue;
    }
    const opts = Array.isArray(q?.options) ? q.options : [];
    if (opts.length < 2) {
      stat.tooFewOptions += 1;
      continue;
    }
    if (opts.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) {
      stat.emptyOptionText += 1;
      continue;
    }
    stat.ok += 1;
  }
  return stat;
}

/** 中文标点旁残留空格（OCR 常见）：只做提示，不阻塞 publish */
const PUNCT_SPACE_RE =
  /[\u3400-\u9fff]\s+[，。、；：？！“”‘’（）《》【】]|[，。、；：？！“”‘’（）《》【】]\s+[\u3400-\u9fff]/;

function spaceStats(questions) {
  let hits = 0;
  let sample = '';
  for (const q of questions) {
    const texts = [
      q?.stem,
      q?.title,
      q?.analysis,
      q?.explanation,
      ...(Array.isArray(q?.options) ? q.options.map(o => o?.text) : []),
    ].filter(t => typeof t === 'string');
    if (texts.some(t => PUNCT_SPACE_RE.test(t))) {
      hits += 1;
      if (!sample) sample = String(q?.stem || q?.title || '').slice(0, 80);
    }
  }
  return { hits, sample };
}

/* ------------------------------------------------------------------ */
/* 计划                                                                */
/* ------------------------------------------------------------------ */

function buildPlan() {
  for (const dir of [SRC, DST]) {
    if (!fs.existsSync(dir)) fail(`目录不存在：${path.relative(ROOT, dir)}`);
    if (!fs.existsSync(path.join(dir, 'index.json'))) {
      fail(`${path.relative(ROOT, dir)} 缺少 index.json，疑似不是数据目录`);
    }
  }

  const sourceAll = listJson(SRC);
  const sourceShards = sourceAll.filter(n => SOURCE_RE.test(n));
  const unexpected = sourceAll.filter(n => !SPECIAL_FILES.has(n) && !SOURCE_RE.test(n));
  if (unexpected.length) fail(`源目录存在无法识别的分片：${unexpected.join(', ')}`);
  if (!sourceShards.length) fail(`questions-v2-provincial 下没有 ${SLUG}-none-*.json`);

  const src = sourceShards.map(name => {
    const m = SOURCE_RE.exec(name);
    const module = m[1];
    const chunk = Number(m[2]);
    return {
      name,
      module,
      chunk,
      target: `${TARGET_PREFIX}${module}-${chunk}.json`,
    };
  });

  const targetSeen = new Set();
  for (const s of src) {
    if (targetSeen.has(s.target)) fail(`源分片映射到重复目标文件：${s.target}`);
    targetSeen.add(s.target);
  }

  const srcIndex = readJson(SRC, 'index.json');
  const srcIndexRefs = Object.values(srcIndex).flat();
  const srcMissingRefs = srcIndexRefs.filter(n => !sourceShards.includes(n));
  const srcUnreferenced = sourceShards.filter(n => !srcIndexRefs.includes(n));
  if (srcMissingRefs.length) fail(`源 index 引用了不存在的分片：${srcMissingRefs.join(', ')}`);
  if (srcUnreferenced.length) fail(`源 index 未覆盖分片：${srcUnreferenced.join(', ')}`);

  const srcQuestions = [];
  const newIdSet = new Set();
  const dupInSource = [];
  const badSrcMeta = [];
  const badSrcIds = [];
  for (const s of src) {
    const questions = readShard(SRC, s.name);
    s.count = questions.length;
    for (const q of questions) {
      const id = String(q?.id ?? '').trim();
      if (!id) fail(`${s.name} 存在空题目 ID`);
      if (newIdSet.has(id)) dupInSource.push(id);
      newIdSet.add(id);
      if (!id.startsWith(NEW_ID_PREFIX)) badSrcIds.push(id);
      if (q?.category !== 'provincial' || q?.province !== PROVINCE || q?.module !== s.module) {
        badSrcMeta.push(`${id}(${q?.category}/${q?.province}/${q?.module})`);
      }
      srcQuestions.push(q);
    }
  }
  if (badSrcIds.length) fail(`新分片存在非 ${NEW_ID_PREFIX}* ID：${badSrcIds.slice(0, 5).join(', ')}`);
  if (badSrcMeta.length) fail(`新分片 category / province / module 不一致：${badSrcMeta.slice(0, 5).join(', ')}`);

  const aggregate = readJson(SRC, 'questions.json');
  if (!Array.isArray(aggregate)) fail('源 questions.json 不是题目数组');
  const aggregateIds = new Set(aggregate.map(q => String(q?.id ?? '').trim()).filter(Boolean));
  if (
    aggregate.length !== srcQuestions.length ||
    aggregateIds.size !== newIdSet.size ||
    [...newIdSet].some(id => !aggregateIds.has(id))
  ) {
    fail(
      `源 questions.json 与分片不一致（聚合 ${aggregate.length} 题 / 分片 ${srcQuestions.length} 题，` +
        `聚合唯一 ID ${aggregateIds.size} / 分片唯一 ID ${newIdSet.size}）`
    );
  }

  if (srcQuestions.length !== EXPECTED_SRC_TOTAL) {
    fail(
      `源分片题目数 ${srcQuestions.length} 与预期 ${EXPECTED_SRC_TOTAL} 不一致` +
        '（清洗 / 修复未定稿或源目录混入其他数据）'
    );
  }

  const dstAll = listShards(DST);
  const dstProvince = dstAll.filter(n => n.startsWith(TARGET_PREFIX));
  const others = dstAll.filter(n => !n.startsWith(TARGET_PREFIX));
  const dstProvinceSet = new Set(dstProvince);

  const leaked = others.filter(n => n.startsWith(TARGET_PREFIX));
  if (leaked.length) fail(`未触碰分片中出现${PROVINCE}分片：${leaked.join(', ')}（删除 / 替换清单不完整）`);
  const badOldNames = dstProvince.filter(n => {
    const parsed = parseShardName(n);
    return !parsed || parsed.province !== PROVINCE;
  });
  if (badOldNames.length) {
    fail(`旧${PROVINCE}分片命名无法解析或省份不符：${badOldNames.join(', ')}`);
  }
  const targetParseBad = src.filter(s => {
    const parsed = parseShardName(s.target);
    return !parsed || parsed.category !== 'provincial' || parsed.province !== PROVINCE || parsed.module !== s.module;
  });
  if (targetParseBad.length) fail(`目标分片名无法被 loader 解析：${targetParseBad.map(s => s.target).join(', ')}`);

  const overwrite = src.filter(s => dstProvinceSet.has(s.target));
  const add = src.filter(s => !dstProvinceSet.has(s.target));
  /** v2 源目录没有对应分片的旧分片（湘、赣当前有旧 shenlun-0） */
  const uncovered = dstProvince.filter(n => !targetSeen.has(n));
  /**
   * 默认保留旧主观题分片：v2 只转换了客观题，shenlun / gongji 不在源目录里。
   * 加 --drop-uncovered 后按“全量替换”删除，旧申论题会消失。
   */
  const kept = uncovered.filter(n => {
    if (DROP_UNCOVERED) return false;
    const parsed = parseShardName(n);
    return parsed && SUBJECTIVE.has(parsed.module);
  });
  const keptSet = new Set(kept);
  const stale = uncovered.filter(n => !keptSet.has(n));

  const oldCounts = new Map();
  const oldQuestions = [];
  let oldTotal = 0;
  for (const name of [...overwrite.map(s => s.target), ...stale]) {
    const questions = readShard(DST, name);
    oldCounts.set(name, questions.length);
    oldTotal += questions.length;
    oldQuestions.push(...questions);
  }

  const keptQuestions = [];
  let keptTotal = 0;
  for (const name of kept) {
    const questions = readShard(DST, name);
    oldCounts.set(name, questions.length);
    keptTotal += questions.length;
    keptQuestions.push(...questions);
  }

  const oldIds = new Set();
  for (const q of oldQuestions) {
    const id = String(q?.id ?? '').trim();
    if (id) oldIds.add(id);
  }
  const badOldIds = [...oldIds].filter(id => !id.startsWith(OLD_ID_PREFIX));
  if (badOldIds.length) fail(`旧分片存在非 ${OLD_ID_PREFIX}* ID：${badOldIds.slice(0, 5).join(', ')}`);

  const keptIds = new Set();
  for (const q of keptQuestions) {
    const id = String(q?.id ?? '').trim();
    if (id) keptIds.add(id);
  }

  const otherQuestions = [];
  for (const name of others) otherQuestions.push(...readShard(DST, name));
  const otherIds = new Set();
  let othersCount = 0;
  for (const q of otherQuestions) {
    othersCount += 1;
    const id = String(q?.id ?? '').trim();
    if (id) otherIds.add(id);
  }

  const collisions = [...newIdSet].filter(id => otherIds.has(id));
  const oldNewOverlap = [...newIdSet].filter(id => oldIds.has(id));
  const keptNewOverlap = [...newIdSet].filter(id => keptIds.has(id));
  const oldIdsStillUsed = [...oldIds].filter(id => otherIds.has(id));

  const currentIndex = readJson(DST, 'index.json');
  const currentIdMap = readJson(DST, 'idMap.json');

  /** 本次会写入 / 删除的文件全集（用于越界检查） */
  const changed = [
    ...overwrite.map(s => s.target),
    ...add.map(s => s.target),
    ...stale,
  ];
  const changedOutOfScope = changed.filter(n => !n.startsWith(TARGET_PREFIX));
  const changedDupes = changed.filter((n, i) => changed.indexOf(n) !== i);

  return {
    src,
    srcQuestions,
    srcTargets: targetSeen,
    dstProvince,
    others,
    overwrite,
    add,
    uncovered,
    kept,
    keptSet,
    stale,
    changed,
    changedOutOfScope,
    changedDupes,
    oldCounts,
    oldQuestions,
    oldTotal,
    keptQuestions,
    keptTotal,
    oldIds,
    keptIds,
    keptNewOverlap,
    oldIdsStillUsed,
    othersCount,
    dupInSource,
    newIdSet,
    collisions,
    oldNewOverlap,
    currentIndexKeyCount: Object.keys(currentIndex).length,
    currentIdMapCount: Object.keys(currentIdMap).length,
    beforeTotal: othersCount + oldTotal + keptTotal,
    beforeFiles: others.length + dstProvince.length,
  };
}

function buildIndex(names) {
  const groups = new Map();
  for (const name of names) {
    const parsed = parseShardName(name);
    if (!parsed) continue;
    if (!groups.has(parsed.key)) groups.set(parsed.key, []);
    groups.get(parsed.key).push({ name, chunk: parsed.chunk });
  }
  const out = {};
  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    out[key] = groups
      .get(key)
      .sort((a, b) => a.chunk - b.chunk)
      .map(x => x.name);
  }
  return out;
}

function buildIdMap(dir, names) {
  const map = new Map();
  for (const name of names) {
    for (const q of readShard(dir, name)) {
      const id = String(q?.id ?? '').trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      if (!map.get(id).includes(name)) map.get(id).push(name);
    }
  }
  const out = {};
  for (const id of [...map.keys()].sort((a, b) => a.localeCompare(b))) {
    out[id] = map.get(id);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 报告                                                                */
/* ------------------------------------------------------------------ */

function num(n) {
  return Number(n).toLocaleString('en-US');
}

function signed(n) {
  return n > 0 ? `+${num(n)}` : num(n);
}

function pct(part, whole) {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function buildReport(plan, projected) {
  const md = [];
  const overwriteOld = plan.overwrite.reduce((sum, s) => sum + (plan.oldCounts.get(s.target) || 0), 0);
  const overwriteNew = plan.overwrite.reduce((sum, s) => sum + s.count, 0);
  const addNew = plan.add.reduce((sum, s) => sum + s.count, 0);
  const staleOld = plan.stale.reduce((sum, n) => sum + (plan.oldCounts.get(n) || 0), 0);
  const oldKeys = new Set(plan.dstProvince.map(n => parseShardName(n)?.key).filter(Boolean));
  const newKeys = new Set(
    [...plan.src.map(s => parseShardName(s.target)?.key), ...plan.kept.map(n => parseShardName(n)?.key)]
      .filter(Boolean)
  );
  const expectedTotal = plan.beforeTotal - plan.oldTotal + EXPECTED_SRC_TOTAL;
  const projectedExpectedFiles =
    plan.beforeFiles - (plan.overwrite.length + plan.stale.length) + plan.src.length;
  const removedOldIds = plan.oldIds.size - plan.oldIdsStillUsed.length;
  const oldDuplicateIds = plan.oldTotal - plan.oldIds.size;
  const newRender = renderStats(plan.srcQuestions);
  const oldRender = renderStats(plan.oldQuestions);
  const keptRender = renderStats(plan.keptQuestions);
  const spaceOld = spaceStats(plan.oldQuestions);
  const spaceNew = spaceStats(plan.srcQuestions);
  const finalRender = projected.render;
  const ok = v => (v ? '通过' : '失败');
  const subjectiveOld = plan.oldQuestions.filter(q => SUBJECTIVE.has(String(q?.module || ''))).length;

  md.push(`# ${PROVINCE} publish 合并计划（方案 A：并入 /data/questions/）`);
  md.push('');
  md.push(`- 模式：**${APPLY ? 'APPLIED（已写入）' : 'dry-run（未写入）'}**`);
  md.push(`- 生成时间：${new Date().toISOString()}`);
  md.push(`- 源目录：\`public/data/questions-v2-provincial/${PROVINCE}/\`（ID 前缀 \`${NEW_ID_PREFIX}*\`）`);
  md.push('- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）');
  md.push(`- 分片映射：\`${SLUG}-none-<module>-<chunk>.json\` → \`provincial-${PROVINCE}-<module>-<chunk>.json\``);
  md.push(`- 基线快照：当前线上 **${num(plan.beforeFiles)} 个分片 / ${num(plan.beforeTotal)} 题**（三省均未发布）`);
  md.push('');
  if (plan.kept.length) {
    md.push(
      `- 旧主观题分片：**保留 ${plan.kept.length} 个 / ${num(plan.keptTotal)} 题**` +
        '（v2 未覆盖 shenlun / gongji，不删不改，仍计入合并后总数）'
    );
  }
  if (DROP_UNCOVERED) {
    md.push(
      `- **\`--drop-uncovered\`**：v2 未覆盖的旧分片全部删除` +
        (subjectiveOld ? `，本省旧主观题 ${num(subjectiveOld)} 题会消失` : '（本省无旧主观题分片）')
    );
  }
  md.push('');
  md.push('> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。');
  md.push(`> 源分片名 \`${SLUG}-none-*\` 会被解析成 \`${SLUG} / none / *\`，${PROVINCE}分类无法命中，`);
  md.push(`> 因此 publish 必须改名为 \`provincial-${PROVINCE}-*\`；题目 ID 保持 \`${NEW_ID_PREFIX}*\` 不变。`);
  md.push('');
  md.push('> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；');
  md.push('> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。');
  md.push('');
  md.push('## 0. 三项 publish 前置对账');
  md.push('');
  const otherProvinces = plan.others.filter(n => n.startsWith('provincial-'));
  const nationalFiles = plan.others.filter(n => n.startsWith('national-'));
  md.push(`### 0.1 越界检查（只允许动 \`${TARGET_PREFIX}*\`）`);
  md.push('');
  md.push('| 检查 | 结果 | 明细 |');
  md.push('|---|---|---|');
  md.push(
    `| 变更文件全部命中 \`${TARGET_PREFIX}*\` | **${ok(plan.changedOutOfScope.length === 0)}** | ` +
      `${num(plan.changed.length)} 个文件（覆盖 ${plan.overwrite.length} / 新增 ${plan.add.length} / 删除 ${plan.stale.length}） |`
  );
  md.push(
    `| 越界到国考 \`national-*\` | **${ok(plan.changed.filter(n => n.startsWith('national-')).length === 0)}** | ` +
      `0 个；未触碰国考分片 ${num(nationalFiles.length)} 个 |`
  );
  md.push(
    `| 越界到其他省 \`provincial-*\` | **${ok(plan.changed.filter(n => n.startsWith('provincial-') && !n.startsWith(TARGET_PREFIX)).length === 0)}** | ` +
      `0 个；未触碰其他省分片 ${num(otherProvinces.length)} 个 |`
  );
  md.push(
    `| 变更清单重复文件 | **${ok(plan.changedDupes.length === 0)}** | ${num(plan.changedDupes.length)} 个 |`
  );
  md.push(
    `| 未触碰分片混入${PROVINCE} | **${ok(plan.others.filter(n => n.startsWith(TARGET_PREFIX)).length === 0)}** | ` +
      `0 个（旧${PROVINCE}分片已全部进入替换 / 删除 / 保留清单） |`
  );
  md.push(
    `| 旧分片 ID 前缀 \`${OLD_ID_PREFIX}*\` | **${ok([...plan.oldIds].every(id => id.startsWith(OLD_ID_PREFIX)))}** | ` +
      `${num(plan.oldIds.size)} 个唯一 ID |`
  );
  md.push('');
  md.push(
    `> 国考 / 其他省文件仅参与 \`index.json\` / \`idMap.json\` 全量重建，题目内容不写不改：` +
      `${num(nationalFiles.length)} 个国考分片 + ${num(otherProvinces.length)} 个其他省分片，合计 ${num(plan.othersCount)} 题。`
  );
  md.push('');
  md.push('### 0.2 覆盖 / 新增 / 删除对账');
  md.push('');
  md.push('| 项目 | 文件数 | 题数 |');
  md.push('|---|---:|---:|');
  md.push(`| 覆盖同名旧${PROVINCE}分片 | ${num(plan.overwrite.length)} | ${num(overwriteNew)} 新 / ${num(overwriteOld)} 旧 |`);
  md.push(`| 新增${PROVINCE}分片 | ${num(plan.add.length)} | ${num(addNew)} |`);
  md.push(`| 删除多余旧${PROVINCE}分片 | ${num(plan.stale.length)} | ${num(staleOld)} |`);
  md.push(`| 保留 v2 未覆盖的旧主观题分片 | ${num(plan.kept.length)} | ${num(plan.keptTotal)} |`);
  md.push(`| 未触碰（国考 / 其他省） | ${num(plan.others.length)} | ${num(plan.othersCount)} |`);
  md.push(`| 合并前线上合计 | ${num(plan.beforeFiles)} | ${num(plan.beforeTotal)} |`);
  md.push(`| 合并后（实际分片推演） | ${num(projected.files)} | ${num(projected.totalQuestions)} |`);
  md.push('');
  md.push('守恒校验：');
  md.push('');
  md.push(
    `- 文件数：\`${num(plan.beforeFiles)} - ${num(plan.overwrite.length + plan.stale.length)} + ${num(plan.src.length)} = ${num(projectedExpectedFiles)}\`，` +
      `推演值 ${num(projected.files)} → **${ok(projected.files === projectedExpectedFiles)}**`
  );
  md.push(
    `- 题目数：\`${num(plan.beforeTotal)} - ${num(plan.oldTotal)} + ${num(EXPECTED_SRC_TOTAL)} = ${num(expectedTotal)}\`，` +
      `推演值 ${num(projected.totalQuestions)} → **${ok(projected.totalQuestions === expectedTotal)}**`
  );
  md.push(
    `- 覆盖 / 删除 / 保留去重：旧${PROVINCE} ${num(plan.dstProvince.length)} 个分片 = 覆盖 ${num(plan.overwrite.length)} + 删除 ${num(plan.stale.length)} + 保留 ${num(plan.kept.length)} → ` +
      `**${ok(plan.dstProvince.length === plan.overwrite.length + plan.stale.length + plan.kept.length)}**`
  );
  md.push('');
  md.push(`### 0.3 总数守恒（定值 ${num(EXPECTED_SRC_TOTAL)}）`);
  md.push('');
  md.push(
    `- 合并后总题数 = 当前 ${num(plan.beforeTotal)} − 旧${PROVINCE} ${num(plan.oldTotal)} + 新${PROVINCE} **${num(EXPECTED_SRC_TOTAL)}** = ` +
      `**${num(expectedTotal)}**；推演结果 **${num(projected.totalQuestions)}**，` +
      `${projected.totalQuestions === expectedTotal ? '一致 ✅' : '不一致 ❌'}`
  );
  md.push(
    `- 源目录分片 ${num(plan.src.length)} 个 / 题目 ${num(plan.srcQuestions.length)} 题；` +
      `与账本定值 ${num(EXPECTED_SRC_TOTAL)} 一致：**${ok(plan.srcQuestions.length === EXPECTED_SRC_TOTAL)}**`
  );
  if (plan.kept.length) {
    md.push(
      `- 旧主观题 ${num(plan.keptTotal)} 题（${plan.kept.join('、')}）不参与增减，` +
        '原样保留在合并后总数中。'
    );
  } else if (DROP_UNCOVERED && subjectiveOld) {
    md.push(
      `- \`--drop-uncovered\` 已把旧主观题 ${num(subjectiveOld)} 题计入“删除多余旧分片”，不再保留。`
    );
  }
  md.push('');
  md.push('## 1. 变更清单');
  md.push('');
  md.push('| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |');
  md.push('|---|---:|---:|---:|---|');
  md.push(`| 覆盖同名旧${PROVINCE}分片 | ${plan.overwrite.length} | ${num(overwriteOld)} | ${num(overwriteNew)} | 同名文件直接替换 |`);
  md.push(`| 新增${PROVINCE}分片 | ${plan.add.length} | 0 | ${num(addNew)} | v2 分片更细，旧目录没有同名文件 |`);
  md.push(`| 删除多余旧${PROVINCE}分片 | ${plan.stale.length} | ${num(staleOld)} | 0 | 旧分片名没有对应新分片，不删会残留旧题 |`);
  md.push(
    `| 保留旧主观题分片 | ${plan.kept.length} | ${num(plan.keptTotal)} | 0 | v2 未覆盖 shenlun / gongji，不删不改 |`
  );
  md.push(`| 未触碰（国考 / 其他省） | ${plan.others.length} | ${num(plan.othersCount)} | ${num(plan.othersCount)} | 文件与题目均保持 |`);
  md.push('');
  md.push(
    `源分片合计 **${plan.src.length}** 个 / **${num(plan.srcQuestions.length)}** 道题；` +
      `旧${PROVINCE}分片 **${plan.dstProvince.length}** 个 / **${num(plan.oldTotal + plan.keptTotal)}** 道题` +
      `（替换 ${num(plan.oldTotal)} + 保留 ${num(plan.keptTotal)}）。`
  );
  md.push('');
  md.push('### 1.1 分片替换清单');
  md.push('');
  md.push('| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |');
  md.push('|---|---|---:|---:|---|');
  for (const s of plan.src) {
    const oldCount = plan.oldCounts.get(s.target);
    md.push(
      `| \`${s.name}\` | \`${s.target}\` | ${oldCount === undefined ? '—' : num(oldCount)} | ` +
        `${num(s.count)} | ${oldCount === undefined ? '新增' : '覆盖'} |`
    );
  }
  md.push('');
  if (plan.stale.length) {
    md.push(`### 1.2 待删除的多余旧${PROVINCE}分片`);
    md.push('');
    md.push('| 文件 | 题目数 | 模块 |');
    md.push('|---|---:|---|');
    for (const n of plan.stale) {
      md.push(`| \`${n}\` | ${num(plan.oldCounts.get(n) || 0)} | ${parseShardName(n)?.module || '?'} |`);
    }
    md.push('');
  }
  if (plan.kept.length) {
    md.push('### 1.3 保留的旧主观题分片（v2 未覆盖）');
    md.push('');
    md.push('| 文件 | 题目数 | 处理 |');
    md.push('|---|---:|---|');
    for (const n of plan.kept) {
      md.push(`| \`${n}\` | ${num(plan.oldCounts.get(n) || 0)} | 不删不改，仅重建 index / idMap |`);
    }
    md.push('');
  }

  md.push('## 2. 波及范围');
  md.push('');
  md.push('| 指标 | 合并前 | 合并后 | 变化 |');
  md.push('|---|---:|---:|---:|');
  md.push(`| 总题目数 | ${num(plan.beforeTotal)} | ${num(projected.totalQuestions)} | ${signed(projected.totalQuestions - plan.beforeTotal)} |`);
  md.push(`| 分片文件数 | ${num(plan.beforeFiles)} | ${num(projected.files)} | ${signed(projected.files - plan.beforeFiles)} |`);
  md.push(`| ${PROVINCE}分片数 | ${num(plan.dstProvince.length)} | ${num(plan.src.length + plan.kept.length)} | ${signed(plan.src.length + plan.kept.length - plan.dstProvince.length)} |`);
  md.push(`| ${PROVINCE}题目数 | ${num(plan.oldTotal + plan.keptTotal)} | ${num(plan.srcQuestions.length + plan.keptTotal)} | ${signed(plan.srcQuestions.length - plan.oldTotal)} |`);
  md.push(`| 其中保留的旧主观题 | ${num(plan.keptTotal)} | ${num(plan.keptTotal)} | 0 |`);
  md.push(`| ${PROVINCE} index key 数 | ${num(oldKeys.size)} | ${num(newKeys.size)} | ${signed(newKeys.size - oldKeys.size)} |`);
  md.push(`| 未触碰分片 / 题目 | ${num(plan.others.length)} / ${num(plan.othersCount)} | ${num(plan.others.length)} / ${num(plan.othersCount)} | 0 |`);
  md.push(`| index key 总数 | ${num(plan.currentIndexKeyCount)} | ${num(projected.keyCount)} | ${signed(projected.keyCount - plan.currentIndexKeyCount)} |`);
  md.push(`| idMap 条目数 | ${num(plan.currentIdMapCount)} | ${num(projected.idCount)} | ${signed(projected.idCount - plan.currentIdMapCount)} |`);
  md.push('');
  md.push(
    `**影响面**：只替换 \`${TARGET_PREFIX}*\` 分片；国考 \`national-*\` 与其他省 \`provincial-*\` 文件不删不改，` +
      '但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。'
  );
  md.push('');
  md.push('## 3. idMap 重建');
  md.push('');
  md.push('| 项目 | 条目数 | 说明 |');
  md.push('|---|---:|---|');
  md.push(`| 当前 idMap | ${num(plan.currentIdMapCount)} | 合并前线上反查表 |`);
  md.push(`| 删除旧${PROVINCE} ID | ${num(removedOldIds)} | 旧前缀 \`${OLD_ID_PREFIX}*\`；不做映射 |`);
  md.push(`| 保留旧主观题 ID | ${num(plan.keptIds.size)} | 旧前缀 \`${OLD_ID_PREFIX}*\`，继续留在 idMap |`);
  md.push(`| 新增新${PROVINCE} ID | ${num(plan.newIdSet.size)} | 新前缀 \`${NEW_ID_PREFIX}*\` |`);
  md.push(`| 合并后 idMap | ${num(projected.idCount)} | 按实际分片全量重建 |`);
  md.push('');
  md.push(
    `- 旧${PROVINCE} ID 仍被其他分片引用：**${num(plan.oldIdsStillUsed.length)}**` +
      `${plan.oldIdsStillUsed.length ? `（${plan.oldIdsStillUsed.slice(0, 10).join(', ')}…）` : ''}`
  );
  md.push(`- 新旧${PROVINCE} ID 交集：**${num(plan.oldNewOverlap.length)}**`);
  md.push(`- 新 ID 与保留的旧主观题 ID 交集：**${num(plan.keptNewOverlap.length)}**`);
  md.push(
    `- 旧${PROVINCE} ${num(plan.oldTotal)} 题对应 ${num(plan.oldIds.size)} 个唯一 ID` +
      `（旧数据内部重复 ${num(oldDuplicateIds)} 条）；因此 idMap 净增 ` +
      `${num(plan.newIdSet.size)} - ${num(removedOldIds)} = ${signed(projected.idCount - plan.currentIdMapCount)}。`
  );
  md.push(`- 重建方式：扫描合并后目录内全部分片，不只做${PROVINCE}增量；国考 / 其他省 ID 一并写入。`);
  md.push('');
  md.push('## 4. 一致性检查（国考同款三项）');
  md.push('');
  md.push('| # | 检查 | 结果 | 说明 |');
  md.push('|---|---|---|---|');
  md.push(
    `| 1 | index 引用的分片都存在 | **${projected.indexOk ? '通过' : '失败'}** | ` +
      `${num(projected.files)} 个分片，引用无悬空 |`
  );
  md.push(
    `| 2 | index 未遗漏 / 未多引分片 | **${projected.indexExact ? '通过' : '失败'}** | ` +
      `${num(projected.keyCount)} 个 key 精确覆盖 ${num(projected.files)} 个实际分片 |`
  );
  md.push(
    `| 3 | idMap 覆盖全部题目 ID | **${projected.idMapOk ? '通过' : '失败'}** | ` +
      `${num(projected.idCount)} 个 ID 均可反查到存在的分片 |`
  );
  md.push('');
  md.push('补充预检：');
  md.push('');
  md.push(`- 新分片内部重复 ID：**${num(plan.dupInSource.length)}**`);
  md.push(`- 新分片与未触碰分片 ID 冲突：**${num(plan.collisions.length)}**`);
  md.push(`- 新旧${PROVINCE} ID 交集：**${num(plan.oldNewOverlap.length)}**`);
  md.push(`- 新 ID 与保留的旧主观题 ID 交集：**${num(plan.keptNewOverlap.length)}**`);
  md.push(`- 源 index 覆盖：**${plan.src.length}/${plan.src.length}**`);
  md.push(`- 源 \`questions.json\` 与分片一致：**是**（${num(plan.srcQuestions.length)} 题）`);
  md.push(`- 目标分片名可被 loader 解析：**是**（全部为 \`provincial-${PROVINCE}-*\`）`);
  md.push('');
  md.push('## 5. 前端可渲染性预检');
  md.push('');
  md.push('口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。');
  md.push('');
  md.push('| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  const renderRow = (label, r) =>
    `| ${label} | ${num(r.total)} | ${num(r.ok)} | ${pct(r.ok, r.total)} | ${num(r.image)} | ` +
    `${num(r.noStem)} | ${num(r.tooFewOptions)} | ${num(r.emptyOptionText)} |`;
  md.push(renderRow(`${PROVINCE}旧数据（被替换 / 删除部分）`, oldRender));
  md.push(renderRow(`${PROVINCE}新数据（v2）`, newRender));
  md.push(renderRow(`${PROVINCE}保留的旧主观题（不变）`, keptRender));
  md.push(renderRow('全库（合并后）', finalRender));
  md.push('');
  md.push(
    `${PROVINCE}可渲染题数（被替换部分）：**${num(oldRender.ok)} → ${num(newRender.ok)}**（${signed(newRender.ok - oldRender.ok)}）；` +
      `图片题占位：${num(oldRender.image)} → ${num(newRender.image)}；保留主观题 ${num(keptRender.ok)} 题可渲染。`
  );
  md.push('');
  md.push('### 5.1 文本空格残留（提示，不阻塞）');
  md.push('');
  md.push(
    `- 旧数据（被替换 / 删除部分）：${num(spaceOld.hits)} / ${num(plan.oldTotal)} 题在中文标点旁残留空格。`
  );
  md.push(
    `- v2 新数据：**${num(spaceNew.hits)} / ${num(plan.srcQuestions.length)}** 题` +
      `（${pct(spaceNew.hits, plan.srcQuestions.length)}）在中文标点旁残留空格。`
  );
  if (spaceNew.sample) md.push(`- 示例：\`${spaceNew.sample}\``);
  md.push('- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。');
  md.push('');
  md.push('## 6. ID 策略（A1：不迁移）');
  md.push('');
  md.push(`- 旧${PROVINCE} ID：\`${OLD_ID_PREFIX}*\`，被替换 / 删除分片共 ${num(plan.oldIds.size)} 个唯一 ID，退出 idMap ${num(removedOldIds)} 个。`);
  if (plan.kept.length) {
    md.push(
      `- 保留的旧主观题 ID：${num(plan.keptIds.size)} 个（${plan.kept.join('、')}），继续留在 idMap。`
    );
  }
  md.push(`- 新${PROVINCE} ID：\`${NEW_ID_PREFIX}*\`，共 ${num(plan.newIdSet.size)} 个，写入 idMap。`);
  md.push(
    `- 新旧 ID 交集：**${num(plan.oldNewOverlap.length)}**；` +
      (plan.oldNewOverlap.length ? '存在交集，apply 会拒绝写入。' : '**不做一一映射、不做错题记录迁移**。')
  );
  md.push(
    `- 错题本 / 复习 / 知识点筛选按 \`idMap.json\` 反查；被替换的 ${num(removedOldIds)} 个旧 ID 不再命中，` +
      `保留的 ${num(plan.keptIds.size)} 个主观题 ID 仍可命中。`
  );
  md.push('- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。');
  md.push('');
  md.push('## 7. 执行计划');
  md.push('');
  md.push('```powershell');
  md.push(`node scripts/publish-merge-provinces.cjs --province ${PROVINCE} --drop-uncovered          # dry-run（本报告）`);
  md.push(`node scripts/publish-merge-provinces.cjs --province ${PROVINCE} --apply --drop-uncovered  # 审核通过后执行`);
  md.push('node scripts/verify-question-loading.cjs');
  md.push('npm run build');
  md.push('```');
  md.push('');
  md.push(
    `- \`--apply\` 执行顺序：删除多余旧${PROVINCE}分片 → 复制 ${plan.src.length} 个新分片` +
      `（映射为 \`provincial-${PROVINCE}-*\`）→ 全量重建 \`index.json\` / \`idMap.json\`。`
  );
  md.push('- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。');
  md.push(
    '- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），' +
      '旧分片与 `index.json` / `idMap.json` 均在版本库中。'
  );
  md.push('- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。');
  md.push('- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。');
  md.push('');
  if (!APPLY) {
    md.push('> 当前为 dry-run：未改动 `public/data/questions/` 中任何题目数据。确认本报告后再加 `--apply`。');
    md.push('');
  }
  return md.join('\n');
}

/* ------------------------------------------------------------------ */
/* 汇总与执行                                                          */
/* ------------------------------------------------------------------ */

/** 对一组分片做统计；readFn(name) 返回该分片的题目数组 */
function summarize(names, readFn) {
  const questions = [];
  for (const name of names) {
    for (const q of readFn(name)) questions.push(q);
  }

  const index = buildIndex(names);
  const idMap = {};
  const seen = new Set();
  for (const name of names) {
    for (const q of readFn(name)) {
      const id = String(q?.id ?? '').trim();
      if (!id) continue;
      seen.add(id);
      if (!idMap[id]) idMap[id] = [];
      if (!idMap[id].includes(name)) idMap[id].push(name);
    }
  }

  const referenced = new Set(Object.values(index).flat());
  const indexOk = [...referenced].every(name => names.includes(name));
  const indexExact = referenced.size === names.length && names.every(name => referenced.has(name));
  const idMapOk =
    seen.size === Object.keys(idMap).length &&
    [...seen].every(id => Array.isArray(idMap[id]) && idMap[id].length > 0 && idMap[id].every(n => names.includes(n)));

  return {
    files: names.length,
    totalQuestions: questions.length,
    keyCount: Object.keys(index).length,
    idCount: seen.size,
    render: renderStats(questions),
    indexOk,
    indexExact,
    idMapOk,
  };
}

function applyPlan(plan, projected) {
  for (const name of plan.stale) {
    fs.unlinkSync(path.join(DST, name));
  }
  for (const s of plan.src) {
    fs.copyFileSync(path.join(SRC, s.name), path.join(DST, s.target));
  }

  const names = listShards(DST);
  fs.writeFileSync(path.join(DST, 'index.json'), JSON.stringify(buildIndex(names)), 'utf8');
  fs.writeFileSync(path.join(DST, 'idMap.json'), JSON.stringify(buildIdMap(DST, names)), 'utf8');

  const final = summarize(names, name => readShard(DST, name));

  const leftovers = names.filter(
    n => n.startsWith(TARGET_PREFIX) && !plan.srcTargets.has(n) && !plan.keptSet.has(n)
  );
  if (leftovers.length) fail(`写入后仍残留旧${PROVINCE}分片：${leftovers.join(', ')}`);
  if (final.files !== projected.files) {
    fail(`写入后分片数不一致（预期 ${projected.files}，实际 ${final.files}）`);
  }
  if (final.totalQuestions !== projected.totalQuestions) {
    fail(`写入后题目数不一致（预期 ${projected.totalQuestions}，实际 ${final.totalQuestions}）`);
  }
  if (final.idCount !== projected.idCount) {
    fail(`写入后 idMap 条目数不一致（预期 ${projected.idCount}，实际 ${final.idCount}）`);
  }
  if (!final.indexOk || !final.indexExact || !final.idMapOk) {
    fail('写入后索引自检失败，请用备份或 git 回滚 public/data/questions/');
  }
  return final;
}

function main() {
  const plan = buildPlan();
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });

  const srcByTarget = new Map(plan.src.map(s => [s.target, s]));
  const projectedNames = [...plan.others, ...plan.kept, ...plan.src.map(s => s.target)];
  const projected = summarize(projectedNames, name => {
    const s = srcByTarget.get(name);
    return s ? readShard(SRC, s.name) : readShard(DST, name);
  });

  const blockers = [];
  if (plan.srcQuestions.length !== EXPECTED_SRC_TOTAL) {
    blockers.push(`源题数 ${plan.srcQuestions.length} ≠ 定值 ${EXPECTED_SRC_TOTAL}`);
  }
  if (plan.changedOutOfScope.length) {
    blockers.push(`变更越界 ${plan.changedOutOfScope.length} 个文件`);
  }
  if (plan.changedDupes.length) blockers.push(`变更清单重复 ${plan.changedDupes.length} 个文件`);
  if (plan.dupInSource.length) blockers.push(`新分片内部重复 ID ${plan.dupInSource.length}`);
  if (plan.collisions.length) blockers.push(`与未触碰分片 ID 冲突 ${plan.collisions.length}`);
  if (plan.oldNewOverlap.length) blockers.push(`新旧${PROVINCE} ID 交集 ${plan.oldNewOverlap.length}`);
  if (plan.keptNewOverlap.length) blockers.push(`新 ID 与保留主观题 ID 交集 ${plan.keptNewOverlap.length}`);
  if (!projected.indexOk) blockers.push('index 存在悬空引用');
  if (!projected.indexExact) blockers.push('index 未精确覆盖分片');
  if (!projected.idMapOk) blockers.push('idMap 未覆盖全部 ID');
  if (projected.totalQuestions !== plan.beforeTotal - plan.oldTotal + EXPECTED_SRC_TOTAL) {
    blockers.push(`合并前后题目数不守恒（应为 当前 − 被替换旧${PROVINCE} + ${num(EXPECTED_SRC_TOTAL)}）`);
  }
  if (projected.files !== plan.others.length + plan.kept.length + plan.src.length) {
    blockers.push('合并前后分片数不守恒');
  }

  console.log(`${TAG} mode=${APPLY ? 'APPLY' : 'dry-run'} province=${PROVINCE}`);
  console.log(`  源分片 ${plan.src.length} / ${plan.srcQuestions.length} 题`);
  console.log(
    `  覆盖同名 ${plan.overwrite.length}、新增 ${plan.add.length}、删除旧分片 ${plan.stale.length}` +
      `（旧题 ${plan.stale.reduce((n, name) => n + (plan.oldCounts.get(name) || 0), 0)} 道）、` +
      `保留旧主观题 ${plan.kept.length} 个 / ${plan.keptTotal} 题、未触碰 ${plan.others.length}`
  );
  console.log(
    `  合并后：${projected.files} 文件 / ${projected.totalQuestions} 题 / ` +
      `index ${projected.keyCount} keys / idMap ${projected.idCount} 条`
  );
  console.log(
    `  ${PROVINCE}：${plan.dstProvince.length} 文件 ${plan.oldTotal + plan.keptTotal} 题 → ` +
      `${plan.src.length + plan.kept.length} 文件 ${plan.srcQuestions.length + plan.keptTotal} 题`
  );
  console.log(
    `  可渲染 ${projected.render.ok}（图片题占位 ${projected.render.image}，主观题 ${projected.render.subjective}）；` +
      `跳过 空题干 ${projected.render.noStem} / 选项不足 ${projected.render.tooFewOptions} / 空选项文本 ${projected.render.emptyOptionText}`
  );
  console.log(
    `  一致性：index ${projected.indexOk && projected.indexExact ? 'OK' : 'FAIL'}，` +
      `idMap ${projected.idMapOk ? 'OK' : 'FAIL'}`
  );
  const expectedTotal = plan.beforeTotal - plan.oldTotal + EXPECTED_SRC_TOTAL;
  const replacedFiles = plan.overwrite.length + plan.stale.length;
  console.log(
    `  三项对账：越界 ${plan.changedOutOfScope.length === 0 ? 'OK' : 'FAIL'}（变更 ${plan.changed.length} 个文件）；` +
      `增减 ${plan.beforeFiles} − ${replacedFiles} + ${plan.src.length} = ${projected.files} ` +
      `${projected.files === plan.beforeFiles - replacedFiles + plan.src.length ? 'OK' : 'FAIL'}；` +
      `总数 ${plan.beforeTotal} − ${plan.oldTotal} + ${EXPECTED_SRC_TOTAL} = ${expectedTotal} ` +
      `${projected.totalQuestions === expectedTotal ? 'OK' : 'FAIL'}`
  );

  if (APPLY && blockers.length) {
    fail(`存在阻塞项：${blockers.join('；')}，拒绝写入`);
  }

  const final = APPLY ? applyPlan(plan, projected) : projected;
  fs.writeFileSync(REPORT, buildReport(plan, final), 'utf8');
  if (APPLY) {
    console.log(`${TAG} 已写入 ${plan.src.length} 个${PROVINCE}分片，并重建 index.json / idMap.json`);
  }
  console.log(`  报告：${path.relative(ROOT, REPORT)}`);
  if (!APPLY) {
    if (blockers.length) console.log(`  警告：存在阻塞项，不可直接 apply：${blockers.join('；')}`);
    console.log('  这是 dry-run，未改动任何题目数据。确认无误后加 --apply。');
  }
}

main();
