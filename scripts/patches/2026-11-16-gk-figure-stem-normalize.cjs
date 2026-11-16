#!/usr/bin/env node
/**
 * 国考题库：图形推理题干统一（2026-11-16，改标批次的收尾补丁）
 *
 * 背景（接 2026-11-16-gk-figure-mislabel.cjs）：
 *   该批次只统一了 2006 二卷 76–83 的占位题干，同型问题仍留在两处：
 *   1) 2003 国考 B卷 16–25（整块图形推理）题干仍是占位文本「请根据题干信息选择正确答案。」；
 *      其中第 25 题更严重——题干/标题混入了下一小节头「二、演绎推理：共 15 题」
 *      （docx 第 25 题只有图形，题号段之后的最后一段文字就是该小节头，导入时被当成了题干）；
 *   2) 2006 国考 二卷 84、85 仍是占位文本（76–83 已统一，剩下两题漏在清单外）。
 *
 * 口径：同代图形推理固定题干（2005/2006 各卷写法），与 2006 二卷 76–83 现有值一致：
 *   「请根据图形规律，从四个选项中选出最合适的一项。」
 *
 * 纪律：
 *   - 只改 stem 与 title（title = 「判断·」+ stem，且仅当 title 正好是「判断·」+ 旧 stem 时才改），
 *     options / thinkingTip / answer / explanation / 分类字段一律不动；
 *   - 改前校验：module=panduan、subModule=图形推理、isImageQuestion=true、options 为空数组，
 *     且旧 stem 属于「预期旧值」白名单（占位文本 / 混入的小节头），否则 ERROR 退出、不落盘；
 *   - 幂等：已是目标值记为 unchanged；
 *   - 不动分片归属，因此无需 rebuild-question-index；题干不进 submoduleCounts 快照，也无需重算。
 *
 * 用法：
 *   node scripts/patches/2026-11-16-gk-figure-stem-normalize.cjs          # 只读检查
 *   node scripts/patches/2026-11-16-gk-figure-stem-normalize.cjs --apply  # 落盘
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

const STEM = '请根据图形规律，从四个选项中选出最合适的一项。';
const TITLE = `判断·${STEM}`;
const PLACEHOLDER = '请根据题干信息选择正确答案。';
const LEAKED_HEADER = '二、演绎推理：共 15 题';

/** 目标清单：id -> 允许的旧 stem（白名单） */
const TARGETS = new Map();
for (let n = 16; n <= 24; n += 1) TARGETS.set(`gk-2003-B卷-${n}`, [PLACEHOLDER, STEM]);
TARGETS.set('gk-2003-B卷-25', [LEAKED_HEADER, PLACEHOLDER, STEM]);
TARGETS.set('gk-2006-二卷-84', [PLACEHOLDER, STEM]);
TARGETS.set('gk-2006-二卷-85', [PLACEHOLDER, STEM]);

const errors = [];
const changes = [];
const unchanged = [];
const written = new Map(); // file -> 改动题数

function fail(message) {
  errors.push(message);
}

const shards = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && !SPECIAL.has(f) && SHARD_RE.test(f))
  .sort();

const parsed = new Map();
const hit = new Map();
for (const name of shards) {
  const raw = fs.readFileSync(path.join(DIR, name), 'utf8');
  const arr = JSON.parse(raw);
  parsed.set(name, { raw, arr });
  for (const q of arr) {
    if (q && TARGETS.has(String(q.id))) hit.set(String(q.id), { q, file: name });
  }
}

for (const id of TARGETS.keys()) {
  const found = hit.get(id);
  if (!found) {
    fail(`题库中找不到题目：${id}`);
    continue;
  }
  const { q } = found;
  if (q.module !== 'panduan' || q.subModule !== '图形推理') {
    fail(`${id} 当前分类为 ${q.module}/${q.subModule}，与预期 panduan/图形推理 不符`);
    continue;
  }
  if (q.isImageQuestion !== true) {
    fail(`${id} 的 isImageQuestion 不是 true（当前 ${JSON.stringify(q.isImageQuestion)}）`);
    continue;
  }
  if (!Array.isArray(q.options) || q.options.length) {
    fail(`${id} 的 options 不是空数组（当前 ${Array.isArray(q.options) ? q.options.length : 'n/a'} 项）`);
    continue;
  }

  const before = { stem: q.stem, title: q.title };
  const allowed = TARGETS.get(id);
  if (!allowed.includes(before.stem)) {
    fail(`${id} 的 stem 不在预期旧值白名单：${JSON.stringify(before.stem)}`);
    continue;
  }
  if (before.stem === STEM) {
    unchanged.push({ id, before, q });
    continue;
  }

  const nextTitle = before.title === `判断·${before.stem}` ? TITLE : before.title;
  q.stem = STEM;
  q.title = nextTitle;
  written.set(found.file, (written.get(found.file) || 0) + 1);
  changes.push({ id, before, after: { stem: q.stem, title: q.title } });
}


if (APPLY && !errors.length && changes.length) {
  for (const [name] of [...written.entries()].sort()) {
    const { raw, arr } = parsed.get(name);
    const ending = raw.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(path.join(DIR, name), JSON.stringify(arr, null, 2) + ending, 'utf8');
  }
}

// ---------------------------------------------------------------- 报告

const lines = [];
lines.push(`# 图形推理题干统一（${DATE}）`);
lines.push('');
lines.push(`- 模式：${APPLY ? 'apply' : '只读检查'}`);
lines.push(`- 目标值：stem=${JSON.stringify(STEM)}；title=${JSON.stringify(TITLE)}`);
lines.push(`- 改动：${changes.length} 题；未变（已达标）：${unchanged.length} 题；ERROR：${errors.length} 条`);
lines.push('');
lines.push('## 明细');
lines.push('');
lines.push('| ID | 原 stem | 现 stem | 原 title |');
lines.push('|---|---|---|---|');
for (const item of changes) {
  lines.push(
    `| ${item.id} | ${JSON.stringify(item.before.stem)} | ${JSON.stringify(item.after.stem)} | ${JSON.stringify(item.before.title)} |`,
  );
}
lines.push('');
lines.push('## 落盘文件');
lines.push('');
if (APPLY && changes.length) {
  for (const [name, count] of [...written.entries()].sort()) lines.push(`- ${name}（${count} 题）`);
} else {
  lines.push('- （未写文件）');
}
lines.push('');
lines.push('## 说明');
lines.push('');
lines.push('- 只动 stem/title；options/thinkingTip/分类/answer/explanation 未变。');
lines.push('- 无分片移动，无需 rebuild-question-index / build-submodule-counts。');
lines.push('');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportFile = path.join(REPORT_DIR, `图形推理题干统一-${DATE}.md`);
fs.writeFileSync(reportFile, lines.join('\n'), 'utf8');

console.log('== 图形推理题干统一 ==');
console.log(`模式    : ${APPLY ? 'apply' : 'dry-run'}`);
console.log(`改动    : ${changes.length} 题`);
console.log(`未变    : ${unchanged.length} 题`);
for (const item of changes) {
  console.log(`  ${item.id}  ${JSON.stringify(item.before.stem)} → ${JSON.stringify(item.after.stem)}`);
}
if (errors.length) {
  console.log(`-- ERROR（${errors.length}）--`);
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  console.log('结论：存在 ERROR，未写入任何分片。');
  console.log(`报告：${path.relative(ROOT, reportFile)}`);
  process.exit(1);
}
console.log(APPLY ? '结论：通过，字段已写入。' : '结论：dry-run 通过（未写文件）。加 --apply 落盘。');
console.log(`报告：${path.relative(ROOT, reportFile)}`);
