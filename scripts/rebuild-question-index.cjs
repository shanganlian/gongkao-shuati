#!/usr/bin/env node
/**
 * rebuild-question-index.cjs —— public/data/questions/ 的 index.json / idMap.json 全量重建与一致性自检
 *
 * 背景：省份批次发布后，若只拷贝分片而未重建索引，前端 useQuestions 会取不到新省份
 * （index 键缺失 → 请求 404；idMap 缺条目 → 题目详情/复习回查不到分片）。
 * 本脚本按目录内实际分片全量重建，口径与 publish-merge-provinces.cjs 完全一致：
 *   1) 分片命名：<category>-<province>-<module>-<chunk>.json（index/idMap/questions 除外）；
 *   2) index：key = <category>-<province>-<module>，value = 该组按 chunk 升序的分片名；
 *   3) idMap：题目 id → 引用该 id 的分片名（同名分片去重），键按 localeCompare 升序；
 *   4) 输出为紧凑 JSON、无结尾换行（与既有文件字节级一致）。
 *
 * 用法：
 *   node scripts/rebuild-question-index.cjs                        # 只检查（默认），有差异 exit=1
 *   node scripts/rebuild-question-index.cjs --apply                # 全量重写 index.json / idMap.json
 *   node scripts/rebuild-question-index.cjs --provinces 内蒙古,西藏   # 附带指定省份明细
 *   PUBLISH_ROOT=/path/to/repo node scripts/rebuild-question-index.cjs  # 指定仓库根
 *
 * 退出码：0 通过；1 校验失败 / 存在差异（检查模式）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TAG = '[rebuild-index]';
const ROOT = process.env.PUBLISH_ROOT
  ? path.resolve(process.env.PUBLISH_ROOT)
  : path.resolve(__dirname, '..');
const DST = path.join(ROOT, 'public', 'data', 'questions');

/** 目标分片命名：<category>-<province>-<module>-<chunk>.json */
const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;
const SPECIAL_FILES = new Set(['index.json', 'idMap.json', 'questions.json']);
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');

function fail(msg) {
  console.error(`${TAG} 失败：${msg}`);
  process.exit(1);
}

function readArgValue(flag) {
  for (let i = 0; i < ARGV.length; i += 1) {
    if (ARGV[i] === flag) return ARGV[i + 1] || '';
    if (ARGV[i].startsWith(`${flag}=`)) return ARGV[i].slice(flag.length + 1);
  }
  return '';
}

const WATCH_PROVINCES = readArgValue('--provinces')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function num(n) {
  return Number(n).toLocaleString('en-US');
}

function listShards(dir) {
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && !SPECIAL_FILES.has(f))
    .sort();
}

function readShard(dir, name) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  } catch (err) {
    throw new Error(`${name} 解析失败：${err.message}`);
  }
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
  let total = 0;
  for (const name of names) {
    for (const q of readShard(dir, name)) {
      total += 1;
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
  return { idMap: out, total };
}

function stat(file) {
  if (!fs.existsSync(file)) return null;
  const s = fs.statSync(file);
  return { size: s.size, mtime: s.mtime.toISOString() };
}

function main() {
  if (!fs.existsSync(DST)) fail(`目录不存在：${DST}`);
  const names = listShards(DST);
  if (!names.length) fail('目录内没有分片');

  const bad = names.filter(n => !parseShardName(n));
  if (bad.length) fail(`存在不符合命名规范的分片：${bad.join(', ')}`);

  const index = buildIndex(names);
  const { idMap, total } = buildIdMap(DST, names);

  // 一致性自检：index 覆盖全部且仅覆盖实际分片；idMap 每个 id 均指向真实分片
  const referenced = new Set(Object.values(index).flat());
  const indexExact =
    referenced.size === names.length && names.every(n => referenced.has(n));
  const idMapOk = Object.entries(idMap).every(
    ([, refs]) => Array.isArray(refs) && refs.length > 0 && refs.every(n => referenced.has(n))
  );
  if (!indexExact) fail(`index 分片覆盖不一致（引用 ${num(referenced.size)} / 实际 ${num(names.length)}）`);
  if (!idMapOk) fail('idMap 存在指向不存在分片的条目');

  const indexPath = path.join(DST, 'index.json');
  const idMapPath = path.join(DST, 'idMap.json');
  const beforeIndex = stat(indexPath);
  const beforeIdMap = stat(idMapPath);

  const oldIndexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
  const oldIdMapText = fs.existsSync(idMapPath) ? fs.readFileSync(idMapPath, 'utf8') : null;
  const newIndexText = JSON.stringify(index);
  const newIdMapText = JSON.stringify(idMap);
  const indexSame = oldIndexText === newIndexText;
  const idMapSame = oldIdMapText === newIdMapText;

  if (APPLY) {
    fs.writeFileSync(indexPath, newIndexText, 'utf8');
    fs.writeFileSync(idMapPath, newIdMapText, 'utf8');
  }

  const afterIndex = stat(indexPath);
  const afterIdMap = stat(idMapPath);

  console.log(`${TAG} 分片 ${num(names.length)} 个 / 题目 ${num(total)} 道`);
  console.log(
    `${TAG} index：${num(Object.keys(index).length)} 键 / ${num(referenced.size)} 条分片引用（覆盖${indexExact ? '完整' : '不完整'}）`
  );
  console.log(`${TAG} idMap：${num(Object.keys(idMap).length)} 个题目 ID（全部指向真实分片：${idMapOk ? '是' : '否'}）`);
  console.log(
    `${TAG} index.json：${APPLY ? '已写入' : '未写入'}，原有 ${beforeIndex ? num(beforeIndex.size) + ' B' : '缺失'} → 重建 ${num(Buffer.byteLength(newIndexText, 'utf8'))} B，${indexSame ? '字节一致' : '内容有变化'}`
  );
  console.log(
    `${TAG} idMap.json：${APPLY ? '已写入' : '未写入'}，原有 ${beforeIdMap ? num(beforeIdMap.size) + ' B' : '缺失'} → 重建 ${num(Buffer.byteLength(newIdMapText, 'utf8'))} B，${idMapSame ? '字节一致' : '内容有变化'}`
  );
  if (APPLY && (afterIndex?.mtime !== beforeIndex?.mtime || afterIdMap?.mtime !== beforeIdMap?.mtime)) {
    console.log(`${TAG} mtime：index ${afterIndex?.mtime} / idMap ${afterIdMap?.mtime}`);
  }

  if (WATCH_PROVINCES.length) {
    const byProvince = new Map();
    for (const name of names) {
      const parsed = parseShardName(name);
      if (!parsed) continue;
      if (!byProvince.has(parsed.province)) {
        byProvince.set(parsed.province, { shards: [], questions: 0, ids: new Set() });
      }
      byProvince.get(parsed.province).shards.push(name);
    }
    for (const [province, bucket] of byProvince) {
      if (!WATCH_PROVINCES.includes(province)) continue;
      for (const name of bucket.shards) {
        for (const q of readShard(DST, name)) {
          bucket.questions += 1;
          const id = String(q?.id ?? '').trim();
          if (id) bucket.ids.add(id);
        }
      }
      const keys = Object.keys(index).filter(k => k.split('-')[1] === province);
      const hit = [...bucket.ids].filter(id => idMap[id]).length;
      console.log(
        `${TAG} ${province}：分片 ${num(bucket.shards.length)} / 题目 ${num(bucket.questions)} / idMap 命中 ${num(hit)}` +
          ` / index 键 ${keys.length}（${keys.map(k => k.split('-')[2]).join('/')}）`
      );
    }
    const missing = WATCH_PROVINCES.filter(p => !byProvince.has(p));
    if (missing.length) fail(`指定省份无分片：${missing.join(', ')}`);
  }

  const drift = !indexExact || !idMapOk || (!APPLY && (!indexSame || !idMapSame));
  if (drift) {
    const reasons = [
      indexExact ? '' : 'index 覆盖不一致',
      idMapOk ? '' : 'idMap 指向异常',
      APPLY ? '' : indexSame ? '' : 'index.json 与重建结果不一致',
      APPLY ? '' : idMapSame ? '' : 'idMap.json 与重建结果不一致',
    ].filter(Boolean);
    console.error(`${TAG} 检查未通过：${reasons.join('；')}（加 --apply 可全量重写）`);
    process.exit(1);
  }
  console.log(`${TAG} 检查通过：索引与目录内容完全一致。`);
}

main();
