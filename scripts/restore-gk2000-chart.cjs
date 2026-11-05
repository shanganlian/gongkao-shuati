#!/usr/bin/env node
/**
 * 2000 国考 81–85 三角形图恢复。
 *
 * 原图来源：
 *   source-data/国考真题（2000--2026)/4-行测/1-行测-真题/word/2000年国家公务员考试《行测》真题.docx
 *   -> word/media/image12.jpeg（已复制为 public/data/questions/images/gk-2000-triangle.jpg）
 *
 * 用法：
 *   node scripts/restore-gk2000-chart.cjs                 # 只读检查
 *   node scripts/restore-gk2000-chart.cjs --apply         # 补 imageUrl
 *   node scripts/restore-gk2000-chart.cjs --apply --clear-abnormal  # 补图并解除 E09 隔离
 *
 * 只写 imageUrl / isAbnormal，不改题干、选项、答案、解析、模块。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ROOTS = [
  path.join(ROOT, 'public', 'data', 'questions'),
  path.join(ROOT, 'public', 'data', 'questions-v2'),
  path.join(ROOT, 'public', 'data', 'questions-v2-provincial'),
];
const IMAGE_PATH = path.join(ROOT, 'public', 'data', 'questions', 'images', 'gk-2000-triangle.jpg');
const IMAGE_URL = '/data/questions/images/gk-2000-triangle.jpg';
const TARGET_IDS = new Set([
  'gk-2000-未标注-81',
  'gk-2000-未标注-82',
  'gk-2000-未标注-83',
  'gk-2000-未标注-84',
  'gk-2000-未标注-85',
]);
const APPLY = process.argv.includes('--apply');
const CLEAR_ABNORMAL = process.argv.includes('--clear-abnormal');

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(abs);
  }
}

function readArray(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

if (!fs.existsSync(IMAGE_PATH)) {
  console.error(`[致命] 找不到图片：${IMAGE_PATH}`);
  process.exit(1);
}

const files = [];
for (const root of ROOTS) walk(root, files);

const hits = [];
const changedFiles = [];
let patched = 0;
let alreadyPatched = 0;
let cleared = 0;

for (const file of files) {
  const list = readArray(file);
  if (!list) continue;
  let dirty = false;
  for (const q of list) {
    if (!q || !TARGET_IDS.has(String(q.id))) continue;
    hits.push({
      id: q.id,
      file: relative(file),
      module: q.module,
      moduleName: q.moduleName,
      hadImageUrl: q.imageUrl === IMAGE_URL,
      wasAbnormal: q.isAbnormal === true,
    });
    if (q.imageUrl !== IMAGE_URL) {
      if (APPLY) q.imageUrl = IMAGE_URL;
      patched++;
      dirty = true;
    } else {
      alreadyPatched++;
    }
    if (CLEAR_ABNORMAL && q.isAbnormal === true) {
      if (APPLY) delete q.isAbnormal;
      cleared++;
      dirty = true;
    }
  }
  if (dirty) {
    changedFiles.push(relative(file));
    if (APPLY) fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
  }
}

console.log('===== 2000 国考 81–85 三角形图恢复 =====');
console.log(`图片: ${relative(IMAGE_PATH)}（${fs.statSync(IMAGE_PATH).size} B）`);
console.log(`目标 ID: ${[...TARGET_IDS].join(', ')}`);
console.log(`命中位置: ${hits.length} 处，涉及 ${new Set(hits.map(hit => hit.file)).size} 个文件`);
console.log(`[${APPLY ? 'apply' : 'dry-run'}] 补 imageUrl ${patched} 处（已有 ${alreadyPatched} 处）；解除隔离 ${cleared} 处；改动 ${changedFiles.length} 个文件`);
for (const hit of hits) {
  console.log(`  ${hit.id}  ${hit.file}  imageUrl=${hit.hadImageUrl ? '已有' : '缺失'}  isAbnormal=${hit.wasAbnormal ? 'true' : '-'}`);
}
if (!APPLY) console.log('\n[dry-run] 未写入。加 --apply 执行；需要同时解除隔离时再加 --clear-abnormal。');
