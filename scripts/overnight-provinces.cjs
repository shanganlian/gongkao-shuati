#!/usr/bin/env node
/**
 * 省考行测真题夜间转换器（浙江 → 福建 → 安徽 → 湖南 → 湖北 → 江西）
 *
 * 目标：
 *   1. 依次转换三个省的《行测》题本 + 答案解析；
 *   2. 每省输出到隔离目录 public/data/questions-v2-provincial/<省>/；
 *   3. 每省写一份账本、异常 CSV、20 题完整字段样本、known-losses；
 *   4. 末尾生成 guokao-reports/overnight-summary.md。
 *
 * 安全边界：
 *   - 只读 source-data/34省考真题合集/<省>/3-行测/**；
 *   - 只写 public/data/questions-v2-provincial/** 与 guokao-reports/**；
 *   - 绝不写 public/data/questions/、public/data/questions-v2/，绝不 git push。
 *
 * 用法（无交互）：
 *   node scripts/overnight-provinces.cjs
 *   node scripts/overnight-provinces.cjs --province 浙江 --limit 2 --dry-run
 *   node scripts/overnight-provinces.cjs --probe
 *   node scripts/overnight-provinces.cjs --province 福建 --reports-only --keep-summary
 *   node scripts/overnight-provinces.cjs --province 福建 --reports-only --keep-summary \
 *     --sample-include prov-fujian-2011-917联考-11
 *
 *   --reports-only   基于现有 questions.json 重算账本/样本，不重写题目分片（用于修复数据后补报告）
 *   --keep-summary   不覆盖三省级 overnight-summary.md（单省重算报告时使用）
 *   --sample-include 逗号分隔的 ID，强制进入 sample-20（仅限答案/解析/4 选项完整题）
 */

const fs = require('node:fs');
const path = require('node:path');
const mammoth = require('mammoth');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'source-data', '34省考真题合集');
const OUT_ROOT = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const REPORT_ROOT = path.join(ROOT, 'guokao-reports');
const SUMMARY_PATH = path.join(REPORT_ROOT, 'overnight-summary.md');
const LOG_PATH = path.join(REPORT_ROOT, 'overnight-run.log');

const MODULE_ORDER = ['changshi', 'yanyu', 'shuliang', 'panduan', 'ziliao'];
const MODULE_CN = {
  changshi: '常识',
  yanyu: '言语',
  shuliang: '数量',
  panduan: '判断',
  ziliao: '资料',
};
const DIFFICULTY = {
  changshi: '基础',
  yanyu: '中等',
  shuliang: '拔高',
  panduan: '中等',
  ziliao: '中等',
};

const PROVINCES = [
  {
    province: '浙江',
    slug: 'zhejiang',
    sourceDir: path.join(SRC_ROOT, '浙江公务员考试真题'),
    questionDir: path.join(SRC_ROOT, '浙江公务员考试真题', '3-行测', '1-题本', 'word'),
    answerDir: path.join(SRC_ROOT, '浙江公务员考试真题', '3-行测', '2-答案及解析', 'word'),
    reportDir: path.join(REPORT_ROOT, '省考-浙江-转换'),
    order: 1,
  },
  {
    province: '福建',
    slug: 'fujian',
    sourceDir: path.join(SRC_ROOT, '福建公务员考试真题'),
    questionDir: path.join(SRC_ROOT, '福建公务员考试真题', '3-行测', '1-题本', 'word'),
    answerDir: path.join(SRC_ROOT, '福建公务员考试真题', '3-行测', '2-答案及解析', 'word'),
    reportDir: path.join(REPORT_ROOT, '省考-福建-转换'),
    order: 2,
  },
  {
    province: '安徽',
    slug: 'anhui',
    sourceDir: path.join(SRC_ROOT, '安徽省公务员考试真题'),
    questionDir: path.join(SRC_ROOT, '安徽省公务员考试真题', '3-行测', '1-题本', 'word'),
    answerDir: path.join(SRC_ROOT, '安徽省公务员考试真题', '3-行测', '2-答案及解析', 'word'),
    reportDir: path.join(REPORT_ROOT, '省考-安徽-转换'),
    order: 3,
  },
  {
    province: '湖南',
    slug: 'hunan',
    sourceDir: path.join(SRC_ROOT, '湖南公务员考试真题'),
    questionDir: path.join(SRC_ROOT, '湖南公务员考试真题', '3-行测', '1-题本', 'word'),
    answerDir: path.join(SRC_ROOT, '湖南公务员考试真题', '3-行测', '2-答案及解析', 'word'),
    reportDir: path.join(REPORT_ROOT, '省考-湖南-转换'),
    order: 4,
  },
  {
    province: '湖北',
    slug: 'hubei',
    sourceDir: path.join(SRC_ROOT, '湖北公务员考试真题'),
    questionDir: path.join(SRC_ROOT, '湖北公务员考试真题', '3-行测', '1-题本', 'word'),
    answerDir: path.join(SRC_ROOT, '湖北公务员考试真题', '3-行测', '2-答案及解析', 'word'),
    reportDir: path.join(REPORT_ROOT, '省考-湖北-转换'),
    order: 5,
  },
  {
    province: '江西',
    slug: 'jiangxi',
    sourceDir: path.join(SRC_ROOT, '江西公务员考试真题'),
    questionDir: path.join(SRC_ROOT, '江西公务员考试真题', '3-行测', '1-题本', 'word'),
    answerDir: path.join(SRC_ROOT, '江西公务员考试真题', '3-行测', '2-答案及解析', 'word'),
    reportDir: path.join(REPORT_ROOT, '省考-江西-转换'),
    order: 6,
  },
];

/* ------------------------------------------------------------------ */
/* 参数与日志                                                          */
/* ------------------------------------------------------------------ */

function readArgs(argv) {
  const get = (name, def) => {
    const eq = argv.find(a => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const i = argv.indexOf(name);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
  };
  const has = name => argv.includes(name);
  const provinceArg = get('--province', '');
  return {
    provinces: provinceArg ? provinceArg.split(/[,，]/).map(s => s.trim()).filter(Boolean) : null,
    limit: Math.max(0, Number(get('--limit', 0)) || 0),
    only: get('--only', ''),
    dryRun: has('--dry-run'),
    probe: has('--probe'),
    verbose: has('--verbose'),
    strict: has('--strict'),
    noReports: has('--no-reports'),
    reportsOnly: has('--reports-only'),
    keepSummary: has('--keep-summary'),
    sampleInclude: get('--sample-include', '').split(/[,，]/).map(s => s.trim()).filter(Boolean),
  };
}

const ARGS = readArgs(process.argv.slice(2));
let logStream = null;
let base = null;

async function loadBase() {
  if (!base) {
    base = await import(pathToFileURL(path.join(__dirname, 'convert-guokao.js')).href);
  }
  return base;
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function initLog() {
  if (ARGS.dryRun || ARGS.noReports) return;
  ensureDir(REPORT_ROOT);
  logStream = fs.createWriteStream(LOG_PATH, { flags: 'w' });
}

function log(...args) {
  const line = args.join(' ');
  console.log(line);
  if (logStream) logStream.write(`[${stamp()}] ${line}\n`);
}

function vlog(...args) {
  if (ARGS.verbose) log(...args);
}

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function listDocx(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /\.docx$/i.test(f) && !f.startsWith('~$') && !/\.bak\.docx$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function normalizeText(text) {
  return String(text || '')
    .replace(/[\u2E80-\u2EFF\u2F00-\u2FDF]/g, ch => ch.normalize('NFKC'))
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u3000/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compact(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function escapePipe(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function writeCsv(file, rows) {
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  fs.writeFileSync(file, `\uFEFF${body}`, 'utf8');
}

function writeJson(file, value, pretty = true) {
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : 0), 'utf8');
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle(list, random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* DOCX → 文本（保留表格与图片位置）                                    */
/* ------------------------------------------------------------------ */

const IMG_MARK = '[[IMG]]';
const TABLE_CLOSE = '[[/TABLE]]';

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

function tableToLines(tableHtml) {
  const images = (tableHtml.match(/<img/gi) || []).length;
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const body = [];
  let contentRows = 0;
  for (const row of rows) {
    const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
    const texts = cells
      .map(c => stripTags(c.replace(/<\/(p|div)>/gi, ' ')).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (texts.length) {
      body.push(texts.join(' | '));
      contentRows++;
    }
  }
  return [`[[TABLE imgs=${images} rows=${contentRows}]]`, ...body, TABLE_CLOSE];
}

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

async function extractDoc(filePath) {
  const result = await withTimeout(
    mammoth.convertToHtml(
      { path: filePath },
      { convertImage: mammoth.images.imgElement(() => ({ src: 'x' })) }
    ),
    90000,
    path.basename(filePath)
  );
  return normalizeText(htmlToText(result.value));
}

/* ------------------------------------------------------------------ */
/* 文件名 → 年份 / 卷别                                                 */
/* ------------------------------------------------------------------ */

function parseYear(name) {
  const m = String(name).match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

function parsePaperLabel(name) {
  const s = String(name);
  const ab = s.match(/[（(]?\s*([ABC])\s*(类|卷)\s*[）)]?/i);
  if (ab) return `${ab[1].toUpperCase()}${ab[2]}`;
  if (/春季/.test(s)) return '春季';
  if (/秋季/.test(s)) return '秋季';
  if (/乡镇/.test(s)) return '乡镇';
  if (/县乡|县级/.test(s)) return '县乡';
  if (/选调/.test(s)) return '选调';
  if (/行政执法|执法类|执法卷/.test(s)) return '行政执法';
  // 同年可能有多场联考（如福建 2011 的 424 / 917）。只用「联考」会把两套卷
  // 压成同一个 label，进而产生同 ID 覆盖；这里把卷别日期写进 label。
  const batch = s.match(/(?:^|[^\d])(\d{3})\s*(?:公务员)?联考/);
  if (batch) return `${batch[1]}联考`;
  if (/联考/.test(s)) return '联考';
  return '未标注';
}

function labelFamily(label) {
  const m = String(label || '').match(/^([ABC])/);
  return m ? m[1] : String(label || '未标注');
}

function labelText(label) {
  return label && label !== '未标注' ? `（${label}）` : '';
}

function stripDocMarkers(text) {
  return String(text || '')
    .replace(/\[\[IMG\]\]/g, '')
    .replace(/\[\[\/?TABLE[^\]]*\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeKangxiSmart(text) {
  return String(text || '').replace(/[\u2E80-\u2EFF\u2F00-\u2FDF]/g, ch => ch.normalize('NFKC'));
}

function normalizeModuleSpacing(line) {
  return String(line)
    .replace(/常\s*识\s*判\s*断/g, '常识判断')
    .replace(/言\s*语\s*理\s*解\s*与\s*表\s*达/g, '言语理解与表达')
    .replace(/言\s*语\s*理\s*解/g, '言语理解')
    .replace(/言\s*语\s*能\s*力/g, '言语能力')
    .replace(/数\s*量\s*关\s*系/g, '数量关系')
    .replace(/判\s*断\s*推\s*理/g, '判断推理')
    .replace(/资\s*料\s*分\s*析/g, '资料分析');
}

function protectInlineList(line) {
  const marks = [...String(line).matchAll(/(^|[\s（(])(\d{1,2})\s*[、.．]\s*(?=[\u4e00-\u9fa5“《（(【])/g)];
  if (marks.length < 2) return line;
  const nums = marks.map(m => Number(m[2]));
  if (nums[0] !== 1 || nums[nums.length - 1] > 20) return line;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) return line;
  }
  return line.replace(
    /(^|[\s（(])(\d{1,2})(\s*[、.．]\s*)(?=[\u4e00-\u9fa5“《（(【])/g,
    (all, pre, n) => `${pre}${String.fromCodePoint(0x2460 + Number(n) - 1)}`
  );
}

function closeLog() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

function normalizeProvinceQuestionText(raw) {
  let text = normalizeText(raw);
  text = normalizeKangxiSmart(text);
  text = text
    .replace(/[\uFF21-\uFF24]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\uFF41-\uFF44]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

  // 模块标题黏在上一行选项/句末
  text = text.replace(
    /([^\n])\s*(第[一二三四五六七八九十]+部分\s*(?:常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析))/g,
    '$1\n$2'
  );
  text = text.replace(
    /([。；;）)\]】]|[A-D]\s*[、.．])\s*([一二三四五六七八九十]{1,3}\s*[、.．]\s*(?:常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析))/g,
    '$1\n$2'
  );

  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      out.push('');
      continue;
    }

    // 页眉/页脚/来源行
    if (/^(分类\s*[:：]|来源\s*[:：]|版权所有|公务员考试网|www\.|https?:\/\/)/i.test(line)) continue;
    if (/^第\s*\d+\s*页(?:\s*[\/／]\s*共?\s*\d+\s*页)?$/.test(line)) continue;
    if (i < 4 && /^\d{4}\s*年.*(?:公务员|省考|联考).*(?:行测|申论)/.test(line)) continue;

    line = normalizeModuleSpacing(line);
    line = protectInlineList(line);

    // 模块标题统一成 base 能识别的格式：一、言语理解。 / 第一部分 常识判断。
    const numbered = line.match(/^([一二三四五六七八九十]{1,3})\s*[、.．]\s*(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)(?=\s*(?:[。.．，,（(：:]|$))/);
    if (numbered) {
      out.push(`${numbered[1]}、${numbered[2]}。`);
      continue;
    }
    const part = line.match(/^第\s*([一二三四五六七八九十]+)\s*部分\s*(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)(?=\s*(?:[。.．，,（(：:]|$))/);
    if (part) {
      out.push(`第${part[1]}部分 ${part[2]}。`);
      continue;
    }
    const bare = line.match(/^(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)\s*[：:。]?\s*$/);
    if (bare) {
      out.push(`一、${bare[1]}。`);
      continue;
    }

    // 小写选项标记 → 大写（只处理行首或空白后的 a. / b、）
    line = line.replace(/(^|[\s　])([a-d])(?=\s*[、.．)）:：]\s*\S)/g, (all, pre, ch) => `${pre}${ch.toUpperCase()}`);
    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isBareAnswerLine(lines, index, stop) {
  const line = lines[index].trim();
  if (!/^[A-D]$/.test(line)) return false;
  let end = index + 1;
  while (end < stop) {
    const next = lines[end].trim();
    if (/^[A-D]$/.test(next) || /^\d{1,3}\s*[、.．:：]\s*[A-D](?![A-Za-z\u4e00-\u9fa5])/.test(next)) break;
    end++;
  }
  const body = lines.slice(index + 1, end).join('\n');
  return body.length >= 20 && /正确答案|答案选|故选/.test(body) && extractAnswer(body) === line;
}

// 2025 江西答案 docx 用 Word 自动编号，转换后部分题号丢失，只剩一行答案字母（"B"）。
// 在相邻两个带号标记之间的空缺数与该区间独立答案行数一致时按顺序补号；
// 末尾连续答案行也逐个校验后补号。
function repairBareAnswerMarkers(text) {
  const lines = text.split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(\d{1,3})\s*[、.．:：]\s*([A-D])(?![A-Za-z\u4e00-\u9fa5])/);
    if (m) marks.push({ index: i, num: Number(m[1]) });
  }
  if (!marks.length) return text;

  const fixes = [];
  for (let k = 0; k + 1 < marks.length; k++) {
    const from = marks[k];
    const to = marks[k + 1];
    const gap = to.num - from.num - 1;
    if (gap <= 0) continue;
    const bare = [];
    for (let i = from.index + 1; i < to.index; i++) {
      if (isBareAnswerLine(lines, i, to.index)) bare.push(i);
    }
    if (bare.length !== gap) continue;
    bare.forEach((i, offset) => fixes.push({ index: i, num: from.num + 1 + offset }));
  }

  const last = marks[marks.length - 1];
  const tail = [];
  for (let i = last.index + 1; i < lines.length; i++) {
    if (isBareAnswerLine(lines, i, lines.length)) tail.push(i);
  }
  if (tail.length) {
    tail.forEach((i, offset) => fixes.push({ index: i, num: last.num + 1 + offset }));
  }

  if (!fixes.length) return text;
  for (const fix of fixes) {
    lines[fix.index] = `${fix.num}.${lines[fix.index].trim()}`;
  }
  return lines.join('\n');
}

function normalizeAnswerText(raw) {
  let text = normalizeText(raw);
  text = normalizeKangxiSmart(text);
  text = text
    .replace(/[\uFF21-\uFF24]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\uFF41-\uFF44]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  text = text.replace(/[【\[]\s*答\s*案\s*[】\]]/g, '【答案】');
  // 2023 等浙江答案把下一题题号黏在上一句句末（“故正确答案为 A。 7”），先拆成独立行
  text = text.replace(/([。！？；])\s+(\d{1,3})\s*(?=\n|$)/g, '$1\n$2');
  // 2025 等浙江答案把下一题标记黏在上一句句末（“故正确答案为 D。 6.参考答案：D”）
  text = text.replace(/([^\n])\s*(\d{1,3})\s*[.、．]\s*(参考答案|答案|解析|详解)/g, '$1\n$2.$3');
  text = repairBareAnswerMarkers(text);
  return text.trim();
}

/* ------------------------------------------------------------------ */
/* 答案解析                                                            */
/* ------------------------------------------------------------------ */

const ANSWER_PATTERNS = [
  /【\s*答\s*案\s*】\s*[:：]?\s*([A-D]{1,4})(?![A-Za-z])/i,
  /答\s*案\s*[】\]]\s*[:：]?\s*([A-D]{1,4})(?![A-Za-z])/i,
  /故\s*正\s*确\s*答\s*案\s*为\s*[:：]?\s*([A-D])/i,
  /故\s*正\s*确\s*答\s*案\s*选\s*[:：]?\s*([A-D])/i,
  /故\s*正\s*确\s*选\s*项\s*(?:应)?\s*(?:为|是)\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /正\s*确\s*选\s*项\s*(?:应)?\s*(?:为|是)\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /故\s*答\s*案\s*选\s*([A-D])/i,
  /故\s*选\s*([A-D])(?![A-Za-z])/i,
  /应\s*选\s*([A-D])(?![A-Za-z])/i,
  /正\s*确\s*答\s*案\s*(?:应)?\s*(?:为|是)?\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /答\s*案\s*(?:为|是|选)?\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /因\s*此\s*[，,、]?\s*(?:应\s*)?选\s*择?\s*([A-D])(?![A-Za-z])/i,
  /所\s*以\s*[，,、]?\s*(?:应\s*)?选\s*择?\s*([A-D])(?![A-Za-z])/i,
  /本\s*题\s*(?:答\s*案|正\s*确\s*答\s*案)\s*(?:为|是|选)?\s*[:：]?\s*([A-D])(?![A-Za-z])/i,
  /^([A-D])[。.．、]/,
];

function normalizeChoiceAnswer(value) {
  const letters = [...new Set(String(value || '').toUpperCase().match(/[A-D]/g) || [])].sort();
  return letters.join('');
}

function isValidChoiceAnswer(value) {
  return /^[A-D]{1,4}$/.test(String(value || '')) && new Set(value).size === value.length;
}

function extractAnswer(text) {
  const body = String(text || '').trim();
  if (!body) return '';

  const lead = body.match(/^([A-D]{1,4})(?![A-Za-z\u4e00-\u9fa5])\s*(?=【|［|\[|（|\(|解析|答案|$)/);
  if (lead) return normalizeChoiceAnswer(lead[1]);

  const leadSpaced = body.match(/^([A-D])(?:[ \t]{2,}|\t)\s*(?=[^\s])/);
  if (leadSpaced) return normalizeChoiceAnswer(leadSpaced[1]);

  const leadExplanation = body.match(/^(?:【|［|\[)\s*解\s*析\s*(?:】|］|\])?\s*[:：]?\s*([A-D]{1,4})(?![A-Za-z\u4e00-\u9fa5])/);
  if (leadExplanation) return normalizeChoiceAnswer(leadExplanation[1]);

  for (const re of ANSWER_PATTERNS) {
    const m = body.match(re);
    if (m) return normalizeChoiceAnswer(m[1]);
  }

  const positives = [...body.matchAll(/([A-D])\s*项[^。；\n]{0,30}(?:符合|正确|恰当|最合适|更为合适)/g)]
    .map(m => m[1]);
  const unique = [...new Set(positives)];
  return unique.length === 1 ? unique[0] : '';
}

const ANSWER_MARKER_DEFS = [
  { re: /【\s*解析\s*(\d{1,3})\s*[—\-－~～至]\s*正确答案\s*([A-D])\s*】/g, priority: 5, answer: 2, kind: '解析N—正确答案X' },
  { re: /【\s*解析\s*(\d{1,3})\s*】/g, priority: 4, kind: '解析N' },
  { re: /【\s*(\d{1,3})\s*】\s*解析/g, priority: 4, kind: 'N解析' },
  { re: /第\s*[【\[]?\s*(\d{1,3})\s*[】\]]?\s*题/g, priority: 3, kind: '第N题' },
  { re: /【\s*(\d{1,3})\s*】/g, priority: 1, kind: 'N' },
];

function collectAnswerMarkers(text) {
  const all = [];
  for (const def of ANSWER_MARKER_DEFS) {
    def.re.lastIndex = 0;
    let m;
    while ((m = def.re.exec(text)) !== null) {
      all.push({
        index: m.index,
        end: def.re.lastIndex,
        num: Number(m[1]),
        markerAnswer: def.answer ? normalizeChoiceAnswer(m[def.answer]) : '',
        priority: def.priority,
        kind: def.kind,
      });
    }
  }

  // 同一题号若存在高优先级标记，去掉解释文本里碰巧出现的「【N】」
  const maxPriority = new Map();
  for (const m of all) maxPriority.set(m.num, Math.max(maxPriority.get(m.num) || 0, m.priority));
  const kept = all.filter(m => m.priority >= 3 || m.priority === maxPriority.get(m.num));

  kept.sort((a, b) => a.index - b.index || b.priority - a.priority);
  const out = [];
  for (const m of kept) {
    const same = out.find(x => x.num === m.num && Math.abs(x.index - m.index) < 3);
    if (same) {
      if (!same.markerAnswer && m.markerAnswer) same.markerAnswer = m.markerAnswer;
      same.priority = Math.max(same.priority, m.priority);
      continue;
    }
    out.push(m);
  }
  return out;
}




function cleanExplanation(block) {
  let s = String(block || '').trim();
  s = s.replace(/^\s*【\s*解\s*析\s*】\s*/g, '');
  s = s.replace(/^\s*解\s*析\s*[:：]?\s*/g, '');
  s = s.replace(/^\s*正确答案\s*[:：]\s*[A-D][^\n]*?\s*(?:解析|详解)\s*/g, '');
  s = s.replace(/^\s*正确答案\s*[:：]\s*[A-D][^\n]*\n?/g, '');
  s = s.replace(/^\s*(?:【\s*解析\s*】|解析)\s*/g, '');
  return s.trim();
}

function parseMarkerBlocks(text, markers) {
  const blocks = new Map();
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const next = markers[i + 1];
    const raw = text.slice(m.end, next ? next.index : text.length).trim();
    const explanation = cleanExplanation(raw);
    blocks.set(m.num, {
      num: m.num,
      raw,
      explanation,
      answer: m.markerAnswer || extractAnswer(raw),
      source: m.kind,
    });
  }
  return blocks;
}

function parseSequentialBlocks(text, maxNum) {
  const blocks = new Map();
  const lines = text.split('\n');
  let expected = null;
  let current = null;
  let buf = [];

  const flush = () => {
    if (!current) return;
    const raw = buf.join('\n').trim();
    const explanation = cleanExplanation(raw);
    blocks.set(current, {
      num: current,
      raw,
      explanation,
      answer: extractAnswer(raw),
      source: 'sequential',
    });
    current = null;
    buf = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (current) buf.push('');
      continue;
    }
    const m = line.match(/^(\d{1,3})\s*[、.．:：]\s*(.*)$/);
    const bare = !m && line.match(/^(\d{1,3})$/);
    if (m || bare) {
      const num = Number((m || bare)[1]);
      const rest = m ? m[2] : '';
      const strong = /参考答案|答案|解析|详解/.test(rest);
      const acceptable = num >= 1 && num <= (maxNum || 999) && (
        expected === null ||
        num === expected ||
        (num > expected && num <= expected + 5) ||
        // 扫描版/OCR 答案经常整段跳号，遇到强标记（“参考答案/解析”）时允许重同步
        (strong && num > expected && num <= (maxNum || 999)) ||
        // 纯数字行是 2023 等浙江答案的格式，允许较大跳号
        (bare && expected !== null && num > expected && num - expected <= 30) ||
        (bare && expected === null && num <= 3)
      );
      if (acceptable) {
        flush();
        current = num;
        buf = rest ? [rest] : [];
        expected = num + 1;
        continue;
      }
    }
    if (current) buf.push(line);
  }
  flush();
  return blocks;
}

function parseQuickKeys(text, maxNum) {
  const head = String(text || '').slice(0, 6000);
  const map = new Map();
  const addRange = (from, to, letters) => {
    const a = Number(from);
    const b = Number(to);
    const chars = normalizeChoiceAnswer(letters);
    if (!a || !b || b < a || b - a > 25) return;
    if (chars.length !== b - a + 1) return;
    if (maxNum && b > maxNum + 5) return;
    for (let i = 0; i < chars.length; i++) map.set(a + i, chars[i]);
  };

  const patterns = [
    /【\s*(\d{1,3})\s*[-~—－至]\s*(\d{1,3})\s*】\s*[:：]?\s*([A-D]{2,26})/g,
    /([A-D]{2,26})\s*【\s*(\d{1,3})\s*[-~—－至]\s*(\d{1,3})\s*】/g,
    /(?:^|\n)\s*(\d{1,3})\s*[-~—－至]\s*(\d{1,3})\s*[:：]?\s*([A-D]{2,26})(?=\s|$)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(head)) !== null) {
      if (m.length === 4) addRange(m[1], m[2], m[3]);
      else addRange(m[2], m[3], m[1]);
    }
  }
  return map;
}

function parseAnswerDocument(answerText, questions) {
  const result = {
    blocks: new Map(),
    answers: new Map(),
    quickAnswers: new Map(),
    sourceEmpty: false,
    answerOnlySource: false,
    markerCount: 0,
    sequentialCount: 0,
  };
  if (!String(answerText || '').trim()) {
    result.sourceEmpty = true;
    return result;
  }

  const maxNum = questions.length ? Math.max(...questions.map(q => q.num)) : 0;
  const markers = collectAnswerMarkers(answerText);
  const markerBlocks = parseMarkerBlocks(answerText, markers);
  const seqBlocks = parseSequentialBlocks(answerText, maxNum);
  result.markerCount = markerBlocks.size;
  result.sequentialCount = seqBlocks.size;

  // 标记块精确；逐行块补足老卷「1、考查……」格式
  result.blocks = new Map(seqBlocks);
  for (const [num, block] of markerBlocks) result.blocks.set(num, block);

  // 若标记块覆盖很低而逐行块覆盖更高，优先逐行块（标记块答案回填）
  if (markerBlocks.size < seqBlocks.size / 2) {
    result.blocks = new Map(seqBlocks);
    for (const [num, block] of markerBlocks) {
      const old = result.blocks.get(num);
      if (!old) result.blocks.set(num, block);
      else if (!old.answer && block.answer) old.answer = block.answer;
    }
  }

  result.quickAnswers = parseQuickKeys(answerText, maxNum);
  const validNums = new Set(questions.map(q => q.num));
  for (const [num, block] of result.blocks) {
    if (!validNums.has(num)) continue;
    const answer = block.answer || result.quickAnswers.get(num) || '';
    result.answers.set(num, answer);
  }
  for (const [num, answer] of result.quickAnswers) {
    if (validNums.has(num) && !result.answers.get(num)) result.answers.set(num, answer);
  }

  const withBody = [...result.blocks.values()].filter(b => b.explanation.length >= 10).length;
  result.answerOnlySource = result.blocks.size > 0 && withBody / result.blocks.size < 0.35;
  return result;
}

/* ------------------------------------------------------------------ */
/* 组装题目                                                            */
/* ------------------------------------------------------------------ */

function extractKeyPoints(explanation) {
  if (!explanation) return [];
  const points = [];
  const sentences = String(explanation).split(/[。\n]/).filter(s => s.trim().length > 5);
  for (const s of sentences.slice(0, 3)) {
    const cleaned = s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d、.．\s]+/, '').trim();
    if (cleaned.length > 4 && cleaned.length < 40) points.push(cleaned);
  }
  return points;
}

function labelSlug(label) {
  return String(label || 'x')
    .replace(/[（）()\s]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_');
}

function buildPaperQuestions(rawText, answerText, meta, sourceFile, answerFile) {
  const normalizedQuestions = normalizeProvinceQuestionText(rawText);
  const built = base.buildXingceQuestions(normalizedQuestions, {
    year: meta.year,
    label: meta.label || '未标注',
    kind: '行测',
    province: meta.province,
  });
  const questions = built.questions;
  const parsedAnswers = parseAnswerDocument(normalizeAnswerText(answerText), questions);

  for (const q of questions) {
    q.category = 'provincial';
    q.province = meta.province;
    q.id = `prov-${meta.slug}-${meta.year}-${labelSlug(meta.label)}-${q.num}`;
    q.source = `${meta.year}年${meta.province}公务员考试《行测》${labelText(meta.label)}第${q.num}题`;
    const block = parsedAnswers.blocks.get(q.num);
    q.answer = parsedAnswers.answers.get(q.num) || '';
    q.explanation = block ? block.explanation : '';
    q.keyPoints = extractKeyPoints(q.explanation);
    if (q.explanation) {
      const trailing = extractAnswer(q.explanation);
      if (q.answer && trailing && trailing !== q.answer) {
        q.answerConflict = `${q.answer}/${trailing}`;
      }
    }
  }

  const placeholders = [];
  const maxNum = questions.length ? Math.max(...questions.map(q => q.num)) : 0;
  const missing = [];
  for (let n = 1; n <= maxNum; n++) {
    if (!questions.some(q => q.num === n)) missing.push(n);
  }

  for (const num of missing) {
    const prev = questions.filter(q => q.num < num).sort((a, b) => b.num - a.num)[0];
    const next = questions.filter(q => q.num > num).sort((a, b) => a.num - b.num)[0];
    const module = prev?.module || next?.module || 'changshi';
    const placeholder = {
      id: `prov-${meta.slug}-${meta.year}-${labelSlug(meta.label)}-${num}`,
      category: 'provincial',
      province: meta.province,
      module,
      title: `第${num}题（原卷文本缺失）`,
      stem: `（原卷此题在 Word 文本层缺失，题号 ${num} 保留占位，待人工补录。）`,
      options: [],
      answer: '',
      explanation: '',
      keyPoints: [],
      thinkingTip: '原卷文本层缺失，需人工从 PDF/图片补录。',
      difficulty: DIFFICULTY[module] || '中等',
      source: `${meta.year}年${meta.province}公务员考试《行测》${labelText(meta.label)}第${num}题`,
      isPlaceholder: true,
      placeholderReason: 'MISSING_IN_SOURCE',
      num,
    };
    questions.push(placeholder);
    placeholders.push(num);
  }

  questions.sort((a, b) => a.num - b.num);

  const issues = [];
  for (const q of questions) {
    if (q.answerConflict) {
      issues.push({ num: q.num, code: 'ANSWER_CONFLICT', detail: `答案标记与解析结论不一致：${q.answerConflict}` });
    }
  }
  if (parsedAnswers.blocks.size === 0 && parsedAnswers.answers.size === 0 && String(answerText || '').trim()) {
    issues.push({ num: 0, code: 'ANSWER_PARSE_EMPTY', detail: '答案文件有文本，但未解析出任何题号/答案' });
  }
  if (parsedAnswers.answers.size > 0 && parsedAnswers.answers.size < questions.length * 0.5) {
    issues.push({
      num: 0,
      code: 'ANSWER_COVERAGE_LOW',
      detail: `仅解析到 ${parsedAnswers.answers.size}/${questions.length} 题答案`,
    });
  }

  const answerSourceEmpty = !String(answerText || '').trim() || parsedAnswers.answers.size === 0;
  const answerOnlySource = parsedAnswers.answerOnlySource
    || (parsedAnswers.answers.size > 0 && parsedAnswers.blocks.size === 0);

  for (const it of built.issues || []) {
    issues.push({ num: it.num, code: it.code, detail: it.detail });
  }
  if (!answerFile) {
    issues.push({ num: 0, code: 'ANSWER_FILE_MISSING', detail: '未找到配对的答案/解析 Word 文件' });
  }
  if (placeholders.length) {
    issues.push({ num: 0, code: 'QNO_PLACEHOLDER', detail: `原卷文本缺号，已补占位：${placeholders.join('、')}` });
  }

  const validation = base.validatePaper(questions, {
    year: meta.year,
    label: meta.label || '未标注',
    kind: '行测',
    province: meta.province,
    answerSourceEmpty,
    answerOnlySource,
  }, issues);

  return {
    questions,
    issues: validation.issues,
    stats: validation.stats,
    placeholders,
    missing,
    answerSourceEmpty,
    answerOnlySource,
    parsedAnswers,
    normalizedQuestions,
    built,
  };
}

/* ------------------------------------------------------------------ */
/* 文件配对与读取                                                      */
/* ------------------------------------------------------------------ */

function isAnswerName(name) {
  return /答案|解析|详解|参考答案/.test(name);
}

function pairDocs(cfg) {
  const qFiles = listDocx(cfg.questionDir).filter(f => !isAnswerName(f));
  const aFiles = listDocx(cfg.answerDir).filter(f => isAnswerName(f));
  const answersByYear = new Map();
  for (const file of aFiles) {
    const year = parseYear(file);
    if (!year) continue;
    if (!answersByYear.has(year)) answersByYear.set(year, []);
    answersByYear.get(year).push(file);
  }

  const pairs = [];
  for (const qFile of qFiles) {
    const year = parseYear(qFile);
    if (!year) continue;
    const label = parsePaperLabel(qFile);
    const family = labelFamily(label);
    const candidates = answersByYear.get(year) || [];
    let answerFile = candidates.find(f => parsePaperLabel(f) === label);
    if (!answerFile) answerFile = candidates.find(f => labelFamily(parsePaperLabel(f)) === family);
    if (!answerFile && candidates.length === 1) answerFile = candidates[0];
    if (!answerFile && candidates.length > 1) {
      answerFile = candidates.find(f => !/[ABC]\s*(类|卷)/i.test(path.basename(f)));
    }
    pairs.push({
      year,
      label,
      questionFile: path.join(cfg.questionDir, qFile),
      answerFile: answerFile ? path.join(cfg.answerDir, answerFile) : '',
      questionName: qFile,
      answerName: answerFile || '',
      pairNote: answerFile ? 'same-year-and-label' : 'answer-not-found',
    });
  }

  pairs.sort((a, b) => a.year - b.year || String(a.label).localeCompare(String(b.label), 'zh-CN'));
  return pairs;
}

async function loadDocText(file) {
  if (!file) return '';
  const sidecar = file.replace(/\.docx$/i, '.ocr.txt');
  if (fs.existsSync(sidecar)) {
    vlog(`    [旁挂] 使用 ${path.basename(sidecar)}`);
    return normalizeText(fs.readFileSync(sidecar, 'utf8'));
  }
  const text = await extractDoc(file);
  return normalizeText(text);
}

/* ------------------------------------------------------------------ */
/* 输出分片                                                            */
/* ------------------------------------------------------------------ */

const SHARD_SIZE = 200;

function publicQuestion(q) {
  const out = { ...q };
  delete out.num;
  delete out.materialImage;
  delete out.materialFrom;
  delete out.answerMissing;
  delete out.answerConflict;
  delete out.placeholderReason;
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

function writeProvinceShards(province, slug, questions) {
  const outDir = path.join(OUT_ROOT, province);
  ensureDir(outDir);

  // 只清理本省目录，绝不触碰 questions/ 与 questions-v2/
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);

  const groups = new Map();
  for (const module of MODULE_ORDER) groups.set(module, []);
  for (const q of questions) {
    if (!groups.has(q.module)) groups.set(q.module, []);
    groups.get(q.module).push(publicQuestion(q));
  }

  const index = {};
  let files = 0;
  for (const [module, list] of groups) {
    if (!list.length) continue;
    const key = `${slug}-none-${module}`;
    index[key] = [];
    for (let i = 0; i * SHARD_SIZE < list.length; i++) {
      const name = `${key}-${i}.json`;
      fs.writeFileSync(path.join(outDir, name), JSON.stringify(list.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE), null, 2), 'utf8');
      index[key].push(name);
      files++;
    }
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(questions.map(publicQuestion), null, 2), 'utf8');
  return { outDir, index, files };
}

/* ------------------------------------------------------------------ */
/* 报告                                                                */
/* ------------------------------------------------------------------ */

function formatPct(part, total) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

function relPath(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function paperTitle(paper) {
  return `${paper.year}年${paper.label && paper.label !== '未标注' ? `（${paper.label}）` : ''}`;
}

function pickSamples(questions, count, seedText, mustInclude = []) {
  const random = mulberry32(hashString(seedText));
  const complete = questions.filter(q => !q.isPlaceholder && q.answer && q.explanation && q.options && q.options.length === 4);
  const fallback = questions.filter(q => !q.isPlaceholder && q.answer);
  const pool = complete.length >= count ? complete : (fallback.length ? fallback : questions);
  const shuffled = shuffle(pool, random);
  const picked = [];
  const used = new Set();

  // 回归样本必须先入样，且只接受字段完整的题，避免出现空解析样本
  for (const id of mustInclude) {
    const q = complete.find(x => x.id === id);
    if (!q || used.has(q.id)) continue;
    picked.push(q);
    used.add(q.id);
  }

  // 再保证模块覆盖：每个模块最多先取 2 题
  for (const module of MODULE_ORDER) {
    const list = shuffled.filter(q => q.module === module);
    for (const q of list.slice(0, 2)) {
      if (picked.length >= count) break;
      if (used.has(q.id)) continue;
      picked.push(q);
      used.add(q.id);
    }
  }
  for (const q of shuffled) {
    if (picked.length >= count) break;
    if (used.has(q.id)) continue;
    picked.push(q);
    used.add(q.id);
  }
  return picked.slice(0, count);
}

function writeSampleReport(file, jsonFile, cfg, samples, mustInclude = []) {
  const lines = [
    `# ${cfg.province}省考行测 20 题完整字段样本`,
    '',
    `生成时间：${stamp()}`,
    '',
    '抽样规则：优先抽取「答案 + 解析 + 4 个选项」齐全的题目，并尽量覆盖五个模块；使用固定种子，重复运行结果一致。',
    '',
  ];
  if (mustInclude.length) {
    lines.push(`回归样本（强制包含）：${mustInclude.map(id => `\`${id}\``).join('、')}`);
    lines.push('');
  }
  samples.forEach((q, i) => {
    lines.push(`## ${i + 1}. ${q.id}`);
    lines.push('');
    lines.push(`- 来源：${q.source}`);
    lines.push(`- 模块：${MODULE_CN[q.module] || q.module}`);
    lines.push(`- 难度：${q.difficulty || '—'}`);
    lines.push(`- 图片题：${q.isImageQuestion ? '是' : '否'}`);
    lines.push(`- 答案：${q.answer || '（空）'}`);
    lines.push('');
    lines.push('**题干**');
    lines.push('');
    lines.push(q.stem || '（空）');
    lines.push('');
    lines.push('**选项**');
    lines.push('');
    if (q.options && q.options.length) {
      for (const o of q.options) lines.push(`- ${o.key}. ${String(o.text || '').replace(/\n/g, ' ')}`);
    } else {
      lines.push('- （无文本选项）');
    }
    lines.push('');
    lines.push('**解析**');
    lines.push('');
    lines.push(q.explanation || '（空）');
    if (q.keyPoints && q.keyPoints.length) {
      lines.push('');
      lines.push(`**要点**：${q.keyPoints.join('；')}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  writeJson(jsonFile, samples.map(publicQuestion), true);
}

function aggregateProvince(cfg, records) {
  const agg = {
    province: cfg.province,
    papers: records.length,
    okPapers: records.filter(r => r.status === 'ok').length,
    failedPapers: records.filter(r => r.status !== 'ok').length,
    questions: 0,
    placeholders: 0,
    withAnswer: 0,
    withExplanation: 0,
    imageQuestions: 0,
    errors: 0,
    warnings: 0,
    missingAnswerPapers: 0,
    answerOnlyPapers: 0,
    moduleCounts: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    moduleAnswers: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    moduleExplanations: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    modulePlaceholders: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    moduleImages: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    issueCodes: {},
    questionsList: [],
  };
  for (const r of records) {
    agg.questions += r.questionCount || 0;
    agg.placeholders += r.placeholderCount || 0;
    agg.withAnswer += r.withAnswer || 0;
    agg.withExplanation += r.withExplanation || 0;
    agg.imageQuestions += r.imageQuestions || 0;
    agg.errors += r.errors || 0;
    agg.warnings += r.warnings || 0;
    if (r.answerSourceEmpty || r.answerFileMissing) agg.missingAnswerPapers += 1;
    if (r.answerOnlySource) agg.answerOnlyPapers += 1;
    for (const m of MODULE_ORDER) {
      agg.moduleCounts[m] += r.moduleCounts?.[m] || 0;
      agg.moduleAnswers[m] += r.moduleAnswers?.[m] || 0;
      agg.moduleExplanations[m] += r.moduleExplanations?.[m] || 0;
      agg.modulePlaceholders[m] += r.modulePlaceholders?.[m] || 0;
      agg.moduleImages[m] += r.moduleImages?.[m] || 0;
    }
    for (const [code, n] of Object.entries(r.issueCodes || {})) {
      agg.issueCodes[code] = (agg.issueCodes[code] || 0) + n;
    }
    if (r.questions) agg.questionsList.push(...r.questions);
  }
  return agg;
}

function writeLedger(file, cfg, agg, records, startedAt) {
  const lines = [
    `# 省考-${cfg.province}-转换 账本`,
    '',
    `- 生成时间：${stamp()}`,
    `- 开始时间：${startedAt}`,
    `- 源目录：\`${relPath(cfg.sourceDir)}\``,
    `- 输出目录：\`${relPath(path.join(OUT_ROOT, cfg.province))}\``,
    `- 解析器：\`scripts/convert-guokao.js\` + \`scripts/overnight-provinces.cjs\``,
    '',
    '## 总览',
    '',
    '| 指标 | 数值 |',
    '| --- | ---: |',
    `| 题本数 | ${agg.papers} |`,
    `| 成功解析题本 | ${agg.okPapers} |`,
    `| 解析失败题本 | ${agg.failedPapers} |`,
    `| 总题数（含占位） | ${agg.questions} |`,
    `| 原卷文本缺号占位 | ${agg.placeholders} |`,
    `| 有答案 | ${agg.withAnswer}（${formatPct(agg.withAnswer, agg.questions)}） |`,
    `| 有解析 | ${agg.withExplanation}（${formatPct(agg.withExplanation, agg.questions)}） |`,
    `| 图片题 | ${agg.imageQuestions} |`,
    `| 错误（ERROR） | ${agg.errors} |`,
    `| 警告（WARN） | ${agg.warnings} |`,
    `| 答案文件缺失/解析为空卷 | ${agg.missingAnswerPapers} |`,
    `| 仅答案无解析卷 | ${agg.answerOnlyPapers} |`,
    '',
    '## 分卷明细',
    '',
    '| 年份 | 卷别 | 题数 | 最大题号 | 占位 | 答案 | 解析 | 图片 | 错误 | 警告 | 状态 | 备注 |',
    '| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const r of records) {
    lines.push([
      r.year,
      mdCell(r.label || '未标注'),
      r.questionCount ?? '-',
      r.maxNum ?? '-',
      r.placeholderCount ?? '-',
      r.withAnswer ?? '-',
      r.withExplanation ?? '-',
      r.imageQuestions ?? '-',
      r.errors ?? '-',
      r.warnings ?? '-',
      r.status === 'ok' ? 'OK' : 'ERROR',
      mdCell(r.error || r.note || ''),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('', '## 模块分布', '', '| 模块 | 题数 | 有答案 | 有解析 | 占位 | 图片 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const m of MODULE_ORDER) {
    lines.push(`| ${MODULE_CN[m]}（${m}） | ${agg.moduleCounts[m]} | ${agg.moduleAnswers[m]} | ${agg.moduleExplanations[m]} | ${agg.modulePlaceholders[m]} | ${agg.moduleImages[m]} |`);
  }

  lines.push('', '## 异常代码统计', '');
  const codes = Object.entries(agg.issueCodes).sort((a, b) => b[1] - a[1]);
  if (!codes.length) lines.push('（无）');
  else {
    lines.push('| 代码 | 次数 |', '| --- | ---: |');
    for (const [code, n] of codes) lines.push(`| ${code} | ${n} |`);
  }

  lines.push('', '## 产物', '');
  lines.push('- `exceptions.csv`：逐条异常（含题号、模块、来源文件）');
  lines.push('- `sample-20.md` / `sample-20.json`：20 题完整字段样本');
  lines.push('- `known-losses.md`：已知损失与人工复核清单');
  lines.push('- `paper-stats.json`：机器可读分卷统计');
  lines.push('');

  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

function writeKnownLosses(file, cfg, agg, records) {
  const lines = [
    `# 省考-${cfg.province}-转换 已知损失`,
    '',
    `生成时间：${stamp()}`,
    '',
    '> 本文件只列「转换过程中确定丢失或需要人工复核」的内容，不代表题目不可用。',
    '',
  ];

  const placeholderPapers = records.filter(r => r.placeholderCount > 0);
  lines.push('## 1. 原卷文本缺号（已补占位）', '');
  if (!placeholderPapers.length) lines.push('（无）');
  else {
    for (const r of placeholderPapers) {
      lines.push(`- ${paperTitle(r)}：缺号 ${r.placeholders.join('、')}，共 ${r.placeholderCount} 题。`);
    }
  }

  lines.push('', '## 2. 无答案或答案解析为空', '');
  const noAnswer = records.filter(r => (r.withAnswer || 0) < (r.questionCount || 0));
  if (!noAnswer.length) lines.push('（无）');
  else {
    for (const r of noAnswer) {
      const miss = (r.questionCount || 0) - (r.withAnswer || 0);
      lines.push(`- ${paperTitle(r)}：${miss}/${r.questionCount} 题无答案${r.answerFileMissing ? '（未找到答案文件）' : ''}。`);
    }
  }

  lines.push('', '## 3. 无解析', '');
  const noExplanation = records.filter(r => (r.withExplanation || 0) < (r.questionCount || 0));
  if (!noExplanation.length) lines.push('（无）');
  else {
    for (const r of noExplanation) {
      const miss = (r.questionCount || 0) - (r.withExplanation || 0);
      lines.push(`- ${paperTitle(r)}：${miss} 题解析为空${r.answerOnlySource ? '（答案文件疑似只有答案清单）' : ''}。`);
    }
  }

  lines.push('', '## 4. 图片题（选项/材料为图片，需人工核对）', '');
  const imagePapers = records.filter(r => r.imageQuestions > 0);
  if (!imagePapers.length) lines.push('（无）');
  else {
    for (const r of imagePapers) lines.push(`- ${paperTitle(r)}：${r.imageQuestions} 题图片题。`);
  }

  lines.push('', '## 5. 异常代码（前 30 项）', '');
  const codes = Object.entries(agg.issueCodes).sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (!codes.length) lines.push('（无）');
  else {
    for (const [code, n] of codes) lines.push(`- \`${code}\`：${n} 次`);
  }

  lines.push('', '## 6. 未参与转换的文件', '');
  lines.push('- `*.bak.docx` 已跳过（避免重复卷）。');
  const noAnswerPair = records.filter(r => r.answerFileMissing);
  if (noAnswerPair.length) {
    for (const r of noAnswerPair) lines.push(`- ${paperTitle(r)}：题本 \`${r.questionName}\` 未配对答案文件。`);
  } else {
    lines.push('- 所有题本均找到同年同卷答案文件（或同题本内含答案）。');
  }

  lines.push('', '## 7. 仍需人工确认', '');
  lines.push('- 资料分析材料若含图片/表格，文本层只能保留表格文字，图表需人工核对。');
  lines.push('- 「仅答案清单」卷的解析为空，前端应继续使用占位/折叠展示。');
  lines.push('- 原卷缺号占位题需从 PDF/图片补录题干与选项。');
  lines.push('');
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

function readExistingQuestions(province) {
  const file = path.join(OUT_ROOT, province, 'questions.json');
  if (!fs.existsSync(file)) return null;
  try {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function reconcileAggWithQuestions(agg, questions) {
  const zero = () => Object.fromEntries(MODULE_ORDER.map(m => [m, 0]));
  const counts = zero();
  const answers = zero();
  const explanations = zero();
  const placeholders = zero();
  const images = zero();
  for (const q of questions) {
    if (!(q.module in counts)) continue;
    counts[q.module] += 1;
    if (q.answer) answers[q.module] += 1;
    if (String(q.explanation || '').trim()) explanations[q.module] += 1;
    if (q.isPlaceholder) placeholders[q.module] += 1;
    if (q.isImageQuestion) images[q.module] += 1;
  }
  agg.questions = questions.length;
  agg.withAnswer = questions.filter(q => q.answer).length;
  agg.withExplanation = questions.filter(q => String(q.explanation || '').trim()).length;
  agg.placeholders = questions.filter(q => q.isPlaceholder).length;
  agg.imageQuestions = questions.filter(q => q.isImageQuestion).length;
  agg.moduleCounts = counts;
  agg.moduleAnswers = answers;
  agg.moduleExplanations = explanations;
  agg.modulePlaceholders = placeholders;
  agg.moduleImages = images;
  agg.questionsList = questions;
}

function writeProvinceReports(cfg, records, agg, startedAt) {
  ensureDir(cfg.reportDir);
  const existingQuestions = ARGS.reportsOnly ? readExistingQuestions(cfg.province) : null;
  if (existingQuestions) {
    reconcileAggWithQuestions(agg, existingQuestions);
    log(`  [reports-only] 统计与样本基于现有 questions.json（${existingQuestions.length} 题）`);
  }
  writeLedger(path.join(cfg.reportDir, 'ledger.md'), cfg, agg, records, startedAt);

  const csv = [['省份', '年份', '卷别', '题本', '答案文件', '级别', '代码', '题号', '模块', '说明']];
  for (const r of records) {
    const baseCols = [cfg.province, r.year ?? '', r.label || '', r.questionName || '', r.answerName || ''];
    if (r.status !== 'ok') {
      csv.push([...baseCols, 'ERROR', 'PAPER_PARSE_FAILED', '', '', r.error || '解析失败']);
    }
    for (const it of r.issues || []) {
      csv.push([...baseCols, it.level || '', it.code || '', it.num ?? '', it.module || '', it.detail || '']);
    }
  }
  writeCsv(path.join(cfg.reportDir, 'exceptions.csv'), csv);

  const samples = pickSamples(existingQuestions || agg.questionsList, 20, `${cfg.province}-2024`, ARGS.sampleInclude);
  const includedForcedIds = ARGS.sampleInclude.filter(id => samples.some(q => q.id === id));
  const missingForcedIds = ARGS.sampleInclude.filter(id => !includedForcedIds.includes(id));
  if (missingForcedIds.length) {
    log(`  [sample] 回归题未入样（不存在或字段不完整）：${missingForcedIds.join('、')}`);
  }
  writeSampleReport(
    path.join(cfg.reportDir, 'sample-20.md'),
    path.join(cfg.reportDir, 'sample-20.json'),
    cfg,
    samples,
    includedForcedIds
  );
  writeKnownLosses(path.join(cfg.reportDir, 'known-losses.md'), cfg, agg, records);

  writeJson(path.join(cfg.reportDir, 'paper-stats.json'), {
    province: cfg.province,
    generatedAt: stamp(),
    startedAt,
    outputDir: relPath(path.join(OUT_ROOT, cfg.province)),
    aggregate: {
      papers: agg.papers,
      okPapers: agg.okPapers,
      failedPapers: agg.failedPapers,
      questions: agg.questions,
      placeholders: agg.placeholders,
      withAnswer: agg.withAnswer,
      withExplanation: agg.withExplanation,
      imageQuestions: agg.imageQuestions,
      errors: agg.errors,
      warnings: agg.warnings,
      missingAnswerPapers: agg.missingAnswerPapers,
      answerOnlyPapers: agg.answerOnlyPapers,
      moduleCounts: agg.moduleCounts,
      issueCodes: agg.issueCodes,
    },
    papers: records.map(r => {
      const copy = { ...r };
      delete copy.questions;
      delete copy.issues;
      return copy;
    }),
  }, true);
}

function writeSummary(provinceResults, startedAt, endedAt) {
  ensureDir(REPORT_ROOT);
  const lines = [
    '# 省考行测夜间转换汇总',
    '',
    `- 开始：${startedAt}`,
    `- 结束：${endedAt}`,
    `- 入口：\`node scripts/overnight-provinces.cjs\``,
    `- 隔离输出：\`${relPath(OUT_ROOT)}/<省>/\``,
    `- 注意：本次运行未写入 \`public/data/questions/\` 与 \`public/data/questions-v2/\`，未执行 git push。`,
    '',
    '## 总览',
    '',
    '| 省份 | 题本 | 成功/失败 | 题数 | 答案覆盖 | 解析覆盖 | 占位 | 图片 | ERROR | WARN | 输出 | 报告 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  let totalQuestions = 0;
  let totalAnswers = 0;
  let totalExplanations = 0;
  let totalPlaceholders = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const result of provinceResults) {
    const { cfg, agg, status } = result;
    totalQuestions += agg.questions;
    totalAnswers += agg.withAnswer;
    totalExplanations += agg.withExplanation;
    totalPlaceholders += agg.placeholders;
    totalErrors += agg.errors;
    totalWarnings += agg.warnings;
    lines.push([
      `${cfg.province}${status === 'ok' ? '' : '（异常）'}`,
      agg.papers,
      `${agg.okPapers}/${agg.failedPapers}`,
      agg.questions,
      formatPct(agg.withAnswer, agg.questions),
      formatPct(agg.withExplanation, agg.questions),
      agg.placeholders,
      agg.imageQuestions,
      agg.errors,
      agg.warnings,
      `\`${relPath(path.join(OUT_ROOT, cfg.province))}/\``,
      `\`${relPath(cfg.reportDir)}/\``,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push(
    '',
    '## 合计',
    '',
    `- 总题数（含占位）：**${totalQuestions}**`,
    `- 有答案：**${totalAnswers}**（${formatPct(totalAnswers, totalQuestions)}）`,
    `- 有解析：**${totalExplanations}**（${formatPct(totalExplanations, totalQuestions)}）`,
    `- 占位题：**${totalPlaceholders}**`,
    `- ERROR：**${totalErrors}**；WARN：**${totalWarnings}**`,
    '',
    '## 分省报告',
    ''
  );

  for (const result of provinceResults) {
    const { cfg, agg } = result;
    lines.push(`### ${cfg.province}`);
    lines.push('');
    lines.push(`- 账本：\`${relPath(path.join(cfg.reportDir, 'ledger.md'))}\``);
    lines.push(`- 异常 CSV：\`${relPath(path.join(cfg.reportDir, 'exceptions.csv'))}\``);
    lines.push(`- 20 题样本：\`${relPath(path.join(cfg.reportDir, 'sample-20.md'))}\``);
    lines.push(`- 已知损失：\`${relPath(path.join(cfg.reportDir, 'known-losses.md'))}\``);
    lines.push(`- 机器统计：\`${relPath(path.join(cfg.reportDir, 'paper-stats.json'))}\``);
    lines.push(`- 题本数：${agg.papers}；失败：${agg.failedPapers}；占位：${agg.placeholders}；仅答案卷：${agg.answerOnlyPapers}`);
    lines.push('');
  }

  lines.push(
    '## 复核建议（按优先级）',
    '',
    '1. 先看各省 `known-losses.md` 的「原卷文本缺号」与「无答案/无解析」清单。',
    '2. 再看 `exceptions.csv` 中 `ERROR` 记录，重点排查 `OPT_NOT_4`、`MISSING_ANSWER`、`QNO_GAP`。',
    '3. 检查 `sample-20.md` 的 20 题是否满足：题干完整、A-D 四项、答案 A-D、解析非空。',
    '4. 资料分析材料含图片的题目，需对照原 PDF/图片人工核对。',
    '5. 全部确认后再决定是否合并到正式题库；本次未触碰正式目录。',
    '',
    '## 运行日志',
    '',
    `- \`${relPath(LOG_PATH)}\``,
    '',
  );

  fs.writeFileSync(SUMMARY_PATH, lines.join('\n'), 'utf8');
}

/* ------------------------------------------------------------------ */
/* 单卷 / 单省处理                                                      */
/* ------------------------------------------------------------------ */

function countBy(list, fn) {
  const out = {};
  for (const item of list) {
    const key = fn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

async function runPaper(cfg, pair) {
  const started = Date.now();
  const meta = {
    year: pair.year,
    label: pair.label,
    slug: cfg.slug,
    province: cfg.province,
  };
  const record = {
    year: pair.year,
    label: pair.label,
    questionName: pair.questionName,
    answerName: pair.answerName,
    pairNote: pair.pairNote,
    answerFileMissing: !pair.answerFile,
    status: 'ok',
    questionCount: 0,
    maxNum: 0,
    placeholderCount: 0,
    placeholders: [],
    missingNums: [],
    withAnswer: 0,
    withExplanation: 0,
    imageQuestions: 0,
    errors: 0,
    warnings: 0,
    issueCodes: {},
    moduleCounts: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    moduleAnswers: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    moduleExplanations: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    modulePlaceholders: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    moduleImages: Object.fromEntries(MODULE_ORDER.map(m => [m, 0])),
    answerSourceEmpty: false,
    answerOnlySource: false,
    rawLength: 0,
    answerLength: 0,
    elapsedMs: 0,
    note: '',
    issues: [],
    questions: [],
  };

  try {
    log(`  → ${pair.year} ${pair.label || '未标注'}：${pair.questionName}`);
    const rawText = await loadDocText(pair.questionFile);
    const answerText = pair.answerFile ? await loadDocText(pair.answerFile) : '';
    record.rawLength = rawText.length;
    record.answerLength = answerText.length;

    if (!rawText.trim()) {
      record.status = 'empty';
      record.error = '题本文本为空（可能是扫描版/加密 docx）';
      log(`    [警告] ${record.error}`);
      return record;
    }

    const result = buildPaperQuestions(rawText, answerText, meta, pair.questionFile, pair.answerFile);
    const questions = result.questions;
    record.questions = questions;
    record.questionCount = questions.length;
    record.maxNum = questions.length ? Math.max(...questions.map(q => q.num)) : 0;
    record.placeholders = result.placeholders;
    record.placeholderCount = result.placeholders.length;
    record.missingNums = result.missing;
    record.withAnswer = questions.filter(q => q.answer && String(q.answer).trim()).length;
    record.withExplanation = questions.filter(q => q.explanation && String(q.explanation).trim()).length;
    record.imageQuestions = questions.filter(q => q.isImageQuestion).length;
    record.answerSourceEmpty = result.answerSourceEmpty;
    record.answerOnlySource = result.answerOnlySource;
    record.issues = result.issues;
    record.errors = result.stats.errors;
    record.warnings = result.stats.warnings;
    record.issueCodes = countBy(result.issues, it => it.code || 'UNKNOWN');
    for (const q of questions) {
      const m = q.module;
      if (!record.moduleCounts[m]) record.moduleCounts[m] = 0;
      record.moduleCounts[m] += 1;
      if (q.answer) record.moduleAnswers[m] = (record.moduleAnswers[m] || 0) + 1;
      if (q.explanation) record.moduleExplanations[m] = (record.moduleExplanations[m] || 0) + 1;
      if (q.isPlaceholder) record.modulePlaceholders[m] = (record.modulePlaceholders[m] || 0) + 1;
      if (q.isImageQuestion) record.moduleImages[m] = (record.moduleImages[m] || 0) + 1;
    }
    record.note = `blocks=${result.parsedAnswers.blocks.size}, answers=${result.parsedAnswers.answers.size}, quick=${result.parsedAnswers.quickAnswers.size}`;

    const moduleText = MODULE_ORDER
      .filter(m => record.moduleCounts[m])
      .map(m => `${MODULE_CN[m]}${record.moduleCounts[m]}`)
      .join('/');
    log(`    题数=${record.questionCount} 答案=${record.withAnswer} 解析=${record.withExplanation} 图片=${record.imageQuestions} 占位=${record.placeholderCount} [${moduleText}] ERROR=${record.errors} WARN=${record.warnings}`);
    if (ARGS.verbose && result.issues.length) {
      for (const it of result.issues.slice(0, 5)) {
        log(`      · ${it.level || ''} ${it.code} Q${it.num ?? ''} ${compact(it.detail, 100)}`);
      }
    }
  } catch (e) {
    record.status = 'error';
    record.error = e && e.stack ? e.stack.split('\n')[0] : String(e);
    log(`    [错误] ${record.error}`);
  } finally {
    record.elapsedMs = Date.now() - started;
  }
  return record;
}


/* ------------------------------------------------------------------ */
/* 单省处理                                                            */
/* ------------------------------------------------------------------ */

async function processProvince(cfg, startedAt) {
  log('');
  log(`===== ${cfg.province} =====`);
  const records = [];
  if (!ARGS.dryRun && !ARGS.noReports) ensureDir(cfg.reportDir);

  if (!fs.existsSync(cfg.questionDir)) {
    log(`  [致命] 题本目录不存在：${cfg.questionDir}`);
    records.push({
      year: null,
      label: '',
      questionName: '',
      answerName: '',
      status: 'error',
      error: '题本目录不存在',
      questionCount: 0,
      withAnswer: 0,
      withExplanation: 0,
      imageQuestions: 0,
      errors: 1,
      warnings: 0,
      placeholders: [],
      placeholderCount: 0,
      issues: [{ level: 'ERROR', code: 'SOURCE_DIR_MISSING', num: 0, module: '', detail: cfg.questionDir }],
      issueCodes: { SOURCE_DIR_MISSING: 1 },
      questions: [],
    });
  } else {
    let pairs = pairDocs(cfg);
    if (ARGS.only) {
      const needle = ARGS.only.toLowerCase();
      pairs = pairs.filter(p => p.questionName.toLowerCase().includes(needle) || String(p.year).includes(needle));
    }
    if (ARGS.limit) pairs = pairs.slice(0, ARGS.limit);
    log(`  题本 ${pairs.length} 卷（答案文件 ${pairs.filter(p => p.answerFile).length} 份）`);
    const noAnswer = pairs.filter(p => !p.answerFile);
    if (noAnswer.length) {
      log(`  [提示] ${noAnswer.length} 卷未配对答案：${noAnswer.map(p => p.questionName).join('；')}`);
    }

    let i = 0;
    for (const pair of pairs) {
      i++;
      const record = await runPaper(cfg, pair);
      records.push(record);
      if (!ARGS.dryRun && !ARGS.noReports) {
        writeJson(path.join(cfg.reportDir, '_progress.json'), {
          province: cfg.province,
          done: i,
          total: pairs.length,
          last: record.questionName,
          updatedAt: stamp(),
        }, true);
      }
    }
  }

  const agg = aggregateProvince(cfg, records);
  const hasFatal = records.some(r => r.status === 'error' || r.status === 'empty');
  const status = agg.okPapers === 0 ? 'failed' : (hasFatal ? 'partial' : 'ok');

  if (!ARGS.dryRun) {
    if (ARGS.reportsOnly) {
      log(`  [reports-only] 保留现有分片，不重写 ${relPath(path.join(OUT_ROOT, cfg.province))}`);
    } else if (agg.questionsList.length) {
      const out = writeProvinceShards(cfg.province, cfg.slug, agg.questionsList);
      log(`  输出：${relPath(out.outDir)}（${agg.questionsList.length} 题，${out.files} 个分片）`);
    } else {
      log('  [警告] 无题目可输出，未创建分片');
    }
    if (!ARGS.noReports) {
      writeProvinceReports(cfg, records, agg, startedAt);
      log(`  报告：${relPath(cfg.reportDir)}`);
    }
  } else {
    log(`  [dry-run] 跳过写盘；统计：题数=${agg.questions} 答案=${agg.withAnswer} 解析=${agg.withExplanation} 占位=${agg.placeholders}`);
  }

  return { cfg, records, agg, status };
}


/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function runProbe() {
  log('===== 省考行测解析探针 =====');
  for (const cfg of PROVINCES) {
    const pairs = pairDocs(cfg);
    if (!pairs.length) {
      log(`${cfg.province}: 未找到题本`);
      continue;
    }
    const pair = pairs.find(p => p.answerFile) || pairs[0];
    const record = await runPaper(cfg, pair);
    log(`${cfg.province}: ${record.status} Q=${record.questionCount} 答案=${record.withAnswer} 解析=${record.withExplanation} 占位=${record.placeholderCount} 错误=${record.errors} 警告=${record.warnings}`);
    const modules = MODULE_ORDER
      .filter(m => record.moduleCounts[m])
      .map(m => `${m}:${record.moduleCounts[m]}`)
      .join(' ');
    log(`  模块：${modules || '无'}`);
    if (record.issues.length) {
      for (const it of record.issues.slice(0, 8)) {
        log(`  · ${it.level} ${it.code} Q${it.num ?? ''} ${compact(it.detail, 120)}`);
      }
    }
  }
}

async function main() {
  const startedAt = stamp();
  const t0 = Date.now();
  await loadBase();

  if (ARGS.probe) {
    await runProbe();
    return;
  }

  initLog();
  log('===== 省考行测夜间转换 =====');
  log(`开始：${startedAt}`);
  log(`参数：${JSON.stringify({ provinces: ARGS.provinces, limit: ARGS.limit, only: ARGS.only, dryRun: ARGS.dryRun })}`);

  const selected = PROVINCES.filter(cfg => !ARGS.provinces || ARGS.provinces.includes(cfg.province));
  if (!selected.length) {
    log(`[致命] 未匹配到省份：${ARGS.provinces.join('、')}`);
    process.exitCode = 1;
    closeLog();
    return;
  }

  const results = [];
  for (const cfg of selected) {
    try {
      results.push(await processProvince(cfg, startedAt));
    } catch (e) {
      log(`[致命] ${cfg.province} 处理异常：${e && e.stack ? e.stack : e}`);
      results.push({
        cfg,
        records: [],
        status: 'failed',
        agg: aggregateProvince(cfg, []),
      });
    }
  }

  if (!ARGS.dryRun && !ARGS.noReports && !ARGS.keepSummary) {
    const endedAt = stamp();
    writeSummary(results, startedAt, endedAt);
    log(`汇总：${relPath(SUMMARY_PATH)}`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalQ = results.reduce((sum, r) => sum + r.agg.questions, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.agg.errors, 0);
  log(`完成：${elapsed}s，共 ${totalQ} 题，ERROR=${totalErrors}`);
  log(`结束：${stamp()}`);
  closeLog();

  if (results.some(r => r.status === 'failed') || (ARGS.strict && totalErrors > 0)) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[致命] 未捕获异常：', err && err.stack ? err.stack : err);
    closeLog();
    process.exitCode = 1;
  });
}

module.exports = {
  PROVINCES,
  loadBase,
  pairDocs,
  loadDocText,
  normalizeAnswerText,
  normalizeProvinceQuestionText,
  parseAnswerDocument,
  parseSequentialBlocks,
  buildPaperQuestions,
  publicQuestion,
  writeProvinceShards,
  parsePaperLabel,
  labelText,
  labelSlug,
};
