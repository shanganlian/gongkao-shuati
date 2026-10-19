#!/usr/bin/env node
/**
 * publish-merge-zhejiang.cjs —— 方案 A：把浙江 v2 分片合并进线上数据目录
 *
 * 与 publish-merge-v2.cjs（国考）同构：
 *   1) 读取 public/data/questions-v2-provincial/浙江/ 的 zhejiang-none-*.json；
 *   2) 映射为前端可识别的 provincial-浙江-<module>-<chunk>.json；
 *   3) 覆盖 public/data/questions/ 下同名旧浙江分片，删除多余旧浙江分片；
 *   4) 按目录内实际文件全量重建 index.json 与 idMap.json（覆盖国考 / 其他省数据）；
 *   5) 执行 index 引用、index 精确覆盖、idMap 覆盖三项一致性检查。
 *
 * 源分片名 zhejiang-none-* 不符合 loader 的 <category>-<province>-<module> 解析规则，
 * 直接并入会导致浙江分类加载不到，因此 publish 时必须改名为 provincial-浙江-*。
 *
 * 用法：
 *   node scripts/publish-merge-zhejiang.cjs            # dry-run：只写 guokao-reports/publish-zhejiang-plan.md
 *   node scripts/publish-merge-zhejiang.cjs --apply    # 真正合并并重建索引
 *
 * 退出码：0 成功；1 前置检查失败（失败时不会写任何题目数据）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.PUBLISH_ROOT
  ? path.resolve(process.env.PUBLISH_ROOT)
  : path.resolve(__dirname, '..');
const PROVINCE = '浙江';
const TARGET_PREFIX = `provincial-${PROVINCE}-`;
const SRC = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', PROVINCE);
const DST = path.join(ROOT, 'public', 'data', 'questions');
const REPORT = path.join(ROOT, 'guokao-reports', 'publish-zhejiang-plan.md');
const APPLY = process.argv.includes('--apply');

/** 主观题模块：允许无选项 */
const SUBJECTIVE = new Set(['shenlun', 'gongji']);
/** 源分片命名：zhejiang-none-<module>-<chunk>.json */
const SOURCE_RE = /^zhejiang-none-([a-z]+)-(\d+)\.json$/;
/** 目标分片命名：<category>-<province>-<module>-<chunk>.json */
const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;
const SPECIAL_FILES = new Set(['index.json', 'idMap.json', 'questions.json']);

function fail(msg) {
  console.error(`[publish-zj] 前置检查失败：${msg}`);
  process.exit(1);
}

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
    subjective: 0,
    noStem: 0,
    tooFewOptions: 0,
    emptyOptionText: 0,
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
  if (!sourceShards.length) fail('questions-v2-provincial 下没有 zhejiang-none-*.json');

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
  for (const s of src) {
    const questions = readShard(SRC, s.name);
    s.count = questions.length;
    for (const q of questions) {
      const id = String(q?.id ?? '').trim();
      if (!id) fail(`${s.name} 存在空题目 ID`);
      if (newIdSet.has(id)) dupInSource.push(id);
      newIdSet.add(id);
      if (q?.category !== 'provincial') {
        fail(`${s.name} 题目 ${id} 的 category 不是 provincial：${q?.category}`);
      }
      if (q?.province !== PROVINCE) {
        fail(`${s.name} 题目 ${id} 的 province 不是 ${PROVINCE}：${q?.province}`);
      }
      if (q?.module !== s.module) {
        fail(`${s.name} 题目 ${id} 的 module 与文件名不一致：${q?.module} != ${s.module}`);
      }
      srcQuestions.push(q);
    }
  }

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

  const dstAll = listShards(DST);
  const dstZhejiang = dstAll.filter(n => n.startsWith(TARGET_PREFIX));
  const others = dstAll.filter(n => !n.startsWith(TARGET_PREFIX));
  const dstZhejiangSet = new Set(dstZhejiang);

  const overwrite = src.filter(s => dstZhejiangSet.has(s.target));
  const add = src.filter(s => !dstZhejiangSet.has(s.target));
  const stale = dstZhejiang.filter(n => !targetSeen.has(n));

  const oldCounts = new Map();
  const oldQuestions = [];
  let oldTotal = 0;
  for (const name of dstZhejiang) {
    const questions = readShard(DST, name);
    oldCounts.set(name, questions.length);
    oldTotal += questions.length;
    oldQuestions.push(...questions);
  }

  const oldIds = new Set();
  for (const q of oldQuestions) {
    const id = String(q?.id ?? '').trim();
    if (id) oldIds.add(id);
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
  const oldIdsStillUsed = [...oldIds].filter(id => otherIds.has(id));

  const currentIndex = readJson(DST, 'index.json');
  const currentIdMap = readJson(DST, 'idMap.json');

  return {
    src,
    srcQuestions,
    srcTargets: targetSeen,
    dstZhejiang,
    others,
    overwrite,
    add,
    stale,
    oldCounts,
    oldQuestions,
    oldTotal,
    oldIds,
    oldIdsStillUsed,
    othersCount,
    dupInSource,
    newIdSet,
    collisions,
    oldNewOverlap,
    currentIndexKeyCount: Object.keys(currentIndex).length,
    currentIdMapCount: Object.keys(currentIdMap).length,
    beforeTotal: othersCount + oldTotal,
    beforeFiles: others.length + dstZhejiang.length,
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
  const oldKeys = new Set(plan.dstZhejiang.map(n => parseShardName(n)?.key).filter(Boolean));
  const newKeys = new Set(plan.src.map(s => parseShardName(s.target)?.key).filter(Boolean));
  const removedOldIds = plan.oldIds.size - plan.oldIdsStillUsed.length;
  const oldDuplicateIds = plan.oldTotal - plan.oldIds.size;
  const newRender = renderStats(plan.srcQuestions);
  const oldRender = renderStats(plan.oldQuestions);
  const finalRender = projected.render;

  md.push('# 浙江 publish 合并计划（方案 A：并入 /data/questions/）');
  md.push('');
  md.push(`- 模式：**${APPLY ? 'APPLIED（已写入）' : 'dry-run（未写入）'}**`);
  md.push(`- 生成时间：${new Date().toISOString()}`);
  md.push('- 源目录：`public/data/questions-v2-provincial/浙江/`（ID 前缀 `prov-zhejiang-`）');
  md.push('- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧浙江）');
  md.push('- 分片映射：`zhejiang-none-<module>-<chunk>.json` → `provincial-浙江-<module>-<chunk>.json`');
  md.push('');
  md.push('> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。');
  md.push('> 源分片名 `zhejiang-none-*` 会被解析成 `zhejiang / none / *`，浙江分类无法命中，');
  md.push('> 因此 publish 必须改名为 `provincial-浙江-*`；题目 ID 保持 `prov-zhejiang-*` 不变。');
  md.push('');
  md.push('## 1. 变更清单');
  md.push('');
  md.push('| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |');
  md.push('|---|---:|---:|---:|---|');
  md.push(`| 覆盖同名旧浙江分片 | ${plan.overwrite.length} | ${num(overwriteOld)} | ${num(overwriteNew)} | 同名文件直接替换 |`);
  md.push(`| 新增浙江分片 | ${plan.add.length} | 0 | ${num(addNew)} | v2 分片更细，旧目录没有同名文件 |`);
  md.push(`| 删除多余旧浙江分片 | ${plan.stale.length} | ${num(staleOld)} | 0 | 旧分片名没有对应新分片，不删会残留旧题 |`);
  md.push(`| 未触碰（国考 / 其他省） | ${plan.others.length} | ${num(plan.othersCount)} | ${num(plan.othersCount)} | 文件与题目均保持 |`);
  md.push('');
  md.push(
    `源分片合计 **${plan.src.length}** 个 / **${num(plan.srcQuestions.length)}** 道题；` +
      `旧浙江分片 **${plan.dstZhejiang.length}** 个 / **${num(plan.oldTotal)}** 道题。`
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
    md.push('### 1.2 待删除的多余旧浙江分片');
    md.push('');
    md.push('| 文件 | 题目数 |');
    md.push('|---|---:|');
    for (const n of plan.stale) md.push(`| \`${n}\` | ${num(plan.oldCounts.get(n) || 0)} |`);
    md.push('');
  }

  md.push('## 2. 波及范围');
  md.push('');
  md.push('| 指标 | 合并前 | 合并后 | 变化 |');
  md.push('|---|---:|---:|---:|');
  md.push(`| 总题目数 | ${num(plan.beforeTotal)} | ${num(projected.totalQuestions)} | ${signed(projected.totalQuestions - plan.beforeTotal)} |`);
  md.push(`| 分片文件数 | ${num(plan.beforeFiles)} | ${num(projected.files)} | ${signed(projected.files - plan.beforeFiles)} |`);
  md.push(`| 浙江分片数 | ${num(plan.dstZhejiang.length)} | ${num(plan.src.length)} | ${signed(plan.src.length - plan.dstZhejiang.length)} |`);
  md.push(`| 浙江题目数 | ${num(plan.oldTotal)} | ${num(plan.srcQuestions.length)} | ${signed(plan.srcQuestions.length - plan.oldTotal)} |`);
  md.push(`| 浙江 index key 数 | ${num(oldKeys.size)} | ${num(newKeys.size)} | ${signed(newKeys.size - oldKeys.size)} |`);
  md.push(`| 未触碰分片 / 题目 | ${num(plan.others.length)} / ${num(plan.othersCount)} | ${num(plan.others.length)} / ${num(plan.othersCount)} | 0 |`);
  md.push(`| index key 总数 | ${num(plan.currentIndexKeyCount)} | ${num(projected.keyCount)} | ${signed(projected.keyCount - plan.currentIndexKeyCount)} |`);
  md.push(`| idMap 条目数 | ${num(plan.currentIdMapCount)} | ${num(projected.idCount)} | ${signed(projected.idCount - plan.currentIdMapCount)} |`);
  md.push('');
  md.push(
    '**影响面**：只替换 `provincial-浙江-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，' +
      '但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。'
  );
  md.push('');
  md.push('## 3. idMap 重建');
  md.push('');
  md.push('| 项目 | 条目数 | 说明 |');
  md.push('|---|---:|---|');
  md.push(`| 当前 idMap | ${num(plan.currentIdMapCount)} | 合并前线上反查表 |`);
  md.push(`| 删除旧浙江 ID | ${num(removedOldIds)} | 旧前缀 \`prov-浙江-*\`；不做映射 |`);
  md.push(`| 新增新浙江 ID | ${num(plan.newIdSet.size)} | 新前缀 \`prov-zhejiang-*\` |`);
  md.push(`| 合并后 idMap | ${num(projected.idCount)} | 按实际分片全量重建 |`);
  md.push('');
  md.push(`- 旧浙江 ID 仍被其他分片引用：**${num(plan.oldIdsStillUsed.length)}**` +
    `${plan.oldIdsStillUsed.length ? `（${plan.oldIdsStillUsed.slice(0, 10).join(', ')}…）` : ''}`
  );
  md.push(`- 新旧浙江 ID 交集：**${num(plan.oldNewOverlap.length)}**`);
  md.push(
    `- 旧浙江 ${num(plan.oldTotal)} 题对应 ${num(plan.oldIds.size)} 个唯一 ID` +
      `（旧数据内部重复 ${num(oldDuplicateIds)} 条）；因此 idMap 净增 ` +
      `${num(plan.newIdSet.size)} - ${num(removedOldIds)} = ${signed(projected.idCount - plan.currentIdMapCount)}。`
  );
  md.push('- 重建方式：扫描合并后目录内全部分片，不只做浙江增量；国考 / 其他省 ID 一并写入。');
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
  md.push(`- 新旧浙江 ID 交集：**${num(plan.oldNewOverlap.length)}**`);
  md.push(`- 源 index 覆盖：**${plan.src.length}/${plan.src.length}**`);
  md.push(`- 源 \`questions.json\` 与分片一致：**是**（${num(plan.srcQuestions.length)} 题）`);
  md.push(`- 目标分片名可被 loader 解析：**是**（全部为 \`provincial-浙江-*\`）`);
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
  md.push(renderRow('浙江旧数据（替换前）', oldRender));
  md.push(renderRow('浙江新数据（替换后）', newRender));
  md.push(renderRow('全库（合并后）', finalRender));
  md.push('');
  md.push(
    `浙江可渲染题数：**${num(oldRender.ok)} → ${num(newRender.ok)}**（${signed(newRender.ok - oldRender.ok)}）；` +
      `图片题占位：${num(oldRender.image)} → ${num(newRender.image)}。`
  );
  md.push('');
  md.push('## 6. ID 策略（A1：不迁移）');
  md.push('');
  md.push(`- 旧浙江 ID：\`prov-浙江-*\`，共 ${num(plan.oldIds.size)} 条，退出 idMap ${num(removedOldIds)} 条。`);
  md.push(`- 新浙江 ID：\`prov-zhejiang-*\`，共 ${num(plan.newIdSet.size)} 条，写入 idMap。`);
  md.push(
    `- 新旧 ID 交集：**${num(plan.oldNewOverlap.length)}**；` +
      (plan.oldNewOverlap.length ? '存在交集，apply 会拒绝写入。' : '**不做一一映射、不做错题记录迁移**。')
  );
  md.push('- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；旧 ID 不再命中，属预期行为。');
  md.push('- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。');
  md.push('');
  md.push('## 7. 执行计划');
  md.push('');
  md.push('```powershell');
  md.push('node scripts/publish-merge-zhejiang.cjs            # dry-run（本报告）');
  md.push('node scripts/publish-merge-zhejiang.cjs --apply    # 审核通过后执行');
  md.push('node scripts/verify-question-loading.cjs');
  md.push('npm run build');
  md.push('```');
  md.push('');
  md.push(
    `- \`--apply\` 执行顺序：删除多余旧浙江分片 → 复制 ${plan.src.length} 个新分片` +
      '（映射为 `provincial-浙江-*`）→ 全量重建 `index.json` / `idMap.json`。'
  );
  md.push('- `--apply` 自检：旧浙江分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。');
  md.push('- 失败回滚：用 git 恢复 `public/data/questions/` 后重新执行 dry-run。');
  md.push('- 不执行 `git push`。');
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

  const leftovers = names.filter(n => n.startsWith(TARGET_PREFIX) && !plan.srcTargets.has(n));
  if (leftovers.length) fail(`写入后仍残留旧浙江分片：${leftovers.join(', ')}`);
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
    fail('写入后索引自检失败，请用 git 回滚 public/data/questions/');
  }
  return final;
}

function main() {
  const plan = buildPlan();
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });

  const srcByTarget = new Map(plan.src.map(s => [s.target, s]));
  const projectedNames = [...plan.others, ...plan.src.map(s => s.target)];
  const projected = summarize(projectedNames, name => {
    const s = srcByTarget.get(name);
    return s ? readShard(SRC, s.name) : readShard(DST, name);
  });

  const blockers = [];
  if (plan.dupInSource.length) blockers.push(`新分片内部重复 ID ${plan.dupInSource.length}`);
  if (plan.collisions.length) blockers.push(`与未触碰分片 ID 冲突 ${plan.collisions.length}`);
  if (plan.oldNewOverlap.length) blockers.push(`新旧浙江 ID 交集 ${plan.oldNewOverlap.length}`);
  if (!projected.indexOk) blockers.push('index 存在悬空引用');
  if (!projected.indexExact) blockers.push('index 未精确覆盖分片');
  if (!projected.idMapOk) blockers.push('idMap 未覆盖全部 ID');
  if (projected.totalQuestions !== plan.beforeTotal - plan.oldTotal + plan.srcQuestions.length) {
    blockers.push('合并前后题目数不守恒');
  }
  if (projected.files !== plan.others.length + plan.src.length) {
    blockers.push('合并前后分片数不守恒');
  }

  console.log(`[publish-zj] mode=${APPLY ? 'APPLY' : 'dry-run'}`);
  console.log(`  源分片 ${plan.src.length} / ${plan.srcQuestions.length} 题`);
  console.log(
    `  覆盖同名 ${plan.overwrite.length}、新增 ${plan.add.length}、删除旧分片 ${plan.stale.length}` +
      `（旧题 ${plan.stale.reduce((n, name) => n + (plan.oldCounts.get(name) || 0), 0)} 道）、` +
      `未触碰 ${plan.others.length}`
  );
  console.log(
    `  合并后：${projected.files} 文件 / ${projected.totalQuestions} 题 / ` +
      `index ${projected.keyCount} keys / idMap ${projected.idCount} 条`
  );
  console.log(
    `  浙江：${plan.dstZhejiang.length} 文件 ${plan.oldTotal} 题 → ${plan.src.length} 文件 ${plan.srcQuestions.length} 题`
  );
  console.log(
    `  可渲染 ${projected.render.ok}（图片题占位 ${projected.render.image}，主观题 ${projected.render.subjective}）；` +
      `跳过 空题干 ${projected.render.noStem} / 选项不足 ${projected.render.tooFewOptions} / 空选项文本 ${projected.render.emptyOptionText}`
  );
  console.log(
    `  一致性：index ${projected.indexOk && projected.indexExact ? 'OK' : 'FAIL'}，` +
      `idMap ${projected.idMapOk ? 'OK' : 'FAIL'}`
  );

  if (APPLY && blockers.length) {
    fail(`存在阻塞项：${blockers.join('；')}，拒绝写入`);
  }

  const final = APPLY ? applyPlan(plan, projected) : projected;
  fs.writeFileSync(REPORT, buildReport(plan, final), 'utf8');
  if (APPLY) {
    console.log(`[publish-zj] 已写入 ${plan.src.length} 个浙江分片，并重建 index.json / idMap.json`);
  }
  console.log(`  报告：${path.relative(ROOT, REPORT)}`);
  if (!APPLY) {
    if (blockers.length) console.log(`  警告：存在阻塞项，不可直接 apply：${blockers.join('；')}`);
    console.log('  这是 dry-run，未改动任何题目数据。确认无误后加 --apply。');
  }
}

main();






