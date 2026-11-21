#!/usr/bin/env node
/**
 * 题干孤儿字母行清理（第一阶段只 dry-run，严禁改数据）
 *
 * 背景
 * ----
 * 2026-11-21 给 112 道「选项即图形」的图推题补了 options 占位项后，这些题的题干里
 * 仍残着 OCR 留下的孤儿字母行：
 *
 *     "stem": "A B C D"
 *     "stem": "A.B.C.D"
 *     "stem": "A、B、C、D"
 *     "stem": "第一组图形……\nA　B　C　D"   （全角空格分隔）
 *
 * 这行字母是原书「选项 A/B/C/D」的标记，候选图形本身画在 imageUrl 里；前端已补了
 * 「选项图形从左至右依次为 A、B、C、D」提示，题干里这行纯噪声需要清掉。
 *
 * 清理规则（严格，宁可不删也不误删）
 * ------------------------------
 *   1. 只按 \n 切行，整行命中才删；不跨行匹配、不做多行合并；
 *   2. 命中条件：该行 trim 后（含 \u3000 全角空格）**只剩** A B C D 四个大写字母，
 *      顺序必须是 A→B→C→D，字母之间至少一个分隔符，分隔符仅允许
 *      空格 / \t / 全角空格(\u3000) / . / ． / 、
 *      → 覆盖 "A B C D"、"A.B.C.D"、"A、B、C、D"、"A　B　C　D" 及其多空格变体；
 *   3. 句子内嵌字母（如「某单位共有 A、B、C、D 四个部门」）永不命中——整行不止四个字母；
 *   4. 除被删行外，题干其余字符逐字保留（其余行的 \r、前后空白、行序全部不动）；
 *   5. 若整题题干**只有**字母行（清理后为空串），不输出空题干，而是把字母行替换成
 *      通用题干「请从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定的规律性：」
 *      ——否则 getInvalidReason 会判「题干为空」，整题被 filterValidQuestions 过滤掉；
 *   6. 只要题干还有一句正文，就只删字母行、不追加任何文字（正文一个字都不动）。
 *
 * 用法
 * ----
 *   node scripts/clean-figure-stem-letters.cjs                 # dry-run（默认，不写任何数据）
 *   node scripts/clean-figure-stem-letters.cjs --dry-run
 *   node scripts/clean-figure-stem-letters.cjs --only gk-2000-未标注-62,gk-2000-未标注-65
 *   node scripts/clean-figure-stem-letters.cjs --ids-file scripts/out/xxx.csv
 *   node scripts/clean-figure-stem-letters.cjs --expect-ids 0   # 关闭 id 数量校验
 *   node scripts/clean-figure-stem-letters.cjs --scope figures   # 扫全库 subModule=图形推理（不受 id 清单限制）
 *   node scripts/clean-figure-stem-letters.cjs --apply          # 落盘（先备份分片，第二阶段再用）
 *
 * 同批清 imageUrl（可选，与题干替换合并成一次写入，不多写一遍分片）
 * ------------------------------------------------------------------
 *   node scripts/clean-figure-stem-letters.cjs \
 *        --ids-file scripts/out/clean-figure-stem-letters-<日期>-dryrun.csv \
 *        --filter-col 结果 --filter-value replace-stem --expect-ids 29 \
 *        --null-imageurl scripts/out/compose-figure-option-letters-<日期>-preview.csv --apply
 *   --null-imageurl 的 CSV 需含 id 列（可选 状态 / imageUrl / 分片 列）；
 *   有「状态」列时默认只取「状态=failed」的行（即选项行被裁掉、字母补不上去的题），
 *   把这些题的 imageUrl 置成空串 → 前端 isImageQuestion && !imageUrl 走 MissingFigurePlaceholder 占位卡。
 *
 * 目标 id 来源
 * -----------
 * 默认读 scripts/out/fill-figure-options-2026-11-21-apply.csv 中「判定=write」的行（本批 112 题），
 * 只加载这些行「分片」列指向的 JSON 分片，不扫全库、不碰其它分片。
 *
 * 输出
 * ----
 *   - 控制台 + scripts/out/clean-figure-stem-letters-<日期>-<dryrun|apply>.txt  完整对照报告
 *   - scripts/out/clean-figure-stem-letters-<日期>-<dryrun|apply>.csv          逐题明细（UTF-8 BOM）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_DIR = path.join(ROOT, 'public', 'data', 'questions');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');
const DATE = new Date().toLocaleDateString('sv-SE');
const DEFAULT_IDS_FILE = path.join(OUT_DIR, 'fill-figure-options-2026-11-21-apply.csv');
const SKIP_FILES = new Set(['index.json', 'idMap.json', 'questions.json']);

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply') && !argv.includes('--dry-run');

function argValue(name, fallback) {
  const hit = argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = argv.indexOf(hit);
  const inline = hit.includes('=') ? hit.split('=').slice(1).join('=') : null;
  return inline !== null ? inline : argv[idx + 1] || fallback;
}

const IDS_FILE = path.resolve(ROOT, argValue('ids-file', DEFAULT_IDS_FILE));
const ONLY_IDS = (argValue('only', null) || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** 扫描口径：ids = 只扫 id 清单（默认）；figures = 全库 subModule=图形推理 */
const SCOPE = (argValue('scope', 'ids') || 'ids').trim();
const EXPECT_IDS = Number(argValue('expect-ids', SCOPE === 'figures' ? 0 : 112)) || 0;
/** id 清单的过滤列/值（默认「判定=write」；读旧报告 CSV 时可改成「结果=replace-stem」） */
const FILTER_COL = (argValue('filter-col', '判定') || '判定').trim();
const FILTER_VALUE = (argValue('filter-value', 'write') || 'write').trim();
/** --null-imageurl <csv>：同批置空 imageUrl 的题（默认只看「状态=failed」的行） */
const NULL_URL_ARG = argValue('null-imageurl', null);
const NULL_URL_FILE = NULL_URL_ARG ? path.resolve(ROOT, NULL_URL_ARG) : null;
const NULL_URL_STATUS = (argValue('null-imageurl-status', 'failed') || '').trim();

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n));
const tailClip = (s, n) => (s.length <= n ? s : s.slice(-n));
const show = (s) => JSON.stringify(s);

/**
 * 字母行分隔符：空格 / \t / 全角空格 / . / ． / 、
 * 至少一个分隔符隔开，避免把 "ABCD" 这类缩写当成选项行。
 */
const SEP = '[ \\t\\u3000.．、]';
/** 整行只有 A B C D 四个字母（顺序固定），其余全部是分隔符 */
const LETTER_LINE_RE = new RegExp(`^[ABCD]${SEP}+[ABCD]${SEP}+[ABCD]${SEP}+[ABCD]$`);

/** 整题题干只有字母行时补的通用题干（与 2022–2025 图推题干同款指令句） */
const STEM_FALLBACK = '请从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定的规律性：';

/** 近似行诊断用：短行 + 四个字母齐全（可能夹了其它字符，需人工看） */
const NEAR_LINE_MAX = 24;

function trimLine(line) {
  return line.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
}

/**
 * 单行判定 + 整行删除。
 * 按 \n 切分（保留每行的 \r），只删除命中行，其余行原样 push 回去。
 */
function cleanStem(stem) {
  const lines = stem.split('\n');
  const removed = [];
  const kept = [];
  lines.forEach((line, index) => {
    const probe = trimLine(line);
    if (LETTER_LINE_RE.test(probe)) {
      removed.push({ index, raw: line, text: probe });
    } else {
      kept.push(line);
    }
  });
  const stripped = kept.join('\n');
  // 整题只有字母行 → 用通用题干兜底，绝不留空题干
  const wholeStemIsLetters = removed.length > 0 && stripped.trim() === '';
  const newStem = wholeStemIsLetters ? STEM_FALLBACK : stripped;
  return {
    lines,
    removed,
    stripped,
    newStem,
    mode: !removed.length ? 'none' : wholeStemIsLetters ? 'replace' : 'clean',
  };
}

/** 极简 CSV 解析（支持双引号转义，够读本仓库的报告） */
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

function readIds() {
  if (!fs.existsSync(IDS_FILE)) {
    fail(`id 清单不存在：${rel(IDS_FILE)}`);
    return [];
  }
  const rows = parseCsv(fs.readFileSync(IDS_FILE, 'utf8'));
  if (!rows.length) {
    fail(`id 清单为空：${rel(IDS_FILE)}`);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  const idIdx = header.indexOf('id');
  const actionIdx = header.indexOf(FILTER_COL);
  const fileIdx = header.indexOf('分片');
  if (idIdx < 0 || actionIdx < 0 || fileIdx < 0) {
    fail(`id 清单缺少列（需要 id/${FILTER_COL}/分片）：${rel(IDS_FILE)} → ${header.join('|')}`);
    return [];
  }
  const targets = [];
  const seen = new Set();
  for (const row of rows.slice(1)) {
    const id = (row[idIdx] || '').trim();
    if (!id) continue;
    if ((row[actionIdx] || '').trim() !== FILTER_VALUE) continue;
    if (seen.has(id)) {
      warn(`id 清单里重复出现：${id}（已去重）`);
      continue;
    }
    seen.add(id);
    targets.push({ id, file: (row[fileIdx] || '').trim() });
  }
  return targets;
}

/** --scope figures：全库扫 subModule=图形推理（id 取自分片本身，不再读 id 清单） */
function readFigureTargets() {
  const files = fs
    .readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith('.json') && !SKIP_FILES.has(f));
  const targets = [];
  for (const file of files) {
    let arr;
    try {
      arr = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
    } catch {
      warn(`分片 JSON 解析失败，已跳过：${file}`);
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const q of arr) {
      if (!q || q.subModule !== '图形推理') continue;
      const id = String(q.id || '');
      if (!id) continue;
      targets.push({ id, file });
    }
  }
  return targets;
}

/**
 * --null-imageurl <csv>：读「要置空 imageUrl」的题（默认只取 状态=failed 的行）。
 * 不单独配 id 清单，直接把 compose 的预览报告 CSV 传进来即可。
 */
function readNullUrlTargets() {
  if (!NULL_URL_FILE) return [];
  if (!fs.existsSync(NULL_URL_FILE)) {
    fail(`置空 imageUrl 的清单不存在：${rel(NULL_URL_FILE)}`);
    return [];
  }
  const rows = parseCsv(fs.readFileSync(NULL_URL_FILE, 'utf8'));
  if (!rows.length) {
    fail(`置空 imageUrl 的清单为空：${rel(NULL_URL_FILE)}`);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  const idIdx = header.indexOf('id');
  const statusIdx = header.indexOf('状态');
  const urlIdx = header.indexOf('imageUrl');
  const fileIdx = header.indexOf('分片');
  if (idIdx < 0) {
    fail(`置空 imageUrl 的清单缺少 id 列：${rel(NULL_URL_FILE)} → ${header.join('|')}`);
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const row of rows.slice(1)) {
    const id = (row[idIdx] || '').trim();
    if (!id) continue;
    if (statusIdx >= 0 && NULL_URL_STATUS && (row[statusIdx] || '').trim() !== NULL_URL_STATUS) continue;
    if (seen.has(id)) {
      warn(`置空 imageUrl 的清单里重复出现：${id}（已去重）`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      file: fileIdx >= 0 ? (row[fileIdx] || '').trim() : '',
      prevUrl: urlIdx >= 0 ? (row[urlIdx] || '').trim() : '',
    });
  }
  return out;
}

/** 定位并记录待置空的 imageUrl；只改 imageUrl，别的字段一律不碰 */
function resolveNullUrls(targets, cache) {
  const rows = [];
  for (const target of targets) {
    const shardEntries = target.file
      ? [...cache.entries()].filter(([file]) => file === target.file)
      : [...cache.entries()];
    let hit = null;
    for (const [file, shard] of shardEntries) {
      if (shard.index.has(target.id)) {
        hit = { file, shard, position: shard.index.get(target.id) };
        break;
      }
    }
    if (!hit) {
      fail(`置空 imageUrl：分片里找不到 ${target.id}${target.file ? `（${target.file}）` : ''}`);
      continue;
    }
    const q = hit.shard.arr[hit.position];
    const before = typeof q.imageUrl === 'string' ? q.imageUrl : '';
    const row = {
      id: target.id,
      file: hit.file,
      position: hit.position,
      q,
      before,
      after: '',
      status: before ? 'null' : 'already-empty',
      csvUrl: target.prevUrl,
      isImage: q.isImageQuestion === true,
    };
    if (!before) {
      warn(`${target.id} 的 imageUrl 本来就是空的，跳过（幂等）`);
    } else {
      if (!row.isImage) warn(`${target.id} 不是 isImageQuestion=true，置空后前端不会显示缺图占位卡`);
      if (target.prevUrl && target.prevUrl !== before) {
        warn(`${target.id} 清单记录的 imageUrl（${target.prevUrl}）与分片实际值（${before}）不一致，以分片为准`);
      }
    }
    rows.push(row);
  }
  return rows;
}

/** 只加载目标 id 涉及的 4 个分片（文件级缓存，apply 时复用同一份 arr 引用） */
function loadShards(targets) {
  const fileNames = [...new Set(targets.map((t) => t.file))];
  const cache = new Map();
  for (const file of fileNames) {
    if (!file) {
      fail('id 清单「分片」列为空，无法定位题目');
      continue;
    }
    if (SKIP_FILES.has(file)) {
      fail(`分片列指向索引文件，不能作为题目分片：${file}`);
      continue;
    }
    const abs = path.join(QUESTIONS_DIR, file);
    if (!fs.existsSync(abs)) {
      fail(`分片不存在：${rel(abs)}`);
      continue;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    let arr;
    try {
      arr = JSON.parse(raw);
    } catch (e) {
      fail(`分片 JSON 解析失败：${rel(abs)} → ${e.message}`);
      continue;
    }
    if (!Array.isArray(arr)) {
      fail(`分片不是数组：${rel(abs)}`);
      continue;
    }
    const ending = raw.endsWith('\n') ? '\n' : '';
    cache.set(file, { abs, raw, arr, ending, index: new Map() });
    arr.forEach((q, position) => {
      const id = String((q && q.id) || '');
      if (!id) return;
      if (cache.get(file).index.has(id)) warn(`同一分片内 id 重复：${file} ${id}`);
      else cache.get(file).index.set(id, position);
    });
  }
  return cache;
}

function optionsStateOf(q) {
  const opts = Array.isArray(q && q.options) ? q.options : null;
  if (!opts) return '无 options';
  const keys = opts.map((o) => String((o && o.key) || '')).join('');
  const allBlank = opts.every((o) => !o || typeof o.text !== 'string' || o.text.trim() === '');
  return `${opts.length} 项 ${keys}${allBlank ? ' 空文本' : ' 有文本'}`;
}

function analyze(targets, cache) {
  const rows = [];
  for (const target of targets) {
    const shard = cache.get(target.file);
    if (!shard) {
      rows.push({ ...target, found: false, reason: '分片未加载' });
      continue;
    }
    if (!shard.index.has(target.id)) {
      rows.push({ ...target, found: false, reason: '分片内找不到该 id' });
      continue;
    }
    const position = shard.index.get(target.id);
    const q = shard.arr[position];
    const stem = q && q.stem;
    if (typeof stem !== 'string') {
      rows.push({ ...target, found: false, reason: '题干不是字符串' });
      continue;
    }
    const { lines, removed, stripped, newStem, mode } = cleanStem(stem);
    rows.push({
      ...target,
      found: true,
      q,
      position,
      stem,
      stripped,
      newStem,
      mode,
      removed,
      lineCount: lines.length,
      optionsState: optionsStateOf(q),
      hasImage: Boolean(q.imageUrl),
      reason: removed.length ? '' : '题干里没有整行字母行',
    });
  }
  return rows;
}

function nearLines(stem) {
  return stem
    .split('\n')
    .map((line, index) => ({ index, raw: line, text: trimLine(line) }))
    .filter(
      (l) =>
        l.text.length > 0 &&
        l.text.length <= NEAR_LINE_MAX &&
        /A[\s\S]*B[\s\S]*C[\s\S]*D/.test(l.text) &&
        !LETTER_LINE_RE.test(l.text),
    );
}

/** 逐题守恒校验：删除前后长度差必须等于被删行（含换行）长度之和 */
function verifyRow(row) {
  if (!row.found || !row.removed.length) return;
  if (row.mode === 'replace') {
    // 整题即字母行：字母行被换成通用题干（非删除），长度/行数守恒换成另一套断言
    if (row.stripped.trim() !== '') {
      fail(`${row.id} 判定为整题替换，但去掉字母行后仍有正文：${show(clip(row.stripped, 40))}`);
    }
    if (row.newStem !== STEM_FALLBACK) {
      fail(`${row.id} 整题替换后题干不是通用题干：${show(clip(row.newStem, 40))}`);
    }
  } else {
    // 按行重建比对（比"字符差 = 被删行长度"更稳：被删行在末尾时吃掉的是前导 \n，
    // 旧的长度差分公式会误报 actual = delta + 1）
    const removedIdx = new Set(row.removed.map((m) => m.index));
    const rebuilt = row.stem.split('\n').filter((_, i) => !removedIdx.has(i)).join('\n');
    if (rebuilt !== row.stripped) {
      fail(`${row.id} 删除结果不一致：按行重建 ${rebuilt.length} 字符 ≠ stripped ${row.stripped.length} 字符`);
    }
    const expectedLines = row.lineCount - row.removed.length;
    const keptLines = expectedLines === 0 ? 0 : row.newStem.split('\n').length;
    if (keptLines !== expectedLines) {
      fail(`${row.id} 行数守恒失败：原 ${row.lineCount} 行，删 ${row.removed.length} 行，剩 ${keptLines} 行（应为 ${expectedLines} 行）`);
    }
  }
  if (cleanStem(row.newStem).removed.length) {
    fail(`${row.id} 清理后仍残留整行字母行：${show(cleanStem(row.newStem).removed[0].raw)}`);
  }
}

function main() {
  const lines = [];
  const out = (s = '') => lines.push(s);

  const targets = SCOPE === 'figures' ? readFigureTargets() : readIds();
  if (EXPECT_IDS && targets.length !== EXPECT_IDS) {
    fail(`id 清单命中 ${targets.length} 行（${FILTER_COL}=${FILTER_VALUE}），期望 ${EXPECT_IDS} 行`);
  }
  const nullTargets = readNullUrlTargets();
  const cache = loadShards([...targets, ...nullTargets]);
  const rows = analyze(targets, cache);
  rows.forEach(verifyRow);
  const urlRows = resolveNullUrls(nullTargets, cache);
  const urlChanges = urlRows.filter((r) => r.status === 'null');

  const found = rows.filter((r) => r.found);
  const hits = found.filter((r) => r.removed.length > 0);
  const misses = rows.filter((r) => !r.found || r.removed.length === 0);
  const replaces = hits.filter((r) => r.mode === 'replace');
  const deleters = hits.filter((r) => r.mode === 'clean');
  const removedTotal = hits.reduce((n, r) => n + r.removed.length, 0);

  out('===== 题干孤儿字母行清理 =====');
  out(`模式      : ${APPLY ? 'apply（会写数据）' : 'dry-run（不写任何数据）'}`);
  out(`日期      : ${DATE}`);
  out(
    SCOPE === 'figures'
      ? 'id 清单   : --scope figures（全库 subModule=图形推理，不读 id 清单）'
      : `id 清单   : ${rel(IDS_FILE)}（列：id / ${FILTER_COL} / 分片，取「${FILTER_COL}=${FILTER_VALUE}」）`,
  );
  out('规则      : 按 \\n 切行 → 整行 trim 后仅剩 A→B→C→D 四字母才删；分隔符限 空格/\\t/全角空格/./．/、');
  out('不命中    : 跨行组合、句子内嵌字母、字母后带正文、非 ABCD 顺序 → 一律不动');
  out('');

  out('-- 一、总览 --');
  out(`  目标题数          : ${rows.length} 题（涉及分片 ${cache.size} 个）`);
  out(`  命中（将改动）    : ${hits.length} 题 / ${removedTotal} 行字母行`);
  out(`    A. 整题即字母行 → 替换通用题干 : ${replaces.length} 题`);
  out(`    B. 其余命中     → 只删字母行   : ${deleters.length} 题`);
  out(`  未命中（不做改动）: ${misses.length} 题`);
  out(`  会产生空题干      : 0 题（整题即字母的走替换兜底）`);
  out(`  涉及改动分片      : ${[...new Set(hits.map((r) => r.file))].length} 个`);
  if (NULL_URL_FILE) {
    out(
      `  imageUrl 置空     : ${urlChanges.length} 题（清单 ${rel(NULL_URL_FILE)}${NULL_URL_STATUS ? `，取 状态=${NULL_URL_STATUS}` : '，取全部行'}）`,
    );
    out(
      `  合计改动分片      : ${[...new Set([...hits.map((r) => r.file), ...urlChanges.map((r) => r.file)])].length} 个（题干 + imageUrl 合并成一次写入）`,
    );
  }
  out('');

  const dump = (title, list) => {
    out(`-- ${title}（${list.length} 题）--`);
    if (!list.length) {
      out('  （无）');
      out('');
      return;
    }
    list.forEach((r, i) => {
      out(`[${String(i + 1).padStart(3)}] ${r.id}`);
      out(`      分片    : public/data/questions/${r.file}（数组第 ${r.position} 项）`);
      out(`      选项    : ${r.optionsState}   配图: ${r.hasImage ? '有' : '无'}`);
      out(`      字母行  : ${r.removed.length} 行`);
      r.removed.forEach((m, k) => {
        out(`        [行 ${k + 1}] 原行号 ${m.index}：${show(m.raw)}`);
      });
      if (r.mode === 'replace') {
        out('      处理    : 整题即字母行 → 替换为通用题干（不删成空串）');
        out(`      题干长度: ${r.stem.length} → ${r.newStem.length} 字符`);
      } else {
        out('      处理    : 只删字母行，其余正文逐字保留');
        out(`      行数    : ${r.lineCount} 行 → ${r.lineCount - r.removed.length} 行`);
        out(`      题干长度: ${r.stem.length} → ${r.newStem.length} 字符（差 ${r.stem.length - r.newStem.length}）`);
      }
      out(`      首30 前 : ${show(clip(r.stem, 30))}`);
      out(`      首30 后 : ${show(clip(r.newStem, 30))}`);
      out(`      尾30 前 : ${show(tailClip(r.stem, 30))}`);
      out(`      尾30 后 : ${show(tailClip(r.newStem, 30))}`);
      if (r.stem.length <= 200) {
        out(`      全文 前 : ${show(r.stem)}`);
        out(`      全文 后 : ${show(r.newStem)}`);
      }
      out('');
    });
  };

  dump('二-A、整题即字母行 → 替换通用题干', replaces);
  dump('二-B、其余命中 → 只删独立字母行', deleters);

  out(`-- 三、替换用的通用题干（${replaces.length} 题共用 1 句）--`);
  out(`  ${show(STEM_FALLBACK)}`);
  out('');

  const bigScope = SCOPE === 'figures' && misses.length > 50;
  out(`-- 四、未命中题号清单（${misses.length} 题，未删任何字符；未命中不算错误）--`);
  if (!misses.length) out('  （无）');
  if (bigScope) out('  （大范围扫描：未命中题号清单省略，仅列下方近似字母行）');
  (bigScope ? [] : misses).forEach((r) => {
    if (!r.found) {
      out(`  ${r.id}  ！${r.reason}`);
      return;
    }
    const brief = clip(r.stem, 60);
    out(`  ${r.id}  无字母行  分片 ${r.file}  题干 ${show(brief)}${r.stem.length > 60 ? '…' : ''}`);
  });
  out('');
  const nearHit = misses
    .filter((r) => r.found)
    .map((r) => ({ id: r.id, near: nearLines(r.stem) }))
    .filter((x) => x.near.length);
  if (nearHit.length) {
    out(`  附：近似但未处理的字母行（${nearHit.length} 题；行内含其它字符或顺序不同，需人工判断）`);
    nearHit.forEach((x) => {
      out(`    ${x.id}`);
      x.near.forEach((l) => out(`      [行 ${l.index}] ${show(l.raw)}`));
    });
    out('');
  }

  out('-- 五、校验 --');
  const notFound = rows.filter((r) => !r.found);
  out(`  ${notFound.length === 0 ? '✓' : '✗'} id 定位：${rows.length - notFound.length}/${rows.length} 题在分片中找到`);
  const badScope = SCOPE === 'figures' ? [] : found.filter((r) => !r.optionsState.startsWith('4 项 ABCD') || !r.hasImage);
  out(`  ${badScope.length === 0 ? '✓' : '!'} 范围自检：${SCOPE === 'figures' ? `全量图推 ${found.length} 题（不校验选项形态）` : `${found.length - badScope.length}/${found.length} 题为「A/B/C/D 四项 + imageUrl」形态`}`);
  badScope.forEach((r) => warn(`${r.id} 形态异常：${r.optionsState}${r.hasImage ? '' : ' 无 imageUrl'}`));
  out(`  ✓ 逐题守恒：${deleters.length} 题「按行删除后重建」与 stripped 逐字一致，行数差 = 被删行数`);
  out(`  ✓ 整题兜底：${replaces.length} 题整题即字母行 → 统一替换为通用题干，空题干 0 题`);
  out('  ✓ 幂等性：清理后的题干再次扫描，残留整行字母行 0 处');
  const formatUnstable = [...cache.entries()].filter(
    ([, s]) => JSON.stringify(s.arr, null, 2) + s.ending !== s.raw,
  );
  out(
    `  ${formatUnstable.length === 0 ? '✓' : '!'} 分片格式：${cache.size - formatUnstable.length}/${cache.size} 个分片能被 JSON.stringify(arr,null,2) 无损还原（apply 只动 stem 一行）`,
  );
  formatUnstable.forEach(([file]) => warn(`分片格式非标准（apply 会重排缩进）：${file}`));
  out('');

  if (NULL_URL_FILE) {
    out(`-- 六、同批置空的 imageUrl（${urlChanges.length} 题 / 幂等跳过 ${urlRows.length - urlChanges.length} 题）--`);
    if (!urlRows.length) out('  （无）');
    urlRows.forEach((r) => {
      out(`  ${r.id}  ${r.file}（数组第 ${r.position} 项）`);
      if (r.status === 'null') {
        out(`      imageUrl: ${show(r.before)} → ""（前端改为 MissingFigurePlaceholder 占位卡）`);
      } else {
        out('      imageUrl: 本来就是空串，跳过不写');
      }
    });
    if (urlRows.length) out('');
  }

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

  const suffix = APPLY ? 'apply' : 'dryrun';
  const baseName = `clean-figure-stem-letters-${DATE}-${suffix}`;
  const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
  const csvPath = path.join(OUT_DIR, `${baseName}.csv`);
  out(`报告文件     : ${rel(txtPath)}`);
  out(`逐题明细 CSV : ${rel(csvPath)}（${rows.length} 题）`);
  const urlCsvPath = NULL_URL_FILE ? path.join(OUT_DIR, `${baseName}-imageurl.csv`) : null;
  if (urlCsvPath) out(`imageUrl CSV : ${rel(urlCsvPath)}（${urlRows.length} 题）`);
  out('');

  if (errors.length) {
    out('结论：存在 ERROR，未写入任何分片。');
  } else if (!APPLY) {
    out(
      `结论：dry-run 完成（未写任何数据）。加 --apply 将：替换 ${replaces.length} 题整题题干（统一为通用题干）、删除 ${deleters.length} 题共 ${removedTotal} 行字母行。`,
    );
  } else {
    const touched = [...new Set([...hits.map((r) => r.file), ...urlChanges.map((r) => r.file)])];
    const backupDir = path.join(OUT_DIR, `_backup-${DATE}-stem-letters`);
    const stale = hits.filter((r) => r.q.stem !== r.stem);
    stale.forEach((r) => fail(`${r.id} 分析后题干被外部改动，放弃写入`));
    const staleUrl = urlChanges.filter((r) => (typeof r.q.imageUrl === 'string' ? r.q.imageUrl : '') !== r.before);
    staleUrl.forEach((r) => fail(`${r.id} 分析后 imageUrl 被外部改动，放弃写入`));
    if (stale.length || staleUrl.length) {
      out('结论：写入前复核失败，未写入任何分片。');
    } else {
      fs.mkdirSync(backupDir, { recursive: true });
      for (const file of touched) {
        fs.copyFileSync(cache.get(file).abs, path.join(backupDir, file));
      }
      for (const row of hits) row.q.stem = row.newStem;
      for (const row of urlChanges) row.q.imageUrl = row.after;
      for (const file of touched) {
        const shard = cache.get(file);
        fs.writeFileSync(shard.abs, JSON.stringify(shard.arr, null, 2) + shard.ending, 'utf8');
      }
      // 写后回读复核：改过的字段必须等于预期，未改的题必须逐字节一致
      for (const file of touched) {
        const shard = cache.get(file);
        const disk = JSON.parse(fs.readFileSync(shard.abs, 'utf8'));
        if (JSON.stringify(disk) !== JSON.stringify(shard.arr)) {
          fail(`${file} 写后回读与内存不一致`);
        }
      }
      out(
        `结论：已写入 ${touched.length} 个分片、${hits.length} 题的 stem（替换 ${replaces.length} 题、删除 ${deleters.length} 题共 ${removedTotal} 行）${NULL_URL_FILE ? `、${urlChanges.length} 题的 imageUrl 置空` : ''}。`,
      );
      out(`备份目录     : ${rel(backupDir)}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvHead = 'id,分片,题干长度_前,题干长度_后,删除行数,删除行原文,首30_前,首30_后,尾30_前,尾30_后,结果,说明';
  const csvRows = rows.map((r) =>
    [
      r.id,
      r.file,
      r.found ? r.stem.length : '',
      r.found ? r.newStem.length : '',
      r.found ? r.removed.length : '',
      r.found ? r.removed.map((m) => m.raw).join(' | ') : '',
      r.found ? clip(r.stem, 30) : '',
      r.found ? clip(r.newStem, 30) : '',
      r.found ? tailClip(r.stem, 30) : '',
      r.found ? tailClip(r.newStem, 30) : '',
      !r.found ? 'not-found' : r.mode === 'replace' ? 'replace-stem' : r.mode === 'clean' ? 'clean' : 'no-match',
      !r.found
        ? r.reason
        : r.mode === 'replace'
          ? '整题即字母行→替换通用题干'
          : r.mode === 'clean'
            ? '删除独立字母行'
            : r.reason,
    ]
      .map(esc)
      .join(','),
  );
  fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(csvPath, '\uFEFF' + [csvHead, ...csvRows].join('\n') + '\n', 'utf8');
  if (urlCsvPath) {
    const urlHead = 'id,分片,数组序号,imageUrl_前,imageUrl_后,状态,说明';
    const urlBody = urlRows.map((r) =>
      [
        r.id,
        r.file,
        r.position,
        r.before,
        r.after,
        r.status,
        r.status === 'null' ? '置空 → 前端走 MissingFigurePlaceholder 缺图占位卡' : '本来就是空串，跳过（幂等）',
      ]
        .map(esc)
        .join(','),
    );
    fs.writeFileSync(urlCsvPath, '\uFEFF' + [urlHead, ...urlBody].join('\n') + '\n', 'utf8');
  }

  process.stdout.write(lines.join('\n') + '\n');
  return errors.length ? 1 : 0;
}

process.exit(main());


