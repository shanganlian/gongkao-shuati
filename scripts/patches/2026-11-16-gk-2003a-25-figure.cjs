#!/usr/bin/env node
/**
 * 国考题库：2003 A卷 第 25 题改标回图形推理（2026-11-16）
 *
 * 缺陷（同 2003 B卷 25 题、2006 二卷整块的导入污染同型）：
 *   docx 第 25 题 =「25.」+ 配图 +「A B C D」，仍属「一、图形推理（共 10 题）」；
 *   但紧跟其后的「二、演绎推理：共 15 题…」小节头 + 演绎例题被导入脚本并进了该题，
 *   于是数据侧变成：subModule=逻辑判断(low)、options=演绎例题的 4 个选项、
 *   stem 混入小节头与例题。解析「第一套图中图三由图一旋转 180 度…」证明它确是图形推理题。
 *
 * 目标状态（与同卷 16–24 完全同型）：
 *   subModule=图形推理 / high、stem="A B C D"、options=[]、title="判断·A B C D"；
 *   explanation 去掉尾部小节头、keyPoints 去掉「二、演绎推理」条目；answer 不动。
 *
 * 纪律：
 *   - 改前校验现状（module/subModule/isImageQuestion/answer/options/stem 白名单），不符即 ERROR、不落盘；
 *   - 模块不变（panduan → panduan），无需移动分片；
 *   - 幂等：已是目标状态记为 unchanged；
 *   - subModule 变化会影响子类题量快照，落盘后必须执行 node scripts/build-submodule-counts.cjs。
 *
 * 用法：
 *   node scripts/patches/2026-11-16-gk-2003a-25-figure.cjs          # 只读检查
 *   node scripts/patches/2026-11-16-gk-2003a-25-figure.cjs --apply  # 落盘
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const DATE = new Date().toLocaleDateString('sv-SE');

const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json', 'submoduleCounts.json']);
const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;

const ID = 'gk-2003-A卷-25';
const STEM = 'A B C D';
const TITLE = `判断·${STEM}`;
const LEAKED_HEADER = '二、演绎推理';
/** 允许的旧 stem：被小节头污染的原值（前缀校验） */
const EXPECT_STEM_RE = /^A B C D\n二、演绎推理：共 15 题/;
const EXPECT_OPTION_KEYS = ['A', 'B', 'C', 'D'];

const errors = [];
const changes = [];
const unchanged = [];
const written = new Map();

function fail(message) {
  errors.push(message);
}

const shards = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && !SPECIAL.has(f) && SHARD_RE.test(f))
  .sort();

const parsed = new Map();
let hit = null;
for (const name of shards) {
  const raw = fs.readFileSync(path.join(DIR, name), 'utf8');
  const arr = JSON.parse(raw);
  parsed.set(name, { raw, arr });
  if (hit) continue;
  const q = arr.find((item) => item && String(item.id) === ID);
  if (q) hit = { q, file: name };
}


if (!hit) {
  fail(`题库中找不到题目：${ID}`);
} else {
  const { q } = hit;
  const before = {
    module: q.module,
    subModule: q.subModule,
    confidence: q.subModule_confidence ?? null,
    stem: q.stem,
    title: q.title,
    options: Array.isArray(q.options) ? q.options.length : null,
    answer: q.answer,
  };

  if (q.module !== 'panduan') fail(`${ID} 的 module 是 ${q.module}，预期 panduan`);
  if (q.isImageQuestion !== true) fail(`${ID} 的 isImageQuestion 不是 true`);
  if (q.answer !== 'B') fail(`${ID} 的 answer 是 ${JSON.stringify(q.answer)}，预期 B（脚本不改答案，不符即人工确认）`);

  const alreadyDone =
    q.subModule === '图形推理' &&
    q.subModule_confidence === 'high' &&
    q.stem === STEM &&
    Array.isArray(q.options) &&
    q.options.length === 0;

  if (alreadyDone) {
    unchanged.push({ id: ID, before });
  } else if (!errors.length) {
    if (q.subModule !== '逻辑判断') fail(`${ID} 的 subModule 是 ${q.subModule}，预期旧值 逻辑判断`);
    if (!EXPECT_STEM_RE.test(String(q.stem || ''))) {
      fail(`${ID} 的 stem 不在预期旧值白名单（当前 ${JSON.stringify(String(q.stem || '').slice(0, 24))}…）`);
    }
    const keys = Array.isArray(q.options) ? q.options.map((o) => o.key) : [];
    if (keys.join('') !== EXPECT_OPTION_KEYS.join('')) {
      fail(`${ID} 的 options 键为 ${JSON.stringify(keys)}，预期 A/B/C/D（演绎例题选项）`);
    }
    if (!errors.length) {
      const explanation = String(q.explanation || '');
      q.subModule = '图形推理';
      q.subModule_confidence = 'high';
      q.stem = STEM;
      q.title = TITLE;
      q.options = [];
      q.explanation = explanation
        .replace(/\s*二、演绎推理\s*$/, '')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
      if (Array.isArray(q.keyPoints)) {
        q.keyPoints = q.keyPoints.filter((item) => !String(item).includes(LEAKED_HEADER));
      }
      written.set(hit.file, 1);
      changes.push({ id: ID, before, after: { subModule: q.subModule, stem: q.stem, title: q.title, options: 0 } });
    }
  }
}

if (APPLY && !errors.length && changes.length) {
  for (const [name] of [...written.entries()].sort()) {
    const { raw, arr } = parsed.get(name);
    const ending = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(path.join(DIR, name), JSON.stringify(arr, null, 2) + ending, 'utf8');
  }
}


const lines = [];
lines.push(`# 2003 A卷 第 25 题改标回图形推理（${DATE}）`);
lines.push('');
lines.push(`- 模式：${APPLY ? 'apply' : '只读检查'}`);
lines.push(`- 题目：${ID}`);
lines.push(`- 目标：subModule=图形推理(high)、stem=${JSON.stringify(STEM)}、title=${JSON.stringify(TITLE)}、options=[]`);
lines.push(`- 改动：${changes.length} 题；未变（已达标）：${unchanged.length} 题；ERROR：${errors.length} 条`);
lines.push('');
lines.push('## 明细');
lines.push('');
lines.push('| ID | 原分类 | 现分类 | 原 stem（截断） | 现 stem | 原 options | 现 options |');
lines.push('|---|---|---|---|---|---|---|');
for (const item of changes) {
  lines.push(
    `| ${item.id} | ${item.before.subModule}(${item.before.confidence ?? '-'}) | 图形推理(high) | ` +
      `${JSON.stringify(String(item.before.stem || '').slice(0, 30))}… | ${JSON.stringify(item.after.stem)} | ` +
      `${item.before.options} 项（演绎例题） | 0 项 |`,
  );
}
lines.push('');
lines.push('## 依据');
lines.push('');
lines.push('- docx：`25.` + 配图 + `A B C D` 之后才是「二、演绎推理：共 15 题」小节头，说明第 25 题属于图形推理；');
lines.push('- 解析：「第一套图中图三由图一旋转 180 度后的上部分与图二下半部分组合而成」，与图形推理同型；');
lines.push('- 卷面小节标题：「一、图形推理：本部分包括两种类型的题目，共 10 题。」→ 16–25 共 10 题。');
lines.push('');
lines.push('## 落盘文件');
lines.push('');
if (APPLY && changes.length) {
  for (const [name, count] of [...written.entries()].sort()) lines.push(`- ${name}（${count} 题）`);
} else {
  lines.push('- （未写文件）');
}
lines.push('');
lines.push('## 后续必做');
lines.push('');
lines.push('```');
lines.push('node scripts/build-submodule-counts.cjs');
lines.push('node scripts/rebuild-question-index.cjs   # 只读校验，无差异即无需 --apply');
lines.push('```');
lines.push('');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportFile = path.join(REPORT_DIR, `2003A-25图形推理改标-${DATE}.md`);
fs.writeFileSync(reportFile, lines.join('\n'), 'utf8');

console.log('== 2003 A卷 25 题改标 ==');
console.log(`模式    : ${APPLY ? 'apply' : 'dry-run'}`);
console.log(`改动    : ${changes.length} 题`);
console.log(`未变    : ${unchanged.length} 题`);
for (const item of changes) {
  console.log(
    `  ${item.id}  ${item.before.subModule}(${item.before.confidence ?? '-'}) → 图形推理(high)  ` +
      `stem ${JSON.stringify(String(item.before.stem || '').slice(0, 20))}… → ${JSON.stringify(item.after.stem)}`,
  );
}
if (errors.length) {
  console.log(`-- ERROR（${errors.length}）--`);
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  console.log('结论：存在 ERROR，未写入任何分片。');
  console.log(`报告：${path.relative(ROOT, reportFile)}`);
  process.exit(1);
}
console.log(APPLY ? '结论：通过，字段已写入。请接着跑 build-submodule-counts。' : '结论：dry-run 通过（未写文件）。加 --apply 落盘。');
console.log(`报告：${path.relative(ROOT, reportFile)}`);
