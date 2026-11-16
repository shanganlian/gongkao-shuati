#!/usr/bin/env node
/**
 * 图形推理配图抽取（试点 A：2010 国考《行测》一卷）
 *
 * 数据来源（只读）：
 *   source-data/国考真题（2000--2026)/4-行测/1-行测-真题/word/<年份>…docx
 *     -> word/document.xml        段落文本 + 图片引用（r:embed / v:imagedata）
 *     -> word/_rels/document.xml.rels  rId -> word/media/*
 *     -> word/media/*             内嵌图片（原样取出，不解码不重采样）
 *
 * 产出（--apply 时）：
 *   public/data/questions/images/gk-<年>-<题号>.<png|jpg>   每题一张，真实格式后缀
 *   public/data/questions/images/figure-map.json            题 id -> 图片路径 + 置信说明
 *   scripts/out/figure-extract-<年>.report.json             对账报告
 *
 * 用法：
 *   node scripts/extract-figure-images.cjs                    # dry-run：只出对账报告
 *   node scripts/extract-figure-images.cjs --apply            # 落盘图片 + figure-map.json
 *   node scripts/extract-figure-images.cjs --apply --force    # 覆盖同名图片
 *   node scripts/extract-figure-images.cjs --year 2010
 *   node scripts/extract-figure-images.cjs --year 2005 --paper 一卷 --docx （一）
 *   node scripts/extract-figure-images.cjs --year 2002 --paper A卷 --docx A卷 --tag A
 *   node scripts/extract-figure-images.cjs --year 2002 --paper B卷 --docx B卷 --tag B --apply --only 96,97,98,104,105
 *     --only 逐题放行：只落盘名单内题号的图（同卷其它缺图题照旧报 error，figure-map.json 也不写）；
 *     用于「整卷对账」无法覆盖、但个别题已经抽出并通过质检的场景。缺省 = 产出即落盘。
 *
 * 一段多题号（2006 一卷把 51/52、53/54 并排写进同一段，如「51.          52」）：
 *   段落文本只由「题号+分隔符+空白」组成时才按多题号处理（避免把资料分析表里的「113.2」误判成两题）；
 *   该段及其后段落的图片按「版面横向位置」从左到右依次归第一个、第二个……题号：
 *     内联图（wp:inline）排最左，浮图（wp:anchor）按 positionH/posOffset 定位。
 *   2006 一卷正是「一张内联靠左 + 一张浮图靠右」，文档顺序与版面左右相反，必须按位置排。
 *
 * 分卷标签（--tag，缺省按卷名自动推导）：
 *   同一年有多卷时，图片文件名必须带卷标签，否则 gk-2002-56.jpg 会被 A/B 卷互相覆盖：
 *     卷名以「A卷 / B卷」结尾 → A / B；以「一卷 / 二卷」结尾 → 1 / 2；单卷年份 → 无标签（沿用 gk-2010-56.jpg）。
 *   落盘为 gk-<年>-<标签>-<题号>.<后缀>，对账报告为 scripts/out/figure-extract-<年>[-<标签>].report.json。
 *   注意：images/figure-map.json 只反映「最近一次运行」的卷；多卷批量写回请用各自的 report.json
 *   （node scripts/apply-figure-image-urls.cjs --report <report.json> --apply）。
 *
 * 纪律：
 *   - 源 docx 只读，绝不写回 source-data/；
 *   - 不改任何题目 JSON（imageUrl 写回是下一步，需人工抽检通过后再单独执行）；
 *   - 单张图片必须 ≤100KB，超限直接报 ERROR（不做静默压缩/降质）；
 *   - 数量对账不通过（产出数 != 该卷图形推理题数）直接 ERROR 退出。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

let JSZip;
try {
  // jszip 是 mammoth 的传递依赖，已随项目安装；显式兜底报错，避免静默失败
  JSZip = require('jszip');
} catch (err) {
  console.error('[致命] 缺少依赖 jszip（mammoth 的传递依赖）。请先 npm install。');
  process.exit(1);
}

// ---------------------------------------------------------------- 常量

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'source-data', '国考真题（2000--2026)', '4-行测', '1-行测-真题', 'word');
const QUESTIONS_DIR = path.join(ROOT, 'public', 'data', 'questions');
const OUT_IMG_DIR = path.join(QUESTIONS_DIR, 'images');
const MAP_FILE = path.join(OUT_IMG_DIR, 'figure-map.json');
const REPORT_DIR = path.join(ROOT, 'scripts', 'out');

const MAX_BYTES = 100 * 1024;
const MIN_PX = 100;
// 旧卷（2003–2005）常把「4 个选项图」并成一条横图（如 348x55 / 512x88），
// 只有一个维度达到 100px。碎片判定改为：两维都达标 -> 通过；
// 否则长边必须 >= 2*MIN_PX（横条/竖条图），避免把整套图形推理误判成公式碎片。
const MIN_LONG_SIDE_PX = MIN_PX * 2;
const MIN_JPEG_BYTES_PER_PX = 0.05;

/** 是否为公式/符号碎片（像素口径）：两维都小且长边不足 MIN_LONG_SIDE_PX */
function isFragmentPixels(width, height) {
  if (!(width > 0 && height > 0)) return false;
  if (width >= MIN_PX && height >= MIN_PX) return false;
  return Math.max(width, height) < MIN_LONG_SIDE_PX;
}

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const AS_JSON = argv.includes('--json');
// 逐题放行名单（--only 96,97,98）：只落盘这些题号；缺省为空 = 产出即落盘
const ONLY = String(argValue('only', '') || '')
  .split(',')
  .map((item) => Number(item.trim()))
  .filter((num) => Number.isInteger(num) && num > 0);
const ONLY_SET = ONLY.length ? new Set(ONLY) : null;

function argValue(name, fallback) {
  const hit = argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = argv.indexOf(hit);
  const inline = hit.includes('=') ? hit.split('=').slice(1).join('=') : null;
  return inline !== null ? inline : argv[idx + 1] || fallback;
}

const YEAR = String(argValue('year', '2010'));

/** 分卷标签：由 main 里按卷名推导或 --tag 显式指定；单卷年份为空串 */
let OUT_TAG = '';

/** 同年多卷时用于文件名的卷标签：A卷→A，B卷→B，一卷→1，二卷→2，单卷→'' */
function derivePaperTag(paperKey) {
  const key = String(paperKey || '');
  if (/A\s*卷\s*）?\s*$/.test(key)) return 'A';
  if (/B\s*卷\s*）?\s*$/.test(key)) return 'B';
  if (/一\s*卷\s*$/.test(key)) return '1';
  if (/二\s*卷\s*$/.test(key)) return '2';
  return '';
}

// ---------------------------------------------------------------- 图片元数据（纯 JS，无三方库）

function detectFormat(buf) {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  if (buf.length >= 4 && buf[0] === 0xd7 && buf[1] === 0xcd && buf[2] === 0xc6 && buf[3] === 0x9a) return 'wmf';
  if (buf.length >= 4 && buf[0] === 0x01 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x00) return 'emf';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'RIFF') return 'webp';
  return 'bin';
}

function readPngInfo(buf) {
  if (buf.length < 33 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    interlace: buf[28],
  };
}

function readJpegInfo(buf) {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const size = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
    }
    offset += 2 + size;
  }
  return null;
}

/**
 * PNG 逐像素解码（仅 8bit / 非隔行），判断是否纯色。
 * 返回 null 表示无法判定（交由字节/像素比启发式兜底）。
 */
function pngFlatCheck(buf) {
  const info = readPngInfo(buf);
  if (!info || info.bitDepth !== 8 || info.interlace !== 0) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[info.colorType];
  if (!channels) return null;

  const idat = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buf.subarray(offset + 8, offset + 8 + len));
    offset += 12 + len;
    if (type === 'IEND') break;
  }
  if (!idat.length) return null;

  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const stride = info.width * channels;
  const expected = (stride + 1) * info.height;
  if (raw.length < expected) return null;

  const out = Buffer.alloc(stride * info.height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < info.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(line);
    if (filter === 1) {
      for (let i = channels; i < stride; i += 1) cur[i] = (cur[i] + cur[i - channels]) & 0xff;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i += 1) cur[i] = (cur[i] + prev[i]) & 0xff;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i += 1) {
        const left = i >= channels ? cur[i - channels] : 0;
        cur[i] = (cur[i] + ((left + prev[i]) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i += 1) {
        const a = i >= channels ? cur[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        cur[i] = (cur[i] + pred) & 0xff;
      }
    } else if (filter !== 0) {
      return null;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }

  let distinct = 0;
  for (let i = channels; i + channels <= out.length; i += channels) {
    let same = true;
    for (let c = 0; c < channels; c += 1) {
      if (out[i + c] !== out[c]) {
        same = false;
        break;
      }
    }
    if (!same) {
      distinct += 1;
      if (distinct >= 2) break;
    }
  }
  return { method: 'pixel', flat: distinct === 0, detail: `解码 ${info.width}x${info.height}，非首像素点 ${distinct}+` };
}

/** JPEG 无解码器：用「每像素字节数」判断是否为大片纯色/空白（纯色 JPEG 压缩后极小）。 */
function jpegFlatCheck(buf, width, height) {
  const px = Math.max(1, width * height);
  const density = buf.length / px;
  const flat = buf.length < 1024 || density < MIN_JPEG_BYTES_PER_PX;
  return {
    method: 'heuristic',
    flat,
    detail: `${buf.length}B / ${px}px = ${density.toFixed(3)}B/px（阈值 ${MIN_JPEG_BYTES_PER_PX}）`,
  };
}

function inspectImage(buf) {
  const format = detectFormat(buf);
  let size = null;
  if (format === 'png') size = readPngInfo(buf);
  else if (format === 'jpg') size = readJpegInfo(buf);
  return { format, size };
}

// ---------------------------------------------------------------- docx 解析

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return ENTITY[body] ?? full;
  });
}

function parseRels(xml) {
  const map = new Map();
  const re = /<Relationship\b[^>]*>/g;
  for (const match of xml.matchAll(re)) {
    const tag = match[0];
    const id = /\bId="([^"]+)"/.exec(tag);
    const target = /\bTarget="([^"]+)"/.exec(tag);
    const type = /\bType="([^"]+)"/.exec(tag);
    if (!id || !target) continue;
    map.set(id[1], { target: target[1].replace(/^\.\//, ''), type: type ? type[1] : '' });
  }
  return map;
}

// 题号标记：56、 / 56. / 56． / 56： / 56:（旧版式用全角冒号）
const MARKER_RE = /^(\d{1,3})\s*([、．.：:])/;
// 一段多题号（2006 一卷：「51.                            52」并排两题）：
// 题号之间必须是空白，避免把资料分析表里的「113.2」「20.0」误判成两道题。
const MULTI_MARKER_RE = /^\d{1,3}\s*[、．.：:]\s+\d{1,3}(?:\s*[、．.：:]\s+\d{1,3})*\s*[、．.：:]?$/;
// 题号写在段落内部：2003 A卷 第 23 题的题号与「请开始答题：」同段（"请开始答题： 23."），
// 段首识别会漏掉它，导致该题配图被归给上一个题号。全库扫描仅此 1 处命中。
const INLINE_MARKER_RE = /请开始答题\s*[：:]\s*(\d{1,3})\s*([、．.：:])/;
// 段落内图片：DrawingML(a:blip r:embed) 与 VML(v:imagedata r:id)
const IMAGE_REF_RE = /<(?:a:blip|v:imagedata)\b[^>]*?r:(?:embed|id)="(rId\d+)"/g;
const EXTENT_RE = /<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/g;
const EMU_PER_CM = 360000;
// 段落内每张图（DrawingML 浮图/内联图、VML 图）分块取 rId + 浮动图的横向位置
const DRAWING_CHUNK_RE = /<w:(?:drawing|pict)\b[\s\S]*?<\/w:(?:drawing|pict)>/g;
const ANCHOR_X_RE = /<wp:positionH\b[^>]*>[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/;

/**
 * 拆段内图片：返回 { refs, anchorXs }，anchorXs[i] 为该图 posOffset（EMU），内联图为 null。
 * 2006 一卷 51/52、53/54 是「内联图靠左 + 浮图靠右」，文档顺序与版面左右相反，
 * 多题号段落要靠这个位置排序才能对号（见文件头说明）。
 */
function parseRefs(raw) {
  const chunks = Array.from(raw.matchAll(DRAWING_CHUNK_RE)).map((m) => m[0]);
  if (chunks.length) {
    const refs = [];
    const anchorXs = [];
    for (const chunk of chunks) {
      const id = /(?:r:embed|r:id)="(rId\d+)"/.exec(chunk);
      if (!id) continue;
      const offset = ANCHOR_X_RE.exec(chunk);
      refs.push(id[1]);
      anchorXs.push(offset ? Number(offset[1]) : null);
    }
    // 兜底：分块解析漏图时回退全段正则（位置未知 → 按文档顺序）
    const expected = Array.from(raw.matchAll(IMAGE_REF_RE)).length;
    if (refs.length && refs.length === expected) return { refs, anchorXs };
  }
  const refs = Array.from(raw.matchAll(IMAGE_REF_RE)).map((m) => m[1]);
  return { refs, anchorXs: refs.map(() => null) };
}

/** 一段多题号：只认「题号+分隔符+空白」组成的短段（如「51.   52」），返回题号数组 */
function parseMultiMarker(text) {
  if (!text) return null;
  // docx 里两个题号之间可能塞了几十个空格做并排，先压成单空格再判长度
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length > 20 || !MULTI_MARKER_RE.test(compact)) return null;
  const numbers = (compact.match(/\d{1,3}/g) || []).map(Number);
  if (numbers.length < 2) return null;
  if (new Set(numbers).size !== numbers.length) return null;
  return numbers;
}

function parseParagraphs(documentXml) {
  const chunks = documentXml.split('</w:p>');
  const paragraphs = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const raw = chunks[index];
    const text = decodeEntities(
      Array.from(raw.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g))
        .map((m) => m[1])
        .join(''),
    ).trim();

    const { refs, anchorXs } = parseRefs(raw);
    const extents = Array.from(raw.matchAll(EXTENT_RE)).map((m) => ({
      widthCm: Number(m[1]) / EMU_PER_CM,
      heightCm: Number(m[2]) / EMU_PER_CM,
    }));

    const marker = MARKER_RE.exec(text) || INLINE_MARKER_RE.exec(text);
    const multiNumbers = parseMultiMarker(text);
    paragraphs.push({
      index,
      text,
      refs,
      anchorXs,
      extents,
      markerNumber: multiNumbers ? multiNumbers[0] : marker ? Number(marker[1]) : null,
      markerDelimiter: marker ? marker[2] : null,
      markerNumbers: multiNumbers || (marker ? [Number(marker[1])] : []),
    });
  }
  return paragraphs;
}

function readMedia(rels, rid) {
  const rel = rels.get(rid);
  if (!rel || !rel.target.startsWith('media/')) return null;
  return `word/${rel.target}`;
}

// ---------------------------------------------------------------- 题目数据侧：该卷图形推理题号

function walkJson(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(abs);
  }
}

function questionNumber(id) {
  const tail = String(id).split('-').pop();
  return /^\d+$/.test(tail) ? Number(tail) : null;
}

function collectFigureQuestions(year) {
  const files = [];
  walkJson(QUESTIONS_DIR, files);
  const bySource = new Map();
  for (const file of files) {
    let list;
    try {
      list = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    for (const q of list) {
      if (!q || q.category !== 'national') continue;
      if (q.subModule !== '图形推理') continue;
      const source = String(q.source || '');
      if (!source.startsWith(year)) continue;
      const paper = source.replace(/第\s*\d+\s*题.*$/, '').trim() || source;
      if (!bySource.has(paper)) bySource.set(paper, []);
      bySource.get(paper).push({
        id: String(q.id),
        number: questionNumber(q.id),
        source,
        isImageQuestion: q.isImageQuestion === true,
        hasOptions: Array.isArray(q.options) && q.options.length > 0,
        currentImageUrl: q.imageUrl || null,
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
      });
    }
  }
  return { bySource, fileCount: files.length };
}

// ---------------------------------------------------------------- 主流程

const errors = [];
const warnings = [];
const filters = new Map(); // reason -> items[]

function reject(reason, item) {
  if (!filters.has(reason)) filters.set(reason, []);
  filters.get(reason).push(item);
}

function fail(message) {
  errors.push(message);
}

function pickDocx() {
  if (!fs.existsSync(SOURCE_DIR)) {
    fail(`找不到源目录：${path.relative(ROOT, SOURCE_DIR)}`);
    return null;
  }
  const all = fs.readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.docx') && !name.startsWith('~$'));
  const hits = all.filter((name) => name.startsWith(YEAR));
  const wanted = argValue('docx', null);
  if (wanted) {
    const hit = hits.find((name) => name.includes(wanted));
    if (!hit) {
      fail(`源目录下没有匹配 --docx ${wanted} 的 ${YEAR} 卷；候选：${hits.join(' | ') || '(无)'}`);
      return null;
    }
    return path.join(SOURCE_DIR, hit);
  }
  if (hits.length === 1) return path.join(SOURCE_DIR, hits[0]);
  if (hits.length === 0) {
    fail(`源目录下没有 ${YEAR} 年的 docx；现有文件示例：${all.slice(0, 5).join(' | ')}`);
    return null;
  }
  fail(`${YEAR} 年有 ${hits.length} 卷 docx，请用 --docx <关键字> 指定：${hits.join(' | ')}`);
  return null;
}

function pickPaper() {
  const { bySource, fileCount } = collectFigureQuestions(YEAR);
  const papers = [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!papers.length) {
    fail(`题目库中没有 ${YEAR} 年的图形推理题（已扫描 ${fileCount} 个分片）`);
    return null;
  }
  const build = (key, list) => ({
    key,
    questions: list.filter((q) => q.number !== null).sort((a, b) => a.number - b.number),
    paperCount: papers.length,
    fileCount,
  });
  const wanted = argValue('paper', null);
  if (wanted) {
    const hit = papers.find(([key]) => key.includes(wanted));
    if (!hit) {
      fail(`没有匹配 --paper ${wanted} 的卷；候选：${papers.map(([k]) => k).join(' | ')}`);
      return null;
    }
    return build(hit[0], hit[1]);
  }
  if (papers.length > 1) {
    fail(
      `${YEAR} 年题目库里有 ${papers.length} 卷图形推理题，请用 --paper <关键字> 指定：` +
        papers.map(([k]) => k).join(' | '),
    );
    return null;
  }
  return build(papers[0][0], papers[0][1]);
}


async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    year: YEAR,
    mode: APPLY ? 'apply' : 'dry-run',
    source: null,
    dataSide: null,
    statistics: {},
    filters: {},
    produced: [],
    verification: {},
    errors,
    warnings,
  };

  if (path.resolve(OUT_IMG_DIR).startsWith(path.resolve(SOURCE_DIR))) {
    fail('输出目录位于 source-data 内，拒绝执行（源文件只读）');
    return report;
  }

  const docxPath = pickDocx();
  const paper = pickPaper();
  if (!docxPath || !paper) return report;

  // 分卷标签：显式 --tag 优先，其次按卷名推导（A/B/1/2），单卷年份为空
  OUT_TAG = String(argValue('tag', '') || derivePaperTag(paper.key))
    .trim()
    .replace(/[^A-Za-z0-9]/g, '');
  report.tag = OUT_TAG || null;

  const figureSet = new Set(paper.questions.map((q) => q.number));
  report.dataSide = {
    paper: paper.key,
    paperCount: paper.paperCount,
    shardFiles: paper.fileCount,
    figureQuestions: paper.questions.length,
    numbers: [...figureSet],
    questions: paper.questions.map((q) => ({ id: q.id, number: q.number, file: q.file })),
  };

  const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const documentXml = await zip.file('word/document.xml').async('string');
  const relsXml = await zip.file('word/_rels/document.xml.rels').async('string');
  const rels = parseRels(relsXml);
  const mediaFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
    .sort();

  const paragraphs = parseParagraphs(documentXml);
  const imageParagraphs = paragraphs.filter((p) => p.refs.length > 0);

  // 例题边界：仅在存在「图形推理」小节标题时启用（旧卷版式，「请开始答题」之前是例题图）
  let exampleBoundary = -1;
  const sectionParagraph = paragraphs.find((p) => /^[一二三四五六七八九十]、/.test(p.text) && /图形推理/.test(p.text));
  if (sectionParagraph) {
    const startParagraph = paragraphs.find((p) => p.index > sectionParagraph.index && p.text.includes('请开始答题'));
    if (startParagraph) exampleBoundary = startParagraph.index;
  }

  report.source = {
    docx: path.relative(ROOT, docxPath).replace(/\\/g, '/'),
    docxBytes: fs.statSync(docxPath).size,
    paragraphs: paragraphs.length,
    markerParagraphs: paragraphs.filter((p) => p.markerNumber !== null).length,
    imageParagraphs: imageParagraphs.length,
    mediaFiles: mediaFiles.length,
    sectionHeader: sectionParagraph ? sectionParagraph.text.slice(0, 40) : null,
    exampleBoundaryParagraph: exampleBoundary,
  };

  // 段落顺序 -> 图片归属题号（同段有题号则归该题，否则沿用最近题号）
  // 一段多题号（「51.   52」）：该段起按版面横向位置把图片依次分给这些题号。
  const assigned = [];
  let currentNumber = null;
  let markerParagraph = -1;
  let markerDelimiter = null;
  let pendingNumbers = null;
  let pendingMarkerText = null;
  let pendingOrderCount = 0;
  const referencedRids = new Set();
  for (const p of paragraphs) {
    if (p.markerNumbers.length > 1) {
      currentNumber = p.markerNumbers[0];
      markerParagraph = p.index;
      markerDelimiter = p.markerDelimiter;
      pendingNumbers = [...p.markerNumbers];
      pendingMarkerText = p.text.replace(/\s+/g, ' ').trim();
      pendingOrderCount = p.markerNumbers.length;
    } else if (p.markerNumber !== null && p.markerNumber !== currentNumber) {
      currentNumber = p.markerNumber;
      markerParagraph = p.index;
      markerDelimiter = p.markerDelimiter;
      pendingNumbers = null;
      pendingMarkerText = null;
      pendingOrderCount = 0;
    }
    // 多题号段落：内联图排最左，浮图按 posOffset 自左向右，与题号从左到右对应
    const order = pendingNumbers
      ? p.refs.map((_, i) => i).sort((a, b) => (p.anchorXs[a] ?? 0) - (p.anchorXs[b] ?? 0))
      : p.refs.map((_, i) => i);
    for (const i of order) {
      const rid = p.refs[i];
      referencedRids.add(rid);
      let number = currentNumber;
      let markerText = null;
      let orderIndex = null;
      if (pendingNumbers) {
        markerText = pendingMarkerText;
        if (pendingNumbers.length) {
          number = pendingNumbers.shift();
          currentNumber = number;
        }
        orderIndex = pendingOrderCount - pendingNumbers.length;
      }
      assigned.push({
        rid,
        media: readMedia(rels, rid),
        paragraphIndex: p.index,
        number,
        delimiter: markerDelimiter,
        sameParagraph: p.markerNumber !== null,
        markerDistance: p.index - markerParagraph,
        paragraphText: p.text.slice(0, 40),
        extent: p.extents[i] || null,
        anchorX: p.anchorXs[i] ?? null,
        markerText,
        orderIndex,
        orderCount: pendingOrderCount || null,
      });
    }
  }
  report.source.mediaReferencedByBody = referencedRids.size;
  report.source.unreferencedMedia = mediaFiles.length - referencedRids.size;


  // 归组 -> 过滤 -> 每题选一张
  const byNumber = new Map();
  let notFigureTiny = 0;
  for (const item of assigned) {
    if (!item.media) {
      reject('unresolved-rid', item);
      continue;
    }
    if (item.number === null) {
      reject('before-first-question', item);
      continue;
    }
    if (!figureSet.has(item.number)) {
      // 被判为「非图形推理题」的图片多为公式/符号碎片：顺手读像素尺寸，便于对账
      const file = zip.file(item.media);
      if (file) {
        const { size } = inspectImage(await file.async('nodebuffer'));
        if (size) {
          item.pixels = `${size.width}x${size.height}`;
          item.tiny = isFragmentPixels(size.width, size.height);
          if (item.tiny) notFigureTiny += 1;
        }
      }
      item.legacyColon = item.delimiter === '：' || item.delimiter === ':';
      item.detail = `${item.paragraphText}${item.pixels ? ` | ${item.pixels}px${item.tiny ? '（碎片尺寸）' : ''}` : ''}`;
      reject('not-figure-question', item);
      continue;
    }
    if (exampleBoundary >= 0 && item.paragraphIndex < exampleBoundary) {
      reject('example-image', item);
      continue;
    }
    if (!byNumber.has(item.number)) byNumber.set(item.number, []);
    byNumber.get(item.number).push(item);
  }
  report.statistics = { notFigureTiny };

  const produced = [];
  for (const number of [...figureSet].sort((a, b) => a - b)) {
    const candidates = byNumber.get(number) || [];
    if (!candidates.length) {
      fail(`第 ${number} 题（图形推理）在 docx 中找不到配图`);
      continue;
    }

    const loaded = [];
    for (const candidate of candidates) {
      const file = zip.file(candidate.media);
      if (!file) {
        reject('media-missing', { ...candidate, detail: `${candidate.media} 不在 zip 内` });
        continue;
      }
      const bytes = await file.async('nodebuffer');
      const { format, size } = inspectImage(bytes);
      const width = size ? size.width : 0;
      const height = size ? size.height : 0;
      const tinyByPixel = isFragmentPixels(width, height);
      const tinyByExtent = candidate.extent !== null && (candidate.extent.widthCm < 1 || candidate.extent.heightCm < 1);
      if (tinyByPixel || tinyByExtent) {
        reject('formula-fragment', {
          ...candidate,
          detail: tinyByPixel
            ? `像素 ${width}x${height} 不足（两维需 ≥${MIN_PX}px，或长边 ≥${MIN_LONG_SIDE_PX}px）`
            : `显示尺寸 ${candidate.extent.widthCm.toFixed(2)}x${candidate.extent.heightCm.toFixed(2)}cm 不足 1cm`,
        });
        continue;
      }
      loaded.push({ ...candidate, bytes, format, width, height });
    }

    if (!loaded.length) {
      fail(`第 ${number} 题（图形推理）的配图全部被过滤（疑似公式碎片），需人工确认`);
      continue;
    }
    loaded.sort((a, b) => b.width * b.height - a.width * a.height);
    for (const extra of loaded.slice(1)) {
      reject('duplicate-candidate', { ...extra, detail: `第 ${number} 题已保留更大候选 ${loaded[0].width}x${loaded[0].height}` });
    }

    produced.push({
      number,
      keeper: loaded[0],
      question: paper.questions.find((q) => q.number === number) || null,
    });
  }


  // --only 名单里有、但本卷没抽出图的题号：直接点名，避免以为「放行了却还是缺口」
  if (ONLY_SET) {
    const producedNumbers = new Set(produced.map((item) => item.number));
    for (const number of ONLY_SET) {
      if (!producedNumbers.has(number)) {
        warnings.push(`--only 名单第 ${number} 题本卷没有产出配图（保持缺口，不落盘）`);
      }
    }
  }

  // 逐张质检 + 落盘
  for (const item of produced) {
    const { keeper, question } = item;
    const flat =
      keeper.format === 'png'
        ? pngFlatCheck(keeper.bytes) || jpegFlatCheck(keeper.bytes, keeper.width, keeper.height)
        : jpegFlatCheck(keeper.bytes, keeper.width, keeper.height);
    const ext = keeper.format === 'jpg' ? 'jpg' : keeper.format;
    const fileName = `gk-${YEAR}-${OUT_TAG ? `${OUT_TAG}-` : ''}${keeper.number}.${ext}`;
    const outPath = path.join(OUT_IMG_DIR, fileName);

    if (!['png', 'jpg'].includes(ext)) {
      fail(`第 ${keeper.number} 题配图格式 ${keeper.format} 浏览器无法直接渲染（${keeper.media}）`);
      continue;
    }
    if (isFragmentPixels(keeper.width, keeper.height)) {
      fail(
        `第 ${keeper.number} 题配图尺寸 ${keeper.width}x${keeper.height}px 低于最小图幅` +
          `（两维 ≥${MIN_PX}px，或长边 ≥${MIN_LONG_SIDE_PX}px）`,
      );
      continue;
    }
    if (flat.flat) {
      fail(`第 ${keeper.number} 题配图疑似纯色/空白（${flat.method}: ${flat.detail}）`);
      continue;
    }
    if (keeper.bytes.length > MAX_BYTES) {
      fail(
        `第 ${keeper.number} 题配图 ${(keeper.bytes.length / 1024).toFixed(1)}KB 超过 ${MAX_BYTES / 1024}KB；` +
          '当前工程未引入图像编码库（sharp/jimp），需先人工转 webp',
      );
      continue;
    }

    const confidence = keeper.sameParagraph || keeper.markerDistance <= 3 ? 'high' : 'medium';
    const positionLabel = keeper.anchorX === null ? '内联图（最左）' : `浮动图 x=${(keeper.anchorX / EMU_PER_CM).toFixed(2)}cm`;
    const note = keeper.markerText
      ? `题号段「${keeper.markerText}」并排多题，本图${positionLabel}，按版面从左到右第 ${keeper.orderIndex}/${keeper.orderCount} 位归第 ${keeper.number} 题`
      : keeper.sameParagraph
        ? `题号与图片同段（"${keeper.number}${keeper.delimiter}"），段内唯一图片`
        : `图片位于第 ${keeper.number} 题题干段之后 ${keeper.markerDistance} 段，段间无其他题号插入`;

    // 逐题放行：--only 名单外的题只看不写（缺图题本来就写不了，这里只挡已产出的）
    const selected = !ONLY_SET || ONLY_SET.has(keeper.number);
    let landing = APPLY ? 'skipped' : 'dry-run';
    let wrote = false;
    if (APPLY) {
      if (!selected) {
        landing = 'not-selected';
      } else if (fs.existsSync(outPath) && !FORCE) {
        landing = 'kept-existing';
        warnings.push(`${fileName} 已存在，未覆盖（需要覆盖请加 --force）`);
      } else {
        fs.mkdirSync(OUT_IMG_DIR, { recursive: true });
        fs.writeFileSync(outPath, keeper.bytes);
        landing = 'written';
        wrote = true;
      }
    }

    report.produced.push({
      number: keeper.number,
      id: question ? question.id : null,
      imageUrl: `/data/questions/images/${fileName}`,
      file: fileName,
      sourcePart: keeper.media,
      sourceParagraph: keeper.paragraphIndex,
      format: keeper.format,
      width: keeper.width,
      height: keeper.height,
      bytes: keeper.bytes.length,
      flatCheck: flat,
      confidence,
      note,
      wrote,
      landing,
    });
  }


  // 过滤明细
  report.filters = {};
  for (const [reason, items] of filters.entries()) {
    report.filters[reason] = {
      count: items.length,
      items: items.map((item) => ({
        rid: item.rid,
        media: item.media,
        number: item.number,
        paragraph: item.paragraphIndex,
        detail: item.detail || item.paragraphText || '',
        legacyColon: item.legacyColon === true,
      })),
    };
  }

  const expected = paper.questions.length;
  const matched = report.produced.length === expected && report.produced.every((p) => figureSet.has(p.number));
  report.verification = {
    expectedFigures: expected,
    producedImages: report.produced.length,
    countMatched: matched,
    allHighConfidence: report.produced.every((p) => p.confidence === 'high'),
    allSizeAboveMin: report.produced.every((p) => !isFragmentPixels(p.width, p.height)),
    allNonFlat: report.produced.every((p) => !p.flatCheck.flat),
    allUnderByteLimit: report.produced.every((p) => p.bytes <= MAX_BYTES),
  };
  if (!matched) fail(`数量对账失败：该卷图形推理 ${expected} 题，实际产出 ${report.produced.length} 张`);

  report.statistics = {
    mediaFiles: mediaFiles.length,
    bodyImageReferences: assigned.length,
    filtered: [...filters.values()].reduce((sum, list) => sum + list.length, 0),
    filteredTinyFragments: notFigureTiny,
    produced: report.produced.length,
    landed: report.produced.filter((row) => row.wrote).length,
    notSelected: report.produced.filter((row) => row.landing === 'not-selected').length,
  };

  // figure-map.json：只在 --apply、无 ERROR 且非 --only 逐题放行时写（只反映整卷对账通过的卷）
  if (APPLY && !errors.length && !ONLY_SET) {
    fs.mkdirSync(OUT_IMG_DIR, { recursive: true });
    const map = {
      generatedAt: report.generatedAt,
      year: YEAR,
      tag: OUT_TAG || null,
      paper: paper.key,
      sourceDocx: report.source.docx,
      imageUrlBase: '/data/questions/images/',
      policy: {
        oneImagePerQuestion: true,
        naming: `gk-${YEAR}-${OUT_TAG ? `${OUT_TAG}-` : ''}<题号>.<真实格式后缀>`,
        byteLimit: MAX_BYTES,
        minPixels: MIN_PX,
        minLongSidePixels: MIN_LONG_SIDE_PX,
        filters: Object.fromEntries(Object.entries(report.filters).map(([key, value]) => [key, value.count])),
        filteredTinyFragments: notFigureTiny,
      },
      count: report.produced.length,
      items: report.produced.map((p) => ({
        id: p.id,
        number: p.number,
        imageUrl: p.imageUrl,
        file: p.file,
        width: p.width,
        height: p.height,
        bytes: p.bytes,
        confidence: p.confidence,
        note: p.note,
      })),
    };
    fs.writeFileSync(MAP_FILE, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  }

  return report;
}


// ---------------------------------------------------------------- 报告输出

function printReport(report) {
  const line = '='.repeat(72);
  console.log(line);
  console.log(`图形推理配图抽取 · ${report.year} 国考 · ${report.mode === 'apply' ? 'APPLY（已落盘）' : 'DRY-RUN（只读）'}`);
  console.log(line);
  if (report.source) {
    console.log(`源 docx      : ${report.source.docx}（${(report.source.docxBytes / 1024).toFixed(0)}KB）`);
    console.log(`段落/含图段落: ${report.source.paragraphs} / ${report.source.imageParagraphs}；题号段落 ${report.source.markerParagraphs}`);
    console.log(
      `media 文件   : ${report.source.mediaFiles}（正文引用 ${report.source.mediaReferencedByBody}，未引用 ${report.source.unreferencedMedia}）`,
    );
    console.log(`图片引用次数 : ${report.statistics.bodyImageReferences}`);
    console.log(`碎片(<${MIN_PX}px) : ${report.statistics.filteredTinyFragments} 张（公式/符号，含在下方过滤明细内）`);
    console.log(`小节标题     : ${report.source.sectionHeader || '(本卷无「图形推理」小节标题，例题过滤按 0 处理)'}`);
    console.log(`例题边界段落 : ${report.source.exampleBoundaryParagraph >= 0 ? report.source.exampleBoundaryParagraph : '未启用'}`);
  }
  if (report.dataSide) {
    console.log(
      `题目库       : ${report.dataSide.paper}，图形推理 ${report.dataSide.figureQuestions} 题（${report.dataSide.numbers.join(',')}）`,
    );
  }
  console.log('');
  console.log('-- 过滤明细 --');
  const reasonLabel = {
    'before-first-question': '首个题号之前的无编号图（卷首/页眉）',
    'not-figure-question': '非图形推理题的图片（数量关系/资料分析等）',
    'example-image': '例题图（「请开始答题」之前）',
    'formula-fragment': '公式/符号碎片（像素或显示尺寸过小）',
    'duplicate-candidate': '同题多余候选图（保留面积最大者）',
    'unresolved-rid': 'rId 找不到 media',
    'media-missing': 'media 条目在 zip 内不存在',
  };
  if (!Object.keys(report.filters).length) console.log('  (无过滤项)');
  for (const [reason, value] of Object.entries(report.filters)) {
    const legacy = value.items.filter((item) => item.legacyColon).length;
    console.log(`  ${reasonLabel[reason] || reason}: ${value.count} 张${legacy ? `（其中旧版式全角冒号题号 ${legacy} 张）` : ''}`);
    for (const item of value.items) {
      console.log(`    - ${item.media} → 第 ${item.number ?? '?'} 题  p${item.paragraph}  ${item.detail}`);
    }
  }
  console.log('');
  console.log('-- 产出 --');
  if (!report.produced.length) console.log('  (无产出)');
  for (const item of report.produced) {
    console.log(
      `  ${item.file.padEnd(18)} ${String(item.width).padStart(4)}x${String(item.height).padEnd(4)}px ` +
        `${(item.bytes / 1024).toFixed(1).padStart(5)}KB ${item.format} ${item.flatCheck.method}/${item.flatCheck.flat ? 'FLAT' : 'ok'} ` +
        `${item.wrote ? 'written' : item.landing === 'not-selected' ? 'deselect' : report.mode === 'apply' ? item.landing || 'skipped' : 'dry'} ${item.id}`,
    );
  }
  console.log('');
  if (report.statistics && report.statistics.produced) {
    const st = report.statistics;
    console.log(
      `  落盘 ${st.landed ?? 0}/${st.produced}${st.notSelected ? `（--only 未选中 ${st.notSelected} 题，保持未落盘）` : ''}`,
    );
  }
  console.log('-- 对账 --');
  const v = report.verification || {};
  console.log(`  图形推理题数/产出图数: ${v.expectedFigures} / ${v.producedImages}  ${v.countMatched ? '✓ 一致' : '✗ 不一致'}`);
  console.log(`  全部高置信          : ${v.allHighConfidence ? '✓' : '✗'}`);
  console.log(`  全部 ≥${MIN_PX}px         : ${v.allSizeAboveMin ? '✓' : '✗'}（横条图按长边 ≥${MIN_LONG_SIDE_PX}px 计）`);
  console.log(`  全部非纯色          : ${v.allNonFlat ? '✓' : '✗'}`);
  console.log(`  全部 ≤${MAX_BYTES / 1024}KB          : ${v.allUnderByteLimit ? '✓' : '✗'}`);
  if (report.warnings.length) {
    console.log('');
    console.log('-- WARN --');
    report.warnings.forEach((item) => console.log(`  ! ${item}`));
  }
  if (report.errors.length) {
    console.log('');
    console.log(`-- ERROR（${report.errors.length}）--`);
    report.errors.forEach((item) => console.log(`  ✗ ${item}`));
  }
  console.log('');
  console.log(
    report.errors.length
      ? '结论：存在 ERROR，未写 figure-map.json。'
      : report.mode === 'apply'
        ? ONLY_SET
          ? '结论：通过（--only 逐题放行：名单内图片已落盘，未写 figure-map.json）。'
          : '结论：通过。图片与 figure-map.json 已写入 public/data/questions/images/。'
        : '结论：对账通过（dry-run 未写任何文件）。加 --apply 落盘。',
  );
}

main()
  .then((report) => {
    if (AS_JSON) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }
    // 逐卷报告：--json 与可读模式都要落盘。
    // 批量脚本 figure-extract-batch.cjs 的汇总表会引用这份文件，只在可读模式写会导致引用落空。
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const reportFile = path.join(REPORT_DIR, `figure-extract-${YEAR}${OUT_TAG ? `-${OUT_TAG}` : ''}.report.json`);
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    // --json 的 stdout 必须保持纯 JSON（批量脚本按 JSON 解析），报告路径只在可读模式提示
    if (!AS_JSON) console.log(`报告：${path.relative(ROOT, reportFile).replace(/\\/g, '/')}`);
    process.exit(report.errors.length ? 1 : 0);
  })
  .catch((err) => {
    console.error('[致命]', err && err.stack ? err.stack : err);
    process.exit(1);
  });

