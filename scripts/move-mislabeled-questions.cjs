#!/usr/bin/env node
/**
 * 把模块错标题从旧模块分片移动到目标模块分片，并重建 index.json / idMap.json。
 *
 * 背景：只改 q.module 而不移动分片，前端按 index 的模块 key 加载分片时，
 * 改标题会既不在旧模块、也不在新模块出现。这里做“真移动”。
 *
 * 用法：
 *   node scripts/move-mislabeled-questions.cjs            # 只读检查
 *   node scripts/move-mislabeled-questions.cjs --apply    # 移动 + 重建索引
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const DATE = new Date().toLocaleDateString('sv-SE');
const REPORT_JSON = path.join(REPORT_DIR, `模块改标移动-${DATE}.json`);
const REPORT_MD = path.join(REPORT_DIR, `模块改标移动-${DATE}.md`);

const TARGETS = new Map([
  ['gk-2024-副省级-115', 'panduan'],
  ['prov-shanghai-2019-A卷-108', 'changshi'],
  ['prov-shanghai-2019-A卷-121', 'changshi'],
]);

const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writePretty(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function writeCompact(file, value) {
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
}

function listShardNames(dir) {
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.json') && !SPECIAL.has(name) && SHARD_RE.test(name))
    .sort();
}

function parseShard(name) {
  const match = SHARD_RE.exec(name);
  if (!match) return null;
  return {
    category: match[1],
    province: match[2],
    module: match[3],
    chunk: Number(match[4]),
    key: `${match[1]}-${match[2]}-${match[3]}`,
    prefix: `${match[1]}-${match[2]}`,
  };
}

/** 在当前目录里找目标题的所有分片位置（不包含 questions.json 汇总） */
function findLocations(dir, ids) {
  const locations = new Map();
  for (const name of listShardNames(dir)) {
    const list = readJson(path.join(dir, name));
    if (!Array.isArray(list)) continue;
    for (let index = 0; index < list.length; index++) {
      const id = String((list[index] && list[index].id) || '');
      if (!ids.has(id)) continue;
      if (!locations.has(id)) locations.set(id, []);
      locations.get(id).push({ name, index, q: list[index] });
    }
  }
  return locations;
}
function rebuildIndex(dir, style) {
  const names = listShardNames(dir);
  const groups = new Map();
  for (const name of names) {
    const parsed = parseShard(name);
    if (!parsed) continue;
    if (!groups.has(parsed.key)) groups.set(parsed.key, []);
    groups.get(parsed.key).push({ name, chunk: parsed.chunk });
  }
  const index = {};
  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    index[key] = groups
      .get(key)
      .sort((a, b) => a.chunk - b.chunk)
      .map(item => item.name);
  }

  const idMap = new Map();
  for (const name of names) {
    const list = readJson(path.join(dir, name));
    if (!Array.isArray(list)) continue;
    for (const q of list) {
      const id = String((q && q.id) || '').trim();
      if (!id) continue;
      if (!idMap.has(id)) idMap.set(id, []);
      if (!idMap.get(id).includes(name)) idMap.get(id).push(name);
    }
  }
  const sortedIdMap = {};
  for (const id of [...idMap.keys()].sort((a, b) => a.localeCompare(b))) {
    sortedIdMap[id] = idMap.get(id);
  }

  const write = style === 'pretty' ? writePretty : writeCompact;
  write(path.join(dir, 'index.json'), index);
  write(path.join(dir, 'idMap.json'), sortedIdMap);
  return {
    index,
    idMap: sortedIdMap,
    shardCount: names.length,
  };
}

function processDir(dir, dataset, style) {
  const ids = new Set(TARGETS.keys());
  const locations = findLocations(dir, ids);
  const moves = [];

  for (const [id, occurrences] of locations) {
    const targetModule = TARGETS.get(id);
    for (const occurrence of occurrences) {
      const parsed = parseShard(occurrence.name);
      if (!parsed || parsed.module === targetModule) continue;
      moves.push({
        id,
        from: occurrence.name,
        fromModule: parsed.module,
        toModule: targetModule,
        q: occurrence.q,
      });
    }
  }

  if (APPLY) {
    for (const move of moves) {
      const parsed = parseShard(move.from);
      const sourcePath = path.join(dir, move.from);
      const source = readJson(sourcePath);
      const sourceIndex = source.findIndex(q => String((q && q.id) || '') === move.id);
      if (sourceIndex < 0) continue;
      source.splice(sourceIndex, 1);
      writePretty(sourcePath, source);

      const candidates = listShardNames(dir)
        .map(name => ({ name, parsed: parseShard(name) }))
        .filter(item => item.parsed && item.parsed.prefix === parsed.prefix && item.parsed.module === move.toModule)
        .sort((a, b) => a.parsed.chunk - b.parsed.chunk);
      const targetName = candidates.length
        ? candidates[candidates.length - 1].name
        : `${parsed.prefix}-${move.toModule}-0.json`;
      const targetPath = path.join(dir, targetName);
      const target = fs.existsSync(targetPath) ? readJson(targetPath) : [];
      if (!target.some(q => String((q && q.id) || '') === move.id)) target.push(move.q);
      writePretty(targetPath, target);
      move.to = targetName;
    }
  }

  const rebuilt = APPLY && moves.length > 0 ? rebuildIndex(dir, style) : null;
  return {
    dataset,
    dir: path.relative(ROOT, dir).replace(/\\/g, '/'),
    moves: moves.map(({ q, ...rest }) => rest),
    rebuilt: rebuilt
      ? {
          shardCount: rebuilt.shardCount,
          indexKeys: Object.keys(rebuilt.index).length,
          idMapEntries: Object.keys(rebuilt.idMap).length,
        }
      : null,
    locations: [...locations.entries()].map(([id, list]) => ({
      id,
      files: list.map(item => item.name),
    })),
  };
}

const reports = [];

for (const dataset of [
  { name: 'v1', dir: path.join(ROOT, 'public', 'data', 'questions') },
  { name: 'v2', dir: path.join(ROOT, 'public', 'data', 'questions-v2') },
]) {
  if (fs.existsSync(dataset.dir)) reports.push(processDir(dataset.dir, dataset.name, 'compact'));
}

const v2pRoot = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
if (fs.existsSync(v2pRoot)) {
  for (const entry of fs.readdirSync(v2pRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(v2pRoot, entry.name);
    if (!fs.existsSync(path.join(dir, 'index.json'))) continue;
    reports.push(processDir(dir, `v2p/${entry.name}`, 'pretty'));
  }
}

const allMoves = reports.flatMap(report => report.moves);
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(
  REPORT_JSON,
  JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, reports, allMoves }, null, 2),
  'utf8'
);

const md = [];
md.push(`# 模块改标分片移动（${DATE}）`);
md.push('');
md.push(`- 模式：${APPLY ? '已执行' : '只读检查'}`);
md.push(`- 移动：${allMoves.length} 处`);
md.push('');
md.push('| ID | 从 | 到 |');
md.push('|---|---|---|');
for (const move of allMoves) md.push(`| ${move.id} | ${move.from} | ${move.to || move.toModule} |`);
md.push('');
for (const report of reports) {
  md.push(`## ${report.dataset}`);
  md.push('');
  md.push(`- 目录：\`${report.dir}\``);
  md.push(`- 移动：${report.moves.length} 处`);
  if (report.rebuilt) {
    md.push(
      `- 重建：${report.rebuilt.shardCount} 个分片 / ${report.rebuilt.indexKeys} 个 index key / ${report.rebuilt.idMapEntries} 个 idMap 条目`
    );
  }
  for (const location of report.locations) md.push(`- ${location.id}: ${location.files.join(', ')}`);
  md.push('');
}
fs.writeFileSync(REPORT_MD, md.join('\n'), 'utf8');

console.log('===== 模块改标分片移动 =====');
console.log(`模式: ${APPLY ? 'apply' : 'dry-run'}  移动: ${allMoves.length}`);
for (const move of allMoves) console.log(`  ${move.id}  ${move.from} -> ${move.to || move.toModule}`);
console.log(`报告: ${path.relative(ROOT, REPORT_MD)}`);

