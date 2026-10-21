#!/usr/bin/env node
/**
 * 省考申论转换器（六省全量）
 *
 * 源目录：source-data/34省考真题合集/<省>公务员考试真题/2-申论/word/*.docx
 *        安徽省目录为“安徽省公务员考试真题”。
 *
 * 产出（默认只预览，--apply 才落盘）：
 *   public/data/questions-v2-provincial-shenlun/<省>/<slug>-none-shenlun-0.json
 *   public/data/questions-v2-provincial-shenlun/<省>/questions.json
 *   public/data/questions-v2-provincial-shenlun/<省>/index.json
 *   public/data/questions-v2-provincial-shenlun/<省>/manifest.json
 *   guokao-reports/省考-申论转换-YYYY-MM-DD.md / .csv
 *
 * 设计原则：
 *   1) 与行测 v2 目录隔离，不改变 publish-merge-* 的 EXPECTED_SRC_TOTAL 门禁；
 *   2) 单文件失败不阻塞整批，报告逐卷记录；--strict 才让退出码非 0；
 *   3) 申论答案按“参考要点”保存，不作为客观题自动判分；
 *   4) 题号支持：【问题一】/问题一/一、/一．/（一）/第 1 题，
 *      并处理“一”与“、”拆行、“二、”粘在上一条要求末尾等源文件问题。
 *
 * 用法：
 *   node scripts/convert-provincial-shenlun.cjs --all --dry-run
 *   node scripts/convert-provincial-shenlun.cjs --all --apply
 *   node scripts/convert-provincial-shenlun.cjs --province 安徽 --apply
 *   node scripts/convert-provincial-shenlun.cjs --all --apply --year 2024
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mammoth = require('mammoth');

const ROOT = path.resolve(__dirname, '..');
const SRC_BASE = path.join(ROOT, 'source-data', '34省考真题合集');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const DEFAULT_OUT = path.join(ROOT, 'public', 'data', 'questions-v2-provincial-shenlun');

const PROVINCES = {
  湖南: { slug: 'hunan' },
  湖北: { slug: 'hubei' },
  江西: { slug: 'jiangxi' },
  浙江: { slug: 'zhejiang' },
  福建: { slug: 'fujian' },
  安徽: { slug: 'anhui' },
};
const DEFAULT_PROVINCES = Object.keys(PROVINCES);
const MODULE = 'shenlun';

/* ------------------------------------------------------------------ */
/* 参数                                                                */
/* ------------------------------------------------------------------ */

const ARGV = process.argv.slice(2);
const has = name => ARGV.includes(name);
const getArg = (name, def) => {
  const i = ARGV.indexOf(name);
  if (i > -1 && ARGV[i + 1] && !ARGV[i + 1].startsWith('--')) return ARGV[i + 1];
  const prefix = `${name}=`;
  const hit = ARGV.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : def;
};

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STAMP = todayStamp();
const ARGS = {
  all: has('--all'),
  apply: has('--apply') && !has('--dry-run'),
  dryRun: !has('--apply') || has('--dry-run'),
  strict: has('--strict'),
  verbose: has('--verbose'),
  includeBak: has('--include-bak'),
  provinces: (() => {
    const one = getArg('--province', '');
    const many = getArg('--provinces', '');
    const raw = one || many;
    if (!raw) return DEFAULT_PROVINCES;
    return raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  })(),
  years: (() => {
    const raw = getArg('--year', '');
    if (!raw) return null;
    return new Set(raw.split(/[,，]/).map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0));
  })(),
  limit: Number(getArg('--limit', '0')) || 0,
  timeoutMs: Number(getArg('--timeout', '60000')) || 60000,
  outDir: path.resolve(getArg('--out-dir', DEFAULT_OUT)),
  report: path.resolve(getArg('--report', path.join(REPORT_DIR, `省考-申论转换-${STAMP}.md`))),
  csv: path.resolve(getArg('--csv', path.join(REPORT_DIR, `省考-申论转换-${STAMP}.csv`))),
  log: path.resolve(getArg('--log', path.join(REPORT_DIR, `省考-申论转换-${STAMP}.log`))),
};

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function compact(text, max = 28) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function cnToNum(value) {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return map[raw] || 0;
}

function parseYear(name) {
  const m = String(name).match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function parseLabel(name) {
  const s = String(name).replace(/\.docx$/i, '');
  if (/行政执法/.test(s)) return '行政执法';
  if (/法检|法院|检察院/.test(s)) return '法检';
  if (/乡镇/.test(s)) return '乡镇';
  if (/县乡/.test(s)) return '县乡';
  if (/县级/.test(s)) return '县级';
  if (/省市县/.test(s)) return '省市县';
  if (/省市|市级|省级/.test(s)) return '省市';
  if (/通用/.test(s)) return '通用';
  if (/选调/.test(s)) return '选调';
  const ab = s.match(/[（(]\s*([ABC])\s*[）)]/) || s.match(/([ABC])\s*[卷类]/i);
  if (ab) return `${ab[1].toUpperCase()}卷`;
  return '未标注';
}

function idLabel(label) {
  return String(label || '未标注').replace(/[\\/:*?"<>|\s]+/g, '-');
}

function disambiguateQuestionIds(questions) {
  const counts = new Map();
  for (const q of questions) {
    counts.set(q.id, (counts.get(q.id) || 0) + 1);
  }
  const used = new Set(questions.map(q => q.id));
  for (const q of questions) {
    if (counts.get(q.id) <= 1) continue;
    // 同年同卷别可能有多份试卷（如 2009 福建春季卷与 913 联考卷）；
    // 仅在同 ID 组内追加源文件哈希，避免改写其他省份的稳定 ID。
    const tag = sha256(String(q.sourceFile || q.id)).slice(0, 8);
    let candidate = `${q.id}-${tag}`;
    let n = 2;
    while (used.has(candidate)) candidate = `${q.id}-${tag}-${n++}`;
    q.id = candidate;
    used.add(candidate);
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function provinceDir(province) {
  const candidates = [
    path.join(SRC_BASE, `${province}公务员考试真题`),
    path.join(SRC_BASE, `${province}省公务员考试真题`),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

function listShenlunFiles(province) {
  const dir = provinceDir(province);
  if (!fs.existsSync(dir)) return [];
  return walkFiles(dir)
    .filter(p => /\.docx$/i.test(p))
    .filter(p => !/~\$/.test(path.basename(p)))
    .filter(p => ARGS.includeBak || !/\.bak\.docx$/i.test(p))
    .filter(p => /申论/.test(p))
    .map(p => ({
      abs: p,
      rel: path.relative(ROOT, p).replace(/\\/g, '/'),
      name: path.basename(p),
      year: parseYear(path.basename(p)),
      label: parseLabel(path.basename(p)),
    }))
    .filter(f => f.year)
    .filter(f => !ARGS.years || ARGS.years.has(f.year))
    .sort((a, b) => a.year - b.year || a.label.localeCompare(b.label, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'));
}

function timeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/* ------------------------------------------------------------------ */
/* 文本抽取与归一化                                                    */
/* ------------------------------------------------------------------ */

async function extractText(file) {
  const result = await timeout(
    mammoth.extractRawText({ path: file }),
    ARGS.timeoutMs,
    path.basename(file)
  );
  return normalizeShenlunText(result.value);
}

function normalizeShenlunText(text) {
  let t = String(text || '')
    // 康熙部首（如「⼀」「⼩」「⾏」）先转标准汉字，否则「第⼀题」识别不到
    .replace(/[\u2E80-\u2EFF\u2F00-\u2FDF]/g, ch => ch.normalize('NFKC'))
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0|\u3000/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');

  // 「一」与「、」被拆成两段（中间可能夹空段）：一\n\n、\n\n根据 → 一、\n根据
  t = t.replace(/(^|\n)[ \t]*([一二三四五六七八九十]{1,3})[ \t]*\n(?:[ \t]*\n)*[ \t]*([、.．，,])[ \t]*/g, '$1$2$3');

  // 中文之间的排版空格（含 OCR 残留），只压缩中文—中文，保留数字/英文间隔
  for (let i = 0; i < 3; i += 1) {
    t = t.replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1');
  }
  t = t.replace(/[ \t]+([，。、；：？！“”‘’（）《》【】])/g, '$1');
  t = t.replace(/([（【《“‘])[ \t]+/g, '$1');

  // 题号被粘在上一条要求末尾：「不超过 200 字。 二、」「……。 三，」
  t = t.replace(
    /([。！？；》”])[ \t]*([一二三四五六七八九十]{1,3})[ \t]*([、.．，,])\s*(?=[\u4e00-\u9fff“【])/g,
    '$1\n$2$3'
  );
  // 「问题一」被粘在上一段末尾
  t = t.replace(/([。！？；》”])[ \t]*(问题[ \t]*[一二三四五六七八九十\d]{1,2})[ \t]*(?=[\u4e00-\u9fff“【])/g, '$1\n$2');

  // 页码 / 页脚
  t = t.split('\n')
    .filter(line => !/^\s*\d+\s*\/\s*\d+\s*$/.test(line))
    .filter(line => !/^\s*第\s*\d+\s*页\s*$/.test(line))
    .join('\n');

  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function lineEntries(text) {
  const out = [];
  let pos = 0;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line) out.push({ line, start: pos, end: pos + raw.length });
    pos += raw.length + 1;
  }
  return out;
}

const REQ_HEADING_RE = /^[ \t]*(?:[一二三四五六七八九十]{1,3}[ \t]*[、.．][ \t]*)?(?:作答要求|申论作答要求|作答题目|问题部分|申论要求)[ \t]*[：:]?[ \t]*$/gm;

function findReqHeadings(text, end = text.length) {
  const out = [];
  REQ_HEADING_RE.lastIndex = 0;
  let m;
  while ((m = REQ_HEADING_RE.exec(text)) !== null) {
    if (m.index >= end) break;
    out.push({ index: m.index, end: m.index + m[0].length, text: m[0].trim() });
  }
  return out;
}

const ANSWER_HEAD_RE = /^.{0,120}(?:参考答案|答案及解析|答案解析|参考范文|参考解析|试题解析|范文|【解析】|（解析）|\(解析\))[^\n]{0,20}$/;
const ANSWER_HEAD_PLAIN_RE = /^[ \t]*(?:参考答案|答案|解析)[ \t]*[：:]?[ \t]*$/;

function isAnswerHeadLine(line) {
  const s = String(line || '').trim();
  if (!s || s.length > 140) return false;
  // 答案区内部的评分说明不是答案起点
  if (/参考答案说明|评分标准|评分参考|赋分说明|答案说明/.test(s)) return false;
  if (ANSWER_HEAD_RE.test(s) || ANSWER_HEAD_PLAIN_RE.test(s)) return true;
  // 「……试题及答案」「……题本及答案」「……真题及答案」这类合册标题
  return /(?:试题|真题|题本|申论).{0,40}(?:及|和)?答案\s*$/.test(s);
}

const DI_ANSWER_START_RE = /^第[ \t]*1[ \t]*题[ \t]*[：:、.．]/;

function findAnswerCandidates(text) {
  return lineEntries(text)
    .filter(e => isAnswerHeadLine(e.line) || DI_ANSWER_START_RE.test(e.line))
    .map(e => ({ start: e.start, line: e.line }));
}

/* ------------------------------------------------------------------ */
/* 题号识别                                                            */
/* ------------------------------------------------------------------ */

function collectPattern(text, re, type, strong, start = 0, end = text.length) {
  const marks = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index >= end) break;
    if (m.index < start) continue;
    const raw = m[1];
    const num = cnToNum(raw);
    if (!num) continue;
    marks.push({ raw, num, type, strong, index: m.index, len: m[0].length });
  }
  return marks;
}

function questionPatterns() {
  return [
    {
      type: 'bracket-problem',
      strong: true,
      re: /【[ \t]*问题[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*】/g,
    },
    {
      type: 'problem',
      strong: true,
      re: /(?:^|\n)[ \t]*问题[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*(?=[：:、.．\s]|$)/g,
    },
    {
      type: 'di',
      strong: true,
      re: /(?:^|\n)[ \t]*第[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*题[ \t]*[、.．：:]?[ \t]*/g,
    },
    {
      type: 'paren-cn',
      strong: false,
      re: /(?:^|\n)[ \t]*[（(][ \t]*([一二三四五六七八九十]{1,3})[ \t]*[）)][ \t]*/g,
    },
    {
      type: 'cn-score',
      strong: true,
      re: /(?:^|\n)[ \t]*([一二三四五六七八九十]{1,3})[ \t]*[、.．，,][ \t]*[（(][ \t]*\d{1,3}[ \t]*分[ \t]*[）)][ \t]*/g,
    },
    {
      type: 'cn',
      strong: false,
      re: /(?:^|\n)[ \t]*([一二三四五六七八九十]{1,3})[ \t]*[、.．，,][ \t]*/g,
    },
    {
      type: 'digit',
      strong: false,
      re: /(?:^|\n)[ \t]*(\d{1,2})[ \t]*[、.．][ \t]*/g,
    },
  ];
}

const QUESTION_CUE_RE = /[（(]\s*\d{1,3}\s*分\s*[）)]|分[）)]|要求|不超过|不少于|字左右|根据|结合|给定资料|给定材料|材料|请|假设|拟写|撰写|概括|分析|提出|谈谈|写一篇文章|自拟题目|以.{1,20}为题/;

function looksLikeQuestion(block) {
  const s = String(block || '').replace(/\s+/g, '');
  if (s.length < 20) return false;
  return QUESTION_CUE_RE.test(s);
}

function buildMarkerWindow(marks, text, end, fromIndex, count) {
  const window = marks.slice(fromIndex, fromIndex + count);
  if (window.length !== count) return null;
  for (let i = 0; i < window.length; i += 1) {
    if (window[i].num !== i + 1) return null;
    const blockStart = window[i].index + window[i].len;
    const blockEnd = i + 1 < window.length ? window[i + 1].index : end;
    if (!looksLikeQuestion(text.slice(blockStart, blockEnd))) return null;
  }
  return window;
}

/**
 * 在所有题号模式中选一组 1..N 连续、块像申论题的窗口。
 * 这样可跳过「一、注意事项 / 二、给定材料 / 三、作答要求」这类材料标题。
 */
function buildLooseMarkerWindow(marks, text, end, fromIndex, count) {
  const window = marks.slice(fromIndex, fromIndex + count);
  if (window.length !== count) return null;
  if (window[0].num !== 1) return null;
  let last = 1;
  for (let i = 0; i < window.length; i += 1) {
    if (i > 0) {
      // 允许「1、3、3、4」这类源文件重号/跳号，但不能回退或跳跃过大
      if (window[i].num < last || window[i].num > last + 3) return null;
      last = window[i].num;
    }
    const blockStart = window[i].index + window[i].len;
    const blockEnd = i + 1 < window.length ? window[i + 1].index : end;
    if (!looksLikeQuestion(text.slice(blockStart, blockEnd))) return null;
  }
  return window;
}

function findBestQuestionSet(text, start = 0, end = text.length) {
  let best = null;

  for (const p of questionPatterns()) {
    const marks = collectPattern(text, p.re, p.type, p.strong, start, end)
      .sort((a, b) => a.index - b.index)
      .filter((m, i, arr) => i === 0 || m.index !== arr[i - 1].index);

    for (let i = 0; i < marks.length; i += 1) {
      if (marks[i].num !== 1) continue;
      for (let n = 2; n <= 8 && i + n <= marks.length; n += 1) {
        const window = buildMarkerWindow(marks, text, end, i, n);
        if (!window) continue;
        const near = window[0].index - start;
        const score =
          n * 10 +
          (p.strong ? 12 : 0) +
          (p.type === 'bracket-problem' ? 6 : 0) +
          (p.type === 'problem' ? 4 : 0) +
          (p.type === 'paren-cn' ? 2 : 0) +
          (near <= 300 ? 18 : near <= 1000 ? 8 : 0);
        if (!best || score > best.score || (score === best.score && window[0].index > best.markers[0].index)) {
          best = { markers: window, score, pattern: p.type, start: window[0].index, end };
        }
      }
    }
  }

  if (best) return best;

  // 兜底：允许题号重号/跳号（审计报告里的 2019 安徽 B：1、3、3、4）
  for (const p of questionPatterns()) {
    const marks = collectPattern(text, p.re, p.type, p.strong, start, end)
      .sort((a, b) => a.index - b.index)
      .filter((m, i, arr) => i === 0 || m.index !== arr[i - 1].index);
    for (let i = 0; i < marks.length; i += 1) {
      if (marks[i].num !== 1) continue;
      for (let n = 2; n <= 8 && i + n <= marks.length; n += 1) {
        const window = buildLooseMarkerWindow(marks, text, end, i, n);
        if (!window) continue;
        const score =
          n * 10 +
          (p.strong ? 8 : 0) +
          (p.type === 'bracket-problem' ? 4 : 0) +
          (p.type === 'paren-cn' ? 2 : 0) -
          5;
        if (!best || score > best.score || (score === best.score && window[0].index > best.markers[0].index)) {
          best = { markers: window, score, pattern: `${p.type}-loose`, start: window[0].index, end };
        }
      }
    }
  }

  return best;
}

function splitByScore(text) {
  const paras = String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of paras) {
    cur = cur ? `${cur}\n\n${p}` : p;
    if (/[（(]\s*\d{1,3}\s*分\s*[）)]/.test(p)) {
      out.push({ num: out.length + 1, text: cur.trim() });
      cur = '';
    }
  }
  if (cur.trim() && out.length) out[out.length - 1].text += `\n\n${cur.trim()}`;
  return out;
}

/* ------------------------------------------------------------------ */
/* 题目/答案区域定位                                                   */
/* ------------------------------------------------------------------ */

function analyzeSections(text) {
  const answerCandidates = findAnswerCandidates(text);
  const valid = [];

  for (const cand of answerCandidates) {
    const reqs = findReqHeadings(text, cand.start);
    const req = reqs.length ? reqs[reqs.length - 1] : null;
    const qStart = req ? req.end : 0;
    const qs = findBestQuestionSet(text, qStart, cand.start);
    if (!qs || qs.markers.length < 2) continue;
    valid.push({
      qs,
      qStart: req ? req.end : qs.start,
      answerStart: cand.start,
      score: qs.score + (req ? 4 : 0),
      answerHead: cand.line,
    });
  }

  if (valid.length) {
    valid.sort((a, b) => a.answerStart - b.answerStart);
    // 旧格式「第 1 题：… 参考答案：…」优先从第 1 题开始，保留题号供答案切分
    const di = valid.find(v => DI_ANSWER_START_RE.test(v.answerHead));
    return di || valid[0];
  }

  const reqs = findReqHeadings(text);
  const req = reqs.length ? reqs[reqs.length - 1] : null;
  const qStart = req ? req.end : 0;
  const qs = findBestQuestionSet(text, qStart, text.length);
  return {
    qs,
    qStart: req ? req.end : (qs ? qs.start : 0),
    answerStart: text.length,
    score: qs ? qs.score : 0,
    answerHead: '',
  };
}

function cleanMaterial(text) {
  const original = String(text || '').trim();
  let s = original;
  if (!s) return '';

  // 从「给定资料/给定材料/材料一/【材料一】」开始，丢掉前面的标题和注意事项
  const heads = [];
  const re = /(?:^|\n)[ \t]*(?:【[ \t]*)?(?:给定资料|给定材料|材料)[ \t]*[一二三四五六七八九十\d]{0,3}[ \t]*(?:】)?[ \t]*[：:]?[ \t]*(?=\n|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) heads.push({ index: m.index, end: m.index + m[0].length });
  if (heads.length) {
    const useful = heads.find(h => s.slice(h.end).trim().length > 100) || heads[0];
    s = s.slice(useful.end).trim();
  } else {
    // 无材料标题：去掉最前面的年份/考试名/满分/时限等标题行
    const lines = s.split('\n');
    while (lines.length && /申论|真题|考试|满分|时限|参考答案/.test(lines[0]) && lines[0].length < 80) {
      lines.shift();
    }
    s = lines.join('\n').trim();
  }

  // 去掉页眉页脚
  s = s.split('\n')
    .filter(line => !/^\s*\d+\s*\/\s*\d+\s*$/.test(line))
    .filter(line => !/^\s*第\s*\d+\s*页\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 材料标题识别失败时宁可用整段（去掉标题行），也不要输出空材料
  if (s.length < 20) {
    const lines = original.split('\n');
    while (lines.length && /申论|真题|考试|满分|时限|注意事项/.test(lines[0]) && lines[0].length < 80) {
      lines.shift();
    }
    s = lines.join('\n').trim();
  }

  return s;
}

function isDocumentAnswerHeading(line) {
  const s = String(line || '').trim();
  if (!s) return false;
  // 题号/括号/【试题】开头的是答案区内部的题目标记，不能当文档标题删掉
  if (/^(?:[（(]|【|第\s*[一二三四五六七八九十\d]+\s*题|\d{1,2}\s*[、.．]|[一二三四五六七八九十]{1,3}\s*[、.．])/.test(s)) {
    return false;
  }
  if (/^(?:参考答案|答案|解析|参考答案及解析)\s*[：:]?$/.test(s)) return true;
  return isAnswerHeadLine(s) && /(?:年|申论|真题|试题|题本|考试)/.test(s) && s.length > 10;
}

function stripAnswerHeading(text) {
  const lines = String(text || '').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && isDocumentAnswerHeading(lines[0])) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
  }
  return lines.join('\n').trim();
}

/* ------------------------------------------------------------------ */
/* 答案切分                                                            */
/* ------------------------------------------------------------------ */

function answerPatterns() {
  return [
    {
      type: 'bracket-problem',
      strong: true,
      re: /【[ \t]*问题[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*(?:参考答案|答案)[ \t]*】/g,
    },
    {
      type: 'bracket-shiti',
      strong: true,
      re: /【[ \t]*试题[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*】[ \t]*(?:参考答案|答案)?/g,
    },
    {
      type: 'problem',
      strong: true,
      re: /(?:^|\n)[ \t]*问题[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*(?=[：:、.．\s]|$)/g,
    },
    {
      type: 'di',
      strong: true,
      re: /(?:^|\n)[ \t]*第[ \t]*([一二三四五六七八九十\d]{1,3})[ \t]*题[ \t]*[、.．：:]?[ \t]*/g,
    },
    {
      type: 'paren-cn-answer',
      strong: true,
      re: /(?:^|\n)[ \t]*[（(][ \t]*([一二三四五六七八九十]{1,3})[ \t]*[）)][ \t]*(?:参考答案|答案|参考要点)/g,
    },
    {
      type: 'cn-score',
      strong: true,
      re: /(?:^|\n)[ \t]*([一二三四五六七八九十]{1,3})[ \t]*[、.．，,][ \t]*[（(][ \t]*\d{1,3}[ \t]*分[ \t]*[）)][ \t]*/g,
    },
    {
      type: 'digit-answer',
      strong: true,
      re: /(?:^|\n)[ \t]*(\d{1,2})[ \t]*[、.．][ \t]*(?:参考答案|答案提示|答案|参考要点)/g,
    },
    {
      type: 'cn-answer',
      strong: true,
      re: /(?:^|\n)[ \t]*([一二三四五六七八九十]{1,3})[ \t]*[、.．，,][ \t]*(?:参考答案|答案|参考要点)/g,
    },
    {
      type: 'answer-one',
      strong: true,
      re: /(?:^|\n)[ \t]*参考答案([一1])[ \t]*[：:]/g,
    },
    {
      type: 'cn',
      strong: false,
      re: /(?:^|\n)[ \t]*([一二三四五六七八九十]{1,3})[ \t]*[、.．，,][ \t]*/g,
    },
    {
      type: 'digit',
      strong: false,
      re: /(?:^|\n)[ \t]*(\d{1,2})[ \t]*[、.．][ \t]*/g,
    },
  ];
}

function sliceAnswerMarks(text, marks) {
  const out = [];
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].index + marks[i].len;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    let body = text.slice(start, end).trim();
    body = body.replace(/^[：:、.．，,\s]+/, '').trim();
    if (body) out.push({ num: marks[i].num || i + 1, text: body });
  }
  return out;
}

function locateAnswerSectionsByStem(answerPart, qSections) {
  const positions = [];
  let from = 0;
  for (const sec of qSections) {
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
  if (positions.length !== qSections.length) return null;
  return positions.map((start, i) => ({
    num: qSections[i].num,
    text: answerPart.slice(start, i + 1 < positions.length ? positions[i + 1] : answerPart.length).trim(),
  })).filter(sec => sec.text.length > 0);
}

function selectAnswerSections(answerPart, qSections) {
  const target = qSections.length;
  let best = null;

  for (const p of answerPatterns()) {
    const marks = collectPattern(answerPart, p.re, p.type, p.strong)
      .sort((a, b) => a.index - b.index)
      .filter((m, i, arr) => i === 0 || m.index !== arr[i - 1].index);
    if (!marks.length) continue;

    const sections = sliceAnswerMarks(answerPart, marks);
    if (!sections.length) continue;
    const exact = sections.length === target;
    const sequential = sections.every((sec, i) => sec.num === i + 1);
    const score =
      (exact ? 100 : 0) +
      (sequential ? 30 : 0) +
      (p.strong ? 12 : 0) +
      sections.length * 2 -
      Math.abs(sections.length - target) * 10;

    if (!best || score > best.score) {
      best = { sections, pattern: p.type, score, exact, sequential };
    }
  }

  if (best && best.exact) return best;

  const byStem = locateAnswerSectionsByStem(answerPart, qSections);
  if (byStem && byStem.length === target) {
    return { sections: byStem, pattern: 'repeat-stem', score: 100, exact: true, sequential: true };
  }

  const byScore = splitByScore(answerPart);
  if (byScore.length === target) {
    return { sections: byScore, pattern: 'score', score: 90, exact: true, sequential: true };
  }

  return best;
}

/* ------------------------------------------------------------------ */
/* 单文件解析                                                          */
/* ------------------------------------------------------------------ */

function cleanAnswer(text) {
  let s = String(text || '').trim();
  s = s.replace(/^[（(]\s*\d{1,3}\s*分\s*[）)]\s*/, '').trim();
  // 旧格式答案段常先写「解题思路/审题要点」，正文在「参考解析/参考答案」之后
  const marker = /(?:参考答案|参考解析|参考范文)\s*[：:]/;
  const mm = marker.exec(s);
  if (mm) s = s.slice(mm.index + mm[0].length).trim();
  let rubric = '';
  const m = s.match(/(?:^|\n)[ \t]*(参考答案说明|赋分说明|评分标准|评分参考)[：:][\s\S]*$/);
  if (m) {
    rubric = m[0].trim();
    s = s.slice(0, m.index).trim();
  }
  return { answer: s, rubric };
}

function extractKeyPoints(answer) {
  const text = String(answer || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const parts = text
    .split(/[。；\n]/)
    .map(s => s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d、.．\s]+/, '').trim())
    .filter(s => s.length >= 5 && s.length <= 40);
  return [...new Set(parts)].slice(0, 4);
}

function questionStem(raw) {
  return String(raw || '')
    .replace(/^[（(]\s*\d{1,3}\s*分\s*[）)]\s*/, '')
    .replace(/^[：:、.．，,\s]+/, '')
    .replace(/\s+$/g, '')
    .trim();
}

async function parseFile(file, province) {
  const issues = [];
  let text = '';
  try {
    text = await extractText(file.abs);
  } catch (err) {
    return {
      file,
      questions: [],
      issues: [{ code: 'EXTRACT_FAIL', detail: err.message }],
      stats: { chars: 0, materialLength: 0, qCount: 0, aCount: 0, branch: '' },
      fatal: true,
    };
  }

  if (text.length < 300) {
    issues.push({ code: 'TEXT_TOO_SHORT', detail: `仅 ${text.length} 字，疑似扫描版或截断` });
  }

  const sections = analyzeSections(text);
  let qSections = [];
  let branch = sections.qs ? sections.qs.pattern : '';

  if (sections.qs && sections.qs.markers.length >= 2) {
    const markers = sections.qs.markers;
    qSections = markers.map((mk, i) => ({
      num: i + 1,
      text: questionStem(text.slice(
        mk.index + mk.len,
        i + 1 < markers.length ? markers[i + 1].index : sections.answerStart
      )),
    })).filter(sec => sec.text);
  } else {
    const fallback = splitByScore(text.slice(0, sections.answerStart));
    if (fallback.length >= 2) {
      qSections = fallback.map((sec, i) => ({ num: i + 1, text: questionStem(sec.text) }));
      branch = 'score-fallback';
      issues.push({ code: 'QUESTION_BY_SCORE', detail: '未识别到题号，按分值段兜底切题' });
    }
  }

  if (!qSections.length) {
    const reqs = findReqHeadings(text);
    if (reqs.length) {
      const tail = text.slice(reqs[reqs.length - 1].end, sections.answerStart).trim();
      if (tail) {
        qSections = [{ num: 1, text: questionStem(tail) }];
        branch = 'single-question';
        issues.push({ code: 'SINGLE_QUESTION', detail: '只识别到 1 道题，需人工核对' });
      }
    }
  }

  if (!qSections.length) {
    issues.push({ code: 'NO_QUESTIONS', detail: '未解析出申论题目' });
    return {
      file,
      questions: [],
      issues,
      stats: { chars: text.length, materialLength: 0, qCount: 0, aCount: 0, branch },
      fatal: true,
    };
  }

  if (qSections.length < 2 || qSections.length > 8) {
    issues.push({ code: 'QUESTION_COUNT_SUSPECT', detail: `识别到 ${qSections.length} 道题，超出常规 2-8 题` });
  }

  const material = cleanMaterial(text.slice(0, sections.qStart || (sections.qs ? sections.qs.start : 0)));
  if (material.length < 20) {
    issues.push({ code: 'MATERIAL_MISSING', detail: '未识别到有效给定材料' });
  }

  const answerPart = sections.answerStart < text.length
    ? stripAnswerHeading(text.slice(sections.answerStart))
    : '';
  let answerSet = null;
  if (answerPart.length) {
    answerSet = selectAnswerSections(answerPart, qSections);
    if (!answerSet || !answerSet.sections.length) {
      issues.push({ code: 'ANSWER_UNSPLIT', detail: `答案区 ${answerPart.length} 字，未能切分到题目` });
    } else if (answerSet.sections.length !== qSections.length) {
      issues.push({
        code: 'ANSWER_COUNT_MISMATCH',
        detail: `题目 ${qSections.length} 道，答案段 ${answerSet.sections.length} 段`,
      });
    }
  } else {
    issues.push({ code: 'ANSWER_MISSING', detail: '未识别到参考答案/解析' });
  }

  const answerByNum = new Map();
  // 答案段多于题目时，按顺序硬映射会把子要点错配成题目答案；宁可不映射并报告。
  const answerOverflow = !!(answerSet && answerSet.sections.length > qSections.length);
  if (answerSet && !answerOverflow) {
    for (const sec of answerSet.sections) {
      if (!answerByNum.has(sec.num)) answerByNum.set(sec.num, sec.text);
    }
  }
  if (answerOverflow) {
    issues.push({
      code: 'ANSWER_UNMAPPED',
      detail: `答案段 ${answerSet.sections.length} 段多于题目 ${qSections.length} 道，未自动映射`,
    });
  }

  const questions = qSections.map((sec, idx) => {
    const num = idx + 1;
    const rawAnswer = answerByNum.get(num) || answerByNum.get(sec.num) || '';
    const cleaned = cleanAnswer(rawAnswer);
    const stem = questionStem(sec.text);
    return {
      id: `prov-${PROVINCES[province].slug}-${file.year}-${idLabel(file.label)}-shenlun-${num}`,
      category: 'provincial',
      module: MODULE,
      title: `申论·${compact(stem, 28)}`,
      stem,
      material: material.length >= 20 ? material : undefined,
      options: [],
      answer: cleaned.answer,
      rubric: cleaned.rubric || undefined,
      explanation: '申论主观题，请对照参考答案要点自评。',
      keyPoints: extractKeyPoints(cleaned.answer),
      thinkingTip: '【申论】先审题定位作答任务，再回材料找要点，分条书写。',
      difficulty: '拔高',
      source: `${file.year}年${province}公务员考试《申论》${file.label === '未标注' ? '' : file.label}第${num}题`,
      province,
      num,
      label: file.label,
      sourceFile: file.rel,
    };
  });

  return {
    file,
    questions,
    issues,
    stats: {
      chars: text.length,
      materialLength: material.length,
      qCount: qSections.length,
      aCount: answerSet ? answerSet.sections.length : 0,
      answerChars: questions.reduce((sum, q) => sum + String(q.answer || '').length, 0),
      branch: answerSet ? `${branch}+${answerSet.pattern}` : branch,
    },
    fatal: false,
  };
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

function statusOf(result) {
  if (result.fatal) return 'FAIL';
  const codes = new Set(result.issues.map(i => i.code));
  const warnCodes = [
    'TEXT_TOO_SHORT', 'QUESTION_COUNT_SUSPECT', 'MATERIAL_MISSING',
    'ANSWER_MISSING', 'ANSWER_UNSPLIT', 'ANSWER_COUNT_MISMATCH', 'ANSWER_UNMAPPED',
    'QUESTION_BY_SCORE', 'SINGLE_QUESTION',
  ];
  return warnCodes.some(c => codes.has(c)) ? 'WARN' : 'OK';
}

function summarize(results) {
  const summary = {
    totalFiles: results.length,
    ok: 0,
    warn: 0,
    fail: 0,
    questions: 0,
    answers: 0,
    byProvince: {},
    byBranch: {},
  };
  for (const r of results) {
    const status = statusOf(r);
    summary[status === 'OK' ? 'ok' : status === 'WARN' ? 'warn' : 'fail'] += 1;
    summary.questions += r.questions.length;
    summary.answers += r.questions.filter(q => String(q.answer || '').trim()).length;
    const p = r.file.province || '';
    if (!summary.byProvince[p]) {
      summary.byProvince[p] = { files: 0, ok: 0, warn: 0, fail: 0, questions: 0, answers: 0 };
    }
    const bp = summary.byProvince[p];
    bp.files += 1;
    bp[status === 'OK' ? 'ok' : status === 'WARN' ? 'warn' : 'fail'] += 1;
    bp.questions += r.questions.length;
    bp.answers += r.questions.filter(q => String(q.answer || '').trim()).length;
    const branch = r.stats.branch || '(none)';
    summary.byBranch[branch] = (summary.byBranch[branch] || 0) + 1;
  }
  return summary;
}

function writeProvinceOutputs(province, results) {
  const questions = results.flatMap(r => r.questions);
  if (!questions.length) return { province, written: false, count: 0 };

  disambiguateQuestionIds(questions);

  const seen = new Set();
  const dupes = [];
  for (const q of questions) {
    if (seen.has(q.id)) dupes.push(q.id);
    seen.add(q.id);
  }
  if (dupes.length) {
    throw new Error(`${province} 生成重复题目 ID：${dupes.slice(0, 5).join(', ')}`);
  }

  questions.sort((a, b) =>
    (a.sourceFile || '').localeCompare(b.sourceFile || '', 'zh-CN') ||
    Number(a.num || 0) - Number(b.num || 0)
  );

  const cfg = PROVINCES[province];
  const dir = path.join(ARGS.outDir, province);
  const shardName = `${cfg.slug}-none-shenlun-0.json`;
  const indexKey = `${cfg.slug}-none-shenlun`;
  const manifest = {
    province,
    slug: cfg.slug,
    module: MODULE,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/convert-provincial-shenlun.cjs',
    sourceBase: path.relative(ROOT, SRC_BASE).replace(/\\/g, '/'),
    shard: shardName,
    count: questions.length,
    answerCount: questions.filter(q => String(q.answer || '').trim()).length,
    shardSha256: sha256(JSON.stringify(questions)),
    files: results.map(r => ({
      file: r.file.rel,
      year: r.file.year,
      label: r.file.label,
      questions: r.questions.length,
      answers: r.questions.filter(q => String(q.answer || '').trim()).length,
      status: statusOf(r),
      branch: r.stats.branch,
      issues: r.issues,
    })),
  };

  writeJsonAtomic(path.join(dir, shardName), questions);
  writeJsonAtomic(path.join(dir, 'questions.json'), questions);
  writeJsonAtomic(path.join(dir, 'index.json'), { [indexKey]: [shardName] });
  writeJsonAtomic(path.join(dir, 'manifest.json'), manifest);
  return { province, written: true, count: questions.length, dir };
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function issueText(result) {
  return result.issues.map(i => `${i.code}:${i.detail}`).join('；') || '';
}

function writeReports(results, summary) {
  const lines = [];
  lines.push('# 省考申论转换报告');
  lines.push('');
  lines.push(`- 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  lines.push(`- 模式：${ARGS.apply ? 'APPLY（已落盘）' : 'DRY-RUN（只预览）'}`);
  lines.push(`- 范围：${ARGS.provinces.join(' / ')}${ARGS.years ? `；年份 ${[...ARGS.years].join('/')}` : ''}`);
  lines.push(`- 输出目录：\`${path.relative(ROOT, ARGS.outDir).replace(/\\/g, '/')}\``);
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| 文件 | OK | WARN | FAIL | 题数 | 有答案题 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  lines.push(`| ${summary.totalFiles} | ${summary.ok} | ${summary.warn} | ${summary.fail} | ${summary.questions} | ${summary.answers} |`);
  lines.push('');
  lines.push('### 按省');
  lines.push('');
  lines.push('| 省 | 文件 | OK | WARN | FAIL | 题数 | 有答案题 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const [p, s] of Object.entries(summary.byProvince)) {
    lines.push(`| ${p} | ${s.files} | ${s.ok} | ${s.warn} | ${s.fail} | ${s.questions} | ${s.answers} |`);
  }
  lines.push('');
  lines.push('### 解析分支');
  lines.push('');
  lines.push('| 分支 | 文件数 |');
  lines.push('|---|---:|');
  for (const [b, n] of Object.entries(summary.byBranch).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${mdEscape(b)} | ${n} |`);
  }
  lines.push('');
  lines.push('## 逐卷结果');
  lines.push('');
  lines.push('| 省 | 年份 | 卷别 | 题数 | 答案段 | 材料字 | 状态 | 分支 | 问题 | 文件 |');
  lines.push('|---|---:|---|---:|---:|---:|---|---|---|---|');
  for (const r of results) {
    lines.push([
      r.file.province,
      r.file.year,
      r.file.label,
      r.questions.length,
      r.stats.aCount,
      r.stats.materialLength,
      statusOf(r),
      mdEscape(r.stats.branch),
      mdEscape(issueText(r)),
      mdEscape(r.file.rel),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('## 说明');
  lines.push('');
  lines.push('- 申论答案按“参考要点”保存，前端不应自动判分。');
  lines.push('- `WARN` 不阻塞落盘，但建议按报告逐卷抽查；`FAIL` 卷未写入题目。');
  lines.push('- 本转换器输出到独立的 `questions-v2-provincial-shenlun/`，不改变现有行测 v2 与线上数据。');
  lines.push('');
  writeText(ARGS.report, lines.join('\n'));

  const csv = ['province,year,label,questions,answerSections,materialChars,status,branch,issues,file'];
  for (const r of results) {
    const cells = [
      r.file.province, r.file.year, r.file.label, r.questions.length, r.stats.aCount,
      r.stats.materialLength, statusOf(r), r.stats.branch, issueText(r), r.file.rel,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`);
    csv.push(cells.join(','));
  }
  writeText(ARGS.csv, `\ufeff${csv.join('\n')}\n`);
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

const LOG_LINES = [];
function log(line = '') {
  console.log(line);
  LOG_LINES.push(line);
}

async function main() {
  ensureDir(REPORT_DIR);
  const provinces = ARGS.provinces.filter(p => PROVINCES[p]);
  const unknown = ARGS.provinces.filter(p => !PROVINCES[p]);
  if (unknown.length) log(`[警告] 忽略未知省份：${unknown.join(', ')}`);
  if (!provinces.length) throw new Error(`没有可用省份（可选：${DEFAULT_PROVINCES.join(' / ')}）`);

  const files = [];
  for (const province of provinces) {
    const list = listShenlunFiles(province).map(f => ({ ...f, province }));
    log(`[扫描] ${province}：${list.length} 份申论 docx`);
    files.push(...list);
  }
  const selected = ARGS.limit > 0 ? files.slice(0, ARGS.limit) : files;
  if (!selected.length) throw new Error('未找到符合条件的申论 docx');

  log('');
  log(`省考申论转换：${selected.length} 份文件，模式 ${ARGS.apply ? 'APPLY' : 'DRY-RUN'}`);
  log(`源目录：${path.relative(ROOT, SRC_BASE).replace(/\\/g, '/')}`);
  log(`输出目录：${path.relative(ROOT, ARGS.outDir).replace(/\\/g, '/')}`);
  log('');

  const results = [];
  for (let i = 0; i < selected.length; i += 1) {
    const file = selected[i];
    let result;
    try {
      result = await parseFile(file, file.province);
    } catch (err) {
      result = {
        file,
        questions: [],
        issues: [{ code: 'PARSE_CRASH', detail: err.stack || err.message }],
        stats: { chars: 0, materialLength: 0, qCount: 0, aCount: 0, branch: '' },
        fatal: true,
      };
    }
    result.file.province = file.province;
    results.push(result);
    const status = statusOf(result);
    const issue = result.issues.length ? ` | ${result.issues.map(x => x.code).join(',')}` : '';
    log(`[${i + 1}/${selected.length}] ${status} ${file.province} ${file.year} ${file.label} Q${result.questions.length} A${result.stats.aCount}${issue} | ${file.name}`);
  }

  const summary = summarize(results);
  writeReports(results, summary);

  const outputs = [];
  if (ARGS.apply) {
    for (const province of provinces) {
      const own = results.filter(r => r.file.province === province);
      if (!own.some(r => r.questions.length)) {
        log(`[落盘] ${province}：无可用题目，跳过`);
        continue;
      }
      try {
        const out = writeProvinceOutputs(province, own);
        outputs.push(out);
        log(`[落盘] ${province}：${out.count} 题 -> ${path.relative(ROOT, out.dir).replace(/\\/g, '/')}`);
      } catch (err) {
        summary.fail += 1;
        log(`[落盘失败] ${province}：${err.message}`);
        if (ARGS.strict) throw err;
      }
    }
  }

  log('');
  log('===== 汇总 =====');
  log(`文件 ${summary.totalFiles} / OK ${summary.ok} / WARN ${summary.warn} / FAIL ${summary.fail}`);
  log(`题目 ${summary.questions} / 有答案题 ${summary.answers}`);
  for (const [p, s] of Object.entries(summary.byProvince)) {
    log(`${p}：${s.files} 份 / ${s.questions} 题 / 有答案 ${s.answers} / OK ${s.ok} / WARN ${s.warn} / FAIL ${s.fail}`);
  }
  if (ARGS.apply) {
    log(`落盘省份 ${outputs.filter(o => o.written).length} 个；目录 ${path.relative(ROOT, ARGS.outDir).replace(/\\/g, '/')}`);
  }
  log(`报告：${path.relative(ROOT, ARGS.report).replace(/\\/g, '/')}`);
  log(`CSV：${path.relative(ROOT, ARGS.csv).replace(/\\/g, '/')}`);
  log(`日志：${path.relative(ROOT, ARGS.log).replace(/\\/g, '/')}`);
  writeText(ARGS.log, `${LOG_LINES.join('\n')}\n`);

  if (ARGS.strict && summary.fail > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n[未捕获异常]', err);
    try {
      writeText(ARGS.log, `${LOG_LINES.join('\n')}\n[未捕获异常] ${err.stack || err.message}\n`);
    } catch {
      // ignore
    }
    process.exit(1);
  });
}

module.exports = {
  normalizeShenlunText,
  findBestQuestionSet,
  analyzeSections,
  selectAnswerSections,
  parseFile,
  parseLabel,
  cleanMaterial,
};
