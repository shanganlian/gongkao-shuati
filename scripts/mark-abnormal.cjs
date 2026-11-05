#!/usr/bin/env node
/**
 * 按题目 ID 打 isAbnormal: true 隔离标记（跨 v1 / v2 / v2p 全部分片）。
 *
 * 用法：
 *   node scripts/mark-abnormal.cjs --id prov-beijing-2008-应届-116
 *   node scripts/mark-abnormal.cjs --id id1,id2 --apply
 *   node scripts/mark-abnormal.cjs --id id1 --clear --apply
 *
 * 只写 isAbnormal 字段，不改题干、选项、答案、解析。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const V1 = path.join(ROOT, 'public', 'data', 'questions');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2');
const V2P = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');

const APPLY = process.argv.includes('--apply');
const CLEAR = process.argv.includes('--clear');
const idArgs = [];
for (let index = 0; index < process.argv.length; index++) {
  if (process.argv[index] === '--id' && process.argv[index + 1]) {
    idArgs.push(...process.argv[index + 1].split(',').map(value => value.trim()).filter(Boolean));
    index++;
  }
}
const TARGET_IDS = new Set(idArgs);

if (TARGET_IDS.size === 0) {
  console.error('用法：node scripts/mark-abnormal.cjs --id <题目ID>[,<题目ID>] [--apply] [--clear]');
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function addIndexFiles(files, dir) {
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) return;
  const index = readJson(indexPath);
  for (const file of Object.values(index).flat()) files.add(path.join(dir, file));
}

function collectFiles() {
  const files = new Set();
  addIndexFiles(files, V1);
  addIndexFiles(files, V2);
  if (fs.existsSync(V2P)) {
    for (const entry of fs.readdirSync(V2P, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(V2P, entry.name);
      const aggregate = path.join(dir, 'questions.json');
      if (fs.existsSync(aggregate)) files.add(aggregate);
      addIndexFiles(files, dir);
    }
  }
  return [...files];
}

const hits = [];
const changedFiles = [];
let marked = 0;
let cleared = 0;

for (const file of collectFiles()) {
  if (!fs.existsSync(file)) continue;
  let list;
  try {
    list = readJson(file);
  } catch (error) {
    console.error(`[skip] JSON 读取失败：${file} (${error.message})`);
    continue;
  }
  if (!Array.isArray(list)) continue;

  let dirty = false;
  for (let index = 0; index < list.length; index++) {
    const question = list[index];
    if (!question || !TARGET_IDS.has(String(question.id || ''))) continue;
    hits.push({
      id: question.id,
      file: path.relative(ROOT, file),
      index,
      before: question.isAbnormal === true,
    });
    if (CLEAR) {
      if (question.isAbnormal === true) {
        delete question.isAbnormal;
        cleared++;
        dirty = true;
      }
    } else if (question.isAbnormal !== true) {
      question.isAbnormal = true;
      marked++;
      dirty = true;
    }
  }
  if (dirty) {
    changedFiles.push(path.relative(ROOT, file));
    if (APPLY) fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
  }
}

const summary = {
  targets: [...TARGET_IDS],
  apply: APPLY,
  clear: CLEAR,
  hitLocations: hits.length,
  hitFiles: new Set(hits.map(hit => hit.file)).size,
  marked,
  cleared,
  changedFiles,
  hits,
};
console.log('===== 按 ID 隔离异常题 =====');
console.log(`目标 ID: ${[...TARGET_IDS].join(', ')}`);
console.log(`命中位置: ${hits.length} 处，涉及 ${summary.hitFiles} 个文件`);
console.log(`[${APPLY ? 'apply' : 'dry-run'}] ${CLEAR ? `清除标记 ${cleared}` : `新写入标记 ${marked}`} 处，改动 ${changedFiles.length} 个文件`);
for (const hit of hits) console.log(`  ${hit.id}  ${hit.file}  [${hit.index}]  before=${hit.before ? 'isAbnormal' : '-'}`);
if (!APPLY) console.log('\n[dry-run] 未写入。加 --apply 执行实际写入。');
