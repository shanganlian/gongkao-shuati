#!/usr/bin/env node
/**
 * build-submodule-counts.cjs —— 生成前端二级分类题量快照
 *
 * 背景：练习页的二级分类 chips 需要显示题数，但前端是按需分片加载题目
 * （全国「常识判断」就有 97 个分片 / 约 35MB），等分片全部加载完再统计会让
 * chips 长时间空白。这里在构建期把「范围 → 模块 → 子类」的题量扫成一个小
 * JSON 打进前端包，chips 首屏即可显示准确题数，且不依赖题库数据重新发布。
 *
 * 口径（与 src/hooks/useQuestions.ts 的筛选保持一致）：
 *   - total：该范围分片里的全部题目（含低置信、未分类、申论/公基）；
 *   - subs ：只统计 subModule_confidence != 'low' 的题目，即可被二级筛选命中的题；
 *     低置信（low）与未分类题仍留在「全部」里，只是不归属任何子类 chips。
 *
 * 用法：
 *   node scripts/build-submodule-counts.cjs            # 重新生成 src/data/submoduleCounts.json
 *   node scripts/build-submodule-counts.cjs --check    # 只校验快照是否与题库一致（有漂移 exit=1）
 *   PUBLISH_ROOT=/path/to/repo node scripts/build-submodule-counts.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TAG = '[submodule-counts]';
const ROOT = process.env.PUBLISH_ROOT
  ? path.resolve(process.env.PUBLISH_ROOT)
  : path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'data', 'questions');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'submoduleCounts.json');
const SUB_MODULES_FILE = path.join(ROOT, 'shared', 'sub-modules.json');

const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;
const SPECIAL_FILES = new Set(['index.json', 'idMap.json', 'questions.json', 'submodule-counts.json']);
const CHECK_ONLY = process.argv.slice(2).includes('--check');

function num(n) {
  return Number(n).toLocaleString('en-US');
}

function listShards() {
  return fs
    .readdirSync(SRC_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json') && !SPECIAL_FILES.has(entry.name))
    .map(entry => entry.name)
    .sort();
}

function readShard(name) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(SRC_DIR, name), 'utf8'));
  } catch (err) {
    throw new Error(`${name} 解析失败：${err.message}`);
  }
  if (!Array.isArray(data)) throw new Error(`${name} 不是题目数组`);
  return data;
}

function readModuleOrder() {
  try {
    return JSON.parse(fs.readFileSync(SUB_MODULES_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`读取 shared/sub-modules.json 失败：${err.message}`);
  }
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    // CI 或“只有前端产物”的场景可能没有题库目录：保留既有快照，避免构建被卡住
    if (fs.existsSync(OUT_FILE)) {
      console.warn(`${TAG} 未找到题库目录 ${SRC_DIR}，保留现有快照`);
      return;
    }
    throw new Error(`缺少题库目录：${SRC_DIR}`);
  }
  if (!fs.existsSync(SUB_MODULES_FILE)) throw new Error(`缺少分类表：${SUB_MODULES_FILE}`);

  const moduleOrder = readModuleOrder();
  const shards = listShards();

  const scopes = new Map();
  let total = 0;
  let withSubModule = 0;
  let lowConfidence = 0;
  let unclassified = 0;

  for (const name of shards) {
    const m = SHARD_RE.exec(name);
    if (!m) {
      console.warn(`${TAG} 跳过分片（命名不符）：${name}`);
      continue;
    }
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    if (!scopes.has(key)) scopes.set(key, { total: 0, subs: Object.create(null) });
    const bucket = scopes.get(key);

    for (const q of readShard(name)) {
      total += 1;
      bucket.total += 1;
      const sub = typeof q?.subModule === 'string' ? q.subModule.trim() : '';
      if (!sub) {
        unclassified += 1;
        continue;
      }
      withSubModule += 1;
      if (q.subModule_confidence === 'low') {
        lowConfidence += 1;
        continue;
      }
      bucket.subs[sub] = (bucket.subs[sub] || 0) + 1;
    }
  }

  const sortedScopes = {};
  for (const key of [...scopes.keys()].sort((a, b) => a.localeCompare(b))) {
    const bucket = scopes.get(key);
    const mod = key.split('-')[2];
    const order = moduleOrder[mod] || [];
    const subs = {};
    const names = Object.keys(bucket.subs).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
      return a.localeCompare(b);
    });
    for (const sub of names) subs[sub] = bucket.subs[sub];
    sortedScopes[key] = { total: bucket.total, subs };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      shards: shards.length,
      questions: total,
      withSubModule,
      lowConfidence,
      subModuleHigh: withSubModule - lowConfidence,
      unclassified,
    },
    scopes: sortedScopes,
  };
  const text = JSON.stringify(payload);
  const existing = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;

  const summary = [
    `${TAG} 分片 ${num(shards.length)} / 题目 ${num(total)} / 有子类 ${num(withSubModule)}` +
      ` / 可筛（非 low）${num(withSubModule - lowConfidence)} / low ${num(lowConfidence)} / 未分类 ${num(unclassified)}`,
    `${TAG} 范围键 ${num(Object.keys(sortedScopes).length)} 个 / 快照 ${num(Buffer.byteLength(text, 'utf8'))} B`,
  ];

  if (CHECK_ONLY) {
    let same = false;
    try {
      const old = existing ? JSON.parse(existing) : null;
      // generatedAt 每次运行都会变，校验只比对 source 与 scopes
      same = !!old
        && JSON.stringify(old.scopes) === JSON.stringify(sortedScopes)
        && JSON.stringify(old.source) === JSON.stringify(payload.source);
    } catch (err) {
      same = false;
    }
    for (const line of summary) console.log(line);
    if (!same) {
      console.error(`${TAG} 快照与题库不一致（${OUT_FILE}），请运行：npm run submodule:counts`);
      process.exit(1);
    }
    console.log(`${TAG} 快照与题库一致。`);
    return;
  }

  fs.writeFileSync(OUT_FILE, text, 'utf8');
  for (const line of summary) console.log(line);
  console.log(`${TAG} 已写入 ${path.relative(ROOT, OUT_FILE)}`);
}

try {
  main();
} catch (err) {
  console.error(`${TAG} 失败：${err.message}`);
  process.exit(1);
}
