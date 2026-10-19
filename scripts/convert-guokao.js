#!/usr/bin/env node
/**
 * 国考真题转换器（试点先行）
 *
 * 源目录：source-data/国考真题（2000--2026)/   ← 注意右括号为半角
 *   - 4-行测/1-行测-真题/word/*.docx
 *   - 4-行测/2-行测-答案及解析/word/*.docx
 *   - 5-申论/word/*.docx（部分资料包为 3-申论）
 *
 * 产出：public/data/questions-v2/national-none-{module}-{n}.json
 *       public/data/questions-v2/index.json
 *       guokao-reports/{year}-{paper}-{kind}-validation.csv
 *       guokao-reports/summary.json
 *
 * 线上 public/data/questions/ 一律不动。
 *
 * 解析策略（2021 试点验证）：
 *   题目文档先 mammoth.convertToHtml，再按块还原为行文本——
 *   表格按行展开（单元格以 " | " 分隔）、图片保留为 [[IMG]] 占位，
 *   因此资料分析材料不会再因为表格/图片而整块丢失。
 *   材料边界优先级：显式「回答 116～120 题」范围 > 「（材料 N）」标题 > 表格起始。
 *   纯图片材料统一记为 material = '【图片材料】'，并标记 isImageQuestion。
 *
 * 用法：
 *   node scripts/convert-guokao.js                      # 默认试点：2021 副省级 + 地市级 + 申论
 *   node scripts/convert-guokao.js --year 2021 --papers 副省级,地市级
 *   node scripts/convert-guokao.js --all                # 全量（确认后再跑）
 *   node scripts/convert-guokao.js --dry-run            # 只解析不落盘
 *   node scripts/convert-guokao.js --dump               # 导出结构化文本（含 [[TABLE]]/[[IMG]] 标记）到 guokao-reports/raw/
 *
 * 扫描版解析（docx 只有图片、无文本层）：在同目录放一份同名旁挂文本
 *   xxx.docx → xxx.ocr.txt（内容为「N、正确答案：X」，可带 # 注释行），
 *   转换器会优先读取它，只填答案、不写入解析，并在报告里记一条 ANSWER_FROM_OCR_KEY（WARN）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'source-data', '国考真题（2000--2026)');

const OUT_DIR = path.join(ROOT, 'public', 'data', 'questions-v2');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const RAW_DIR = path.join(REPORT_DIR, 'raw');

const MODULE_MAP = {
  常识判断: 'changshi',
  言语理解与表达: 'yanyu',
  言语理解: 'yanyu',
  数量关系: 'shuliang',
  判断推理: 'panduan',
  资料分析: 'ziliao',
  申论: 'shenlun',
};

const MODULE_CN = {
  changshi: '常识',
  yanyu: '言语',
  shuliang: '数量',
  panduan: '判断',
  ziliao: '资料',
  shenlun: '申论',
};

const DIFFICULTY = {
  changshi: '基础',
  yanyu: '中等',
  shuliang: '拔高',
  panduan: '中等',
  ziliao: '中等',
  shenlun: '拔高',
};

/* ------------------------------------------------------------------ */
/* 参数                                                                */
/* ------------------------------------------------------------------ */

function readArgs(argv) {
  const get = (name, def) => {
    const i = argv.indexOf(name);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
  };
  const has = name => argv.includes(name);
  const yearRaw = get('--year', '2021');
  return {
    all: has('--all'),
    dryRun: has('--dry-run'),
    dump: has('--dump'),
    verbose: has('--verbose'),
    year: yearRaw === 'all' ? null : Number(yearRaw),
    papers: get('--papers', '副省级,地市级').split(/[,，]/).map(s => s.trim()).filter(Boolean),
    includeShenlun: !has('--no-shenlun'),
    includeXingce: !has('--no-xingce'),
  };
}

const ARGS = readArgs(process.argv.slice(2));

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pickDir(candidates) {
  for (const c of candidates) {
    const p = path.join(SRC_ROOT, c);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return null;
}

function listDocx(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /\.docx$/i.test(f) && !f.startsWith('~$'))
    .sort();
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u3000/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return normalizeText(result.value);
}

/* ---- HTML 结构化抽取：保留表格与图片位置 ---------------------------- */

const IMG_MARK = '[[IMG]]';
const TABLE_CLOSE = '[[/TABLE]]';
const TABLE_OPEN_RE = /^\[\[TABLE imgs=(\d+) rows=(\d+)\]\]$/;

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/\u00a0/g, ' ');
}

/** 表格 → 每行一条文本，单元格用 " | " 分隔，表内图片数写入表头标记 */
function tableToLines(tableHtml) {
  const images = (tableHtml.match(/<img/gi) || []).length;
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const body = [];
  let contentRows = 0;
  for (const row of rows) {
    const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
    const texts = cells.map(c => stripTags(c.replace(/<\/(p|div)>/gi, ' ')).replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (texts.length) {
      body.push(texts.join(' | '));
      contentRows++;
    }
  }
  return [`[[TABLE imgs=${images} rows=${contentRows}]]`, ...body, TABLE_CLOSE];
}

/** HTML → 行文本；表格按行展开，图片单独成行并保留位置 */
function htmlToText(html) {
  const parts = String(html).split(/(<table[\s\S]*?<\/table>)/i);
  const out = [];

  for (const part of parts) {
    if (/^<table/i.test(part)) {
      out.push(...tableToLines(part));
      continue;
    }

    const withBreaks = part
      .replace(/<img[^>]*>/gi, `\n${IMG_MARK}\n`)
      .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');

    for (const raw of stripTags(withBreaks).split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (line) out.push(line);
    }
  }

  return out.join('\n');
}

/** 题目文档专用：转 HTML 后按块还原，避免材料表格/图片丢失 */
async function extractDoc(filePath) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    { convertImage: mammoth.images.imgElement(() => ({ src: 'x' })) }
  );
  return normalizeText(htmlToText(result.value));
}

/** 去掉结构化标记，得到干净文本（用于申论/预览） */
function stripDocMarkers(text) {
  return String(text || '')
    .replace(/\[\[IMG\]\]/g, '')
    .replace(/\[\[\/?TABLE[^\]]*\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseYear(name) {
  const m = name.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function parsePaperLabel(name) {
  if (/行政执法|执法类|执法卷/.test(name)) return '行政执法';
  if (/地市|市地/.test(name)) return '地市级';
  if (/副省|省部|省级/.test(name)) return '副省级';
  // 2002-2006 老卷：A/B 卷、卷一/卷二
  const ab = name.match(/[（(]?\s*([AB])\s*[）)]?\s*卷/i) || name.match(/[（(]\s*([AB])\s*[）)]/i);
  if (ab) return `${ab[1].toUpperCase()}卷`;
  const cn = name.match(/[（(]\s*([一二])\s*[）)]\s*卷?/) || name.match(/卷\s*[（(]\s*([一二])\s*[）)]/);
  if (cn) return `${cn[1]}卷`;
  return '未标注';
}

function cnToNum(cn) {
  const map = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (!cn) return 0;
  if (cn.length === 1) return map[cn] || 0;
  if (cn === '十一') return 11;
  if (cn === '十二') return 12;
  if (cn.startsWith('十')) return 10 + (map[cn[1]] || 0);
  if (cn.endsWith('十')) return (map[cn[0]] || 0) * 10;
  return (map[cn[0]] || 0) * 10 + (map[cn[2]] || 0);
}

function compact(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function makeTitle(stem, module) {
  return `${MODULE_CN[module] || '行测'}·${compact(stem, 28)}`;
}

function extractKeyPoints(analysis) {
  if (!analysis) return [];
  const out = [];
  const sentences = String(analysis).split(/[。\n；]/).map(s => s.trim()).filter(s => s.length > 5);
  for (const s of sentences.slice(0, 3)) {
    const cleaned = s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d、.．\s]+/, '').trim();
    if (cleaned.length > 4 && cleaned.length < 40) out.push(cleaned);
  }
  return out;
}

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function writeCsv(file, rows) {
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  fs.writeFileSync(file, `\uFEFF${body}`, 'utf8');
}

function log(...args) {
  console.log(...args);
}

function vlog(...args) {
  if (ARGS.verbose) console.log(...args);
}

/* ------------------------------------------------------------------ */
/* 目录与文件配对                                                       */
/* ------------------------------------------------------------------ */

function resolveDirs() {
  const qDir = pickDir([
    path.join('4-行测', '1-行测-真题', 'word'),
    path.join('4-行测', '1-行测-真题', 'Word'),
    path.join('4-行测', '1-行测-真题'),
  ]);
  const aDir = pickDir([
    path.join('4-行测', '2-行测-答案及解析', 'word'),
    path.join('4-行测', '2-行测-答案及解析', 'Word'),
    path.join('4-行测', '2-行测-答案及解析'),
  ]);
  const sDir = pickDir([
    path.join('5-申论', 'word'),
    path.join('3-申论', 'word'),
    path.join('5-申论', 'Word'),
    path.join('3-申论', 'Word'),
    path.join('5-申论'),
    path.join('3-申论'),
  ]);
  return { qDir, aDir, sDir };
}

const isAnswerFile = name => /答案|解析|详解|参考/.test(name);
const isQuestionFile = name => !isAnswerFile(name);

function filterByArgs(files) {
  const byYear = files.filter(name => {
    const year = parseYear(name);
    if (ARGS.all) return true;
    return !ARGS.year || year === ARGS.year;
  });
  const byPaper = byYear.filter(name => {
    if (ARGS.all || !ARGS.papers.length) return true;
    return ARGS.papers.includes(parsePaperLabel(name));
  });
  // 文件名未标注卷别时，卷别过滤会误杀；此时退回按年份过滤
  return byPaper.length ? byPaper : byYear;
}

/**
 * 为每份真题找同年、同卷别的解析文件。
 * 仅允许同卷配对，宁缺毋滥（禁止跨年份/跨卷别借用解析）。
 */
function pairXingceFiles(qDir, aDir) {
  const qFiles = filterByArgs(listDocx(qDir).filter(isQuestionFile));
  const aFiles = listDocx(aDir).filter(isAnswerFile);
  const pairs = [];
  const unpaired = [];

  for (const qf of qFiles) {
    const year = parseYear(qf);
    const label = parsePaperLabel(qf);
    const candidates = aFiles.filter(af => parseYear(af) === year && parsePaperLabel(af) === label);

    if (candidates.length === 0) {
      pairs.push({ questionFile: path.join(qDir, qf), answerFile: null, year, label, name: qf });
      unpaired.push({ year, label, file: qf, reason: '未找到同年同卷解析文件' });
      continue;
    }

    // 多份候选时优先取文件名与真题名相似度最高的
    const scored = candidates
      .map(af => {
        let score = 0;
        if (/答案及解析|答案解析|详解/.test(af)) score += 5;
        if (af.replace(/答案|解析|及|详解|参考/g, '') === qf.replace(/\.docx$/i, '')) score += 10;
        return { af, score };
      })
      .sort((a, b) => b.score - a.score);

    pairs.push({
      questionFile: path.join(qDir, qf),
      answerFile: path.join(aDir, scored[0].af),
      year,
      label,
      name: qf,
      answerName: scored[0].af,
    });
  }

  // 解析文件未被任何真题选中，也要进入异常清单（禁止静默跳过）
  const usedAnswers = new Set(pairs.map(p => p.answerName).filter(Boolean));
  for (const af of aFiles) {
    if (usedAnswers.has(af)) continue;
    const year = parseYear(af);
    if (!ARGS.all && ARGS.year && year !== ARGS.year) continue;
    if (!ARGS.all && ARGS.papers.length && !ARGS.papers.includes(parsePaperLabel(af))) continue;
    unpaired.push({ year, label: parsePaperLabel(af), file: af, reason: '解析文件未匹配到同年同卷真题' });
  }

  return { pairs, unpaired };
}

function pairShenlunFiles(sDir) {
  const all = filterByArgs(listDocx(sDir));
  let qFiles = all.filter(isQuestionFile);
  const aFiles = all.filter(isAnswerFile);

  // 有些申论真题文件名自带「答案/解析」，会被整体判为答案文件；
  // 此时退回全量作为题干来源，避免整卷静默跳过。
  if (!qFiles.length && all.length) qFiles = all.slice();

  const result = [];
  const unpaired = [];
  const used = new Set();

  for (const qf of qFiles) {
    const year = parseYear(qf);
    const label = parsePaperLabel(qf);
    const selfIsAnswer = isAnswerFile(qf);
    const same = selfIsAnswer
      ? []
      : aFiles.filter(af => af !== qf && parseYear(af) === year && parsePaperLabel(af) === label);
    const answerName = same.length ? same[0] : null;
    result.push({
      questionFile: path.join(sDir, qf),
      answerFile: answerName ? path.join(sDir, answerName) : null,
      year,
      label,
      name: qf,
      answerName,
    });
    used.add(qf);
    if (answerName) used.add(answerName);
  }

  // 未被使用的文件（多出来的答案卷等）逐条上报，避免静默跳过
  for (const f of all) {
    if (used.has(f)) continue;
    unpaired.push({ year: parseYear(f), label: parsePaperLabel(f), file: f, reason: '未作为申论题干或参考答案使用' });
  }

  if (!result.length) log(`  [提示] 申论目录未发现可转换的 docx：${sDir}`);
  return { pairs: result, unpaired };
}

/* ------------------------------------------------------------------ */
/* 行测正文解析                                                         */
/* ------------------------------------------------------------------ */

// 2023 起模块标题常与说明同段：「一、常识判断。第一部分 常识判断。 根据题目要求……」
const HEADER_RE = /^(?:第[一二三四五六七八九十]+部分\s*[、.．]?\s*|[一二三四五六七八九十]{1,3}\s*[、.．]\s*)(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)(?=\s*(?:[。.．，,（(]|$)).*$/;
// 选项标记：A、/A./A）/A：，以及老卷常见的「A 总书记 B 中央…」纯空格分隔
const OPTION_RE = /(?<![A-Za-z])([A-D])(?:\s*[、.．\)）:：]\s*|\s+)(?=[^\s])/g;
const QTAG_RE = /(?<![\d.])[（(]?(\d{1,3})[）)]?\s*(?:、|[.．](?=\s*(?:(?:19|20)\d{2}(?:\s*年)?|[\u4e00-\u9fa5“《（(【]))|[:：])\s*/g;

const GRAPH_HINT_RE = /(问号处|所给图形|下列图形|四个图形|图形推理|九宫格|折叠|展开图|纸盒|骰子|六面体|截面|三视图|俯视图|主视图|左视图|拼合|立体图形|旋转|翻转|对称轴|阴影部分|左图|右图|下图)/;

/** 判断是否为图片题：图形推理的固定表述，或题干明确指向图形 */
function detectImageQuestion(stem) {
  if (!stem) return false;
  return GRAPH_HINT_RE.test(stem);
}

/** 预处理：把黏在同一段里的题号切开 */
function preSplitText(text) {
  return text
    .replace(/([。：:？?；;】）)])\s*(?=\d{1,3}\s*[、.．]\s*[\u4e00-\u9fa5“《（(【])/g, '$1\n')
    .replace(/(题\s*[。.]?)\s*(?=\d{1,3}\s*[、.．]\s*[\u4e00-\u9fa5“《（(【])/g, '$1\n')
    // 选项行尾黏连下一题（如「D、……发展过程 52、作者举……」）
    // 下一题题干也可能以数字开头（如「128、2018 年……」）；只切同一行内的黏连，
    // 不能跨行匹配，否则会把独立的「125、」「126、」两行粘成一行。
    .replace(/([A-D][ \t]*[、.．][^\n]*?)[ \t]+(\d{1,3})\s*[、.．][ \t]*(?=[\u4e00-\u9fa5“《（(【0-9])/g, '$1\n$2、');
}

/**
 * 切分题干与选项。
 * 选项可能混排在同一段，也可能跨段；按 A→B→C→D 顺序定位并重组。
 */
function splitStemAndOptions(blockText) {
  const text = String(blockText || '').trim();
  const marks = [];
  OPTION_RE.lastIndex = 0;
  let m;
  while ((m = OPTION_RE.exec(text)) !== null) {
    marks.push({ key: m[1], start: m.index, end: OPTION_RE.lastIndex });
  }

  let best = null;

  for (let i = 0; i < marks.length; i++) {
    if (marks[i].key !== 'A') continue;
    const seq = [marks[i]];
    for (const want of ['B', 'C', 'D']) {
      const last = seq[seq.length - 1];
      const next = marks.find(mk => mk.start >= last.end && mk.key === want);
      if (!next) break;
      seq.push(next);
    }
    if (seq.length !== 4) continue;

    const stem = text.slice(0, seq[0].start).trim();
    const options = seq.map((mk, idx) => {
      const stop = idx + 1 < seq.length ? seq[idx + 1].start : text.length;
      return { key: mk.key, text: text.slice(mk.end, stop).trim() };
    });

    const allFilled = options.every(o => o.text.length > 0);
    const maxLen = Math.max(...options.map(o => o.text.length));
    const stemTail = stem.slice(-2);
    const stemOk = /([：:？?。．””\)）]|（\s*）|\(\s*\))$/.test(stem);
    const hasQno = options.some(o => /(?:^|\n)\s*\d{1,3}\s*[、.．]/.test(o.text));

    let score = 0;
    if (allFilled) score += 40;
    if (stemOk) score += 30;
    if (maxLen <= 120) score += 20;
    if (stem.length >= 8) score += 10;
    if (!hasQno) score += 20;
    if (maxLen > 400) score -= 50;
    if (stem.length === 0) {
      // 填空题常只给选项，题干在共享材料里：四个选项齐全时允许无题干
      score += allFilled ? 0 : -100;
    }

    if (!best || score > best.score) best = { score, stem, options };
  }

  if (best && best.score > 0) return { stem: best.stem, options: best.options, splitScore: best.score };

  // 原卷缺项：例如只有 A/B/D（缺 C）或 B/C/D（缺 A）。保留真实 key，供后续校验降级为 WARN。
  let partial = null;
  for (let i = 0; i < marks.length; i++) {
    const seq = [marks[i]];
    for (let j = i + 1; j < marks.length && seq.length < 4; j++) {
      const last = seq[seq.length - 1];
      if (marks[j].key > last.key && marks[j].start >= last.end) seq.push(marks[j]);
    }
    if (seq.length < 2) continue;

    const stem = text.slice(0, seq[0].start).trim();
    const options = seq.map((mk, idx) => {
      const stop = idx + 1 < seq.length ? seq[idx + 1].start : text.length;
      return { key: mk.key, text: text.slice(mk.end, stop).trim() };
    });
    if (options.some(o => !o.text)) continue;
    if (Math.max(...options.map(o => o.text.length)) > 400) continue;

    let score = 10;
    if (/([：:？?。．””\\)）]|（\s*）|\(\s*\))$/.test(stem)) score += 20;
    if (stem.length >= 8) score += 10;
    if (!options.some(o => /(?:^|\n)\s*\d{1,3}\s*[、.．]/.test(o.text))) score += 10;
    if (!partial || score > partial.score) partial = { score, stem, options };
  }
  if (partial && partial.score > 0) return { stem: partial.stem, options: partial.options, splitScore: partial.score };

  return { stem: text, options: [], splitScore: -1 };
}

/** 追加到上一题题干；若上一题选项已闭合（A-D 齐全且都有正文）则拒绝，交由材料逻辑处理 */
function appendToLast(items, line) {
  const last = items[items.length - 1];
  if (!last || last.type !== 'question') return false;
  const parsed = splitStemAndOptions(last.body);
  if (parsed.options.length === 4 && parsed.options.every(o => o.text.trim())) return false;
  last.body += `\n${line}`;
  return true;
}

const RANGE_RE = /(?:根据|依据|结合|阅读|所给|以下)[^。\n]{0,30}?回答\s*(?:下列)?\s*(\d{1,3})\s*(?:[～~〜—\-－至到]\s*(\d{1,3}))?\s*(?:小)?题/;

/** 材料标题：（材料 1）/（材料一）/ (材料) / 材料二：/ 材料三 */
const MATERIAL_INLINE_RE = /[（(]\s*材料(?:\s*[一二三四五六七八九十\d]+)?\s*[）)]/;
const MATERIAL_COLON_RE = /^材料\s*[一二三四五六七八九十\d]+\s*[：:]\s*/;
const MATERIAL_PLAIN_RE = /^材料\s*[一二三四五六七八九十\d]+\s*$/;

/** 老卷题号后常带「单选、」「多选、」，不属于题干 */
function stripChoiceType(text) {
  return String(text || '').replace(/^\s*(?:单选|多选|单项选择|多项选择|不定项选择)\s*[、.．，,：:]?\s*/, '');
}

/**
 * 材料范围首题常不带题号（如「51、根据所给材料...」后的题干直接出现）。
 * 在材料缓冲区末尾寻找题干起点：优先找问句/冒号收尾的短行，避免把整段材料并入首题。
 */
const FIRST_Q_PROMPT_RE = /(?:[：:？?]\s*$|[（(]\s*[）)]\s*$)/;

function findFirstQuestionStemStart(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = String(lines[i] || '').trim();
    if (!text) continue;
    if (FIRST_Q_PROMPT_RE.test(text)) return i;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const text = String(lines[i] || '').trim();
    if (!text) continue;
    if (text.length <= 60 && !/[。！？；]$/.test(text)) return i;
  }
  return -1;
}

/** 逐行扫描，产出：模块标记 / 材料块 / 题目块 */
function scanBlocks(text) {
  const lines = preSplitText(text).split('\n');
  const items = [];
  let currentModule = null;
  let pendingMaterial = null;
  let lastNum = 0;

  const startMaterial = (from, to) => {
    pendingMaterial = {
      from: from == null ? null : from,
      to: to == null ? null : to,
      lines: [],
      images: 0,
      hasTable: false,
      firstQuestion: null,
    };
  };

  const flushMaterial = () => {
    if (!pendingMaterial) return;
    const body = stripDocMarkers(pendingMaterial.lines.join('\n'));
    if (body || pendingMaterial.images > 0) {
      items.push({
        type: 'material',
        from: pendingMaterial.from,
        to: pendingMaterial.to,
        text: body || '【图片材料】',
        hasImage: pendingMaterial.images > 0,
        hasTable: pendingMaterial.hasTable,
        images: pendingMaterial.images,
      });
    }
    pendingMaterial = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (pendingMaterial) pendingMaterial.lines.push('');
      continue;
    }

    const hm = line.match(HEADER_RE);
    if (hm) {
      flushMaterial();
      currentModule = MODULE_MAP[hm[1]] || currentModule;
      items.push({ type: 'header', module: currentModule, text: line });
      continue;
    }

    // 图片：材料内计数；材料外保留标记，供题目侧判断 isImageQuestion
    if (line === IMG_MARK) {
      if (pendingMaterial) pendingMaterial.images += 1;
      else appendToLast(items, IMG_MARK);
      continue;
    }

    // 表格：资料/言语模块内视为材料骨架；空表格（仅排版用）直接忽略
    const tm = line.match(TABLE_OPEN_RE);
    if (tm) {
      const tableImages = Number(tm[1]);
      const tableRows = Number(tm[2]);
      if (tableRows === 0 && tableImages === 0) continue;
      if (!pendingMaterial && (currentModule === 'ziliao' || currentModule === 'yanyu')) {
        startMaterial(null, null);
      }
      if (pendingMaterial) {
        pendingMaterial.hasTable = true;
        pendingMaterial.images += tableImages;
      }
      continue;
    }
    if (line === TABLE_CLOSE) continue;

    // 材料标记：（材料 1）/ (材料) / 行尾「…(材料 2)」/ 材料二：
    const inlineMark = line.match(MATERIAL_INLINE_RE);
    if (inlineMark) {
      const before = line.slice(0, inlineMark.index).trim();
      const after = line.slice(inlineMark.index + inlineMark[0].length).trim();
      const carry = pendingMaterial && pendingMaterial.from != null && !pendingMaterial.lines.some(l => l.trim())
        ? { from: pendingMaterial.from, to: pendingMaterial.to }
        : null;

      if (before) {
        if (pendingMaterial) {
          pendingMaterial.lines.push(before);
        } else if (!appendToLast(items, before)) {
          // 行尾标记前的文字通常是上一题（或 D 选项）的收尾，补回题干主体
          const last = items[items.length - 1];
          if (last && last.type === 'question') last.body += `\n${before}`;
        }
      }

      flushMaterial();
      startMaterial(carry ? carry.from : null, carry ? carry.to : null);
      if (after) pendingMaterial.lines.push(after);
      continue;
    }

    // 资料分析/判断推理的分组小标题：（一）（二）……（2023 起材料不再带「材料 N」）
    const subMark = line.match(/^[（(]([一二三四五六七八九十]{1,3})[）)]\s*$/);
    if (subMark && (currentModule === 'ziliao' || currentModule === 'panduan')) {
      flushMaterial();
      startMaterial(null, null);
      pendingMaterial.lines.push(line);
      continue;
    }

    // 材料标题：材料二：/ 材料三
    const isColonMark = MATERIAL_COLON_RE.test(line);
    const isPlainMark = !isColonMark && MATERIAL_PLAIN_RE.test(line);
    if (isColonMark || isPlainMark) {
      flushMaterial();
      startMaterial(null, null);
      const rest = isColonMark ? line.replace(MATERIAL_COLON_RE, '').trim() : '';
      if (rest) pendingMaterial.lines.push(rest);
      continue;
    }

    // 材料范围标记：根据以下资料，回答 116～120 题（可能出现在材料末尾）
    const mm = line.match(RANGE_RE);
    if (mm) {
      const from = Number(mm[1]);
      const to = mm[2] ? Number(mm[2]) : from;
      const before = line.slice(0, mm.index).trim();
      // 「51、根据所给材料，回答 51~55 题。」：51 是范围首题的题号，不能当材料正文吞掉
      const bareBefore = before.match(/^[（(]?(\d{1,3})[）)]?\s*[、.．:：]?$/);
      const beforeIsRangeNum = !!bareBefore && Number(bareBefore[1]) === from;
      if (pendingMaterial) {
        if (before && !beforeIsRangeNum) pendingMaterial.lines.push(before);
        pendingMaterial.from = from;
        pendingMaterial.to = to;
      } else {
        startMaterial(from, to);
        if (before && !beforeIsRangeNum) {
          // 「D．…… 四、根据下图回答 131～135 题。」：范围标记前的选项属于上一题
          if (/^[A-D]\s*[、.．]/.test(before)) appendToLast(items, before);
          else pendingMaterial.lines.push(before);
        }
      }
      // 范围首题若没有独立题号行，需在材料缓冲区里识别并补出
      if (from > lastNum) {
        pendingMaterial.firstQuestion = { num: from, emitted: false };
      }
      const tail = line.slice(mm.index + mm[0].length).trim();
      if (tail) pendingMaterial.lines.push(tail);
      continue;
    }

    // 图形推理常见「16-25」独占一行，后接一组图片：补出中间题号，避免整段缺号
    const rangeOnly = line.match(/^(\d{1,3})\s*[-~—－至]\s*(\d{1,3})$/);
    if (rangeOnly) {
      const from = Number(rangeOnly[1]);
      const to = Number(rangeOnly[2]);
      if (from === lastNum + 1 && to > from && to - from < 20) {
        flushMaterial();
        for (let n = from; n <= to; n++) {
          items.push({ type: 'question', num: n, module: currentModule, body: IMG_MARK });
        }
        lastNum = to;
        continue;
      }
    }

    // 题号后可能是顿号/点号/冒号；「1.5 万」这类小数不能当题号，
    // 但「116.2004 年…」这种题号后直接跟年份仍应识别
    const qm = line.match(/^(\d{1,3})\s*([、.．:：])\s*(.*)$/);
    const qnum = qm ? Number(qm[1]) : 0;
    const qBody = qm ? qm[3] : '';
    const dateAfterDot = !!qm && /^[.．]$/.test(qm[2]) && /^(?:19|20)\d{2}(?:\s*年)?/.test(qBody);
    const sequenceAfterDot = !!qm && /^\d{1,4}(?:\s*[,，、]\s*\d{1,4}){2,}/.test(qBody);
    // 「5.2／3，1／2…」「43.6，18，…」「78.20 世纪」「124.18 岁」等：题号后直接跟数字，但仍是题干
    const numericSeriesAfterDot = !!qm && qnum === lastNum + 1
      && /^(?:\d{1,4}\s*[／/，,、]|\d{1,4}\s+\d{3}|\d{1,2}\s*(?:世纪|年代)|\d{1,3}\s*岁)/.test(qBody);
    // 「8.100 张多米诺骨牌…」：题号后直接跟三位以上整数，仍是题干
    const longIntegerAfterDot = !!qm && /^[.．]$/.test(qm[2]) && qnum === lastNum + 1
      && /^\d{3,4}\s*[\u4e00-\u9fa5]/.test(qBody);
    const decimalAfterDot = !!qm && /^[.．]$/.test(qm[2]) && /^\d/.test(qBody)
      && !dateAfterDot && !sequenceAfterDot && !numericSeriesAfterDot && !longIntegerAfterDot;
    // 题号严格递增，避免把解析里的数字/材料编号当成重复题号
    if (qm && qnum <= 200 && qnum > lastNum && !decimalAfterDot && !/^\d{1,3}\s*[:：]\s*\d/.test(line)) {
      flushMaterial();
      items.push({ type: 'question', num: qnum, module: currentModule, body: stripChoiceType(qBody) });
      lastNum = qnum;
      continue;
    }

    // 部分真题题号后只有空格（如「111 2014 年全国…」），仅在连续题号时采用
    const qSpace = line.match(/^(\d{1,3})\s+(.+)$/);
    if (qSpace) {
      const num = Number(qSpace[1]);
      if (num === lastNum + 1 && num <= 200) {
        flushMaterial();
        items.push({ type: 'question', num, module: currentModule, body: qSpace[2] });
        lastNum = num;
        continue;
      }
    }

    // 行内出现下一个题号（上一题选项与下一题黏连），支持一行连续多个题号
    if (!pendingMaterial && lastNum > 0) {
      QTAG_RE.lastIndex = 0;
      const inline = [];
      let expected = lastNum + 1;
      let im;
      while ((im = QTAG_RE.exec(line)) !== null) {
        const num = Number(im[1]);
        if (num === expected && im.index > 0) {
          inline.push({ num, index: im.index, len: im[0].length });
          expected = num + 1;
        }
      }
      if (inline.length) {
        let cursor = 0;
        for (const tag of inline) {
          const before = line.slice(cursor, tag.index).trim();
          if (before) appendToLast(items, before);
          items.push({ type: 'question', num: tag.num, module: currentModule, body: line.slice(tag.index + tag.len) });
          lastNum = tag.num;
          cursor = tag.index + tag.len;
        }
        continue;
      }
    }

    // 选项行尾黏连纯空格题号（如「D、第四季度 129 2012 年上半年…」）
    if (!pendingMaterial && lastNum > 0) {
      // 「每 10 万人」「共 20 个项目」里的数量词不是题号，先排除常见量词/单位
      const spaceTagRe = /\s(\d{1,3})\s+(?=(?:(?:19|20)\d{2}(?:\s*年)?|(?!(?:万|千|百|十|亿|个|人|元|年|月|日|岁|次|倍|分|秒|米|吨|度|项|种|条|家|位|名|件|台|辆|只|张|页|题|字|克|升|亩|余|多|左右|以上|以下|的|%|％))[\u4e00-\u9fa5“《（(【]))/g;
      let sm;
      let spaceTag = null;
      while ((sm = spaceTagRe.exec(line)) !== null) {
        const num = Number(sm[1]);
        const before = line.slice(0, sm.index).trim();
        const afterOption = /[A-D]\s*[、.．][^A-D]*$/.test(before);
        const afterSentence = /[。；;]$/.test(before);
        if (num === lastNum + 1 && num >= 10 && (afterOption || afterSentence)) {
          spaceTag = { num, index: sm.index, len: sm[0].length };
        }
      }
      if (spaceTag) {
        const before = line.slice(0, spaceTag.index).trim();
        if (before) appendToLast(items, before);
        items.push({ type: 'question', num: spaceTag.num, module: currentModule, body: line.slice(spaceTag.index + spaceTag.len).trim() });
        lastNum = spaceTag.num;
        continue;
      }
    }

    // 材料段落末尾黏连题号（如「……补偿贸易方式。 66：单选、」）：材料收尾，题号起新题
    if (pendingMaterial && lastNum > 0) {
      const trailRe = /(?:^|\s)([（(]?\d{1,3}[）)]?)\s*(?:[、.．](?!\d)|[:：])\s*((?:单选|多选|单项选择|多项选择)?\s*[、.．]?\s*)$/g;
      let tm;
      let trail = null;
      while ((tm = trailRe.exec(line)) !== null) {
        if (Number(tm[1]) === lastNum + 1) trail = { num: Number(tm[1]), index: tm.index, body: tm[2] };
      }
      if (trail) {
        const before = line.slice(0, trail.index).trim();
        if (before) pendingMaterial.lines.push(before);
        flushMaterial();
        items.push({ type: 'question', num: trail.num, module: currentModule, body: stripChoiceType(trail.body) });
        lastNum = trail.num;
        continue;
      }
    }

    // 指导语末尾黏连下一题题号（如「请开始答题： 23.」）
    if (lastNum > 0) {
      const endTag = line.match(/(?:^|\s)(\d{1,3})\s*[、.．:：]\s*$/);
      if (endTag && Number(endTag[1]) === lastNum + 1) {
        flushMaterial();
        items.push({ type: 'question', num: lastNum + 1, module: currentModule, body: '' });
        lastNum += 1;
        continue;
      }
    }

    // 范围首题无独立题号：遇到首个选项行时，把缓冲区末尾的题干切出来补成一题
    if (pendingMaterial && pendingMaterial.firstQuestion && !pendingMaterial.firstQuestion.emitted) {
      const fq = pendingMaterial.firstQuestion;
      const startsOption = /^[A-D]\s*(?:[、.．)）:：]|\s)/.test(line);
      if (startsOption) {
        const stemIdx = findFirstQuestionStemStart(pendingMaterial.lines);
        let body;
        if (stemIdx >= 0) {
          body = [...pendingMaterial.lines.slice(stemIdx), line].join('\n');
          pendingMaterial.lines = pendingMaterial.lines.slice(0, stemIdx);
        } else {
          // 题干与选项同一行：缓冲区全部保留为材料，当前行作为题目正文
          body = line;
        }
        flushMaterial();
        items.push({ type: 'question', num: fq.num, module: currentModule, body });
        lastNum = fq.num;
        continue;
      }
    }

    if (pendingMaterial) {
      pendingMaterial.lines.push(line);
    } else if (
      !appendToLast(items, line)
      && line.length >= 40
      && !/共\s*\d+\s*题|参考时限|建议分配|评分标准/.test(line)
      && (currentModule === 'ziliao' || currentModule === 'yanyu')
    ) {
      // 上一题选项已闭合：后续整段文字属于下一份材料（即使没有「（材料 N）」标题）
      startMaterial(null, null);
      pendingMaterial.lines.push(line);
    }
  }

  flushMaterial();
  return items;
}

/** 无模块标题时按国考 2021 题量分布兜底推断（副省级 135 / 地市级 130） */
function moduleByNumber(num, total) {
  const judgeEnd = total >= 133 ? 110 : 105;
  if (num <= 20) return 'changshi';
  if (num <= 55) return 'yanyu';
  if (num <= 70) return 'shuliang';
  if (num <= judgeEnd) return 'panduan';
  return 'ziliao';
}

/** 把 scanBlocks 的结果组装成题目（不含答案） */
/** 2023 行测：题号独占一行，或黏在选项行尾（如 "D、5 项 2"） */
function normalizeBareNumbers(text, opts = {}) {
  const minAppended = opts.minAppended ?? 10;
  const allowAnyAppended = !!opts.allowAnyAppended;
  const out = [];
  let last = 0;
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (/^\d{1,3}$/.test(t)) {
      const n = Number(t);
      if (n > last && n - last <= 5) {
        out.push(`${n}、`);
        last = n;
        continue;
      }
    }
    const m = line.match(/^(.*\S)\s+(\d{1,3})\s*$/);
    if (m) {
      const n = Number(m[2]);
      const looksOption = /[A-D]\s*[、.．]/.test(m[1]);
      // 无选项行仅在句末黏连（如共享材料「……。 106」）时拆分，避免误切数字
      const looksSentence = n >= minAppended && /[。！？；》]$/.test(m[1]);
      // 解析文档常见「【文段出处】…… 22」：句尾无标点，按“下一个题号”识别
      const looksAnswerTail = allowAnyAppended
        && m[1].length >= 12
        && !/\d$/.test(m[1])
        && !/[年月日%％元万亿人个项倍分秒米吨度岁次]$/.test(m[1]);
      if (n === last + 1 && (looksOption || looksSentence || looksAnswerTail)) {
        out.push(m[1]);
        out.push(`${n}、`);
        last = n;
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

/** 同一行并排的两个题号（图形推理「51. 52」）拆成两道题 */
function splitPairedQuestionNumbers(text) {
  return String(text || '').split('\n').map(line => {
    const m = line.trim().match(/^(\d{1,3})\s*[、.．]\s*(\d{1,3})$/);
    if (m && Number(m[2]) === Number(m[1]) + 1) {
      return `${m[1]}. ${IMG_MARK}\n${m[2]}. ${IMG_MARK}`;
    }
    return line;
  }).join('\n');
}

/** 解析文件里「……得不偿失》 30、第一空……」这类题号黏在段尾时拆成独立行 */
function splitGluedAnswerQuestionNumbers(text) {
  const out = [];
  let last = 0;
  for (const line of String(text || '').split('\n')) {
    const head = line.match(/^\s*[（(]?(\d{1,3})[）)]?\s*(?:、|[.．](?=\s*(?:(?:19|20)\d{2}(?:\s*年)?|[\u4e00-\u9fa5A-D“《（(【]))|[:：])/);
    if (head) last = Number(head[1]);

    let rest = line;
    while (true) {
      const m = rest.match(/([。！？；;》】）)])\s*(\d{1,3})\s*[、.．]\s*(?=[\u4e00-\u9fa5“《（(【])/);
      if (!m) {
        out.push(rest);
        break;
      }
      const num = Number(m[2]);
      if (!(num > last && num <= last + 3)) {
        out.push(rest);
        break;
      }
      const cut = m.index + m[1].length;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
      last = num;
    }
  }
  return out.join('\n');
}

/** 解析文件里「……故正确答案为 C。 19.D【解析】」这类黏连题号拆成独立行 */
function normalizeGluedAnswerMarkers(text) {
  return String(text || '')
    // 「来源：《……》2008 年 07 月 02 日《环球》杂志 35、此题考查……」：出处行尾黏连下一题
    .replace(/((?:来源|出处|摘自|转自)\s*[：:][^\n]*?)\s+(\d{1,3})\s*[、.．]\s*(?=[\u4e00-\u9fa5“《（(【])/g, '$1\n$2、')
    .replace(/(?<![\d\n])([（(]?\d{1,3}[）)]?\s*[、.．]?\s*(?=【\s*答\s*案\s*】))/g, '\n$1')
    .replace(/(?<![\d\n])([（(]?\d{1,3}[）)]?\s*[、.．]?\s*(?=[A-D]{1,4}\s*(?:【|［|\[)\s*解\s*析))/g, '\n$1');
}

function buildXingceQuestions(text, meta) {
  const items = scanBlocks(splitPairedQuestionNumbers(normalizeBareNumbers(text)));
  const qItems = items.filter(i => i.type === 'question');
  const total = qItems.length ? Math.max(...qItems.map(i => i.num)) : 0;
  const materials = items.filter(i => i.type === 'material');

  const questions = [];
  const seen = new Map();
  const issues = [];
  let currentMaterial = null;

  for (const it of items) {
    if (it.type === 'header') {
      currentMaterial = null;
      continue;
    }
    if (it.type === 'material') {
      currentMaterial = it;
      continue;
    }
    if (it.type !== 'question') continue;

    // 题干/选项里可能残留图片与表格标记
    const bodyImages = (it.body.match(/\[\[IMG\]\]/g) || []).length
      + [...it.body.matchAll(/\[\[TABLE imgs=(\d+) rows=(\d+)\]\]/g)].reduce((sum, m) => sum + Number(m[1]), 0);
    const cleanBody = it.body
      .replace(/\[\[IMG\]\]/g, '')
      .replace(/\[\[\/?TABLE[^\]]*\]\]/g, '');

    const parsed = splitStemAndOptions(cleanBody);
    if (process.env.DEBUG_Q === `${meta.year}-${it.num}`) {
      console.error('[DEBUG_Q]', JSON.stringify(it.body));
      console.error('[DEBUG_PARSED]', JSON.stringify(parsed));
    }
    const module = it.module || moduleByNumber(it.num, total);

    // 有显式题号范围时严格按范围；仅有「（材料 N）」时挂到后续题，遇到下一份材料/模块为止
    const inRange = !!currentMaterial && (
      currentMaterial.from == null ||
      (it.num >= currentMaterial.from && it.num <= currentMaterial.to)
    );
    const material = inRange ? currentMaterial : null;
    if (currentMaterial && currentMaterial.from != null && it.num > currentMaterial.to) currentMaterial = null;

    // 图形推理的选项常是四张图：四个选项都无文本时按图片题处理
    const emptyImageOptions = module === 'panduan' && parsed.options.length === 4
      && parsed.options.every(o => !o.text.trim());
    // 题块完全没有正文/选项（原文档图片丢失或题号后单独成行）时，按图片题容错
    const blankQuestion = !cleanBody.trim() && parsed.options.length === 0;
    const image = detectImageQuestion(parsed.stem)
      || bodyImages > 0
      || emptyImageOptions
      || blankQuestion
      || !!(material && material.text === '【图片材料】');

    // 纯图片题或填空题在真题文本里可能只剩图片标记/选项：给出通用题干，避免空题干
    if (!parsed.stem.trim() && (image || parsed.options.length === 4)) {
      parsed.stem = image
        ? (module === 'panduan'
          ? '请根据图形规律，从四个选项中选出最合适的一项。'
          : module === 'ziliao'
            ? '请根据上述资料回答以下问题。'
            : '请根据题干信息选择正确答案。')
        : module === 'yanyu'
          ? '请根据上下文，选择最恰当的一项填入横线处。'
          : '请根据题干信息选择正确答案。';
    }

    const q = {
      id: `gk-${meta.year}-${meta.label}-${it.num}`,
      category: 'national',
      module,
      title: makeTitle(parsed.stem, module),
      stem: parsed.stem,
      material: material ? material.text : undefined,
      materialImage: material && material.hasImage ? true : undefined,
      options: parsed.options,
      answer: '',
      explanation: '',
      keyPoints: [],
      thinkingTip: `【${MODULE_CN[module] || '行测'}】先定位题干关键条件，再结合选项逐一排除。`,
      difficulty: DIFFICULTY[module] || '中等',
      source: `${meta.year}年国家公务员考试《行测》${meta.label}第${it.num}题`,
      isImageQuestion: image || undefined,
      num: it.num,
    };

    if (seen.has(it.num)) {
      issues.push({ num: it.num, code: 'DUP_QNO', detail: '题号重复，保留首个解析成功的题目' });
      continue;
    }
    seen.set(it.num, q);
    questions.push(q);

    if (parsed.splitScore < 0 && !image) {
      issues.push({ num: it.num, code: 'OPT_SPLIT_FAIL', detail: `未能拆出 A-D 选项：${compact(cleanBody, 60)}` });
    } else if (!image && parsed.options.length !== 4) {
      // 2-3 个完整选项通常意味着原卷缺项，交给 validatePaper 记为 WARN（OPT_PARTIAL）
      const partial = parsed.options.length >= 2 && parsed.options.length < 4
        && parsed.options.every(o => o.text.trim());
      if (!partial) issues.push({ num: it.num, code: 'OPT_COUNT', detail: `选项数 ${parsed.options.length}` });
    }
    if (it.num > 0 && !it.module) {
      issues.push({ num: it.num, code: 'MODULE_INFERRED', detail: `无模块标题，按题号推断为 ${module}` });
    }
  }

  if (ARGS.verbose) {
    const groups = new Map();
    for (const q of questions) {
      if (!q.material) continue;
      const key = q.material.slice(0, 40);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(q.num);
    }
    for (const [, nums] of groups) {
      vlog(`    [材料] ${nums[0]}..${nums[nums.length - 1]} 共 ${nums.length} 题`);
    }
  }

  return { questions, issues, materials, total, maxNum: total };
}

/* ------------------------------------------------------------------ */
/* 答案与解析                                                          */
/* ------------------------------------------------------------------ */

const ANSWER_PATTERNS = [
  /故\s*正\s*确\s*答\s*案\s*为\s*[:：]?\s*([A-D])/i,
  // 2017 副省级等解析写作「故正确选项为 C」
  /故\s*正\s*确\s*选\s*项\s*(?:应)?\s*(?:为|是)\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /正\s*确\s*选\s*项\s*(?:应)?\s*(?:为|是)\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /故\s*答\s*案\s*选\s*([A-D])/i,
  /故\s*选\s*([A-D])(?![A-Za-z])/i,
  /应\s*选\s*([A-D])(?![A-Za-z])/i,
  /正\s*确\s*答\s*案\s*(?:应)?\s*(?:为|是)?\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /【\s*答\s*案\s*】\s*[:：]?\s*([A-D])/i,
  /因\s*此\s*[，,、]?\s*(?:应\s*)?选\s*择?\s*([A-D])(?![A-Za-z])/i,
  /所\s*以\s*[，,、]?\s*(?:应\s*)?选\s*择?\s*([A-D])(?![A-Za-z])/i,
  /答\s*案\s*(?:为|是|选)?\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
];

// 老卷解析：「1.B 【解析】」中题号后的首字母就是答案；多选题可能为「71.AC」
const LEADING_ANSWER_RE = /^\s*([A-D]{1,4})(?![A-Za-z\u4e00-\u9fa5])\s*(?=【|［|\[|（|\(|解析|答案|$)/;
// 表格抽取后常见「D      而其余各项…」「B      因为…」：首字母后用多个空格与解析分隔
const LEADING_ANSWER_SPACED_RE = /^\s*([A-D])(?:[ \t]{2,}|\t)\s*(?=[^\s])/;
// 「56.【解析】C。」：答案写在解析标记之后
const LEADING_EXPLANATION_ANSWER_RE = /^\s*(?:【|［|\[)\s*解\s*析\s*(?:】|］|\])?\s*[:：]?\s*([A-D]{1,4})(?![A-Za-z\u4e00-\u9fa5])/;

/** 答案统一成 A-D / AC 形式（多选去重并排序） */
function normalizeChoiceAnswer(value) {
  const letters = [...new Set(String(value || '').toUpperCase().match(/[A-D]/g) || [])].sort();
  return letters.join('');
}

function isValidChoiceAnswer(value) {
  return /^[A-D]{1,4}$/.test(String(value || '')) && new Set(value).size === value.length;
}

function extractAnswer(text) {
  const body = String(text || '');
  const lead = body.match(LEADING_ANSWER_RE);
  if (lead) return normalizeChoiceAnswer(lead[1]);

  const leadSpaced = body.match(LEADING_ANSWER_SPACED_RE);
  if (leadSpaced) return normalizeChoiceAnswer(leadSpaced[1]);

  const leadExplanation = body.match(LEADING_EXPLANATION_ANSWER_RE);
  if (leadExplanation) return normalizeChoiceAnswer(leadExplanation[1]);

  for (const re of ANSWER_PATTERNS) {
    const m = body.match(re);
    if (m) return normalizeChoiceAnswer(m[1]);
  }

  // 少数解析只逐项分析、未写总括句：取唯一被判定为“符合/正确/最合适”的选项
  const positives = [...body.matchAll(/([A-D])\s*项[^。；\n]{0,30}(?:符合|正确|恰当|最合适|更为合适)/g)]
    .map(m => m[1]);
  const unique = [...new Set(positives)];
  if (unique.length === 1) return unique[0];
  return '';
}

/** 解析文件是否含足够多的答案标记（老卷常用「故选 B」） */
const ANSWER_MARK_RE = /故\s*正\s*确\s*答\s*案\s*为|故\s*答\s*案\s*选|故\s*选\s*[A-D]|应\s*选\s*[A-D]|【\s*答案\s*】|正确答案\s*[：:]|答案\s*[是为：:]?\s*选?\s*[A-D]|因\s*此\s*[，,]?\s*选\s*择\s*[A-D]/gi;

function countAnswerMarks(text) {
  return (String(text || '').match(ANSWER_MARK_RE) || []).length;
}

/** 按题号切分解析文件，取每个题号下最长的一段作为该题解析 */
function splitAnswerBlocks(text) {
  const blocks = new Map();
  let cur = null;

  const push = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').trim();
    const prev = blocks.get(cur.num);
    if (!prev || body.length > prev.text.length) blocks.set(cur.num, { num: cur.num, text: body });
  };

  for (const rawLine of splitGluedAnswerQuestionNumbers(text).split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      if (cur) cur.lines.push('');
      continue;
    }

    let m = line.match(/^【\s*(\d{1,3})\s*】\s*(.*)$/);
    // 解析里的「(1).A…」「1、2、2…」是层次编号/数值列举，不是新题号
    const enumLine = /^[（(]\d{1,3}[）)]\s*[.．]/.test(line)
      || /^\d{1,3}\s*[:：]\s*\d/.test(line)
      || /^\d{1,3}\s*、\s*\d{1,3}\s*[、,，]\s*\d{1,3}/.test(line);
    // 题号「1、」「1.」「1：」；小数点后接数字（1.2y / （98.8%））不算题号
    if (!m && !enumLine) m = line.match(/^[（(]?(\d{1,3})[）)]?\s*(?:、|[.．](?=\s*(?:(?:19|20)\d{2}(?:\s*年)?|[\u4e00-\u9fa5A-D“《（(【]))|[:：])\s*(.*)$/);
    // 老卷「1【答案】B」「1、【答案】B」：题号后直接跟答案标记
    if (!m) m = line.match(/^[（(]?(\d{1,3})[）)]?\s*([、.．]?\s*【\s*答\s*案\s*】.*)$/);
    // 2023 行测解析：题号独占一行（无顿号/点号）
    if (!m && /^\d{1,3}$/.test(line)) m = [line, line, ''];

    // 解析正文里的分情况编号（如 115 题里的「1、假设甲坐 2 号座椅」、
    // 75 题公式换行后的孤立「1」）不是新题号：题号只允许向前推进。
    if (cur && m && cur.num >= 10 && Number(m[1]) < cur.num) m = null;
    // 表格里的数字也会被抽成独立一行（2006 副省第 46 题解析表格里的「81」）。
    // 独占一行的题号只有在紧接上一题时才可信，否则视为表格/公式数据。
    if (m && /^\d{1,3}$/.test(line) && m[2] === '' && cur && Number(m[1]) !== cur.num + 1) m = null;

    if (m && Number(m[1]) <= 200) {
      push();
      cur = { num: Number(m[1]), lines: [m[2]] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  push();

  for (const [num, b] of blocks) {
    if (b.text.length < 2) blocks.delete(num);
  }
  return blocks;
}

/** 快速对答案区：1-5 ABCDA / 6：B */
function parseQuickKey(text) {
  const map = new Map();
  const head = text.slice(0, Math.min(text.length, 1500));
  const rangeRe = /(\d{1,3})\s*[-~—－至]\s*(\d{1,3})\s*[】\]）)]?\s*[：:]?\s*([A-D]{2,12})/g;
  let m;
  while ((m = rangeRe.exec(head)) !== null) {
    const from = Number(m[1]);
    const seq = m[3].replace(/\s/g, '');
    for (let i = 0; i < seq.length; i++) map.set(from + i, seq[i]);
  }
  const singleRe = /(?:^|\s)(\d{1,3})\s*[：:]\s*([A-D])(?![A-Za-z])/g;
  while ((m = singleRe.exec(head)) !== null) map.set(Number(m[1]), m[2]);
  return map;
}

/**
 * 兜底：解析文档使用 Word 自动编号时，题号不会出现在文本里，
 * 此时按「【答案】」或「故正确答案为」的出现顺序切段，与题号一一对应。
 * 仅在标记数与题目数完全相等、且题号连续时启用；否则返回 null，宁缺毋滥。
 */
function splitAnswerBySequential(text, questionNums) {
  const nums = [...questionNums].sort((a, b) => a - b);
  if (!nums.length || !nums.every((n, i) => n === i + 1)) return null;

  const strategies = [
    { re: /【答案】\s*([A-D])/g, mode: 'before' },
    { re: /故正确答案为\s*([A-D])/g, mode: 'after' },
  ];

  for (const { re, mode } of strategies) {
    const marks = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) marks.push({ start: m.index, end: m.index + m[0].length });
    if (marks.length !== nums.length) continue;

    const out = new Map();
    for (let i = 0; i < nums.length; i++) {
      const segStart = mode === 'before'
        ? (i === 0 ? 0 : marks[i].start)
        : (i === 0 ? 0 : marks[i - 1].end);
      const segEnd = mode === 'before'
        ? (i + 1 < marks.length ? marks[i + 1].start : text.length)
        : marks[i].end;
      const body = text.slice(segStart, segEnd).trim();
      if (body.length < 2) {
        out.clear();
        break;
      }
      out.set(nums[i], { num: nums[i], text: body });
    }
    if (out.size !== nums.length) continue;

    // 速查表里的「【答案】B」也会形成短块，平均长度过低时放弃该策略
    const totalLen = [...out.values()].reduce((sum, b) => sum + b.text.length, 0);
    if (totalLen / nums.length < 40) continue;

    return out;
  }

  return null;
}

/** 把解析文件合并进题目；只按同年同卷同题号配对，不跨题借用 */
function mergeAnswers(questions, answerText, meta) {
  // 解析文件同样存在「……故正确答案为 C。 4」这种题号黏连
  answerText = normalizeGluedAnswerMarkers(normalizeBareNumbers(answerText, { minAppended: 1, allowAnyAppended: true }));
  let blocks = splitAnswerBlocks(answerText);
  const quick = parseQuickKey(answerText);
  const issues = [];

  // 旁挂 OCR 清单只有「N、正确答案：X」，没有解析正文：只取答案，不把清单本身当解析
  const ANSWER_ONLY_BLOCK_RE = /^正确答案\s*[：:]?\s*[A-D]{1,4}\s*[。.]?$/;
  const answerOnlySource = blocks.size > 0
    && [...blocks.values()].every(b => ANSWER_ONLY_BLOCK_RE.test(b.text.trim()));

  const covered = questions.filter(q => blocks.has(q.num)).length;
  if (process.env.DEBUG_ANS) {
    const dbg = [22, 64, 111].map(n => {
      const b = blocks.get(n);
      return `### ${n}\n${b ? b.text : '(NO BLOCK)'}`;
    }).join('\n\n');
    fs.writeFileSync(path.join(REPORT_DIR, 'debug-answers.txt'), dbg, 'utf8');
  }
  if (covered < questions.length * 0.5 && questions.length) {
    const fallback = splitAnswerBySequential(answerText, questions.map(q => q.num));
    if (fallback) {
      blocks = fallback;
      issues.push({ num: 0, code: 'ANALYSIS_SEQUENTIAL', detail: '解析题号缺失（Word 自动编号），已按答案句顺序与连续题号一一对应' });
    }
  }

  for (const q of questions) {
    const block = blocks.get(q.num);
    let answer = block ? extractAnswer(block.text) : '';
    let fromQuick = false;

    if (!answer && quick.has(q.num)) {
      answer = quick.get(q.num);
      fromQuick = true;
    }

    q.answer = answer;
    q.explanation = answerOnlySource ? '' : (block ? block.text.trim() : '');
    q.keyPoints = extractKeyPoints(q.explanation);

    if (!answerOnlySource && (!block || !q.explanation)) {
      issues.push({ num: q.num, code: 'MISSING_ANALYSIS', detail: '该题号无解析内容（禁止跨题借用）' });
    }
    if (!answer) {
      issues.push({ num: q.num, code: 'MISSING_ANSWER', detail: '未找到「故正确答案为 X」且无同题号速查答案' });
    } else if (fromQuick) {
      issues.push({ num: q.num, code: 'ANSWER_FROM_QUICKKEY', detail: `答案 ${answer} 取自同题号速查区` });
    }
    if (answer && !isValidChoiceAnswer(answer)) {
      issues.push({ num: q.num, code: 'ANSWER_INVALID', detail: `答案 ${answer} 非 A-D` });
    }
  }

  if (answerOnlySource) {
    // 交给 validatePaper 统一出一条卷级 WARN（含答案/解析统计），此处不重复报
    if (meta) meta.answerOnlySource = true;
  }

  const qnums = new Set(questions.map(q => q.num));
  const maxNum = questions.reduce((max, q) => Math.max(max, q.num), 0);
  for (const num of blocks.keys()) {
    // 超出最大题号的块通常是解析中的数字编号，不当作「多出的解析」
    if (num > maxNum) continue;
    if (!qnums.has(num)) {
      issues.push({ num, code: 'ANALYSIS_EXTRA', detail: '解析题号在真题中不存在' });
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* 申论解析                                                            */
/* ------------------------------------------------------------------ */

function splitNumberedSections(text) {
  const re = /^[ \t]*([一二三四五六七八九十]{1,3})\s*[、.．]\s*/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) marks.push({ num: cnToNum(m[1]), index: m.index, len: m[0].length });
  if (marks.length === 0) return [];

  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i].len;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    out.push({ num: marks[i].num || i + 1, text: text.slice(start, end).trim() });
  }
  return out.filter(s => s.text.length > 0);
}

/** 申论文本归一化：修复「一\n、」与「……。 二、」等同段落黏连 */
function normalizeShenlunText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/^[ \t]*([一二三四五六七八九十]{1,3})[ \t]*\n+[ \t]*[、.．][ \t]*\n?/gm, '$1、')
    // 「、三作答要求」这类题号与标题顺序颠倒的 PDF 残留
    .replace(/^[ \t]*[、.．]?\s*([一二三四五六七八九十]{1,3})\s*(?=作答要求|作答题目|申论要求)/gm, '$1、')
    .replace(/([。！？；》”])\s*([一二三四五六七八九十]{1,3})\s*[、.．]\s*(?=\S)/g, '$1\n$2、')
    // 答案标记黏在上一条末尾：「……。 3.【参考例文】」
    .replace(/([。！？；）)])\s*(\d{1,2})\s*[、.．]\s*(【\s*(?:答案提示|参考例文|参考答案)\s*】)/g, '$1\n$2、$3')
    .replace(/([^\n])\s*([一二三四五六七八九十]{1,3})\s*[、.．]\s*([（(]\s*\d+\s*分\s*[）)]\s*【参考答案】)/g, '$1\n$2、$3')
    .replace(/([^\n])\s*([一二三四五六七八九十]{1,3})\s*[、.．]\s*参考答案/g, '$1\n$2、参考答案');
}

/** 收集申论题号：1、/一、/（一）/（1）/问题一： */
function collectShenlunQuestionMarks(text) {
  const re = /^[ \t]*(?:问题\s*([一二三四五六七八九十]{1,3})\s*[：:]|[（(]\s*([一二三四五六七八九十]{1,3}|\d{1,2})\s*[）)]|([一二三四五六七八九十]{1,3})\s*[、.．]|(\d{1,2})\s*[、.．])\s*/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] || m[2] || m[3] || m[4];
    marks.push({
      raw,
      num: /^\d+$/.test(raw) ? Number(raw) : cnToNum(raw),
      type: m[1] ? 'problem' : m[2] ? (/^\d+$/.test(m[2]) ? 'paren' : 'parenCn') : m[3] ? 'cn' : 'digit',
      // 保留分隔符，用于区分「3、」主问题与「1.」容器内子问
      sep: (m[0].match(/[、.．]/) || [''])[0],
      index: m.index,
      len: m[0].length,
    });
  }
  return marks;
}

/**
 * 按重复题干定位申论答案段。
 * 2007/2008/2025 等卷的答案区会再次抄写完整题干，直接命中题干前缀比“数一、二、”可靠，
 * 可避免把答案内部的小标题当成新题。
 */
function locateAnswerSectionsByStem(answerPart, questionSections) {
  const positions = [];
  let from = 0;

  for (const sec of questionSections) {
    const sample = String(sec.text || '').replace(/\s+/g, '').slice(0, 24);
    if (sample.length < 8) return null;
    const pattern = sample
      .split('')
      .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    const m = new RegExp(pattern).exec(answerPart.slice(from));
    if (!m) return null;
    const index = from + m.index;
    positions.push(index);
    from = index + m[0].length;
  }

  if (positions.length !== questionSections.length) return null;
  return positions.map((start, i) => ({
    num: questionSections[i].num,
    text: answerPart.slice(start, i + 1 < positions.length ? positions[i + 1] : answerPart.length).trim(),
  })).filter(sec => sec.text.length > 0);
}

/** 申论无题号兜底：按含「（N分）」的设问段落切块（2023 地市/执法） */
function splitShenlunByScore(text) {
  const paras = String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const blocks = [];
  let cur = '';
  for (const p of paras) {
    const hasScore = /[（(]\s*\d+\s*分\s*[）)]/.test(p);
    if (hasScore && !/^要求\s*[：:]/.test(p) && p.length > 30) {
      if (cur) blocks.push(cur);
      cur = p;
    } else if (cur) {
      cur += '\n' + p;
    } else {
      cur = p;
    }
  }
  if (cur) blocks.push(cur);
  return blocks.filter(t => t.length >= 10).map((t, i) => ({ num: i + 1, text: t }));
}

/** 申论作答要求子项常见开头（「（1）准确、全面」不是题目） */
const RUBRIC_START_RE = /^(?:不超过|字数|观点|见解|紧扣|内容|表述|语言|条理|所提|问题|准确|全面|参考|思路|逻辑|自选|联系实际|结合|针对|符合|主题|结构|行文|要求)/;

/** 申论题干：支持 1./一、/（一）/（1）/问题一：，并过滤「下面两题」总起句与作答要求子项 */
function splitShenlunQuestions(text) {
  const allMarks = collectShenlunQuestionMarks(text);
  // 有「一、二、」顶级题号时，忽略其内部的「1、2、」子问，避免把一道题拆成多道；
  // 其次把「（一）（二）」视为顶级题号（2010 等卷），忽略「（1）（2）」与「2．」作答要求
  const cnMarks = allMarks.filter(mk => mk.type === 'cn');
  const parenCnMarks = allMarks.filter(mk => mk.type === 'parenCn');
  const useParenCn = cnMarks.length < 2 && parenCnMarks.length >= 2;
  let marks = cnMarks.length >= 2 ? cnMarks : useParenCn ? parenCnMarks : allMarks;
  // 2009 地市卷把第二题误写成「（2）本题仅限……」，在「（一）（三）（四）」体系中会漏题
  if (useParenCn) {
    const extras = allMarks.filter(mk => {
      if (mk.type !== 'paren' || !/^本题仅限/.test(text.slice(mk.index + mk.len).trim())) return false;
      return !marks.some(x => x.index === mk.index);
    });
    if (extras.length) marks = [...marks, ...extras].sort((a, b) => a.index - b.index);
  }
  const out = [];
  let containerEnd = -1;

  // 「3、……回答下列两个问题。」后紧跟的「1.」「2.」是这道题的子问，不能当成两道新题。
  // 仅当子问用「. / （1）」而主问题用「、」时跳过，避免误伤本来就用「1.」作主题号的卷子。
  const subQuestionIdx = new Set();
  for (let i = 0; i < marks.length; i++) {
    const cur = marks[i];
    const nextIdx = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(cur.index + cur.len, nextIdx).trim();
    const cm = /回答(?:下列|以下|下面)\s*([一二两三四五六七八九十\d]{1,2})\s*(?:个)?问题|请回答(?:下列|以下|下面)(?:的)?问题/.exec(body);
    if (!cm) continue;
    const count = cm[1]
      ? (/^\d+$/.test(cm[1]) ? Number(cm[1]) : cnToNum(cm[1]))
      : 2;
    let found = 0;
    for (let j = i + 1; j < marks.length && found < count; j++) {
      const mk = marks[j];
      const isSubMark = mk.num === found + 1
        && (mk.sep === '.' || mk.sep === '．' || mk.type === 'paren' || mk.type === 'parenCn');
      if (!isSubMark) break;
      subQuestionIdx.add(j);
      found++;
    }
  }

  for (let i = 0; i < marks.length; i++) {
    if (subQuestionIdx.has(i)) continue;
    const cur = marks[i];
    let next = i + 1;
    while (next < marks.length && subQuestionIdx.has(next)) next++;
    const end = next < marks.length ? marks[next].index : text.length;
    const body = text.slice(cur.index + cur.len, end).trim();
    const isArabicParen = cur.type === 'paren' && /^\d+$/.test(cur.raw);

    // 「（一）……下面两题」是总起句：跳过它及其下属（1）（2）
    // 若「（一）（二）」本身就是顶级题号，则整题保留（其答案解析也合并在一段里）
    if (!useParenCn && (cur.type === 'paren' || cur.type === 'parenCn') && !isArabicParen && /下面[两二三]题|以下[两二三]题/.test(body)) {
      containerEnd = text.length;
      for (let j = i + 1; j < marks.length; j++) {
        if ((marks[j].type === 'paren' || marks[j].type === 'parenCn') && !/^\d+$/.test(marks[j].raw)) {
          containerEnd = marks[j].index;
          break;
        }
        if (marks[j].type === 'cn' || marks[j].type === 'problem') {
          containerEnd = marks[j].index;
          break;
        }
      }
      continue;
    }
    if (isArabicParen) {
      if (cur.index < containerEnd) continue;
      // 分数落在当前题号到下一题号之间即视为题干（2019 地市第 4 题的引文跨空行，不能只看首段）
      const scoreInQuestion = /[（(]\s*\d+\s*分\s*[）)]/.test(body);
      if (!/^本题仅限/.test(body) && (!scoreInQuestion || RUBRIC_START_RE.test(body))) continue;
    }
    if (body.length < 10) continue;

    out.push({ num: out.length + 1, text: body });
  }

  if (out.length >= 2) return out;
  return splitShenlunByScore(text);
}

/** 申论答案切分：一、参考答案 / 1、参考答案 / 【试题一】参考答案 / 通用题号 */
function splitShenlunAnswers(text) {
  const slice = marks => {
    const out = [];
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].index + marks[i].len;
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      const body = text.slice(start, end).trim();
      if (body) out.push({ num: marks[i].num || i + 1, text: body });
    }
    return out;
  };
  const collect = re => {
    const marks = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      marks.push({
        raw: m[1],
        num: /^\d+$/.test(m[1]) ? Number(m[1]) : cnToNum(m[1]),
        index: m.index,
        len: m[0].length,
      });
    }
    return marks;
  };

  // 答案段里可能出现单独的「【参考答案】」（题号写在上一段/缺失），
  // 用前后已编号的答案段补出缺号，例如 1、2、【参考答案】、4、5 → 第 3 题。
  const mergeBareAnswerMarks = marks => {
    const bareRe = /^[ \t]*【\s*参考答案\s*】[ \t]*$/gm;
    const bare = [];
    let bm;
    while ((bm = bareRe.exec(text)) !== null) {
      bare.push({ raw: '', num: 0, index: bm.index, len: bm[0].length, bare: true });
    }
    if (!bare.length) return marks;
    const all = [...marks, ...bare].sort((a, b) => a.index - b.index);
    const used = new Set(marks.map(mk => mk.num).filter(n => n > 0));
    for (let i = 0; i < all.length; i++) {
      if (!all[i].bare) continue;
      let prev = null;
      let next = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!all[j].bare) { prev = all[j]; break; }
      }
      for (let j = i + 1; j < all.length; j++) {
        if (!all[j].bare) { next = all[j]; break; }
      }
      // 只有「1、2、【参考答案】、4」这种缺号才补号；
      // 若前后题号已连续（如 2019 副省 3、【参考答案】、4），这是题内另一版答案，跳过。
      if (!prev || !next || next.num <= prev.num + 1) continue;
      let n = prev.num + 1;
      if (next && next.num > prev.num + 1) n = prev.num + 1;
      while (used.has(n)) n++;
      all[i].num = n;
      used.add(n);
    }
    return all.filter(mk => mk.num > 0);
  };

  // 标记只匹配到「参考答案/答案提示/参考例文」为止；不能再吃掉同一行的答案正文
  const specific = [
    /^[ \t]*第\s*([一二三四五六七八九十\d]{1,3})\s*[问題题]\s*参考答案[ \t]*[：:]?/gm,
    /^[ \t]*【问题\s*([一二三四五六七八九十\d]{1,3})\s*参考答案】/gm,
    /^[ \t]*【试题\s*([一二三四五六七八九十\d]{1,3})\s*】\s*参考答案/gm,
    /^[ \t]*([一二三四五六七八九十]{1,3})\s*[、.．]\s*(?:[（(]\s*\d+\s*分\s*[）)]\s*)?(?:【参考答案】|参考答案(?!说明)\s*[：:]?)(?:\s*[（(]\s*[A-Za-z]\s*[）)])?/gm,
    // 2005 等卷写作「3. (1)【答案提示】」：题号后先跟子问编号，再跟答案标记
    /^[ \t]*(\d{1,2})\s*[、.．]\s*(?:[（(]\s*\d{1,2}\s*[）)]\s*)?(?:【\s*(?:参考答案|答案提示|参考例文)\s*】|参考答案(?!说明)\s*[：:]?)(?:\s*[（(]\s*[A-Za-z]\s*[）)])?/gm,
  ];
  for (const re of specific) {
    const marks = collect(re);
    if (process.env.DEBUG_SHENLUN) {
      console.error('[answersplit]', JSON.stringify({ head: text.slice(0, 60).replace(/\n/g, '|'), pattern: String(re).slice(0, 50), marks: marks.map(mk => mk.num) }));
    }
    if (marks.length) {
      const merged = mergeBareAnswerMarks(marks);
      const sections = slice(merged);
      if (process.env.DEBUG_SHENLUN) {
        console.error('[answersplit-merged]', JSON.stringify({ merged: merged.map(mk => ({ num: mk.num, bare: !!mk.bare, index: mk.index })), sections: sections.map(sec => ({ num: sec.num, len: sec.text.length })) }));
      }
      return sections;
    }
  }
  const bareMarks = collect(/^[ \t]*【\s*参考答案\s*】[ \t]*$/gm);
  if (bareMarks.length >= 2) return slice(bareMarks.map((mk, i) => ({ ...mk, num: i + 1 })));

  // 答案直接以题号起段（2025 重复题干；2001【答案提示】）
  // 优先「一、二、」顶级题号，避免答案内部的「1、2、」小点把一段答案拆散
  const cnMarks = collect(/^[ \t]*([一二三四五六七八九十]{1,3})\s*[、.．]\s*/gm);
  if (cnMarks.length >= 2) return slice(cnMarks);
  const digitMarks = collect(/^[ \t]*(\d{1,2})\s*[、.．]\s*/gm);
  if (digitMarks.length >= 2) return slice(digitMarks);
  return [];
}

function parseShenlun(text, meta) {
  const issues = [];
  text = normalizeShenlunText(text);
  const reqRe = /^[ \t]*(?:[一二三四五六七八九十]+\s*[、.．]\s*)?(?:作答要求|申论作答要求|作答题目|问题部分|申论要求)[ \t]*[：:]?[ \t]*$/m;
  const reqMatch = reqRe.exec(text);
  const reqIdx = reqMatch ? reqMatch.index : -1;

  // 答案起点：显式「参考答案/（解析）/答案」，或题号重新从 1 开始（2025 答案重复题干）
  let ansIdx = -1;
  const explicitAnswerRe = /^[^\n]*(?:参\s*考\s*答\s*案|答\s*案\s*及\s*例\s*文|（解析）|\(解析\))[^\n]*$|^[ \t]*答案[ \t]*[：:]?[ \t]*$/m;
  if (reqIdx > -1) {
    const qStart = reqIdx + reqMatch[0].length;
    const tail = text.slice(qStart);
    const am = explicitAnswerRe.exec(tail);
    if (am) {
      ansIdx = qStart + am.index;
    } else {
      const marks = collectShenlunQuestionMarks(tail);
      let max = 0;
      for (const mk of marks) {
        if (max >= 3 && mk.num <= max) {
          ansIdx = qStart + mk.index;
          break;
        }
        max = Math.max(max, mk.num);
      }
    }
  } else {
    const am = explicitAnswerRe.exec(text);
    if (am) ansIdx = am.index;
  }

  let material = '';
  let qPart = text;
  let aPart = '';

  if (reqIdx > -1) {
    material = text.slice(0, reqIdx).trim();
    const qStart = reqIdx + reqMatch[0].length;
    if (ansIdx > qStart) {
      qPart = text.slice(qStart, ansIdx);
      aPart = text.slice(ansIdx);
    } else {
      qPart = text.slice(qStart);
    }
  } else if (ansIdx > -1) {
    material = text.slice(0, ansIdx).trim();
    qPart = '';
    aPart = text.slice(ansIdx);
  }

  // 材料只保留「二、给定材料」之后，去掉注意事项
  const matHead = /^[ \t]*(?:[一二三四五六七八九十]+\s*[、.．]\s*)?(?:给定材料|给定资料|材料部分|资料)[^\n]*$/m.exec(material);
  if (matHead) material = material.slice(matHead.index + matHead[0].length).trim();

  let qSections = splitShenlunQuestions(qPart);
  if (qSections.length === 0) qSections = splitNumberedSections(qPart);
  if (qSections.length === 0) {
    const re = /【问题([一二三四五六七八九十]+)】([\s\S]*?)(?=【问题[一二三四五六七八九十]+】|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      qSections.push({ num: cnToNum(m[1]), text: m[2].trim() });
    }
  }

  let aSections = locateAnswerSectionsByStem(aPart, qSections) || [];
  if (!aSections.length) aSections = splitShenlunAnswers(aPart);
  if (!aSections.length) aSections = splitNumberedSections(aPart);
  if (process.env.DEBUG_SHENLUN) {
    console.error('[shenlun]', meta.year, meta.label, JSON.stringify({
      reqIdx, ansIdx, material: material.length, qPart: qPart.length, aPart: aPart.length,
      qSections: qSections.length, aSections: aSections.length,
      qNums: qSections.map(s => s.num), aNums: aSections.map(s => s.num),
      qHead: qPart.slice(0, 400).replace(/\n/g, '|'),
      aHead: aPart.slice(0, 400).replace(/\n/g, '|'),
    }));
  }
  const answerByNum = new Map();
  for (const sec of aSections) {
    if (!answerByNum.has(sec.num)) answerByNum.set(sec.num, sec.text);
  }
  if (aSections.length && qSections.length && aSections.length !== qSections.length) {
    issues.push({
      num: 0,
      code: 'ANSWER_COUNT_MISMATCH',
      detail: `题目 ${qSections.length} 道，答案段 ${aSections.length} 段，需人工核对答案归属`,
    });
  }
  // 【问题一参考答案】格式
  const aRe = /【问题([一二三四五六七八九十]+)参考答案】([\s\S]*?)(?=【问题[一二三四五六七八九十]+参考答案】|$)/g;
  let am;
  while ((am = aRe.exec(text)) !== null) {
    const n = cnToNum(am[1]);
    if (!answerByNum.has(n)) answerByNum.set(n, am[2].trim());
  }

  const questions = qSections.map((sec, idx) => {
    const answer = answerByNum.get(sec.num) || answerByNum.get(idx + 1) || '';
    const stem = sec.text;
    const q = {
      id: `gk-${meta.year}-${meta.label}-申论-${idx + 1}`,
      category: 'national',
      module: 'shenlun',
      title: `申论·${compact(stem, 28)}`,
      stem,
      material: material || undefined,
      options: [],
      answer,
      explanation: '申论主观题，请对照参考答案要点自评。',
      keyPoints: extractKeyPoints(answer),
      thinkingTip: '【申论】先审题定位作答任务，再回材料找要点，分条书写。',
      difficulty: '拔高',
      source: `${meta.year}年国家公务员考试《申论》${meta.label}第${idx + 1}题`,
      num: idx + 1,
    };
    if (!answer) {
      issues.push({ num: idx + 1, code: 'MISSING_ANSWER', detail: '申论参考答案缺失' });
    }
    return q;
  });

  if (!material) issues.push({ num: 0, code: 'MISSING_MATERIAL', detail: '未识别到申论给定材料' });
  if (questions.length === 0) issues.push({ num: 0, code: 'NO_QUESTION', detail: '未解析出申论题目' });

  return { questions, issues, materialLength: material.length };
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

const WARN_CODES = new Set([
  'MODULE_INFERRED',
  'ANSWER_FROM_QUICKKEY',
  'ANSWER_FROM_OCR_KEY',
  'ANALYSIS_SEQUENTIAL',
  'MATERIAL_MISSING',
  'MATERIAL_IMAGE',
  'IMAGE_OPTION',
  // 申论子问/备用答案会让答案段数与题数不一致，只作提示，不算阻断性错误
  'ANSWER_COUNT_MISMATCH',
  'ANSWER_SOURCE_EMPTY',
  'MISSING_ANSWER_FILE',
]);

/** 图片题的选项常以图片呈现，拆不出 A-D 文本属正常，降级为独立豁免码 */
const IMAGE_TOLERANT_CODES = new Set(['OPT_SPLIT_FAIL', 'OPT_COUNT', 'OPT_NOT_4', 'OPT_EMPTY']);

function missingRanges(nums, max) {
  const set = new Set(nums);
  const out = [];
  let start = null;
  for (let i = 1; i <= max; i++) {
    if (!set.has(i)) {
      if (start === null) start = i;
    } else if (start !== null) {
      out.push(start === i - 1 ? `${start}` : `${start}-${i - 1}`);
      start = null;
    }
  }
  if (start !== null) out.push(start === max ? `${start}` : `${start}-${max}`);
  return out;
}

/**
 * 同一题号可能同时由答案合并与逐题校验报同一问题（典型：Q60 的 MISSING_ANSWER）。
 * 以 code+num 去重，保留带 id/module 的逐题记录。
 */
function dedupeIssues(issues) {
  const out = [];
  const indexByKey = new Map();
  for (const it of issues) {
    const key = `${it.code}|${it.num ?? ''}`;
    const at = indexByKey.get(key);
    if (at == null) {
      indexByKey.set(key, out.length);
      out.push(it);
      continue;
    }
    const prev = out[at];
    const moreSpecific = (!prev.id && it.id) || (!prev.module && it.module);
    if (moreSpecific) {
      out[at] = {
        ...prev,
        ...it,
        level: prev.level === 'ERROR' || it.level === 'ERROR' ? 'ERROR' : 'WARN',
      };
    }
  }
  return out;
}

function validatePaper(questions, meta, baseIssues) {
  const subjective = meta.kind === '申论';
  const imageNums = new Set(questions.filter(q => q.isImageQuestion).map(q => q.num));
  const issues = baseIssues.map(i => {
    const tolerant = imageNums.has(i.num) && IMAGE_TOLERANT_CODES.has(i.code);
    if (tolerant) {
      return {
        ...i,
        code: 'IMAGE_OPTION',
        level: 'WARN',
        detail: `图片题选项以图片呈现，豁免文本选项校验（原 ${i.code}：${i.detail}）`,
      };
    }
    return { ...i, level: WARN_CODES.has(i.code) ? 'WARN' : 'ERROR' };
  });
  const reportedMaterials = new Set();
  let analysisMissing = 0;

  for (const q of questions) {
    if (q.answer && String(q.answer).trim()) delete q.answerMissing;
    else q.answerMissing = true;

    if (!q.stem || !q.stem.trim()) {
      issues.push({ level: 'ERROR', code: 'STEM_EMPTY', num: q.num, id: q.id, module: q.module, detail: '题干为空' });
      continue;
    }

    if (subjective) {
      if (!q.answer || !q.answer.trim()) {
        issues.push({ level: 'ERROR', code: 'MISSING_ANSWER', num: q.num, id: q.id, module: q.module, detail: '主观题答案为空' });
      }
      continue;
    }

    if (q.isImageQuestion) {
      // 图片题选项以图片呈现，统一用独立豁免码，不与普通文本题的 OPT_* 混在一起
      const keys = q.options.map(o => o.key).join('');
      const emptyText = q.options.some(o => !o.text.trim());
      if (q.options.length !== 4 || emptyText || keys !== 'ABCD') {
        issues.push({
          level: 'WARN',
          code: 'IMAGE_OPTION',
          num: q.num,
          id: q.id,
          module: q.module,
          detail: `图片题选项以图片呈现（文本 ${q.options.length} 项，key=${keys || '无'}），豁免 A-D 文本校验`,
        });
      }
    } else if (q.options.length >= 2 && q.options.length < 4 && q.options.every(o => o.text.trim())) {
      // 原卷本身缺项（如只有 A/B/D），保留真实选项，降级为 WARN 供人工复核
      const keys = q.options.map(o => o.key).join('');
      issues.push({ level: 'WARN', code: 'OPT_PARTIAL', num: q.num, id: q.id, module: q.module, detail: `原卷选项不全（${keys}），共 ${q.options.length} 项` });
    } else if (q.options.length !== 4) {
      issues.push({ level: 'ERROR', code: 'OPT_NOT_4', num: q.num, id: q.id, module: q.module, detail: `选项数 ${q.options.length}` });
    } else {
      const keys = q.options.map(o => o.key).join('');
      if (keys !== 'ABCD') {
        issues.push({ level: 'ERROR', code: 'OPT_KEY_ORDER', num: q.num, id: q.id, module: q.module, detail: `选项 key 序列 ${keys}` });
      }
      const emptyOpt = q.options.find(o => !o.text);
      if (emptyOpt) {
        issues.push({ level: 'ERROR', code: 'OPT_EMPTY', num: q.num, id: q.id, module: q.module, detail: `选项 ${emptyOpt.key} 文本为空` });
      }
    }

    if (!meta.answerSourceEmpty) {
      if (!q.answer) {
        issues.push({ level: 'ERROR', code: 'MISSING_ANSWER', num: q.num, id: q.id, module: q.module, detail: '答案为空' });
      } else if (!isValidChoiceAnswer(q.answer)) {
        issues.push({ level: 'ERROR', code: 'ANSWER_INVALID', num: q.num, id: q.id, module: q.module, detail: `答案 ${q.answer} 不在 A-D` });
      }

      if (!q.explanation || !q.explanation.trim()) {
        // 扫描版解析的 OCR 清单只有答案：不逐题刷 ERROR，卷级汇总一条 WARN
        if (meta.answerOnlySource) analysisMissing += 1;
        else issues.push({ level: 'ERROR', code: 'MISSING_ANALYSIS', num: q.num, id: q.id, module: q.module, detail: '解析为空' });
      }
    }

    if (!q.material && q.module === 'ziliao') {
      issues.push({ level: 'WARN', code: 'MATERIAL_MISSING', num: q.num, id: q.id, module: q.module, detail: '资料分析题未绑定材料' });
    }
    if (q.materialImage && !reportedMaterials.has(q.material)) {
      reportedMaterials.add(q.material);
      issues.push({ level: 'WARN', code: 'MATERIAL_IMAGE', num: q.num, id: q.id, module: q.module, detail: '材料含图片，需人工核对图表' });
    }
  }

  if (meta.answerOnlySource) {
    const withAnswer = questions.filter(q => q.answer && String(q.answer).trim()).length;
    issues.push({
      level: 'WARN',
      code: 'ANSWER_FROM_OCR_KEY',
      num: 0,
      id: '',
      module: '',
      detail: `扫描版解析无文本层：答案取自 OCR 答案清单（${withAnswer}/${questions.length} 题），${analysisMissing} 题解析为空待补录`,
    });
  }

  const nums = questions.map(q => q.num).filter(n => n > 0).sort((a, b) => a - b);
  const max = nums.length ? nums[nums.length - 1] : 0;
  const gaps = missingRanges(nums, max);
  if (gaps.length) {
    issues.push({ level: 'ERROR', code: 'QNO_GAP', num: 0, id: '', module: '', detail: `题号缺号：${gaps.join('、')}` });
  }

  const dedupedIssues = dedupeIssues(issues);
  const byModule = {};
  for (const q of questions) byModule[q.module] = (byModule[q.module] || 0) + 1;

  const stats = {
    paper: `${meta.year}-${meta.label}-${meta.kind}`,
    questionCount: questions.length,
    maxNum: max,
    gapCount: gaps.length,
    byModule,
    withMaterial: questions.filter(q => q.material).length,
    imageQuestions: questions.filter(q => q.isImageQuestion).length,
    withAnswer: questions.filter(q => q.answer && String(q.answer).trim()).length,
    missingAnswers: questions.filter(q => q.answerMissing).length,
    withAnalysis: questions.filter(q => q.explanation).length,
    errors: dedupedIssues.filter(i => i.level === 'ERROR').length,
    warnings: dedupedIssues.filter(i => i.level === 'WARN').length,
  };

  return { issues: dedupedIssues, stats };
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

const SHARD_SIZE = 200;

function publicQuestion(q) {
  const out = { ...q };
  delete out.num;
  delete out.materialImage;
  delete out.materialFrom;
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** 计算分片清单（纯函数，不落盘）：dry-run 也要能写出一致的 shardFiles/shardIndex */
function planShards(allQuestions) {
  const groups = new Map();
  for (const q of allQuestions) {
    const key = `national-none-${q.module}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  const index = {};
  const chunks = [];
  let files = 0;

  for (const [key, list] of groups) {
    index[key] = [];
    for (let i = 0; i * SHARD_SIZE < list.length; i++) {
      const name = `${key}-${i}.json`;
      const chunk = list.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE).map(publicQuestion);
      index[key].push(name);
      chunks.push([name, chunk]);
      files++;
    }
  }

  return { index, files, chunks };
}

function writeShards(allQuestions) {
  if (!allQuestions.length) return { index: {}, files: 0 };

  const plan = planShards(allQuestions);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  for (const [name, chunk] of plan.chunks) {
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(chunk, null, 2), 'utf8');
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(plan.index), 'utf8');
  return { index: plan.index, files: plan.files };
}


function writePaperReport(meta, issues) {
  ensureDir(REPORT_DIR);
  const name = `${meta.year}-${meta.label}-${meta.kind}-validation.csv`;
  const rows = [['level', 'code', 'num', 'id', 'module', 'detail']];
  for (const it of issues) rows.push([it.level, it.code, it.num ?? '', it.id ?? '', it.module ?? '', it.detail]);
  writeCsv(path.join(REPORT_DIR, name), rows);
  return path.join(REPORT_DIR, name);
}

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_');
}

async function loadText(file, tag) {
  // 扫描版解析（docx 无文本层）支持同名旁挂 OCR 文本：xxx.docx → xxx.ocr.txt
  const sidecar = file ? String(file).replace(/\.docx$/i, '.ocr.txt') : '';
  if (sidecar && sidecar !== file && fs.existsSync(sidecar)) {
    const text = fs.readFileSync(sidecar, 'utf8');
    log(`  [旁挂] ${tag} 使用 OCR 文本 ${path.basename(sidecar)}（${text.length} 字）`);
    return text;
  }
  try {
    const text = await extractText(file);
    if (!text) console.warn(`  [警告] ${tag} 文本为空: ${path.basename(file)}`);
    return text;
  } catch (e) {
    console.error(`  [错误] ${tag} 解析失败: ${path.basename(file)} → ${e.message}`);
    return '';
  }
}

/** 题目文档：走 HTML 结构化抽取（保留表格与图片位置） */
async function loadDocText(file, tag) {
  try {
    const text = await extractDoc(file);
    if (!text) console.warn(`  [警告] ${tag} 文本为空: ${path.basename(file)}`);
    return text;
  } catch (e) {
    console.error(`  [错误] ${tag} 解析失败: ${path.basename(file)} → ${e.message}`);
    return '';
  }
}

function dumpRaw(name, text) {
  if (!ARGS.dump || !text) return;
  ensureDir(RAW_DIR);
  fs.writeFileSync(path.join(RAW_DIR, `${safeName(name)}.txt`), text, 'utf8');
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  log('===== 国考真题转换 =====');
  log(`源目录: ${SRC_ROOT}`);

  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`\n[致命] 源目录不存在: ${SRC_ROOT}`);
    console.error('请确认 source-data/国考真题（2000--2026) 已就位（注意右括号为半角）。');
    process.exit(1);
  }

  const { qDir, aDir, sDir } = resolveDirs();
  log(`行测真题: ${qDir || '未找到'}`);
  log(`行测解析: ${aDir || '未找到'}`);
  log(`申论目录: ${sDir || '未找到'}`);

  const listMode = process.argv.includes('--list');
  const issuesAll = [];
  const summaries = [];
  const questionsAll = [];
  const unpairedList = [];

  if (ARGS.includeXingce && qDir) {
    const { pairs, unpaired } = pairXingceFiles(qDir, aDir);
    unpairedList.push(...unpaired);

    if (listMode) {
      log('\n--- 行测文件配对 ---');
      for (const p of pairs) log(`${p.year} ${p.label} | ${p.name}  ⇢  ${p.answerName || '（无解析）'}`);
    }

    for (const pair of pairs) {
      log(`\n▶ ${pair.year} ${pair.label} | ${pair.name}`);
      const text = await loadDocText(pair.questionFile, '真题');
      if (!text) {
        issuesAll.push({ paper: `${pair.year}-${pair.label}-行测`, level: 'ERROR', code: 'EXTRACT_FAIL', detail: pair.name });
        continue;
      }
      dumpRaw(pair.name, text);

      const meta = { year: pair.year, label: pair.label, kind: '行测' };
      const built = buildXingceQuestions(text, meta);
      const matWithImage = built.materials.filter(m => m.hasImage).length;
      const matWithTable = built.materials.filter(m => m.hasTable).length;
      log(`  题块 ${built.questions.length} 道 / 最大题号 ${built.maxNum} / 材料块 ${built.materials.length}（含图 ${matWithImage} / 含表 ${matWithTable}）`);
      if (!built.materials.length && /[（(]\s*材料/.test(text)) {
        console.warn('  [警告] 文档含「（材料 N）」标记，但未识别出材料块');
      }
      if (ARGS.verbose && built.materials[0]) {
        vlog(`  材料样例: ${compact(built.materials[0].text, 80)}`);
      }

      let answerIssues = [];
      if (pair.answerFile) {
        const ansText = await loadText(pair.answerFile, '解析');
        dumpRaw(pair.answerName, ansText);
        const answerMarks = countAnswerMarks(ansText);
        if (ansText && answerMarks >= 10) {
          answerIssues = mergeAnswers(built.questions, ansText, meta);
        } else {
          meta.answerSourceEmpty = true;
          answerIssues.push({
            num: 0,
            code: 'ANSWER_SOURCE_EMPTY',
            detail: `解析文件无有效文本（${ansText.length} 字，可能为扫描图片），需人工补答案`,
          });
        }
      } else {
        answerIssues.push({ num: 0, code: 'MISSING_ANSWER_FILE', detail: '未找到同年同卷解析文件' });
      }

      const { issues, stats } = validatePaper(built.questions, meta, [...built.issues, ...answerIssues]);
      const report = writePaperReport(meta, issues);
      summaries.push({ ...stats, source: pair.name, answerSource: pair.answerName || null, report: path.basename(report) });
      questionsAll.push(...built.questions);

      for (const it of issues) issuesAll.push({ paper: stats.paper, ...it });

      log(`  答案 ${stats.withAnswer} / 解析 ${stats.withAnalysis} / 图片题 ${stats.imageQuestions} / 带材料 ${stats.withMaterial}`);
      log(`  ERROR ${stats.errors}  WARN ${stats.warnings} → ${path.relative(ROOT, report)}`);
    }
  }

  if (ARGS.includeShenlun && sDir) {
    const { pairs: sPairs, unpaired: sUnpaired } = pairShenlunFiles(sDir);
    unpairedList.push(...sUnpaired);

    if (listMode) {
      log('\n--- 申论文件配对 ---');
      for (const p of sPairs) log(`${p.year} ${p.label} | ${p.name}  ⇢  ${p.answerName || '（无参考答案）'}`);
    }

    for (const pair of sPairs) {
      log(`\n▶ ${pair.year} ${pair.label} | ${pair.name}`);
      const qText = await loadText(pair.questionFile, '申论');
      if (!qText) {
        issuesAll.push({ paper: `${pair.year}-${pair.label}-申论`, level: 'ERROR', code: 'EXTRACT_FAIL', detail: pair.name });
        continue;
      }
      dumpRaw(pair.name, qText);

      let combined = qText;
      if (pair.answerFile) {
        const aText = await loadText(pair.answerFile, '申论参考答案');
        dumpRaw(pair.answerName, aText);
        if (aText) combined = `${qText}\n参考答案\n${aText}`;
      }

      const meta = { year: pair.year, label: pair.label, kind: '申论' };
      const parsed = parseShenlun(combined, meta);
      const { issues, stats } = validatePaper(parsed.questions, meta, parsed.issues);
      const report = writePaperReport(meta, issues);
      summaries.push({
        ...stats,
        materialLength: parsed.materialLength,
        source: pair.name,
        answerSource: pair.answerName || null,
        report: path.basename(report),
      });
      questionsAll.push(...parsed.questions);

      for (const it of issues) issuesAll.push({ paper: stats.paper, ...it });

      log(`  题目 ${stats.questionCount} / 材料 ${parsed.materialLength} 字 / 答案 ${stats.withAnswer}`);
      log(`  ERROR ${stats.errors}  WARN ${stats.warnings} → ${path.relative(ROOT, report)}`);
    }
  }

  if (listMode) {
    log('\n[--list] 仅列出文件，未转换。');
    return;
  }

  let written = { files: 0, index: {} };
  if (!ARGS.dryRun && questionsAll.length) {
    written = writeShards(questionsAll);
    log(`\n已写入 ${written.files} 个分片 → ${path.relative(ROOT, OUT_DIR)}`);
  } else if (questionsAll.length) {
    written = planShards(questionsAll);
    log(`\n[dry-run] 未写入 questions-v2（按当前数据将产出 ${written.files} 个分片）`);
  } else {
    log('\n[dry-run] 未写入 questions-v2。');
  }

  ensureDir(REPORT_DIR);
  const summary = {
    generatedAt: new Date().toISOString(),
    filter: {
      all: ARGS.all,
      year: ARGS.all ? null : ARGS.year,
      papers: ARGS.all ? [] : ARGS.papers,
    },
    sourceRoot: SRC_ROOT,
    papers: summaries,
    totalQuestions: questionsAll.length,
    totalWithAnswer: summaries.reduce((sum, s) => sum + (s.withAnswer || 0), 0),
    totalMissingAnswers: summaries.reduce((sum, s) => sum + (s.missingAnswers || 0), 0),
    papersWithMissingAnswers: summaries.filter(s => (s.missingAnswers || 0) > 0).length,
    shardFiles: written.files,
    shardIndex: written.index,
    unpaired: unpairedList,
    totalIssues: issuesAll.length,
    totalErrors: issuesAll.filter(i => i.level === 'ERROR').length,
    qnoGapCount: issuesAll.filter(i => i.code === 'QNO_GAP').length,
    qnoGapPapers: summaries.filter(s => (s.gapCount || 0) > 0).length,
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  const issueRows = [['paper', 'level', 'code', 'num', 'id', 'module', 'detail']];
  for (const it of issuesAll) {
    issueRows.push([it.paper, it.level, it.code, it.num ?? '', it.id ?? '', it.module ?? '', it.detail]);
  }
  writeCsv(path.join(REPORT_DIR, 'all-issues.csv'), issueRows);

  log('\n===== 汇总 =====');
  for (const s of summaries) {
    log(`${s.paper}: 题目 ${s.questionCount} / ERROR ${s.errors} / WARN ${s.warnings}`);
  }
  log(`总计 ${questionsAll.length} 道，ERROR ${summary.totalErrors} / 问题 ${summary.totalIssues}`);
  log(`无官方答案 ${summary.totalMissingAnswers} 道（涉及 ${summary.papersWithMissingAnswers} 卷）/ QNO_GAP ${summary.qnoGapCount}`);
  log(`报告目录: ${path.relative(ROOT, REPORT_DIR)}`);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) {
  main().catch(err => {
    console.error('\n[未捕获异常]', err);
    process.exit(1);
  });
}

export {
  preSplitText,
  splitStemAndOptions,
  scanBlocks,
  buildXingceQuestions,
  mergeAnswers,
  parseShenlun,
  validatePaper,
  missingRanges,
  dedupeIssues,
};







