#!/usr/bin/env node
/**
 * 图推字母图落库后的 roundtrip 校验（只读，不改任何数据）
 *
 * 校验口径
 * --------
 *   A. 分片级：拿 apply 前的备份（_backup-<日期>-stem-letters）与当前分片逐题逐字段比对，
 *      **除预期字段外必须完全一致**（数组长度、题目顺序、键顺序、其余字段值全部相等）；
 *      预期字段来源：compose 预览 CSV —— 状态=ok 的题只允许 stem 变；状态=failed 的题
 *      允许 stem + imageUrl 变（imageUrl 置空）。
 *   B. 值级：29 题 stem 必须等于通用题干；6 题 imageUrl 必须是空串；其余 23 题 imageUrl 原样。
 *   C. 格式级：每个改动分片仍能被 JSON.stringify(arr,null,2) + 原行尾无损还原（只改了值，没重排）。
 *   D. 图片级：23 张现图 = 预览合成图（sha256 相等）；备份原图 = git HEAD 里的原图
 *      （git hash-object 相等），保证原图可回滚、没被换错。
 *   E. 范围级：git status --porcelain -- public/data 里出现的路径，只允许这 23 张图 + 改动分片。
 *
 * 用法
 * ----
 *   node scripts/verify-figure-letters-apply.cjs
 *   node scripts/verify-figure-letters-apply.cjs --backup scripts/out/_backup-2026-11-21-stem-letters \
 *        --csv scripts/out/compose-figure-option-letters-2026-11-21-preview.csv \
 *        --image-backup scripts/out/_backup-letters-2026-11-21
 *
 * 输出
 * ----
 *   - 控制台 + scripts/out/verify-figure-letters-apply-<日期>.txt
 *   - scripts/out/verify-figure-letters-apply-<日期>-diff.csv（逐字段差异清单）
 *   - 有任一违规 → 退出码 1
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data', 'questions');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');
const DATE = new Date().toLocaleDateString('sv-SE');
const STEM_FALLBACK = '请从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定的规律性：';

const argv = process.argv.slice(2);
function argValue(name, fallback) {
  const hit = argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = argv.indexOf(hit);
  const inline = hit.includes('=') ? hit.split('=').slice(1).join('=') : null;
  return inline !== null ? inline : argv[idx + 1] || fallback;
}

const BACKUP_DIR = path.resolve(ROOT, argValue('backup', `scripts/out/_backup-${DATE}-stem-letters`));
const IMAGE_BACKUP_DIR = path.resolve(ROOT, argValue('image-backup', `scripts/out/_backup-letters-${DATE}`));
const CSV_FILE = path.resolve(
  ROOT,
  argValue('csv', 'scripts/out/compose-figure-option-letters-2026-11-21-preview.csv'),
);

const violations = [];
const warns = [];
const bad = (msg) => violations.push(msg);
const warn = (msg) => warns.push(msg);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const clip = (s, n = 50) => (s.length <= n ? s : `${s.slice(0, n)}…`);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 从 compose 预览 CSV 读预期：ok → 只许 stem 变；failed → 许 stem + imageUrl 变 */
function readExpectation() {
  if (!fs.existsSync(CSV_FILE)) {
    bad(`预览报告不存在：${rel(CSV_FILE)}`);
    return { allowed: new Map(), stemIds: [], urlIds: [], imageRows: [] };
  }
  const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  const idx = {
    id: header.indexOf('id'),
    status: header.indexOf('状态'),
    imageUrl: header.indexOf('imageUrl'),
    out: header.indexOf('输出文件'),
  };
  if (idx.id < 0 || idx.status < 0) {
    bad(`预览报告缺少 id/状态 列：${rel(CSV_FILE)} → ${header.join('|')}`);
    return { allowed: new Map(), stemIds: [], urlIds: [], imageRows: [] };
  }
  const allowed = new Map();
  const stemIds = [];
  const urlIds = [];
  const imageRows = [];
  const bump = (id, field) => {
    if (!allowed.has(id)) allowed.set(id, new Set());
    allowed.get(id).add(field);
  };
  for (const row of rows.slice(1)) {
    const id = (row[idx.id] || '').trim();
    if (!id) continue;
    const status = (row[idx.status] || '').trim();
    const imageUrl = idx.imageUrl >= 0 ? (row[idx.imageUrl] || '').trim() : '';
    const outFile = idx.out >= 0 ? (row[idx.out] || '').trim() : '';
    if (status === 'ok' || status === 'failed') {
      stemIds.push(id);
      bump(id, 'stem');
    }
    if (status === 'failed') {
      urlIds.push(id);
      bump(id, 'imageUrl');
    }
    if (status === 'ok') imageRows.push({ id, imageUrl, outFile });
  }
  return { allowed, stemIds, urlIds, imageRows };
}

/** 逐题逐字段比对：返回预期差异 + 违规 */
function compareShard(oldArr, newArr, allowed) {
  const diffs = [];
  if (!Array.isArray(oldArr) || !Array.isArray(newArr)) {
    bad('分片不是数组，无法比对');
    return diffs;
  }
  if (oldArr.length !== newArr.length) bad(`数组长度变了：${oldArr.length} → ${newArr.length}`);
  const n = Math.min(oldArr.length, newArr.length);
  for (let i = 0; i < n; i++) {
    const o = oldArr[i] || {};
    const w = newArr[i] || {};
    const id = String(o.id || '');
    if (id !== String(w.id || '')) {
      bad(`第 ${i} 项 id 变了：${id} → ${w.id}`);
      continue;
    }
    const keys = Object.keys(o);
    const nextKeys = Object.keys(w);
    if (keys.join(',') !== nextKeys.join(',')) bad(`${id} 键集合/顺序变了`);
    for (const field of new Set([...keys, ...nextKeys])) {
      if (JSON.stringify(o[field]) === JSON.stringify(w[field])) continue;
      const allow = allowed.get(id);
      if (allow && allow.has(field)) diffs.push({ id, field, before: o[field], after: w[field] });
      else {
        bad(
          `${id} 出现预期外改动：字段 ${field}（${clip(JSON.stringify(o[field]))} → ${clip(JSON.stringify(w[field]))}）`,
        );
      }
    }
  }
  return diffs;
}

/** 注意：不要在这里 trim —— git status --porcelain 第一行的状态列以空格开头 */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function main() {
  const lines = [];
  const out = (s = '') => lines.push(s);

  out('===== 图推字母图落库 roundtrip 校验 =====');
  out(`日期        : ${DATE}`);
  out(`分片备份    : ${rel(BACKUP_DIR)}`);
  out(`图片备份    : ${rel(IMAGE_BACKUP_DIR)}`);
  out(`预期来源    : ${rel(CSV_FILE)}`);
  out('');

  const { allowed, stemIds, urlIds, imageRows } = readExpectation();
  out('-- 一、预期 --');
  out(`  题干应改     : ${stemIds.length} 题（状态=ok/failed 全部）`);
  out(`  imageUrl 置空: ${urlIds.length} 题（状态=failed）`);
  out(`  图片应换     : ${imageRows.length} 张（状态=ok）`);
  out(`  允许改动字段 : ${stemIds.length} 处 stem + ${urlIds.length} 处 imageUrl`);
  out('');

  // ---- A/B/C 分片级 ----
  const shardFiles = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'))
    : [];
  if (!fs.existsSync(BACKUP_DIR)) bad(`分片备份目录不存在：${rel(BACKUP_DIR)}`);
  else if (!shardFiles.length) bad(`分片备份目录里没有 json：${rel(BACKUP_DIR)}`);

  const allDiffs = [];
  out(`-- 二、分片 roundtrip（${shardFiles.length} 个分片）--`);
  for (const file of shardFiles) {
    const abs = path.join(DATA_DIR, file);
    const oldRaw = fs.readFileSync(path.join(BACKUP_DIR, file), 'utf8');
    if (!fs.existsSync(abs)) {
      bad(`当前分片不存在：${rel(abs)}`);
      continue;
    }
    const newRaw = fs.readFileSync(abs, 'utf8');
    let oldArr;
    let newArr;
    try {
      oldArr = JSON.parse(oldRaw);
      newArr = JSON.parse(newRaw);
    } catch (e) {
      bad(`${file} JSON 解析失败：${e.message}`);
      continue;
    }
    const diffs = compareShard(oldArr, newArr, allowed);
    allDiffs.push(...diffs.map((d) => ({ ...d, file })));

    const ending = newRaw.endsWith('\n') ? '\n' : '';
    const stable = JSON.stringify(newArr, null, 2) + ending === newRaw;
    if (!stable) bad(`${file} 格式不稳：JSON.stringify(arr,null,2) 无法无损还原（缩进/键序被重排）`);
    out(
      `  ${stable ? '✓' : '✗'} ${file}  ${oldArr.length} 题  差异 ${diffs.length} 处  ${stable ? '格式可无损还原' : '格式被重排'}`,
    );
  }
  out('');

  const stemDiffs = allDiffs.filter((d) => d.field === 'stem');
  const urlDiffs = allDiffs.filter((d) => d.field === 'imageUrl');
  const otherDiffs = allDiffs.filter((d) => d.field !== 'stem' && d.field !== 'imageUrl');
  out('-- 三、逐字段差异 --');
  out(
    `  实际差异合计 : ${allDiffs.length} 处（stem ${stemDiffs.length} / imageUrl ${urlDiffs.length} / 其它 ${otherDiffs.length}）`,
  );
  if (allDiffs.length !== stemIds.length + urlIds.length) {
    bad(`差异条数 ${allDiffs.length} ≠ 预期 ${stemIds.length + urlIds.length}`);
  }

  const badStem = stemDiffs.filter((d) => d.after !== STEM_FALLBACK);
  badStem.forEach((d) => bad(`${d.id} 的 stem 不是通用题干：${clip(String(d.after), 60)}`));
  const LETTERS = /^[ABCD][ \t\u3000.．、]+[ABCD][ \t\u3000.．、]+[ABCD][ \t\u3000.．、]+[ABCD]$/;
  const notLetters = stemDiffs.filter((d) => !LETTERS.test(String(d.before).trim()));
  notLetters.forEach((d) => warn(`${d.id} 改前的题干不是「A B C D」形态：${clip(String(d.before), 40)}`));
  const badUrl = urlDiffs.filter((d) => d.after !== '');
  badUrl.forEach((d) => bad(`${d.id} 的 imageUrl 不是空串：${JSON.stringify(d.after)}`));
  out(`  stem 非通用题干 : ${badStem.length} 处（应为 0）`);
  out(`  imageUrl 非空串 : ${badUrl.length} 处（应为 0）`);
  out(`  其它字段改动    : ${otherDiffs.length} 处（应为 0）`);
  out('');

  // ---- D 图片级 ----
  out(`-- 四、图片 roundtrip（${imageRows.length} 张）--`);
  const imagePaths = [];
  let imgOk = 0;
  for (const row of imageRows) {
    const live = path.join(ROOT, 'public', row.imageUrl.replace(/^\/+/, ''));
    const preview = path.resolve(ROOT, row.outFile);
    const backup = path.join(IMAGE_BACKUP_DIR, path.basename(live));
    imagePaths.push(rel(live));
    if (!fs.existsSync(live)) {
      bad(`${row.id} 现图不存在：${rel(live)}`);
      continue;
    }
    if (!fs.existsSync(backup)) {
      bad(`${row.id} 备份原图不存在：${rel(backup)}`);
      continue;
    }
    const liveHash = sha256(live);
    const backupHash = sha256(backup);
    const previewHash = fs.existsSync(preview) ? sha256(preview) : '';
    if (liveHash !== previewHash) bad(`${row.id} 现图 ≠ 预览合成图：${rel(live)}`);
    if (liveHash === backupHash) bad(`${row.id} 现图与备份原图相同（没换成新图？）`);
    let headHash = '';
    try {
      headHash = git(['rev-parse', `HEAD:${rel(live)}`]).trim();
    } catch {
      warn(`${row.id} git HEAD 里没有 ${rel(live)}（无法核对原始版本）`);
    }
    const backupBlob = git(['hash-object', rel(backup)]).trim();
    if (headHash && headHash !== backupBlob) bad(`${row.id} 备份原图 ≠ git HEAD 版本（备份可能不是落库前的原图）`);
    if (liveHash === previewHash && backupHash !== liveHash) imgOk += 1;
  }
  out(`  ${imgOk === imageRows.length ? '✓' : '✗'} 现图=预览合成图、备份=HEAD 原图：${imgOk}/${imageRows.length}`);
  out('');

  // ---- E 范围级 ----
  out('-- 五、git status 范围（public/data）--');
  let statusLines = [];
  try {
    const raw = git(['status', '--porcelain', '--', 'public/data']);
    statusLines = raw
      ? raw
          .split('\n')
          .filter((l) => l.trim() !== '')
      : [];
  } catch (e) {
    bad(`git status 执行失败：${e.message}`);
  }
  const shardPaths = new Set(shardFiles.map((f) => `public/data/questions/${f}`));
  const imageSet = new Set(imagePaths);
  const unexpected = [];
  for (const line of statusLines) {
    // porcelain 格式：XY + 空格 + 路径（X 可能是空格，所以不能 trim 后再切）
    const p = line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/');
    out(`  ${line.trimEnd()}`);
    if (!shardPaths.has(p) && !imageSet.has(p)) unexpected.push(p);
  }
  if (!statusLines.length) out('  （无改动）');
  unexpected.forEach((p) => bad(`public/data 出现预期外改动：${p}`));
  out('');

  // ---- 结论 ----
  if (warns.length) {
    out(`-- WARN（${warns.length}）--`);
    warns.forEach((w) => out(`  ! ${w}`));
    out('');
  }
  if (violations.length) {
    out(`-- ERROR（${violations.length}）--`);
    violations.forEach((v) => out(`  ✗ ${v}`));
    out('');
  }
  out(
    violations.length
      ? '结论：✗ roundtrip 校验未通过，见上方 ERROR。'
      : `结论：✓ roundtrip 通过 —— ${shardFiles.length} 个分片仅改动 ${stemDiffs.length} 处 stem + ${urlDiffs.length} 处 imageUrl，其余题目/字段/格式逐字节一致；${imgOk} 张图现图=预览、备份=HEAD。`,
  );

  const baseName = `verify-figure-letters-apply-${DATE}`;
  const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
  const csvPath = path.join(OUT_DIR, `${baseName}-diff.csv`);
  out(`报告文件     : ${rel(txtPath)}`);
  out(`差异清单 CSV : ${rel(csvPath)}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', '分片', '字段', '改前', '改后'];
  const csvRows = allDiffs.map((d) =>
    [d.id, d.file, d.field, clip(String(d.before), 120), clip(String(d.after), 120)].map(esc).join(','),
  );
  fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(csvPath, '\uFEFF' + [head.join(','), ...csvRows].join('\n') + '\n', 'utf8');
  process.stdout.write(lines.join('\n') + '\n');
  return violations.length ? 1 : 0;
}


process.exitCode = main();


