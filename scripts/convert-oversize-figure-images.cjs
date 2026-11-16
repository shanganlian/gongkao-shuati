#!/usr/bin/env node
/**
 * 图形推理超限配图转 webp（2026-11-16，sharp 试点）
 *
 * 背景：extract-figure-images.cjs 对 >100KB 的配图直接 ERROR（工程未内置图像编码能力），
 * 导致 3 张图卡住整卷：2002 B卷 #99（114.6KB）、2004 B卷 #50（194.2KB）、2006 二卷 #79（143.8KB）。
 * 本脚本用 sharp（devDependency）把它们压到 ≤100KB 并转 webp：
 *   - 文件名沿用 extract 的命名，只把扩展名换成 .webp → public/data/questions/images/gk-<年>-<卷>-<题号>.webp
 *   - 同步把条目补进对应 scripts/out/figure-extract-<年>-<卷>.report.json 的 produced[]，
 *     并重算 verification / 去掉该题「超过 100KB」的 error，便于后续对账与复核
 *   - 另出 <scripts/out/figure-oversize-webp-<日期>.map.json>（items[]: id/imageUrl），
 *     供 scripts/apply-figure-image-urls.cjs --map … --apply 写回 imageUrl
 *
 * 纪律：
 *   - 只处理下面 ENTRIES 白名单里的 3 题；docx 媒体字节数必须与 sourceBytes 完全一致，否则 ERROR（防错位）
 *   - 幂等：目标 webp 已存在且 ≤100KB 时只看不写（--force 覆盖）；report 里已有同 id 条目则更新而非重复追加
 *   - 只写图片文件与 report.json，不碰题目分片（imageUrl 由 apply-figure-image-urls.cjs 负责）
 *
 * 用法：
 *   node scripts/convert-oversize-figure-images.cjs            # 只读检查（试压 + 打印结果，不写文件）
 *   node scripts/convert-oversize-figure-images.cjs --apply    # 落盘 webp + 更新 report + 生成 map
 *   node scripts/convert-oversize-figure-images.cjs --force    # 允许覆盖已存在的 webp
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'source-data', '国考真题（2000--2026)', '4-行测', '1-行测-真题', 'word');
const OUT_IMG_DIR = path.join(ROOT, 'public', 'data', 'questions', 'images');
const REPORT_DIR = path.join(ROOT, 'scripts', 'out');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const DATE = new Date().toLocaleDateString('sv-SE');

const MAX_BYTES = 100 * 1024;
const MIN_PX = 100;
const MIN_LONG_SIDE_PX = MIN_PX * 2;
const QUALITIES = [82, 76, 70, 64, 58, 52, 46, 40];

/** 超限清单（docx 媒体与字节数一一锁定，防错位） */
const ENTRIES = [
  {
    id: 'gk-2002-B卷-99', number: 99, year: '2002', tag: 'B', report: 'figure-extract-2002-B.report.json',
    docx: '2002年国家公务员录用考试《行测》真题（B卷）.docx',
    media: 'word/media/image7.png', sourceBytes: 117370, paragraph: 361,
  },
  {
    id: 'gk-2004-B卷-50', number: 50, year: '2004', tag: 'B', report: 'figure-extract-2004-B.report.json',
    docx: '2004年国家公务员录用考试《行测》真题（B卷）.docx',
    media: 'word/media/image6.png', sourceBytes: 198865, paragraph: 144,
  },
  {
    id: 'gk-2006-二卷-79', number: 79, year: '2006', tag: '2', report: 'figure-extract-2006-2.report.json',
    docx: '2006年国家公务员考试《行测》真题卷（二）.docx',
    media: 'word/media/image5.png', sourceBytes: 147276, paragraph: 342,
  },
];

const errors = [];
const results = [];
let reportWrites = 0;

function fail(message) {
  errors.push(message);
}

function isFragmentPixels(width, height) {
  if (!(width > 0 && height > 0)) return false;
  if (width >= MIN_PX && height >= MIN_PX) return false;
  return Math.max(width, height) < MIN_LONG_SIDE_PX;
}

/** 逐档降质量，仍超限再缩边（每次 0.85，最多 4 次） */
async function compress(buffer, sourceWidth) {
  let width = sourceWidth;
  for (let round = 0; round <= 4; round += 1) {
    for (const quality of QUALITIES) {
      let pipeline = sharp(buffer);
      if (width < sourceWidth) pipeline = pipeline.resize({ width, withoutEnlargement: true });
      const out = await pipeline.webp({ quality, effort: 6 }).toBuffer();
      if (out.length <= MAX_BYTES) return { out, quality, width };
    }
    width = Math.round(width * 0.85);
    if (width < MIN_LONG_SIDE_PX) break;
  }
  return null;
}


/** 把条目补进 report.produced[]，重算 verification，去掉该题的「超过 100KB」error */
function updateReport(entry, item) {
  const file = path.join(REPORT_DIR, entry.report);
  if (!fs.existsSync(file)) {
    fail(`找不到对账报告：scripts/out/${entry.report}`);
    return null;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const report = JSON.parse(raw);
  const produced = Array.isArray(report.produced) ? report.produced : [];
  const content = {
    number: entry.number,
    id: entry.id,
    imageUrl: item.imageUrl,
    file: item.file,
    sourcePart: entry.media,
    sourceParagraph: entry.paragraph,
    format: 'webp',
    width: item.width,
    height: item.height,
    bytes: item.bytes,
    flatCheck: {
      method: 'sharp-webp',
      flat: false,
      detail: `原 PNG ${(entry.sourceBytes / 1024).toFixed(1)}KB → webp ${(item.bytes / 1024).toFixed(1)}KB`,
    },
    confidence: 'high',
    note:
      `原图 ${(entry.sourceBytes / 1024).toFixed(1)}KB 超过 ${MAX_BYTES / 1024}KB 上限；${DATE} 用 sharp 转 webp` +
      `（quality ${item.quality}${item.resized ? `，宽度 ${item.sourceWidth}→${item.width}` : ''}）`,
    wrote: true,
  };
  const index = produced.findIndex((row) => row && row.id === entry.id);
  if (index >= 0) produced[index] = { ...produced[index], ...content };
  else produced.push(content);
  produced.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  report.produced = produced;
  const previousItems = report.postProcess && Array.isArray(report.postProcess.items) ? report.postProcess.items : [];
  const previous = previousItems.find((row) => row && row.id === entry.id);
  const unchangedItem = Boolean(previous && previous.bytes === item.bytes && previous.quality === item.quality);
  report.postProcess = {
    tool: `sharp@${sharp.versions.sharp}`,
    at: unchangedItem && report.postProcess.at ? report.postProcess.at : new Date().toISOString(),
    note: '超限配图转 webp（scripts/convert-oversize-figure-images.cjs）',
    items: previousItems
      .filter((row) => row && row.id !== entry.id)
      .concat([unchangedItem ? previous : {
        id: entry.id,
        sourcePart: entry.media,
        sourceBytes: entry.sourceBytes,
        bytes: item.bytes,
        quality: item.quality,
        width: item.width,
        height: item.height,
        resized: item.resized,
      }]),
  };

  const figureSet = new Set((report.dataSide && report.dataSide.numbers) || []);
  const expected = (report.dataSide && report.dataSide.figureQuestions) || 0;
  report.verification = {
    ...(report.verification || {}),
    expectedFigures: expected,
    producedImages: produced.length,
    countMatched: produced.length === expected && produced.every((row) => figureSet.has(row.number)),
    allHighConfidence: produced.every((row) => row.confidence === 'high'),
    allSizeAboveMin: produced.every((row) => !isFragmentPixels(row.width, row.height)),
    allNonFlat: produced.every((row) => !(row.flatCheck && row.flatCheck.flat)),
    allUnderByteLimit: produced.every((row) => row.bytes <= MAX_BYTES),
  };
  report.errors = (report.errors || []).filter(
    (message) => !(message.includes(`第 ${entry.number} 题配图`) && message.includes('超过')),
  );

  const next = JSON.stringify(report, null, 2) + (raw.endsWith('\n') ? '\n' : '');
  if (APPLY && next !== raw) {
    fs.writeFileSync(file, next, 'utf8');
    reportWrites += 1;
  }
  return report;
}

(async () => {
  for (const entry of ENTRIES) {
    const docxPath = path.join(SRC_DIR, entry.docx);
    if (!fs.existsSync(docxPath)) {
      fail(`找不到 docx：${entry.docx}`);
      continue;
    }
    const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
    const file = zip.file(entry.media);
    if (!file) {
      fail(`${entry.id}：${entry.media} 不在 ${entry.docx} 内`);
      continue;
    }
    const buffer = await file.async('nodebuffer');
    if (buffer.length !== entry.sourceBytes) {
      fail(`${entry.id}：${entry.media} 实际 ${buffer.length}B，与清单 ${entry.sourceBytes}B 不一致（源文件已变，先人工核对）`);
      continue;
    }

    const meta = await sharp(buffer).metadata();
    const compressed = await compress(buffer, meta.width || 0);
    if (!compressed) {
      fail(`${entry.id}：逐档降质量 + 缩边后仍 >${MAX_BYTES / 1024}KB，需人工处理`);
      continue;
    }
    const { out, quality } = compressed;
    const outMeta = await sharp(out).metadata();
    const fileName = `gk-${entry.year}-${entry.tag}-${entry.number}.webp`;
    const outPath = path.join(OUT_IMG_DIR, fileName);
    const item = {
      id: entry.id,
      number: entry.number,
      imageUrl: `/data/questions/images/${fileName}`,
      file: fileName,
      bytes: out.length,
      width: outMeta.width || 0,
      height: outMeta.height || 0,
      quality,
      sourceWidth: meta.width || 0,
      sourceHeight: meta.height || 0,
      resized: (outMeta.width || 0) < (meta.width || 0),
      existed: fs.existsSync(outPath),
      wrote: false,
    };

    if (isFragmentPixels(item.width, item.height)) {
      fail(`${entry.id}：转档后 ${item.width}x${item.height}px 低于最小图幅，需人工确认`);
      continue;
    }
    if (APPLY && item.existed && !FORCE) {
      const size = fs.statSync(outPath).size;
      if (size > MAX_BYTES) fail(`${entry.id}：${fileName} 已存在且 ${(size / 1024).toFixed(1)}KB > 上限（加 --force 覆盖）`);
    } else if (APPLY) {
      fs.mkdirSync(OUT_IMG_DIR, { recursive: true });
      fs.writeFileSync(outPath, out);
      item.wrote = true;
    }
    results.push(item);
    if (APPLY) updateReport(entry, item);
  }

  const mapFile = path.join(REPORT_DIR, `figure-oversize-webp-${DATE}.map.json`);
  if (APPLY && !errors.length && results.length) {
    const map = {
      generatedAt: new Date().toISOString(),
      tool: `sharp@${sharp.versions.sharp}`,
      note: '超限配图转 webp 的 imageUrl 清单（供 apply-figure-image-urls.cjs --map 使用）',
      items: results.map((item) => ({ id: item.id, number: item.number, imageUrl: item.imageUrl, confidence: 'high' })),
    };
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2) + '\n', 'utf8');
  }

  console.log('== 超限配图转 webp ==');
  console.log(`模式    : ${APPLY ? 'apply' : 'dry-run'}${FORCE ? '（--force）' : ''}  sharp ${sharp.versions.sharp}`);
  for (const item of results) {
    const sourceBytes = ENTRIES.find((e) => e.id === item.id).sourceBytes;
    console.log(
      `  ${item.id.padEnd(16)} ${item.sourceWidth}x${item.sourceHeight} ${(sourceBytes / 1024).toFixed(1)}KB` +
        ` → ${item.width}x${item.height} ${(item.bytes / 1024).toFixed(1)}KB  q${item.quality}` +
        `${item.resized ? '（已缩边）' : ''} ${item.wrote ? 'written' : APPLY ? 'kept' : 'dry'}`,
    );
  }
  if (APPLY && results.length && !errors.length) {
    console.log(`清单    : ${path.relative(ROOT, mapFile).replace(/\\/g, '/')}`);
    console.log(`report  : 更新 ${reportWrites}/${results.length}（其余已是最新，未重写）`);
  }
  if (errors.length) {
    console.log(`-- ERROR（${errors.length}）--`);
    errors.forEach((message) => console.log(`  ✗ ${message}`));
    process.exit(1);
  }
  const wroteAnything = results.some((row) => row.wrote) || reportWrites > 0;
  console.log(
    APPLY
      ? wroteAnything
        ? '结论：通过，webp 已落盘、report 已更新。'
        : '结论：通过（幂等重跑：图片与 report 均未变化，未写任何文件）。'
      : '结论：dry-run 通过（未写文件）。加 --apply 落盘。',
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

