#!/usr/bin/env node
/**
 * 图形推理配图 imageUrl 写回（试点 A：2010 国考《行测》一卷之后续批次）
 *
 * 只做一件事：把「配图抽取」产出的 题 id -> imageUrl 写回题目分片，**只增加/更新 imageUrl 字段**，
 * 其余字段、字段顺序、缩进、文件末尾换行风格全部保持原样（分片本身是 JSON.stringify(arr, null, 2)
 * 且无末尾换行，这里按原始末尾换行风格原样回写，diff 只有新增的那一行）。
 *
 * 数据来源（二选一）：
 *   --report <file>   scripts/out/figure-extract-<year>.report.json（produced[] 里有 id/imageUrl）
 *   --map <file>      public/data/questions/images/figure-map.json（items[] 里有 id/imageUrl），默认
 *
 * 用法：
 *   node scripts/apply-figure-image-urls.cjs --year 2010              # dry-run：只打印将写回的条目
 *   node scripts/apply-figure-image-urls.cjs --year 2010 --apply      # 落盘
 *   node scripts/apply-figure-image-urls.cjs --report scripts/out/figure-extract-2002-A.report.json --apply
 *
 * 纪律：
 *   - 不存在的 id / 非图片题 / 图片文件缺失 / 两题指向同一张图（命名冲突）→ 直接 ERROR 退出，不落盘；
 *   - 幂等：imageUrl 已一致时记为 unchanged，不重复写文件；
 *   - 不碰 index.json / idMap.json / figure-map.json。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_DIR = path.join(ROOT, 'public', 'data', 'questions');
const DEFAULT_MAP = path.join(QUESTIONS_DIR, 'images', 'figure-map.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

function argValue(name, fallback) {
  const hit = argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = argv.indexOf(hit);
  const inline = hit.includes('=') ? hit.split('=').slice(1).join('=') : null;
  return inline !== null ? inline : argv[idx + 1] || fallback;
}

const YEAR = argValue('year', null);
const REPORT = argValue('report', null);
const MAP = argValue('map', DEFAULT_MAP);

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

// ---------------------------------------------------------------- 读来源清单

function resolveSource() {
  if (REPORT) {
    const file = path.isAbsolute(REPORT) ? REPORT : path.join(ROOT, REPORT);
    if (!fs.existsSync(file)) {
      fail(`找不到对账报告：${REPORT}`);
      return null;
    }
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = (report.produced || [])
      .filter((item) => item && item.id && item.imageUrl)
      .map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl,
        number: item.number ?? null,
        confidence: item.confidence ?? null,
      }));
    return { file, label: path.relative(ROOT, file).replace(/\\/g, '/'), items };
  }

  if (!fs.existsSync(MAP)) {
    fail(`找不到配图清单：${path.relative(ROOT, MAP)}（先跑 npm run figures:extract:apply）`);
    return null;
  }
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const all = Array.isArray(map.items) ? map.items : [];
  const items = all
    .filter((item) => item && item.id && item.imageUrl)
    .filter((item) => !YEAR || String(item.id).includes(`-${YEAR}-`))
    .map((item) => ({
      id: item.id,
      imageUrl: item.imageUrl,
      number: item.number ?? null,
      confidence: item.confidence ?? null,
    }));
  return {
    file: MAP,
    label: path.relative(ROOT, MAP).replace(/\\/g, '/'),
    items,
  };
}

// ---------------------------------------------------------------- 索引题目分片

function listShards() {
  return fs
    .readdirSync(QUESTIONS_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'index.json' && name !== 'idMap.json')
    .sort();
}

function main() {
  const source = resolveSource();
  if (!source) return summary(null);
  if (!source.items.length) {
    fail(`来源里没有可写回的条目：${source.label}${YEAR ? `（--year ${YEAR}）` : ''}`);
    return summary(null);
  }

  const parsed = new Map(); // file -> { raw, arr }
  const idIndex = new Map(); // id -> { file, q }
  for (const file of listShards()) {
    const full = path.join(QUESTIONS_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    let arr;
    try {
      arr = JSON.parse(raw);
    } catch (err) {
      fail(`${file} 不是合法 JSON：${err.message}`);
      continue;
    }
    if (!Array.isArray(arr)) continue;
    parsed.set(file, { raw, arr });
    for (const q of arr) {
      if (!q || !q.id) continue;
      if (idIndex.has(q.id)) {
        fail(`题目 id 重复：${q.id}（${idIndex.get(q.id).file} 与 ${file}）`);
        continue;
      }
      idIndex.set(q.id, { file, q });
    }
  }

  const rows = [];
  const byUrl = new Map();
  const touchedFiles = new Set();

  for (const item of source.items) {
    const hit = idIndex.get(item.id);
    if (!hit) {
      fail(`题库中找不到题目：${item.id}`);
      continue;
    }
    const { q, file } = hit;
    if (q.isImageQuestion !== true) {
      fail(`${item.id} 的 isImageQuestion 不是 true（当前 ${JSON.stringify(q.isImageQuestion)}），拒绝写 imageUrl`);
      continue;
    }
    const url = String(item.imageUrl).startsWith('/') ? String(item.imageUrl) : `/${item.imageUrl}`;
    if (byUrl.has(url)) {
      fail(`配图命名冲突：${byUrl.get(url)} 与 ${item.id} 都指向 ${url}（同一年多卷需区分文件名）`);
      continue;
    }
    byUrl.set(url, item.id);

    const diskPath = path.join(PUBLIC_DIR, url.replace(/^\//, ''));
    if (!fs.existsSync(diskPath)) {
      fail(`${item.id} 的图片文件不存在：public${url}`);
      continue;
    }
    const bytes = fs.statSync(diskPath).size;
    if (bytes === 0) {
      fail(`${item.id} 的图片是空文件：public${url}`);
      continue;
    }
    if (item.confidence && item.confidence !== 'high') {
      warnings.push(`${item.id} 配图归属置信度 ${item.confidence}（非 high），请人工抽检后再放行`);
    }

    const before = q.imageUrl ?? null;
    if (before === url) {
      rows.push({ id: item.id, file, before, after: url, status: 'unchanged', bytes });
      continue;
    }
    q.imageUrl = url;
    touchedFiles.add(file);
    rows.push({ id: item.id, file, before, after: url, status: before ? 'updated' : 'added', bytes });
  }

  // 写盘：保持原有末尾换行风格，避免整文件 diff
  let written = 0;
  if (APPLY && !errors.length) {
    for (const file of [...touchedFiles].sort()) {
      const { raw, arr } = parsed.get(file);
      const ending = raw.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(path.join(QUESTIONS_DIR, file), JSON.stringify(arr, null, 2) + ending, 'utf8');
      written += 1;
    }
  }

  return summary({ source, rows, written, touchedFiles: touchedFiles.size });
}

function summary(result) {
  console.log('== 图形推理 imageUrl 写回 ==');
  console.log(`模式         : ${APPLY ? 'apply' : 'dry-run'}${YEAR ? `（--year ${YEAR}）` : ''}`);
  if (result && result.source) {
    console.log(`来源清单     : ${result.source.label}（${result.source.items.length} 条）`);
    console.log('');
    console.log('-- 明细 --');
    for (const row of result.rows) {
      const arrow = row.status === 'unchanged' ? '=' : '→';
      console.log(
        `  ${String(row.status).padEnd(9)} ${row.id}  ${row.before ?? '(无)'} ${arrow} ${row.after}  ` +
          `[${row.file} ${(row.bytes / 1024).toFixed(1)}KB]`,
      );
    }
    const counts = result.rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    console.log('');
    console.log(
      `合计         : ${result.rows.length} 题（新增 ${counts.added || 0}、更新 ${counts.updated || 0}、` +
        `未变 ${counts.unchanged || 0}），涉及分片 ${result.touchedFiles} 个`,
    );
    if (APPLY) console.log(`已写入分片   : ${result.written} 个`);
  }
  if (warnings.length) {
    console.log('');
    console.log(`-- WARN（${warnings.length}）--`);
    warnings.forEach((item) => console.log(`  ! ${item}`));
  }
  if (errors.length) {
    console.log('');
    console.log(`-- ERROR（${errors.length}）--`);
    errors.forEach((item) => console.log(`  ✗ ${item}`));
    console.log('');
    console.log('结论：存在 ERROR，未写入任何分片。');
    return 1;
  }
  console.log('');
  console.log(
    APPLY
      ? '结论：通过，imageUrl 已写入分片（只新增/更新该字段）。'
      : '结论：dry-run 通过（未写任何文件）。加 --apply 落盘。',
  );
  return 0;
}

process.exit(main());
