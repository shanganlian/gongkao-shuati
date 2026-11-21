#!/usr/bin/env node
/**
 * 图推选项字母图落库（第二阶段：先备份原图，再用合成图覆盖原路径）
 *
 * 背景
 * ----
 * `compose-figure-option-letters.cjs` 只在 scripts/out/_letter-preview/ 出预览，
 * 本脚本负责把预览图**原路径覆盖**到 public/data/questions/images/，imageUrl 保持不动。
 *
 * 安全约定（按顺序执行，任一步失败即中止，不留半成品）
 * ----------------------------------------------------
 *   1. 只处理预览报告里 状态=ok 的行，张数必须等于 --expect（默认 23）；
 *   2. 合成图、原图都必须存在；合成图必须是 PNG，且与原图哈希不同（相同则幂等跳过）；
 *   3. 覆盖前先把原图复制到备份目录，复制后再比哈希确认备份可用；
 *      —— 备份已存在时不覆盖备份，只校验它与当前原图哈希是否一致，
 *         不一致（原图被别的批次改过？）就报错中止，避免把旧备份当成本次原图；
 *   4. 合成图 copy 到原路径后重新算哈希，必须等于合成图哈希；再用 sharp 读尺寸进报告；
 *   5. 全程不删任何文件；imageUrl 字段不动（原路径覆盖，不需要改名）。
 *
 * 用法
 * ----
 *   node scripts/apply-figure-option-letter-images.cjs                  # dry-run（默认，只看计划）
 *   node scripts/apply-figure-option-letter-images.cjs --apply          # 备份 + 覆盖原图
 *   node scripts/apply-figure-option-letter-images.cjs --restore        # 用备份回滚原图
 *   node scripts/apply-figure-option-letter-images.cjs --csv <预览CSV> --backup <备份目录>
 *   node scripts/apply-figure-option-letter-images.cjs --expect 23      # 张数校验（0 = 关闭）
 *
 * 输出
 * ----
 *   - 控制台 + scripts/out/apply-figure-letter-images-<日期>-<dryrun|apply|restore>.txt
 *   - scripts/out/apply-figure-letter-images-<日期>-<mode>.csv（逐图明细）
 *   - 备份目录 _manifest.csv（id / imageUrl / 备份文件 / 原图哈希 / 新图哈希 / 尺寸）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'data', 'questions', 'images');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');
const DATE = new Date().toLocaleDateString('sv-SE');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply') && !argv.includes('--dry-run');
const RESTORE = argv.includes('--restore');

function argValue(name, fallback) {
  const hit = argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = argv.indexOf(hit);
  const inline = hit.includes('=') ? hit.split('=').slice(1).join('=') : null;
  return inline !== null ? inline : argv[idx + 1] || fallback;
}

const CSV_FILE = path.resolve(
  ROOT,
  argValue('csv', 'scripts/out/compose-figure-option-letters-2026-11-21-preview.csv'),
);
const BACKUP_DIR = path.resolve(ROOT, argValue('backup', `scripts/out/_backup-letters-${DATE}`));
const EXPECT = Number(argValue('expect', 23)) || 0;

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** 极简 CSV 解析（支持双引号转义，够读 compose 报告） */
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
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
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
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 读 compose 预览 CSV，只取 状态=ok 的行 */
function readPlan() {
  if (!fs.existsSync(CSV_FILE)) {
    fail(`预览报告不存在：${rel(CSV_FILE)}`);
    return [];
  }
  const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
  if (!rows.length) {
    fail(`预览报告为空：${rel(CSV_FILE)}`);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  const need = ['id', 'imageUrl', '输出文件', '状态'];
  const missing = need.filter((k) => header.indexOf(k) < 0);
  if (missing.length) {
    fail(`预览报告缺少列 ${missing.join('/')}：${rel(CSV_FILE)} → ${header.join('|')}`);
    return [];
  }
  const idx = Object.fromEntries(need.map((k) => [k, header.indexOf(k)]));
  const plan = [];
  for (const row of rows.slice(1)) {
    const id = (row[idx.id] || '').trim();
    if (!id) continue;
    if ((row[idx['状态']] || '').trim() !== 'ok') continue;
    const imageUrl = (row[idx.imageUrl] || '').trim();
    const previewFile = (row[idx['输出文件']] || '').trim();
    if (!imageUrl || !previewFile) {
      fail(`${id} 预览报告行缺少 imageUrl / 输出文件`);
      continue;
    }
    plan.push({
      id,
      imageUrl,
      src: path.resolve(ROOT, previewFile),
      dst: path.join(PUBLIC_DIR, imageUrl.replace(/^\/+/, '')),
    });
  }
  return plan;
}

async function sharpMeta(file) {
  const sharp = require('sharp');
  const meta = await sharp(file).metadata();
  return `${meta.width}x${meta.height} ${meta.format}`;
}

function checkPaths(item) {
  if (!fs.existsSync(item.src)) {
    fail(`${item.id} 合成图不存在：${rel(item.src)}`);
    return false;
  }
  if (!fs.existsSync(item.dst)) {
    fail(`${item.id} 原图不存在：${rel(item.dst)}`);
    return false;
  }
  if (path.resolve(path.dirname(item.dst)) + path.sep !== path.resolve(IMAGES_DIR) + path.sep) {
    fail(`${item.id} 目标不在 images 目录内，拒写：${rel(item.dst)}`);
    return false;
  }
  if (path.resolve(item.src) === path.resolve(item.dst)) {
    fail(`${item.id} 合成图与原图是同一文件，拒绝自覆盖`);
    return false;
  }
  if (!/\.png$/i.test(item.src)) {
    fail(`${item.id} 合成图不是 PNG：${rel(item.src)}`);
    return false;
  }
  return true;
}

function duplicateTargets(plan) {
  const seen = new Map();
  for (const item of plan) {
    const key = path.resolve(item.dst).toLowerCase();
    if (seen.has(key)) fail(`两题指向同一张原图：${seen.get(key)} / ${item.id} → ${rel(item.dst)}`);
    else seen.set(key, item.id);
  }
}

async function main() {
  const lines = [];
  const out = (s = '') => lines.push(s);
  const mode = RESTORE ? 'restore' : APPLY ? 'apply' : 'dryrun';

  out('===== 图推选项字母图落库（原路径覆盖）=====');
  out(
    `模式      : ${RESTORE ? 'restore（用备份回滚原图）' : APPLY ? 'apply（备份 + 覆盖原图）' : 'dry-run（不写任何文件）'}`,
  );
  out(`日期      : ${DATE}`);
  out(`预览报告  : ${rel(CSV_FILE)}`);
  out(`原图目录  : ${rel(IMAGES_DIR)}`);
  out(`备份目录  : ${rel(BACKUP_DIR)}`);
  out('');

  if (RESTORE) return await runRestore(out, lines, mode);

  const plan = readPlan();
  duplicateTargets(plan);
  if (EXPECT && plan.length !== EXPECT) fail(`预览报告命中 ${plan.length} 张（状态=ok），期望 ${EXPECT} 张`);

  const rows = [];
  for (const item of plan) {
    if (!checkPaths(item)) continue;
    const srcHash = sha256(item.src);
    const dstHash = sha256(item.dst);
    const backupPath = path.join(BACKUP_DIR, path.basename(item.dst));
    const row = {
      ...item,
      backupPath,
      beforeHash: dstHash,
      afterHash: srcHash,
      status: '',
      note: '',
      dims: '',
    };
    if (srcHash === dstHash) {
      row.status = 'same';
      row.note = '合成图与原图字节相同（已落库过），跳过';
      warn(`${item.id} 合成图与原图完全相同，跳过`);
    } else if (fs.existsSync(backupPath)) {
      if (sha256(backupPath) !== dstHash) {
        row.status = 'backup-conflict';
        row.note = '备份已存在但与当前原图哈希不同（原图被别的批次改过？）';
        fail(`${item.id} 备份 ${rel(backupPath)} 与当前原图不一致，拒绝覆盖（需人工确认）`);
      } else {
        row.status = 'backup-exists';
        row.note = '备份已存在且与当前原图一致，复用';
      }
    } else {
      row.status = 'planned';
      row.note = '待备份 + 覆盖';
    }

    const writable = row.status === 'planned' || row.status === 'backup-exists';
    if (APPLY && writable) {
      try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(item.dst, backupPath);
          const copied = sha256(backupPath);
          if (copied !== row.beforeHash) {
            throw new Error(`备份哈希不一致：${copied.slice(0, 12)} ≠ ${row.beforeHash.slice(0, 12)}`);
          }
          row.note = '已备份原图';
        }
        fs.copyFileSync(item.src, item.dst);
        const written = sha256(item.dst);
        if (written !== row.afterHash) {
          throw new Error(`写入哈希不一致：${written.slice(0, 12)} ≠ ${row.afterHash.slice(0, 12)}`);
        }
        row.dims = await sharpMeta(item.dst);
        row.status = 'written';
        row.note = `${row.note}；已覆盖原路径`;
      } catch (e) {
        row.status = 'write-failed';
        row.note = e.message;
        fail(`${item.id} 落库失败：${e.message}`);
      }
    } else {
      try {
        row.dims = await sharpMeta(item.dst);
      } catch {
        row.dims = '';
      }
    }
    rows.push(row);
  }

  const written = rows.filter((r) => r.status === 'written');
  const same = rows.filter((r) => r.status === 'same');
  const blocked = rows.filter((r) => r.status === 'write-failed' || r.status === 'backup-conflict');

  out('-- 一、总览 --');
  out(`  计划张数      : ${plan.length} 张`);
  out(`  待写 / 已写   : ${rows.filter((r) => r.status === 'planned' || r.status === 'written').length} 张`);
  out(`  本来就是新图  : ${same.length} 张（幂等跳过）`);
  out(`  失败 / 拦截   : ${blocked.length} 张`);
  out('  imageUrl 改动 : 0 处（原路径覆盖，字段不动）');
  out('');

  out(`-- 二、逐图明细（${rows.length} 张）--`);
  if (!rows.length) out('  （无）');
  rows.forEach((r, i) => {
    out(`[${String(i + 1).padStart(2)}] ${r.id}  → ${r.status}`);
    out(`      imageUrl: ${r.imageUrl}`);
    out(`      合成图  : ${rel(r.src)}`);
    out(`      哈希    : ${r.beforeHash.slice(0, 12)} → ${r.afterHash.slice(0, 12)}`);
    if (r.dims) out(`      现行尺寸: ${r.dims}`);
    out(`      说明    : ${r.note}`);
  });
  out('');

  return await writeReport(out, lines, mode, rows, { written, same, plan });
}

/** 报告落盘：txt（完整）+ csv（逐图）+ 备份清单 _manifest.csv */
async function writeReport(out, lines, mode, rows, meta) {
  const { written, same } = meta;
  if (warnings.length) {
    out(`-- WARN（${warnings.length}）--`);
    warnings.forEach((w) => out(`  ! ${w}`));
    out('');
  }
  if (errors.length) {
    out(`-- ERROR（${errors.length}）--`);
    errors.forEach((e) => out(`  ✗ ${e}`));
    out('');
  }

  const baseName = `apply-figure-letter-images-${DATE}-${mode}`;
  const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
  const csvPath = path.join(OUT_DIR, `${baseName}.csv`);
  const manifestPath = path.join(BACKUP_DIR, '_manifest.csv');
  out(`报告文件     : ${rel(txtPath)}`);
  out(`逐图明细 CSV : ${rel(csvPath)}`);
  if (APPLY) out(`备份清单     : ${rel(manifestPath)}`);
  out('');

  if (errors.length) {
    out('结论：存在 ERROR，本次未全部落库（已写入的图可用 --restore 回滚）。');
  } else if (!APPLY) {
    const toWrite = rows.filter((r) => r.status === 'planned').length;
    out(
      `结论：dry-run 完成（未写任何文件）。加 --apply 将：备份 ${toWrite} 张原图到 ${rel(BACKUP_DIR)}，然后覆盖原路径；imageUrl 不动。`,
    );
  } else {
    out(`结论：已覆盖 ${written.length} 张原图（备份在 ${rel(BACKUP_DIR)}），幂等跳过 ${same.length} 张。`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'imageUrl', '合成图', '备份文件', '原图sha256', '新图sha256', '尺寸', '状态', '说明'];
  const csvRows = rows.map((r) =>
    [r.id, r.imageUrl, rel(r.src), rel(r.backupPath), r.beforeHash, r.afterHash, r.dims, r.status, r.note]
      .map(esc)
      .join(','),
  );
  fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(csvPath, '\uFEFF' + [head.join(','), ...csvRows].join('\n') + '\n', 'utf8');
  if (APPLY) {
    const mHead = ['id', 'imageUrl', '备份文件', '原图sha256', '新图sha256', '尺寸', '时间'];
    const stamp = new Date().toISOString();
    const mRows = rows
      .filter((r) => r.status === 'written' || r.status === 'backup-exists')
      .map((r) =>
        [r.id, r.imageUrl, path.basename(r.backupPath), r.beforeHash, r.afterHash, r.dims, stamp].map(esc).join(','),
      );
    fs.writeFileSync(manifestPath, '\uFEFF' + [mHead.join(','), ...mRows].join('\n') + '\n', 'utf8');
  }

  process.stdout.write(lines.join('\n') + '\n');
  return errors.length ? 1 : 0;
}

/** --restore：按备份目录里的图片回滚原路径（不碰 imageUrl、不删文件） */
async function runRestore(out, lines, mode) {
  if (!fs.existsSync(BACKUP_DIR)) fail(`备份目录不存在：${rel(BACKUP_DIR)}`);
  const files = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    : [];
  if (!files.length) fail(`备份目录里没有图片：${rel(BACKUP_DIR)}`);

  const rows = [];
  out('-- 一、回滚明细 --');
  for (const file of files) {
    const src = path.join(BACKUP_DIR, file);
    const dst = path.join(IMAGES_DIR, file);
    const srcHash = sha256(src);
    const dstHash = fs.existsSync(dst) ? sha256(dst) : '';
    const row = { file, dst, beforeHash: dstHash, afterHash: srcHash, status: '', note: '' };
    if (srcHash === dstHash) {
      row.status = 'same';
      row.note = '已与原图一致，跳过';
    } else {
      try {
        fs.copyFileSync(src, dst);
        if (sha256(dst) !== srcHash) throw new Error('回滚后哈希不一致');
        row.status = dstHash ? 'restored' : 'restored-new';
        row.note = dstHash ? '已回滚' : '原路径原本没有文件，已补回';
      } catch (e) {
        row.status = 'restore-failed';
        row.note = e.message;
        fail(`${file} 回滚失败：${e.message}`);
      }
    }
    out(`  ${file}  ${row.status}  ${row.note}`);
    rows.push(row);
  }
  out('');
  if (errors.length) {
    out(`-- ERROR（${errors.length}）--`);
    errors.forEach((e) => out(`  ✗ ${e}`));
    out('');
  }

  const baseName = `apply-figure-letter-images-${DATE}-${mode}`;
  const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
  const csvPath = path.join(OUT_DIR, `${baseName}.csv`);
  out(`报告文件     : ${rel(txtPath)}`);
  out(`逐图明细 CSV : ${rel(csvPath)}`);
  out('');
  const restored = rows.filter((r) => r.status.startsWith('restored')).length;
  out(`结论：回滚 ${restored} 张，跳过 ${rows.filter((r) => r.status === 'same').length} 张。`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['备份文件', '原图路径', '回滚前sha256', '备份sha256', '状态', '说明'];
  const csvRows = rows.map((r) => [r.file, rel(r.dst), r.beforeHash, r.afterHash, r.status, r.note].map(esc).join(','));
  fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(csvPath, '\uFEFF' + [head.join(','), ...csvRows].join('\n') + '\n', 'utf8');
  process.stdout.write(lines.join('\n') + '\n');
  return errors.length ? 1 : 0;
}

/** 用 exitCode 而不是 process.exit()：避免 Windows 管道/重定向下 stdout 被截断 */
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });




