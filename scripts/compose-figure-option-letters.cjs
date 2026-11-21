#!/usr/bin/env node
/**
 * 图形推理「选项字母」合成 —— 第一阶段：只产出预览，严禁覆盖原图
 *
 * 背景
 * ----
 * 2000–2010 国考图推的 imageUrl 里只有题干图形 + 4 个选项图形，选项字母（A/B/C/D）
 * 原本在扫描件里被裁掉了；题干里的 "A B C D" 孤儿字母行清理后，页面上就只剩
 * 「选项图形从左至右依次为 A、B、C、D」这一句提示。本脚本把字母**画到图里**
 * 每个选项图形的正下方，风格对齐 2010 年图（字母居中在各选项格子下方、黑体、纯黑）。
 *
 * 安全边界（第一阶段）
 * -------------------
 *   1. 只读 public/data/questions/images/ 下的原图，**不写、不覆盖、不改名**；
 *   2. 所有产物写到 scripts/out/_letter-preview/（PNG），原图所在目录不动；
 *   3. --out 必须落在 scripts/out/ 内，脚本拒绝任何指向 public/ 的输出目录。
 *
 * 版式识别（宁可不画，也不硬画）
 * ------------------------------
 *   1. 转灰度 → Otsu 二值化 → 行/列墨迹投影；
 *   2. 找「长水平线」（该行墨迹 ≥ 50% 图宽）当作框线；
 *   3. 判定选项行：
 *      · 最后一条水平线**下方还有成块内容**（≥3 个列簇）→ 无边框选项行（如 2006 一卷 52）；
 *      · 否则取最后两条水平线围成的框 → 有边框选项行（如 2000/2001、2003-A 23–25）；
 *   4. 选项区高度占全图 > 60% → 判为「整图就是题干两套图形」（如 2003-A 16–21），
 *      记失败，不画；
 *   5. 有框：按**四等分**切 4 个单元格，要求每格都有图形墨迹、格线处不得压住图形；
 *      无框：列簇必须恰好 4 个（取最大的 3 个间隙当分隔）。
 *   6. 失败一律进失败清单，给出原因，不产生半成品图。
 *
 * 字母画法
 * --------
 *   · 字体 SimHei（黑体）优先，回退 Microsoft YaHei / Noto Sans SC / sans-serif；
 *   · 纯黑 #000，字高 = 图宽 × 5%（clamp 11–18px），与 2010 年图实测一致；
 *   · 水平居中在各选项单元格的图形中心；
 *   · 垂直：框下留白足够 → 直接画在框外；不够 → 画布下延补白后再画（--no-extend 则
 *     压缩字号塞进现有留白）。**任何情况下都不覆盖选项图形本体。**
 *
 * 用法
 * ----
 *   node scripts/compose-figure-option-letters.cjs                    # 预览（默认，29 题）
 *   node scripts/compose-figure-option-letters.cjs --limit 5          # 只跑前 5 题
 *   node scripts/compose-figure-option-letters.cjs --no-extend        # 不扩画布
 *   node scripts/compose-figure-option-letters.cjs --no-sheet         # 不生成拼贴
 *
 * 输出
 * ----
 *   - scripts/out/_letter-preview/<id>.png                          合成结果（单张）
 *   - scripts/out/_letter-preview/PREVIEW-29-sheet.png              29 图拼贴总览（带 id 标签）
 *   - scripts/out/compose-figure-option-letters-<日期>-preview.txt  成功/失败统计 + 逐题几何
 *   - scripts/out/compose-figure-option-letters-<日期>-preview.csv  逐题明细（UTF-8 BOM）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_DIR = path.join(ROOT, 'public', 'data', 'questions');
const IMAGES_DIR = path.join(QUESTIONS_DIR, 'images');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');
const DATE = new Date().toLocaleDateString('sv-SE');

// ---------------------------------------------------------------- 参数

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const argOf = (n, def) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const CSV_IN = path.resolve(argOf('--csv', path.join(OUT_DIR, 'clean-figure-stem-letters-2026-11-21-dryrun.csv')));
const OUT_IMG = path.resolve(argOf('--out', path.join(OUT_DIR, '_letter-preview')));
const EXTEND = !has('--no-extend');
const NO_SHEET = has('--no-sheet');
const LIMIT = Number(argOf('--limit', '0')) || 0;
const SHEET_NAME = 'PREVIEW-29-sheet.png';

const REPORT_TXT = path.join(OUT_DIR, `compose-figure-option-letters-${DATE}-preview.txt`);
const REPORT_CSV = path.join(OUT_DIR, `compose-figure-option-letters-${DATE}-preview.csv`);

// 安全阀：输出目录必须在 scripts/out 下，绝不落到 public/
if (!OUT_IMG.toLowerCase().startsWith(OUT_DIR.toLowerCase())) {
  console.error(`拒绝执行：--out 必须位于 ${OUT_DIR} 内（当前 ${OUT_IMG}）`);
  process.exit(2);
}

// ---------------------------------------------------------------- 小工具

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function layoutFail(msg) {
  const e = new Error(msg);
  e.isLayout = true;
  throw e;
}

/** 极简 CSV 解析（支持双引号包裹与 "" 转义） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Otsu 阈值 + 墨迹掩码（1 = 墨迹） */
function buildMask(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) mask[i] = gray[i] <= thr ? 1 : 0;
  return { mask, thr };
}

/** 把连续命中行合并成分组（框线厚度可能 1–3px） */
function groupHits(hits) {
  const groups = [];
  for (const y of hits) {
    const g = groups[groups.length - 1];
    if (g && y - g.y2 <= 1) g.y2 = y;
    else groups.push({ y, y2: y });
  }
  return groups;
}

/** 统计 [y0,y1]×[x0,x1] 区间内每列墨迹数 */
function colCounts(mask, W, y0, y1, x0, x1) {
  const arr = new Int32Array(W);
  for (let y = y0; y <= y1; y++) {
    const off = y * W;
    for (let x = x0; x <= x1; x++) if (mask[off + x]) arr[x]++;
  }
  return arr;
}

/** 列簇：把有墨迹的列连成段，丢掉过窄的段（框线/噪点） */
function columnRuns(colInk, x0, x1, minWidth) {
  const runs = [];
  let s = -1;
  for (let x = x0; x <= x1; x++) {
    const on = colInk[x] > 0;
    if (on && s < 0) s = x;
    if ((!on || x === x1) && s >= 0) {
      const e = on ? x : x - 1;
      runs.push({ x0: s, x1: e, w: e - s + 1, cx: (s + e) / 2 });
      s = -1;
    }
  }
  return runs.filter((r) => r.w >= minWidth);
}

/** 按最大的 k-1 个间隙把列簇分成 k 组 */
function groupRuns(runs, k) {
  if (runs.length < k) return null;
  const gaps = [];
  for (let i = 1; i < runs.length; i++) gaps.push({ i, g: runs[i].x0 - runs[i - 1].x1 - 1 });
  const sorted = [...gaps].sort((a, b) => b.g - a.g);
  const seps = sorted.slice(0, k - 1);
  const minSep = Math.min(...seps.map((s) => s.g));
  const nextG = sorted.length > k - 1 ? sorted[k - 1].g : -1;
  const sepIdx = new Set(seps.map((s) => s.i));
  const groups = [];
  let cur = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    if (sepIdx.has(i)) { groups.push(cur); cur = [runs[i]]; } else cur.push(runs[i]);
  }
  groups.push(cur);
  return {
    groups: groups.map((g) => ({
      x0: g[0].x0,
      x1: g[g.length - 1].x1,
      cx: (g[0].x0 + g[g.length - 1].x1) / 2,
      parts: g.length,
    })),
    minSep,
    nextG,
  };
}



// ---------------------------------------------------------------- 版式识别

async function analyze(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (W < 120 || H < 40) layoutFail(`图像尺寸异常（${W}x${H}）`);

  const { mask, thr } = buildMask(data);
  let ink = 0;
  for (let i = 0; i < mask.length; i++) ink += mask[i];
  const inkRatio = ink / (W * H);
  if (inkRatio < 0.004) layoutFail(`图像几乎空白（墨迹占比 ${(inkRatio * 100).toFixed(2)}%）`);
  if (inkRatio > 0.45) layoutFail(`图像异常偏黑（墨迹占比 ${(inkRatio * 100).toFixed(2)}%）`);

  const rowInk = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let c = 0;
    const off = y * W;
    for (let x = 0; x < W; x++) c += mask[off + x];
    rowInk[y] = c;
  }

  // 1) 长水平线 = 框线
  const lineThr = Math.max(10, Math.round(W * 0.5));
  const lineRows = [];
  for (let y = 0; y < H; y++) if (rowInk[y] >= lineThr) lineRows.push(y);
  const lines = groupHits(lineRows);
  if (!lines.length) layoutFail('未找到水平框线（无 ≥50% 图宽的横线），无法定位选项行');

  const inkRowThr = Math.max(2, Math.round(W * 0.004));
  let lastInkRow = H - 1;
  while (lastInkRow >= 0 && rowInk[lastInkRow] < inkRowThr) lastInkRow--;
  if (lastInkRow < 0) layoutFail('整张图没有可识别墨迹');

  const lastLine = lines[lines.length - 1];
  const belowY0 = lastLine.y2 + 3;
  const belowH = lastInkRow - belowY0 + 1;

  let region = null;
  let framed = false;
  let bottomRef = 0;
  let regionNote = '';

  // 2a) 最后一条框线下方还有成块内容 → 无边框选项行
  if (belowH >= 8) {
    const belowCols = colCounts(mask, W, belowY0, lastInkRow, 0, W - 1);
    const runs = columnRuns(belowCols, 0, W - 1, 3);
    if (runs.length >= 3) {
      region = {
        x0: Math.max(0, runs[0].x0 - 2),
        x1: Math.min(W - 1, runs[runs.length - 1].x1 + 2),
        y0: belowY0,
        y1: lastInkRow,
      };
      framed = false;
      bottomRef = lastInkRow;
      regionNote = `无边框：末条框线 y=${lastLine.y2} 下方 ${belowH}px 内有 ${runs.length} 个列簇`;
    }
  }

  // 2b) 否则取最后两条框线围成的框
  if (!region) {
    if (lines.length < 2) layoutFail('只有一条水平框线，围不出选项框');
    const boxTop = lines[lines.length - 2];
    const boxBot = lines[lines.length - 1];
    const boxH = boxBot.y - boxTop.y2;
    if (boxH < 10) layoutFail(`最后两条框线间距 ${boxH}px，围不出选项框`);
    const y0 = boxTop.y2 + 2;
    const y1 = boxBot.y - 2;
    if (y1 - y0 < 8) layoutFail(`选项框内高只有 ${y1 - y0 + 1}px`);

    const colInkBox = colCounts(mask, W, y0, y1, 0, W - 1);
    const vThr = Math.max(4, Math.round((y1 - y0 + 1) * 0.7));
    const vCols = [];
    for (let x = 0; x < W; x++) if (colInkBox[x] >= vThr) vCols.push(x);
    const vGroups = groupHits(vCols);
    let x0;
    let x1;
    if (vGroups.length >= 2) {
      x0 = vGroups[0].y2 + 2;
      x1 = vGroups[vGroups.length - 1].y - 2;
    } else {
      const inked = [];
      for (let x = 0; x < W; x++) if (colInkBox[x] > 0) inked.push(x);
      if (!inked.length) layoutFail('选项框内没有墨迹');
      x0 = inked[0];
      x1 = inked[inked.length - 1];
    }
    if (x1 - x0 < 60) layoutFail(`选项框内宽只有 ${x1 - x0 + 1}px`);

    region = { x0, x1, y0, y1 };
    framed = true;
    bottomRef = boxBot.y2;
    regionNote = `有边框：框 y=${boxTop.y}..${boxBot.y2}（高 ${boxH + 1}px），内区 x=${x0}..${x1}`;
  }

  // 3) 选项区不能占满整图（否则就是题干两套图形）
  const regionH = region.y1 - region.y0 + 1;
  const regionHPct = Math.round((regionH / H) * 100);
  if (regionH > H * 0.6) {
    layoutFail(
      `选项区高 ${regionH}px = 全图 ${regionHPct}%，不是底部独立一条（疑似整图为题干两套图形，图内没有独立选项行）`,
    );
  }
  if (regionH < 10) layoutFail(`选项区高只有 ${regionH}px，太窄`);

  // 4) 定 4 个单元格
  const spanW = region.x1 - region.x0 + 1;
  const cellW = spanW / 4;
  const colInkRegion = colCounts(mask, W, region.y0, region.y1, region.x0, region.x1);
  const divider = new Uint8Array(W);
  for (let x = region.x0; x <= region.x1; x++) divider[x] = colInkRegion[x] >= regionH * 0.8 ? 1 : 0;

  const runs = columnRuns(colInkRegion, region.x0, region.x1, 3);
  const cells = [];
  let cellMode = '';

  if (framed) {
    // 四等分（用户口径）：每格必须有图形墨迹，格线处不得压着图形
    for (let i = 0; i < 4; i++) {
      const qx0 = Math.round(region.x0 + i * cellW);
      const qx1 = Math.round(region.x0 + (i + 1) * cellW) - 1;
      if (i > 0) {
        const bx = Math.round(region.x0 + i * cellW);
        let cross = 0;
        for (let x = bx - 1; x <= bx + 1; x++) {
          if (x < region.x0 || x > region.x1) continue;
          if (colInkRegion[x] > 0 && !divider[x]) cross++;
        }
        if (cross > 0) layoutFail(`第 ${i}/${i + 1} 格分界 x=${bx} 处压着图形墨迹（非格线），四等分不成立`);
      }
      let sum = 0;
      let minX = -1;
      let maxX = -1;
      for (let x = qx0; x <= qx1; x++) {
        if (divider[x]) continue;
        if (colInkRegion[x] > 0) {
          sum += colInkRegion[x];
          if (minX < 0) minX = x;
          maxX = x;
        }
      }
      if (sum < 25 || minX < 0) layoutFail(`四等分第 ${i + 1} 格（x=${qx0}..${qx1}）里没有图形墨迹`);
      cells.push({ i, x0: qx0, x1: qx1, figX0: minX, figX1: maxX, cx: (minX + maxX) / 2, ink: sum });
    }
    cellMode = '有框→四等分';
  } else {
    const g = groupRuns(runs, 4);
    if (!g) layoutFail(`底部只找到 ${runs.length} 个列簇（≠4 个图形），不硬画`);
    if (g.minSep < 4) layoutFail(`列簇最小间隙只有 ${g.minSep}px，分不清 4 个选项`);
    if (g.nextG >= 0 && g.minSep < g.nextG * 1.2) {
      layoutFail(`列簇间隙差异过小（第 3 大 ${g.minSep}px / 第 4 大 ${g.nextG}px），无法确定 4 格`);
    }
    const widths = g.groups.map((c) => c.x1 - c.x0 + 1);
    if (Math.max(...widths) > Math.min(...widths) * 2.5) {
      layoutFail(`4 个列簇宽窄差 ${Math.min(...widths)}–${Math.max(...widths)}px，疑似不是 4 个选项`);
    }
    g.groups.forEach((c, i) => {
      cells.push({ i, x0: c.x0, x1: c.x1, figX0: c.x0, figX1: c.x1, cx: c.cx, ink: 0 });
    });
    cellMode = '无框→列簇四格';
  }

  // 5) 四格中心与四等分中心偏差校验（防"看着像 4 个其实错位"）
  const maxDev = Math.max(...cells.map((c) => Math.abs(c.cx - (region.x0 + (c.i + 0.5) * cellW))));
  if (maxDev > cellW * 0.35) {
    layoutFail(
      `4 个图形中心与四等分中心最大偏差 ${maxDev.toFixed(1)}px（> 0.35 格宽 = ${(cellW * 0.35).toFixed(1)}px），版式对不上`,
    );
  }

  return {
    W,
    H,
    thr,
    inkRatio,
    framed,
    cellMode,
    region,
    regionNote,
    regionHPct,
    cellW,
    cells,
    bottomRef,
    maxDev,
  };
}



// ---------------------------------------------------------------- 合成

const LETTERS = ['A', 'B', 'C', 'D'];

function svgFor(W, H, items, fontPx, baseline) {
  const texts = items
    .map(
      (it) =>
        `<text x="${it.cx.toFixed(2)}" y="${baseline.toFixed(2)}" font-family="SimHei, 'Microsoft YaHei', 'Noto Sans SC', 'Source Han Sans SC', sans-serif" font-size="${fontPx.toFixed(2)}" fill="#000000" text-anchor="middle">${it.ch}</text>`,
    )
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="none"/>${texts}</svg>`,
  );
}

/** 量出渲染结果的墨迹包围盒（按 alpha 通道，避免透明像素被当成黑色） */
async function inkBBox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * ch + 3] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function renderLetters(W, H, items, capH, top) {
  let fontPx = capH / 0.72;
  let baseline = top + capH;
  let box = null;
  for (let pass = 0; pass < 3; pass++) {
    const png = await sharp(svgFor(W, H, items, fontPx, baseline)).png().toBuffer();
    box = await inkBBox(png);
    if (!box) layoutFail('字母渲染为空（字体不可用？）');
    const scale = capH / box.h;
    const dy = top - box.minY;
    if (Math.abs(1 - scale) < 0.01 && Math.abs(dy) <= 1) return { png, box, fontPx, baseline };
    fontPx *= scale;
    baseline += dy;
  }
  const png = await sharp(svgFor(W, H, items, fontPx, baseline)).png().toBuffer();
  return { png, box, fontPx, baseline };
}

async function compose(file, geo, outFile) {
  const { W, H } = geo;
  const desiredCap = clamp(Math.round(W * 0.05), 11, 18);
  const gapBelow = Math.max(3, Math.round(W * 0.022));
  const margin = H - 1 - geo.bottomRef;

  let capH = desiredCap;
  let gap = gapBelow;
  let newH = H;
  let placed = '框外';
  if (margin < gap + capH + 1) {
    if (EXTEND) {
      newH = H + (gap + capH + 2 - margin);
      placed = `框外（画布下延 ${newH - H}px）`;
    } else {
      if (margin < 11) layoutFail(`底部留白只有 ${margin}px，--no-extend 下放不下字母`);
      capH = clamp(margin - 2, 9, desiredCap);
      gap = 1;
      placed = '框内底部（压缩字号）';
    }
  }
  const top = geo.bottomRef + gap;

  const items = geo.cells.map((c, i) => ({ ch: LETTERS[i], cx: clamp(c.cx, 6, W - 7) }));
  const { png, box, fontPx, baseline } = await renderLetters(W, newH, items, capH, top);
  if (baseline + 1 > newH) layoutFail(`字母基线 ${baseline.toFixed(1)} 超出画布 ${newH}px`);

  let baseBuf = await sharp(file).flatten({ background: '#ffffff' }).toColourspace('srgb').png().toBuffer();
  if (newH > H) baseBuf = await sharp(baseBuf).extend({ bottom: newH - H, background: '#ffffff' }).png().toBuffer();
  const outBuf = await sharp(baseBuf).composite([{ input: png, left: 0, top: 0 }]).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(outFile, outBuf);

  return { capH, fontPx, baseline, gap, top, newH, extended: newH - H, placed, letterBox: box };
}

/**
 * 校验「原图区一个像素都没动」：把合成图的上 H 行与原图做墨迹比对。
 * 字母只画在 bottomRef 下方（含下延区），所以差异必须为 0。
 */
async function verifyNoTouch(srcFile, outFile, W, H) {
  const a = await sharp(srcFile).greyscale().raw().toBuffer();
  const b = await sharp(outFile).extract({ left: 0, top: 0, width: W, height: H }).greyscale().raw().toBuffer();
  if (a.length !== b.length) return { diff: -1, inkA: 0, inkB: 0 };
  let diff = 0;
  let inkA = 0;
  let inkB = 0;
  for (let i = 0; i < a.length; i++) {
    const ia = a[i] < 200 ? 1 : 0;
    const ib = b[i] < 200 ? 1 : 0;
    inkA += ia;
    inkB += ib;
    if (ia !== ib) diff++;
  }
  return { diff, inkA, inkB };
}


// ---------------------------------------------------------------- 拼贴总览

const shortId = (id) => id.replace(/^gk-/, '').replace(/-未标注-/, '-').replace(/-A卷-/, 'A-').replace(/-一卷-/, '1-');

async function buildSheet(entries, outFile) {
  const cols = 4;
  const cellW = 340;
  const pad = 14;
  const labelH = 18;
  const tiles = [];
  for (const r of entries) {
    const m = await sharp(r.file).metadata();
    tiles.push({ r, w: cellW, h: Math.round((m.height * cellW) / m.width) });
  }
  const placed = [];
  let y = pad;
  for (let i = 0; i < tiles.length; i += cols) {
    const row = tiles.slice(i, i + cols);
    const rowH = Math.max(...row.map((t) => t.h));
    row.forEach((t, j) => placed.push({ ...t, x: pad + j * (cellW + pad), y, rowH }));
    y += rowH + pad + labelH;
  }
  const totalW = pad + cols * (cellW + pad);
  const totalH = y;

  const comps = [];
  for (const p of placed) {
    const buf = await sharp(p.r.file)
      .resize({ width: p.w, height: p.h, fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    comps.push({ input: buf, left: p.x, top: p.y });
  }
  const labels = placed
    .map(
      (p) =>
        `<text x="${p.x}" y="${p.y + p.rowH + 13}" font-family="SimHei, 'Microsoft YaHei', sans-serif" font-size="12" fill="${p.r.ok ? '#444444' : '#b00020'}">${p.r.label}</text>`,
    )
    .join('');
  const labelPng = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">${labels}</svg>`),
  )
    .png()
    .toBuffer();
  comps.push({ input: labelPng, left: 0, top: 0 });

  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: '#f4f4f4' } })
    .composite(comps)
    .png({ compressionLevel: 9 })
    .toFile(outFile);
  return { totalW, totalH };
}


// ---------------------------------------------------------------- 主流程

async function main() {
  if (!fs.existsSync(CSV_IN)) {
    console.error(`找不到 id 清单：${CSV_IN}`);
    process.exit(2);
  }
  const rows = parseCsv(fs.readFileSync(CSV_IN, 'utf8').replace(/^\uFEFF/, ''));
  const header = rows[0];
  const iId = header.indexOf('id');
  const iShard = header.indexOf('分片');
  const iRes = header.indexOf('结果');
  if (iId < 0 || iRes < 0) {
    console.error(`CSV 缺少 id / 结果 列：${header.join('|')}`);
    process.exit(2);
  }

  let targets = rows
    .slice(1)
    .filter((r) => r[iRes] === 'replace-stem')
    .map((r) => ({ id: r[iId], shard: r[iShard] }));
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  if (!targets.length) {
    console.error('清单里没有 结果=replace-stem 的行');
    process.exit(1);
  }

  // imageUrl 索引：只读清单里出现过的分片
  const byId = new Map();
  const shards = [...new Set(targets.map((t) => t.shard).filter(Boolean))];
  for (const f of shards) {
    const p = path.join(QUESTIONS_DIR, f);
    if (!fs.existsSync(p)) continue;
    for (const q of JSON.parse(fs.readFileSync(p, 'utf8'))) byId.set(q.id, q);
  }

  fs.mkdirSync(OUT_IMG, { recursive: true });
  const ok = [];
  const bad = [];
  const entries = []; // 拼贴用：按清单顺序，成功用合成图、失败用原图并标红

  for (const t of targets) {
    const q = byId.get(t.id);
    const url = (q && q.imageUrl) || '';
    if (!url) {
      bad.push({ ...t, url, reason: '题目没有 imageUrl' });
      entries.push({ id: t.id, ok: false, file: null, label: `${shortId(t.id)}  未画` });
      continue;
    }
    const abs = path.join(ROOT, 'public', url.replace(/^\//, ''));
    if (!fs.existsSync(abs)) {
      bad.push({ ...t, url, reason: `图片文件不存在：${url}` });
      entries.push({ id: t.id, ok: false, file: null, label: `${shortId(t.id)}  未画` });
      continue;
    }
    const outFile = path.join(OUT_IMG, `${t.id}.png`);
    try {
      const geo = await analyze(abs);
      const done = await compose(abs, geo, outFile);
      done.noTouch = await verifyNoTouch(abs, outFile, geo.W, geo.H);
      if (done.noTouch.diff !== 0) {
        layoutFail(`原图区被改动了 ${done.noTouch.diff} 个像素（字母越界），已丢弃该输出`);
      }
      ok.push({ ...t, url, geo, done, outFile });
      entries.push({ id: t.id, ok: true, file: outFile, label: shortId(t.id) });
    } catch (e) {
      // 失败不留半成品
      try {
        if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });
      } catch {
        /* ignore */
      }
      let dims = '';
      try {
        const m = await sharp(abs).metadata();
        dims = `${m.width}x${m.height}`;
      } catch {
        dims = '';
      }
      bad.push({ ...t, url, dims, reason: e.message });
      entries.push({ id: t.id, ok: false, file: abs, label: `${shortId(t.id)}  未画` });
    }
  }

  // 拼贴（缺图的题没有原图可放，直接跳过）
  let sheet = null;
  const sheetEntries = entries.filter((e) => e.file && fs.existsSync(e.file));
  if (!NO_SHEET && sheetEntries.length) {
    const sheetPath = path.join(OUT_IMG, `PREVIEW-${targets.length}-sheet.png`);
    sheet = { path: sheetPath, ...(await buildSheet(sheetEntries, sheetPath)) };
  }

  // 报告
  const L = [];
  const out = (s = '') => L.push(s);
  out('===== 图推选项字母合成（第一阶段：只出预览）=====');
  out(`模式      : 预览（原图只读，产物写 ${path.relative(ROOT, OUT_IMG).replace(/\\/g, '/')}）`);
  out(`日期      : ${DATE}`);
  out(`id 清单   : ${path.relative(ROOT, CSV_IN).replace(/\\/g, '/')}（取 结果=replace-stem）`);
  out(`画布下延  : ${EXTEND ? '允许（留白不足时补白）' : '禁止（--no-extend，压缩字号塞进现有留白）'}`);
  out('');
  out('-- 一、总览 --');
  out(`  目标题数      : ${targets.length} 题`);
  out(`  成功（已合成）: ${ok.length} 题`);
  out(`  失败（未画）  : ${bad.length} 题`);
  out(`  其中画布下延  : ${ok.filter((r) => r.done.extended > 0).length} 题`);
  out(`  原图          : public/data/questions/images 只读，未写入/未改名`);
  out(`  原图区校验    : ${ok.length} 张合成图的上半部分与原图逐像素比对，差异像素为 0 的 ${ok.filter((r) => r.done.noTouch.diff === 0).length}/${ok.length} 张`);
  out(`  拼贴口径      : 成功 ${ok.length} 张用合成图 + 失败 ${bad.length} 张用原图（标签标红「未画」）`);
  if (sheet) out(`  拼贴总览      : ${path.relative(ROOT, sheet.path).replace(/\\/g, '/')}（${sheet.totalW}x${sheet.totalH}）`);
  out('');
  out('-- 二、成功明细 --');
  out('  #   id                       尺寸        版式             选项区(y)    四格中心x                   字高 基线  放置');
  ok.forEach((r, i) => {
    const g = r.geo;
    const d = r.done;
    out(
      `  ${String(i + 1).padStart(2)}  ${r.id.padEnd(24)} ${`${g.W}x${g.H}`.padEnd(10)} ${g.cellMode.padEnd(16)} ` +
        `${`${g.region.y0}-${g.region.y1}`.padEnd(12)} ${g.cells.map((c) => c.cx.toFixed(0)).join('/').padEnd(27)} ` +
        `${String(d.capH).padStart(3)}  ${String(Math.round(d.baseline)).padStart(4)}  ${d.placed}`,
    );
  });
  out('');
  out('-- 三、失败清单（未画，需人工处理）--');
  if (!bad.length) out('  （无）');
  bad.forEach((r, i) => {
    out(`  ${String(i + 1).padStart(2)}  ${r.id}  ${r.url || '-'}${r.dims ? `  [${r.dims}]` : ''}`);
    out(`      原因：${r.reason}`);
  });
  if (bad.length) {
    out('');
    out('  判读提示：失败题的图高若明显比同批矮（本批正常 110–112px，失败 6 题只有 54–55px），');
    out('  说明扫描图只裁到「题干两套图形」、选项行被裁掉了 —— 这种题画不了字母，只能回原书/原 docx 重新裁图。');
  }
  out('');
  out('-- 四、口径说明 --');
  out('  1. 字高 = 图宽 × 5%（clamp 11–18px），对齐 2010 年图实测比例；黑体（SimHei）纯黑。');
  out('  2. 水平位置 = 该选项格内图形墨迹的中心；有框按四等分切格，无框按 4 个列簇切格。');
  out('  3. 垂直位置 = 选项框底边 / 末行墨迹下方，间隔 ≈ 图宽 × 2.2%；留白不够时下延画布，');
  out('     不覆盖任何图形像素（--no-extend 时改为压缩字号塞进现有留白）。');
  out('  4. 失败一律不画：找不到框线、选项区占全图 >60%（两套题干图形）、列簇 ≠4、');
  out('     格线压图形、四格中心与四等分偏差 >0.35 格宽、图片缺失/异常。');
  out('  5. 本阶段只产出预览 PNG，没有写 public/data、没有改 questions JSON、没有改 imageUrl。');

  fs.writeFileSync(REPORT_TXT, L.join('\n') + '\n', 'utf8');

  const head = ['id', '分片', 'imageUrl', '原图尺寸', '版式', '选项区y', '四格中心x', '字高px', '基线y', '放置方式', '画布下延px', '原图区差异像素', '输出文件', '状态', '原因'];
  const lines = [head.join(',')];
  for (const r of ok) {
    lines.push(
      [
        r.id,
        r.shard,
        r.url,
        `${r.geo.W}x${r.geo.H}`,
        r.geo.cellMode,
        `${r.geo.region.y0}-${r.geo.region.y1}`,
        r.geo.cells.map((c) => c.cx.toFixed(1)).join(' / '),
        r.done.capH,
        r.done.baseline.toFixed(1),
        r.done.placed,
        r.done.extended,
        r.done.noTouch.diff,
        path.relative(ROOT, r.outFile).replace(/\\/g, '/'),
        'ok',
        '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const r of bad) {
    lines.push([r.id, r.shard, r.url, '', '', '', '', '', '', '', '', '', '', 'failed', r.reason].map(csvEscape).join(','));
  }
  fs.writeFileSync(REPORT_CSV, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');

  // 控制台摘要
  console.log(L.slice(0, 24).join('\n'));
  console.log(`\n报告：${path.relative(ROOT, REPORT_TXT).replace(/\\/g, '/')}`);
  console.log(`明细：${path.relative(ROOT, REPORT_CSV).replace(/\\/g, '/')}`);
  if (sheet) console.log(`拼贴：${path.relative(ROOT, sheet.path).replace(/\\/g, '/')}`);
  if (bad.length) console.log(`\n失败 ${bad.length} 题，详见报告第三节。`);
}

main().catch((e) => {
  console.error('运行失败：', e && e.stack ? e.stack : e);
  process.exit(1);
});

