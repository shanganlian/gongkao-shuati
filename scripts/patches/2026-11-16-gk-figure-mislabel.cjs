#!/usr/bin/env node
/**
 * 国考题库：图形推理块改标 + 分片真移动（2026-11-16）
 *
 * 三处数据缺陷（用户指定）：
 *   1) 2003 国考 B卷 第 16–25 题——卷面「一、图形推理（共 10 题）」整块被标成 shuliang，
 *      subModule 为「几何 / 计算杂题」，confidence=low；
 *   2) 2006 国考 二卷 第 76–85 题——图形推理整块被标成 changshi，
 *      subModule 为「生活常识 / 人文历史 / 科技」，confidence=low；
 *   3) gk-2000-未标注-70——docx 第 70 题是「70.」+ 配图 + 「A B C D」的图形推理题，
 *      数据里却被标成「逻辑判断」，题干/选项混入了「四、演绎推理」小节头与例题。
 *
 * 同批附带（可用 --no-extra 跳过，报告中单列）：
 *   - 2006 二卷 76–83 题干是占位文本「请根据题干信息选择正确答案。」，
 *     按同代口径（2005/2006 一卷的固定写法）统一为「请根据图形规律，从四个选项中选出最合适的一项。」；
 *   - gk-2000-未标注-70 的 stem/options 归一为与同卷 61–69 完全同型（stem="A B C D"、options=[]）；
 *   - 模块变化后同步派生字段：title 前缀（数量·/常识· → 判断·）、thinkingTip（【数量】/【常识】 → 【判断】）。
 *
 * 纪律：
 *   - 只改上面点名的字段，其余字段一律不动；
 *   - 模块变化必须「真移动」分片（只改 module 不移动，前端按 index 的模块 key 取分片会两头都找不到），
 *     口径同 scripts/move-mislabeled-questions.cjs：追加到同前缀目标模块的最后一个分片；
 *   - 改前先校验现状（module / subModule / isImageQuestion），与预期不符直接 ERROR 退出，不落盘；
 *   - 幂等：已是目标状态时记为 unchanged。
 *
 * 用法：
 *   node scripts/patches/2026-11-16-gk-figure-mislabel.cjs             # 只读检查
 *   node scripts/patches/2026-11-16-gk-figure-mislabel.cjs --apply     # 落盘
 *   node scripts/patches/2026-11-16-gk-figure-mislabel.cjs --no-extra  # 只修三处清单，不动 stem/options
 *
 * 移动分片后必须依次执行（否则 index/idMap 与子类题量快照会漂移）：
 *   node scripts/rebuild-question-index.cjs --apply
 *   node scripts/build-submodule-counts.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const WITH_EXTRA = !process.argv.includes('--no-extra');
const DATE = new Date().toLocaleDateString('sv-SE');

const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);
const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;

/** 同代口径：2005/2006 各卷图形推理题的固定题干（2006 一卷 51/53 题即为该写法） */
const STEM_FIGURE_STANDARD = '请根据图形规律，从四个选项中选出最合适的一项。';
const TITLE_PREFIX = { panduan: '判断·', shuliang: '数量·', changshi: '常识·', yanyu: '言语·', ziliao: '资料·' };
const THINKING_TIP = {
  panduan: '【判断】先定位题干关键条件，再结合选项逐一排除。',
  shuliang: '【数量】先定位题干关键条件，再结合选项逐一排除。',
  changshi: '【常识】先定位题干关键条件，再结合选项逐一排除。',
};

/** 用户点名的三处清单 */
const GROUPS = [
  {
    label: '2003 B卷 图形推理 16–25',
    prefix: 'gk-2003-B卷',
    from: 16,
    to: 25,
    expectModules: ['shuliang'],
    fix: { module: 'panduan', subModule: '图形推理', subModule_confidence: 'high' },
    reason: '卷面「一、图形推理：共 10 题」，docx 以「16-25」整块配图',
  },
  {
    label: '2006 二卷 图形推理 76–85',
    prefix: 'gk-2006-二卷',
    from: 76,
    to: 85,
    expectModules: ['changshi'],
    fix: { module: 'panduan', subModule: '图形推理', subModule_confidence: 'high' },
    reason: 'docx 76、—85、 每题一图，86、起为定义判断',
  },
  {
    label: 'gk-2000-未标注-70',
    ids: ['gk-2000-未标注-70'],
    expectModules: ['panduan'],
    expectSubModules: ['逻辑判断'],
    fix: { module: 'panduan', subModule: '图形推理', subModule_confidence: 'high' },
    reason: 'docx 第 70 题 =「70.」+ 图 +「A B C D」',
  },
];

/** 附带修正（--no-extra 可跳过），报告中单列 */
const EXTRAS = [
  {
    label: '2006 二卷 76–83 占位题干',
    ids: ['gk-2006-二卷-76', 'gk-2006-二卷-77', 'gk-2006-二卷-78', 'gk-2006-二卷-79',
      'gk-2006-二卷-80', 'gk-2006-二卷-81', 'gk-2006-二卷-82', 'gk-2006-二卷-83'],
    stem: STEM_FIGURE_STANDARD,
    expectStem: '请根据题干信息选择正确答案。',
  },
  {
    label: 'gk-2000-未标注-70 内容归一（与同卷 61–69 同型）',
    ids: ['gk-2000-未标注-70'],
    stem: 'A B C D',
    dropOptions: true,
  },
];

function idsOf(group) {
  if (group.ids) return group.ids;
  const out = [];
  for (let n = group.from; n <= group.to; n += 1) out.push(`${group.prefix}-${n}`);
  return out;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

// ---------------------------------------------------------------- 索引分片

const shardNames = fs
  .readdirSync(DIR)
  .filter((name) => name.endsWith('.json') && !SPECIAL.has(name) && SHARD_RE.test(name))
  .sort();

const shards = new Map(); // name -> { raw, list }
const locations = new Map(); // id -> [{ name, index, q }]

for (const name of shardNames) {
  const raw = fs.readFileSync(path.join(DIR, name), 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) continue;
  shards.set(name, { raw, list });
  list.forEach((q, index) => {
    const id = String((q && q.id) || '').trim();
    if (!id) return;
    if (!locations.has(id)) locations.set(id, []);
    locations.get(id).push({ name, index, q });
  });
}

// ---------------------------------------------------------------- 校验与改字段

const errors = [];
const changes = [];
const moves = [];

function fail(message) {
  errors.push(message);
}

for (const group of GROUPS) {
  for (const id of idsOf(group)) {
    const hits = locations.get(id);
    if (!hits || hits.length !== 1) {
      fail(`${id} 在分片中命中 ${hits ? hits.length : 0} 处（应为 1）`);
      continue;
    }
    const { q } = hits[0];
    const atTarget =
      q.module === group.fix.module &&
      q.subModule === group.fix.subModule &&
      q.subModule_confidence === group.fix.subModule_confidence;
    if (atTarget) continue; // 幂等：已是目标状态
    if (group.expectModules && !group.expectModules.includes(q.module)) {
      fail(`${id} 当前 module=${q.module}，预期 ${group.expectModules.join('/')}——数据已变，停止以免误改`);
      continue;
    }
    if (group.expectSubModules && !group.expectSubModules.includes(q.subModule)) {
      fail(`${id} 当前 subModule=${q.subModule}，预期 ${group.expectSubModules.join('/')}`);
      continue;
    }
    if (q.isImageQuestion !== true) {
      fail(`${id} 的 isImageQuestion 不是 true，不符合图形推理块特征`);
      continue;
    }
    changes.push({ id, q, from: hits[0].name, fix: group.fix, group: group.label });
  }
}

const extraChanges = [];
if (WITH_EXTRA) {
  for (const extra of EXTRAS) {
    for (const id of extra.ids) {
      const hits = locations.get(id);
      if (!hits || hits.length !== 1) {
        fail(`${id}（附带）在分片中命中 ${hits ? hits.length : 0} 处（应为 1）`);
        continue;
      }
      const { q } = hits[0];
      if (extra.expectStem && q.stem !== extra.expectStem) {
        // 幂等：已是目标状态时静默跳过
        if (extra.stem && q.stem === extra.stem) continue;
        fail(`${id}（附带）stem 不是预期占位文本，实际 ${JSON.stringify(q.stem)}`);
        continue;
      }
      if (!extra.expectStem && extra.stem && q.stem === extra.stem && extra.dropOptions && Array.isArray(q.options) && q.options.length === 0) {
        continue; // 幂等：stem/options 均已归一
      }
      extraChanges.push({ id, q, extra: extra.label, stem: extra.stem, dropOptions: !!extra.dropOptions });
    }
  }
}

// ---------------------------------------------------------------- 应用（内存）

for (const item of changes) {
  const { q, fix } = item;
  item.before = { module: q.module, subModule: q.subModule, confidence: q.subModule_confidence, title: q.title };
  q.module = fix.module;
  q.subModule = fix.subModule;
  q.subModule_confidence = fix.subModule_confidence;
  const prefix = TITLE_PREFIX[fix.module] || '';
  if (typeof q.title === 'string' && prefix) {
    q.title = q.title.replace(/^[^·]*·/, prefix);
  }
  if (THINKING_TIP[fix.module]) q.thinkingTip = THINKING_TIP[fix.module];
  item.after = { module: q.module, subModule: q.subModule, confidence: q.subModule_confidence, title: q.title };
}

for (const item of extraChanges) {
  const { q } = item;
  item.beforeStem = q.stem;
  if (item.stem) {
    q.stem = item.stem;
    const prefix = TITLE_PREFIX[q.module] || '';
    if (typeof q.title === 'string' && prefix) q.title = `${prefix}${item.stem}`;
  }
  if (item.dropOptions) {
    item.beforeOptions = Array.isArray(q.options) ? q.options.length : 0;
    q.options = [];
  }
}

// ---------------------------------------------------------------- 分片真移动

const removeByFile = new Map(); // name -> Set(id)
const appendByKey = new Map(); // `${prefix}-${module}` -> [{ id, q }]

for (const item of changes) {
  if (item.before.module === item.q.module) continue;
  if (!removeByFile.has(item.from)) removeByFile.set(item.from, new Set());
  removeByFile.get(item.from).add(item.id);
  const key = `${item.q.category}-${item.q.province || 'none'}-${item.q.module}`;
  if (!appendByKey.has(key)) appendByKey.set(key, []);
  appendByKey.get(key).push({ id: item.id, q: item.q });
  moves.push({ id: item.id, from: item.from, toModule: item.q.module, key });
}

function targetShard(key) {
  const [category, province, module] = key.split('-');
  const candidates = shardNames
    .map((name) => ({ name, parsed: SHARD_RE.exec(name) }))
    .filter(({ parsed }) => parsed && parsed[1] === category && parsed[2] === province && parsed[3] === module)
    .sort((a, b) => Number(a.parsed[4]) - Number(b.parsed[4]));
  if (!candidates.length) {
    const name = `${category}-${province}-${module}-0.json`;
    shards.set(name, { raw: '', list: [] });
    shardNames.push(name);
    return name;
  }
  return candidates[candidates.length - 1].name;
}

const dirty = new Set();

for (const [name, ids] of removeByFile) {
  const shard = shards.get(name);
  const before = shard.list.length;
  shard.list = shard.list.filter((q) => !ids.has(String((q && q.id) || '').trim()));
  if (shard.list.length !== before) dirty.add(name);
  console.log(`[MOVE-OUT] ${relative(path.join(DIR, name))} 移除 ${before - shard.list.length} 题`);
}

for (const [key, rows] of appendByKey) {
  const name = targetShard(key);
  const shard = shards.get(name);
  const existing = new Set(shard.list.map((q) => String((q && q.id) || '').trim()));
  let added = 0;
  for (const row of rows.sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'))) {
    if (existing.has(row.id)) continue;
    shard.list.push(row.q);
    added += 1;
  }
  if (added) dirty.add(name);
  console.log(`[MOVE-IN ] ${relative(path.join(DIR, name))} 追加 ${added} 题`);
}

for (const item of changes) {
  if (item.before.module === item.q.module) dirty.add(item.from);
}
for (const item of extraChanges) {
  const hit = locations.get(item.id)[0];
  if (hit) dirty.add(hit.name);
}

// ---------------------------------------------------------------- 落盘与报告

const written = [];
if (APPLY && !errors.length) {
  for (const name of [...dirty].sort()) {
    const shard = shards.get(name);
    if (!shard) continue;
    const ending = shard.raw && shard.raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(path.join(DIR, name), JSON.stringify(shard.list, null, 2) + ending, 'utf8');
    written.push({ file: relative(path.join(DIR, name)), questions: shard.list.length });
  }
}

const reportLines = [];
reportLines.push(`# 图形推理改标与分片移动（${DATE}）`);
reportLines.push('');
reportLines.push(`- 模式：${APPLY ? '已执行' : '只读检查'}${WITH_EXTRA ? '' : '（--no-extra）'}`);
reportLines.push(`- 改标：${changes.length} 题；移动分片：${moves.length} 题；附带修正：${extraChanges.length} 题`);
reportLines.push('');
reportLines.push('## 三处缺陷');
reportLines.push('');
reportLines.push('| ID | 原模块 | 原二级分类 | 现模块 | 现二级分类 | 分片 |');
reportLines.push('|---|---|---|---|---|---|');
for (const item of changes) {
  reportLines.push(
    `| ${item.id} | ${item.before.module} | ${item.before.subModule}(${item.before.confidence ?? '-'}) | ` +
      `${item.after.module} | ${item.after.subModule}(${item.after.confidence}) | ${item.from} |`,
  );
}
if (extraChanges.length) {
  reportLines.push('');
  reportLines.push('## 附带修正');
  reportLines.push('');
  reportLines.push('| ID | 类别 | 原题干/选项 | 现题干/选项 |');
  reportLines.push('|---|---|---|---|');
  for (const item of extraChanges) {
    const before = `${JSON.stringify(item.beforeStem)}${item.beforeOptions != null ? ` / options ${item.beforeOptions} 项` : ''}`;
    const after = `${JSON.stringify(item.q.stem)}${item.dropOptions ? ' / options []' : ''}`;
    reportLines.push(`| ${item.id} | ${item.extra} | ${before} | ${after} |`);
  }
}
reportLines.push('');
reportLines.push('## 移动明细');
reportLines.push('');
reportLines.push('| ID | 从 | 到模块 |');
reportLines.push('|---|---|---|');
for (const move of moves) reportLines.push(`| ${move.id} | ${move.from} | ${move.toModule} |`);
reportLines.push('');
reportLines.push('## 落盘文件');
reportLines.push('');
for (const item of written) reportLines.push(`- ${item.file}（${item.questions} 题）`);
if (!written.length) reportLines.push('- （只读检查未写文件）');
reportLines.push('');
reportLines.push('## 后续必做');
reportLines.push('');
reportLines.push('```');
reportLines.push('node scripts/rebuild-question-index.cjs --apply');
reportLines.push('node scripts/build-submodule-counts.cjs');
reportLines.push('```');
reportLines.push('');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportFile = path.join(REPORT_DIR, `图形推理改标-${DATE}.md`);
fs.writeFileSync(reportFile, reportLines.join('\n'), 'utf8');

console.log('');
console.log('== 图形推理改标 ==');
console.log(`模式      : ${APPLY ? 'apply' : 'dry-run'}${WITH_EXTRA ? '' : '（--no-extra）'}`);
console.log(`改标      : ${changes.length} 题`);
console.log(`移动      : ${moves.length} 题`);
console.log(`附带修正  : ${extraChanges.length} 题`);
console.log('');
console.log('-- 改标明细 --');
for (const item of changes) {
  console.log(
    `  ${item.id}  ${item.before.module}/${item.before.subModule}(${item.before.confidence ?? '-'})` +
      ` → ${item.after.module}/${item.after.subModule}(${item.after.confidence})  [${item.from}]`,
  );
  if (item.before.title !== item.after.title) {
    console.log(`    title: ${JSON.stringify(item.before.title)} → ${JSON.stringify(item.after.title)}`);
  }
}
if (extraChanges.length) {
  console.log('');
  console.log('-- 附带修正 --');
  for (const item of extraChanges) {
    console.log(`  ${item.id}  ${JSON.stringify(item.beforeStem)} → ${JSON.stringify(item.q.stem)}`);
  }
}
console.log('');
if (written.length) {
  console.log('-- 落盘 --');
  for (const item of written) console.log(`  ${item.file}（${item.questions} 题）`);
  console.log('');
}
if (errors.length) {
  console.log(`-- ERROR（${errors.length}）--`);
  errors.forEach((item) => console.log(`  ✗ ${item}`));
  console.log('');
  console.log('结论：存在 ERROR，未写入任何分片。');
  console.log(`报告：${relative(reportFile)}`);
  process.exit(1);
}
console.log(
  APPLY
    ? '结论：通过，字段已改、分片已移动。请接着执行 rebuild-question-index + build-submodule-counts。'
    : '结论：dry-run 通过（未写文件）。加 --apply 落盘。',
);
console.log(`报告：${relative(reportFile)}`);

