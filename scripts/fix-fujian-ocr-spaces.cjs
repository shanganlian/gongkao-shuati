#!/usr/bin/env node
/**
 * fix-fujian-ocr-spaces.cjs —— 福建 v2 文本层 OCR 空格清洗 + keyPoints 自动残句清理
 *
 * 背景：福建 v2 继承 PDF 文本层，选项/解析里残留两类问题：
 *   1) 排版空格：`说： “……”`、`“轻 ”`、`A 项`、`藏历 6 月`、`台湾 和广东地区`；
 *   2) keyPoints 被写成解析尾句：`故正确答案为 C`、`本题相关知识点：`。
 *
 * 范围：只改 public/data/questions-v2-provincial/福建/ 的 16 个分片与 questions.json；
 *       不改 stem / title / answer / module / ID，也不动线上 public/data/questions/。
 *
 * 用法：
 *   node scripts/fix-fujian-ocr-spaces.cjs            # dry-run（默认，只写报告）
 *   node scripts/fix-fujian-ocr-spaces.cjs --apply    # 备份后写入
 *
 * apply 强制断言（任一失败即中止，不写任何文件）：
 *   - options[].text / explanation 去掉空白后与改前完全一致（只删空格，不改字）；
 *   - keyPoints 只允许删模板残句，或替换为解析首句的子串；
 *   - 2,564 题 / 2,564 唯一 ID，分片与 questions.json 的 ID 顺序一致。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', '福建');
const REPORT_MD = path.join(ROOT, 'guokao-reports', 'fujian-v2-空格清洗.md');
const REPORT_CSV = path.join(ROOT, 'guokao-reports', 'fujian-v2-空格清洗对照.csv');
const APPLY = process.argv.includes('--apply');
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);
const EXPECTED_TOTAL = 2564;

/** 汉字区间：只用于“汉字—空白—汉字/字母数字”的局部规则 */
const CJK = '\u4e00-\u9fa5';
const RE_CJK_CJK = new RegExp(`[${CJK}]\\s+[${CJK}]`, 'g');
const RE_STRIP_CJK_CJK = new RegExp(`([${CJK}])\\s+([${CJK}])`, 'g');
const RE_LATIN_CJK = new RegExp(`([A-Za-z0-9])\\s+([${CJK}])`, 'g');
const RE_CJK_LATIN = new RegExp(`([${CJK}])\\s+([A-Za-z0-9])`, 'g');

/** 自动生成的 keyPoints 模板残句（“本题考查…”属题型标签，保留不动） */
const KP_JUNK = /^(故正确答案为|故答案为|正确答案为|正确答案是|本题正确答案|答案为|答案[:：]|故本题选[ABCD]|本题选[ABCD]|故选[ABCD]|本题为选非题|本题选非题|本题相关知识点[:：]?$)/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listShards() {
  return fs
    .readdirSync(DIR)
    .filter(f => f.endsWith('.json') && !SPECIAL.has(f))
    .sort();
}

function stripSpaces(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '');
}

/**
 * 清洗单行。表格行（以 | 开头或含制表符）只做标点/引号级清洗，
 * 避免破坏表格列对齐与单元格间距。
 */
function cleanLine(line) {
  let s = line;
  const table = /^\s*\|/.test(s) || s.includes('\t');

  // 1. 冒号/逗号/顿号/句末标点后接引号：`说： “` → `说：“`
  s = s.replace(/([：:，,、；;。！？])\s+([“”"‘’'])/g, '$1$2');
  // 2. 左引号后、右引号前/后的空格：`“轻 ”` → `“轻”`；`” 的` → `”的`
  s = s.replace(/([“"‘'])\s+/g, '$1');
  s = s.replace(/\s+([”"’'])/g, '$1');
  s = s.replace(/([”’])\s+/g, '$1');
  s = s.replace(new RegExp(`([${CJK}])\\s+([“‘])`, 'g'), '$1$2');
  // 3. 全角标点/括号两侧空格：`茶艺、 昆曲` / `， 日偏食` / `（ 1 ）`
  s = s.replace(/\s+([，。；：！？、（）【】《》—…])/g, '$1');
  s = s.replace(/([，。；：！？、（）【】《》—…])\s+/g, '$1');
  // 4. 字母/数字与汉字之间的排版空格：`A 项` / `藏历 6 月` / `GDP 的`
  s = s.replace(RE_LATIN_CJK, '$1$2');
  s = s.replace(RE_CJK_LATIN, '$1$2');

  // 5. 汉字之间的空格：列表行保留，其余按断行残留删除
  if (!table) {
    const hits = s.match(RE_CJK_CJK) || [];
    if (hits.length) {
      const tokens = s.trim().split(/\s+/).filter(Boolean);
      const isList =
        hits.length >= 2 && tokens.length >= 3 && tokens.every(t => t.length <= 8);
      if (!isList) {
        let prev;
        do {
          prev = s;
          s = s.replace(RE_STRIP_CJK_CJK, '$1$2');
        } while (s !== prev);
      }
    }
    // 6. 连续空格压成一个（不合并换行）
    s = s.replace(/[ \t]{2,}/g, ' ');
  }
  return s.trim();
}

/** 逐行清洗，保留原有换行结构 */
function cleanText(text) {
  if (typeof text !== 'string' || text === '') return text;
  return text.split('\n').map(cleanLine).join('\n');
}

/**
 * 从解析首句提取一个可用考点；取不到则返回空串（宁可置空，不写错）。
 * 首句为选项分析（A项…）、模板句（故/本题/答案…）、占位图或过长时一律放弃。
 */
function firstClause(explanation) {
  const cleaned = cleanText(explanation);
  if (!cleaned) return '';
  const line =
    cleaned
      .split('\n')
      .map(s => s.trim())
      .find(s => s && !/^\[\[IMG\]\]$/.test(s)) || '';
  if (!line) return '';
  const body = line.replace(/^(【解析】|解析[:：])\s*/, '');
  const m = body.match(/^[^。！？；]+/);
  const clause = (m ? m[0] : body).trim().replace(/[。！？；，、：]+$/, '').trim();
  if (!clause) return '';
  if (/^[A-F]\s*[项选]/.test(clause) || /^[A-F][.．、]/.test(clause)) return '';
  if (/^(故|因此|所以|综上|本题|答案|正确答案|解析)/.test(clause)) return '';
  if (clause.length < 8 || clause.length > 60) return '';
  return clause;
}


/* ------------------------------------------------------------------ */
/* 单题转换                                                            */
/* ------------------------------------------------------------------ */

/**
 * @returns {{changes: Array, kpJunk: number, kpFilled: boolean, kpCleared: boolean}}
 */
function transformQuestion(q) {
  const changes = [];
  let kpJunk = 0;
  let kpFilled = false;
  let kpCleared = false;
  let kpRemoved = [];

  const opts = Array.isArray(q.options) ? q.options : [];
  for (const opt of opts) {
    if (typeof opt?.text !== 'string') continue;
    const before = opt.text;
    const after = cleanText(before);
    if (after !== before) {
      opt.text = after;
      changes.push({
        id: q.id,
        type: 'option',
        field: `option.${opt.key ?? '?'}`,
        before,
        after,
        reason: 'space',
      });
    }
  }

  if (typeof q.explanation === 'string' && q.explanation !== '') {
    const before = q.explanation;
    const after = cleanText(before);
    if (after !== before) {
      q.explanation = after;
      changes.push({
        id: q.id,
        type: 'explanation',
        field: 'explanation',
        before,
        after,
        reason: 'space',
      });
    }
  }

  if (Array.isArray(q.keyPoints)) {
    const kpRaw = q.keyPoints.map(x => String(x));
    const kpCleaned = kpRaw.map(k => cleanText(k).trim()).filter(Boolean);
    const kept = kpCleaned.filter(k => !KP_JUNK.test(k));
    kpJunk = kpCleaned.length - kept.length;
    kpRemoved = kpCleaned.filter(k => KP_JUNK.test(k));

    let kpAfter = kept;
    if (kept.length === 0 && kpRaw.length > 0) {
      const clause = firstClause(q.explanation);
      if (clause) {
        kpAfter = [clause];
        kpFilled = true;
      } else {
        kpAfter = [];
        kpCleared = true;
      }
    }

    if (JSON.stringify(kpAfter) !== JSON.stringify(kpRaw)) {
      q.keyPoints = kpAfter;
      changes.push({
        id: q.id,
        type: 'keyPoints',
        field: 'keyPoints',
        before: kpRaw,
        after: kpAfter,
        reason: kpFilled
          ? 'keypoint-from-first-sentence'
          : kpCleared
            ? 'keypoint-cleared'
            : kpJunk > 0
              ? 'keypoint-junk-removed'
              : 'keypoint-space',
      });
    }
  }

  return { changes, kpJunk, kpFilled, kpCleared, kpRemoved };
}

/** apply 前的一致性断言：只删空白；keyPoints 只删残句或换成解析子串 */
function assertSafeChange(q, res) {
  const problems = [];
  for (const c of res.changes) {
    if (!c.id) problems.push('存在空 ID 的变更');
    if (c.type === 'option' || c.type === 'explanation') {
      if (stripSpaces(c.before) !== stripSpaces(c.after)) {
        problems.push(`${c.id} ${c.field} 去空白后文本不一致`);
      }
    }
    if (c.type === 'keyPoints') {
      const cleanedBefore = c.before.map(k => cleanText(k).trim());
      const explanation = stripSpaces(cleanText(q.explanation || ''));
      for (const k of c.after) {
        const fromBefore = cleanedBefore.includes(k);
        const fromExplanation = explanation.includes(stripSpaces(k));
        if (!fromBefore && !fromExplanation) {
          problems.push(`${c.id} keyPoints 新值不在解析中：${JSON.stringify(k)}`);
        }
      }
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 统计与报告                                                          */
/* ------------------------------------------------------------------ */

function num(n) {
  return Number(n).toLocaleString('en-US');
}

function pct(part, whole) {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** 清洗后仍会保留的“列表空格”等模式，用于报告残留量（只统计行内空白，不把换行当空格） */
const RESIDUAL = [
  ['colon-quote', /[：:，,、；;。！？][^\S\n]+[“”"‘’']/],
  ['quote-trail', /[^\S\n]+[”"’']/],
  ['cjk-cjk', new RegExp(`[${CJK}][^\\S\\n]+[${CJK}]`)],
  ['latin-cjk', new RegExp(`[A-Za-z0-9][^\\S\\n]+[${CJK}]|[${CJK}][^\\S\\n]+[A-Za-z0-9]`)],
  ['punct-space', /[^\S\n]+[，。；：！？、（）【】《》—…]|[，。；：！？、（）【】《》—…][^\S\n]+/],
  ['multi-space', /[ \t]{2,}/],
];

function scanResidual(records) {
  const out = { records: 0, fields: 0, byPattern: {}, samples: {} };
  for (const [name] of RESIDUAL) {
    out.byPattern[name] = 0;
    out.samples[name] = [];
  }
  for (const q of records) {
    const fields = [];
    for (const o of Array.isArray(q.options) ? q.options : []) fields.push(String(o?.text || ''));
    fields.push(String(q.explanation || ''));
    for (const k of Array.isArray(q.keyPoints) ? q.keyPoints : []) fields.push(String(k));
    let hit = false;
    for (const text of fields) {
      for (const [name, re] of RESIDUAL) {
        const m = text.match(new RegExp(re.source, 'g'));
        if (m) {
          out.byPattern[name] += m.length;
          out.fields += m.length;
          hit = true;
          if (out.samples[name].length < 5) {
            out.samples[name].push({ id: q.id, text: text.slice(0, 120) });
          }
        }
      }
    }
    if (hit) out.records += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main() {
  const files = listShards();
  if (files.length !== 16) throw new Error(`分片数=${files.length}（期望 16）`);

  const shardData = files.map(file => ({ file, rows: readJson(path.join(DIR, file)) }));
  const flat = [];
  for (const s of shardData) {
    if (!Array.isArray(s.rows)) throw new Error(`${s.file} 不是题目数组`);
    for (const q of s.rows) flat.push(q);
  }
  const ids = new Set(flat.map(q => q.id));
  if (flat.length !== EXPECTED_TOTAL || ids.size !== EXPECTED_TOTAL) {
    throw new Error(
      `分片题数=${flat.length} / 唯一 ID=${ids.size}（期望 ${EXPECTED_TOTAL}）`
    );
  }

  const agg = readJson(path.join(DIR, 'questions.json'));
  if (!Array.isArray(agg) || agg.length !== flat.length) {
    throw new Error(`questions.json 题数=${agg?.length}（期望 ${flat.length}）`);
  }
  const shardSeq = flat.map(q => q.id).join('\u0000');
  const aggSeq = agg.map(q => q.id).join('\u0000');
  if (shardSeq !== aggSeq) throw new Error('questions.json 与分片的 ID 顺序不一致');

  const originals = new Map();
  for (const q of flat) originals.set(q.id, JSON.stringify(q));

  const allChanges = [];
  const stats = {
    total: flat.length,
    changedRecords: 0,
    optionFields: 0,
    optionRecords: 0,
    explanationFields: 0,
    explanationRecords: 0,
    kpRecords: 0,
    kpJunk: 0,
    kpFilled: 0,
    kpCleared: 0,
    kpEmptyBefore: 0,
    kpEmptyAfter: 0,
  };
  const changedIds = new Set();
  const problems = [];
  const junkItems = new Map();
  const targetBefore = JSON.parse(JSON.stringify(flat.find(q => q.id === 'prov-fujian-2011-917联考-11') || null));

  for (const q of flat) {
    if (Array.isArray(q.keyPoints) && q.keyPoints.length === 0) stats.kpEmptyBefore += 1;
    const res = transformQuestion(q);
    if (res.changes.length) {
      stats.changedRecords += 1;
      changedIds.add(q.id);
      allChanges.push(...res.changes);
      problems.push(...assertSafeChange(q, res));
    }
    stats.kpJunk += res.kpJunk;
    for (const k of res.kpRemoved) junkItems.set(k, (junkItems.get(k) || 0) + 1);
    if (res.kpFilled) stats.kpFilled += 1;
    if (res.kpCleared) stats.kpCleared += 1;
    if (Array.isArray(q.keyPoints) && q.keyPoints.length === 0) stats.kpEmptyAfter += 1;
    for (const c of res.changes) {
      if (c.type === 'option') stats.optionFields += 1;
      if (c.type === 'explanation') stats.explanationFields += 1;
      if (c.type === 'keyPoints') stats.kpRecords += 1;
    }
  }
  stats.optionRecords = new Set(allChanges.filter(x => x.type === 'option').map(x => x.id)).size;
  stats.explanationRecords = new Set(allChanges.filter(x => x.type === 'explanation').map(x => x.id)).size;

  // questions.json 与分片逐条比对后，用同一批 patched 对象重建，保证两者完全一致
  const patchedById = new Map(flat.map(q => [q.id, q]));
  const aggAfter = agg.map(rec => {
    const original = originals.get(rec.id);
    if (!original) throw new Error(`questions.json 存在分片中没有的 ID：${rec.id}`);
    if (JSON.stringify(rec) !== original) {
      throw new Error(`questions.json 记录 ${rec.id} 与分片内容不一致，拒绝继续`);
    }
    return patchedById.get(rec.id);
  });
  if (aggAfter.length !== flat.length) throw new Error('重建 questions.json 题数不一致');
  if (aggAfter.map(q => q.id).join('\u0000') !== shardSeq) {
    throw new Error('重建 questions.json 的 ID 顺序发生变化');
  }

  const originalRecords = [...originals.values()].map(text => JSON.parse(text));
  const residualBefore = scanResidual(originalRecords);
  const residualAfter = scanResidual(flat);

  const targetAfter = flat.find(q => q.id === 'prov-fujian-2011-917联考-11') || null;
  const samples = [];
  for (const id of changedIds) {
    if (samples.length >= 10) break;
    if (id === 'prov-fujian-2011-917联考-11') continue;
    const changes = allChanges.filter(c => c.id === id);
    if (changes.length) samples.push({ id, changes });
  }

  let backupRel = '—';
  const filledSamples = allChanges
    .filter(c => c.reason === 'keypoint-from-first-sentence')
    .slice(0, 10)
    .map(c => ({ id: c.id, value: c.after[0] }));
  const clearedSamples = allChanges
    .filter(c => c.reason === 'keypoint-cleared')
    .slice(0, 5)
    .map(c => ({ id: c.id, before: c.before.join(' | ') }));
  let final = { applied: false, ok: problems.length === 0, notes: [] };
  if (APPLY) {
    if (problems.length) {
      final.ok = false;
      final.notes.push('存在安全断言失败，未写入任何文件');
    } else {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path.join(ROOT, 'guokao-reports', `backup-fujian-v2-spaces-${stamp}`);
      fs.mkdirSync(backup, { recursive: true });
      for (const f of files) fs.copyFileSync(path.join(DIR, f), path.join(backup, f));
      fs.copyFileSync(path.join(DIR, 'questions.json'), path.join(backup, 'questions.json'));
      backupRel = path.relative(ROOT, backup).replace(/\\/g, '/');

      for (const s of shardData) {
        fs.writeFileSync(path.join(DIR, s.file), `${JSON.stringify(s.rows, null, 2)}\n`, 'utf8');
      }
      fs.writeFileSync(
        path.join(DIR, 'questions.json'),
        `${JSON.stringify(aggAfter, null, 2)}\n`,
        'utf8'
      );

      const reloaded = files.map(f => readJson(path.join(DIR, f)));
      const flatAfter = reloaded.flat();
      const aggReloaded = readJson(path.join(DIR, 'questions.json'));
      const reloadProblems = [];
      if (flatAfter.length !== EXPECTED_TOTAL) {
        reloadProblems.push(`写后分片题数=${flatAfter.length}`);
      }
      if (JSON.stringify(flatAfter) !== JSON.stringify(aggReloaded)) {
        reloadProblems.push('写后 questions.json 与分片不一致');
      }
      for (const q of flatAfter) {
        const e = String(q.explanation || '');
        if (cleanText(e) !== e) reloadProblems.push(`${q.id} 解析清洗不幂等`);
        for (const o of Array.isArray(q.options) ? q.options : []) {
          const t = String(o?.text || '');
          if (cleanText(t) !== t) reloadProblems.push(`${q.id} 选项 ${o.key} 清洗不幂等`);
        }
        for (const k of Array.isArray(q.keyPoints) ? q.keyPoints : []) {
          const t = String(k);
          if (cleanText(t) !== t) reloadProblems.push(`${q.id} keyPoints 清洗不幂等`);
          if (KP_JUNK.test(t)) reloadProblems.push(`${q.id} keyPoints 仍残留模板句`);
        }
      }
      const index = readJson(path.join(DIR, 'index.json'));
      const referenced = Object.values(index).flat().sort();
      if (JSON.stringify(referenced) !== JSON.stringify(files)) {
        reloadProblems.push('index.json 与实际分片不一致');
      }

      if (reloadProblems.length) {
        for (const f of files) fs.copyFileSync(path.join(backup, f), path.join(DIR, f));
        fs.copyFileSync(path.join(backup, 'questions.json'), path.join(DIR, 'questions.json'));
        final.ok = false;
        final.notes.push('写后自检失败，已从备份回滚');
        final.notes.push(...reloadProblems.slice(0, 20));
      } else {
        final.applied = true;
        final.notes.push(`写后自检通过：${EXPECTED_TOTAL} 题 / 分片与 questions.json 一致 / 清洗幂等`);
      }
    }
  }

  writeReports({
    stats,
    changes: allChanges,
    residualBefore,
    residualAfter,
    targetBefore,
    targetAfter,
    samples,
    problems,
    backupRel,
    final,
    junkItems,
    filledSamples,
    clearedSamples,
  });

  console.log(`[fix-fj-spaces] mode=${APPLY ? 'APPLY' : 'dry-run'}`);
  console.log(
    `  记录 ${num(stats.total)}；有变更 ${num(stats.changedRecords)}` +
      `（选项 ${num(stats.optionRecords)} 题 / ${num(stats.optionFields)} 处，解析 ${num(stats.explanationRecords)} 条，` +
      `keyPoints ${num(stats.kpRecords)} 条）`
  );
  console.log(
    `  keyPoints：删除模板残句 ${num(stats.kpJunk)} 项；首句回填 ${num(stats.kpFilled)} 条、置空 ${num(stats.kpCleared)} 条；` +
      `空数组 ${num(stats.kpEmptyBefore)} → ${num(stats.kpEmptyAfter)}`
  );
  console.log(
    `  残留（列表空格等）：${num(residualBefore.fields)} → ${num(residualAfter.fields)} 处，` +
      `涉及记录 ${num(residualBefore.records)} → ${num(residualAfter.records)}`
  );
  if (problems.length) console.log(`  安全断言失败 ${problems.length} 项，详见报告`);
  if (final.notes.length) for (const n of final.notes) console.log(`  ${n}`);
  if (APPLY && final.applied) console.log(`  备份：${backupRel}`);
  console.log(`  报告：${path.relative(ROOT, REPORT_MD)}`);
  console.log(APPLY ? '' : '  这是 dry-run，未改动任何题目数据。审核后加 --apply。');
  if (!final.ok) process.exitCode = 1;
}


function csvCell(value) {
  const s = String(value == null ? '' : value);
  return `"${s.replace(/"/g, '""')}"`;
}


function writeReports(ctx) {
  const {
    stats,
    changes,
    residualBefore,
    residualAfter,
    targetBefore,
    targetAfter,
    samples,
    problems,
    backupRel,
    final,
    junkItems,
    filledSamples,
    clearedSamples,
  } = ctx;
  const md = [];
  md.push('# 福建 v2 文本层空格清洗与 keyPoints 残句清理');
  md.push('');
  md.push(`- 模式：**${APPLY ? (final.applied ? 'APPLIED（已写入）' : 'APPLY（未写入）') : 'dry-run（未写入）'}**`);
  md.push(`- 生成时间：${new Date().toISOString()}`);
  md.push('- 范围：`public/data/questions-v2-provincial/福建/`（16 分片 + `questions.json`）');
  md.push(`- 结论：**${final.ok ? '✅ 通过' : '❌ 失败'}**`);
  if (APPLY) md.push(`- 写入前备份：\`${backupRel}\``);
  md.push('');
  md.push('> 不清洗题干 `stem` / `title`，不改 `answer` / `module` / `id`，不动线上 `public/data/questions/`。');
  md.push('');
  md.push('## 1. 清洗规则');
  md.push('');
  md.push('| # | 规则 | 示例 |');
  md.push('|---|---|---|');
  md.push('| 1 | 冒号/逗号/顿号后接引号的空格删除 | `说： “……”` → `说：“……”` |');
  md.push('| 2 | 左引号后、右引号前的空格删除 | `“轻 ”` → `“轻”` |');
  md.push('| 3 | 全角标点两侧空格删除 | `茶艺、 昆曲` → `茶艺、昆曲` |');
  md.push('| 4 | 字母/数字与汉字之间的排版空格删除 | `A 项` → `A项`；`藏历 6 月` → `藏历6月` |');
  md.push('| 5 | 汉字之间的空格：**列表行保留**，其余按断行残留删除 | 保留 `人类 自然 科技`；删除 `青稞 酒`、`台湾 和广东地区` |');
  md.push('| 6 | 连续空格压成一个（表格行跳过） | — |');
  md.push('');
  md.push('列表行判定：一行内汉字—空白—汉字 ≥ 2 处，且空格切分后每段 ≤ 8 字、段数 ≥ 3，视为并列项，保留空格。');
  md.push('表格行（以 `|` 开头或含制表符）只做 1–4 类清洗，避免破坏列对齐。');
  md.push('');
  md.push('`keyPoints`：');
  md.push('');
  md.push('- 删除自动模板残句：`故正确答案为 X`、`本题相关知识点：`、`本题考查…` 等；');
  md.push('- 整组只剩残句时，按解析首句回填；首句为选项分析（`A项…`）、模板句、`[[IMG]]`、少于 8 字或多于 60 字时置空；');
  md.push('- 混合组只删残句，保留真实考点。');
  md.push('');
  md.push('## 2. 影响面');
  md.push('');
  md.push('| 指标 | 数量 |');
  md.push('|---|---:|');
  md.push(`| 记录总数 | ${num(stats.total)} |`);
  md.push(`| 有任意变更的记录 | ${num(stats.changedRecords)}（${pct(stats.changedRecords, stats.total)}） |`);
  md.push(`| 选项文本变更 | ${num(stats.optionFields)} 处 / ${num(stats.optionRecords)} 题 |`);
  md.push(`| 解析变更 | ${num(stats.explanationFields)} 条 |`);
  md.push(`| keyPoints 变更 | ${num(stats.kpRecords)} 条 |`);
  md.push('');
  md.push('## 3. 清洗前后残留');
  md.push('');
  md.push('| 模式 | 改前 | 改后 |');
  md.push('|---|---:|---:|');
  const patternLabels = {
    'colon-quote': '冒号/逗号后接引号',
    'quote-trail': '右引号前空格',
    'cjk-cjk': '汉字间空格（含保留的列表项）',
    'latin-cjk': '字母/数字与汉字间空格',
    'punct-space': '全角标点旁空格',
    'multi-space': '连续空格',
  };
  for (const [name] of RESIDUAL) {
    md.push(
      `| ${patternLabels[name] || name} | ${num(residualBefore.byPattern[name])} | ` +
        `${num(residualAfter.byPattern[name])} |`
    );
  }
  md.push(`| **合计** | **${num(residualBefore.fields)}** | **${num(residualAfter.fields)}** |`);
  md.push('');
  md.push(
    `涉及记录：**${num(residualBefore.records)} → ${num(residualAfter.records)}**。` +
      '剩余空格应全部为并列项/表格/英文词组内部空格。'
  );
  md.push('');
  for (const [name, list] of Object.entries(residualAfter.samples)) {
    if (!list.length) continue;
    md.push(`残留样例 · ${patternLabels[name] || name}：`);
    md.push('');
    for (const s of list) md.push(`- \`${s.id}\`：${JSON.stringify(s.text)}`);
    md.push('');
  }

  md.push('## 4. keyPoints 处理');
  md.push('');
  md.push('| 指标 | 数量 |');
  md.push('|---|---:|');
  md.push(`| 删除模板残句 | ${num(stats.kpJunk)} 项 |`);
  md.push(`| 整组残句 → 解析首句回填 | ${num(stats.kpFilled)} 条 |`);
  md.push(`| 整组残句 → 置空 | ${num(stats.kpCleared)} 条 |`);
  md.push(`| 空数组（改前 → 改后） | ${num(stats.kpEmptyBefore)} → ${num(stats.kpEmptyAfter)} |`);
  md.push('');
  const junkTop = [...junkItems.entries()].sort((a, b) => b[1] - a[1]);
  if (junkTop.length) {
    md.push('删除明细（去重后按出现次数）：');
    md.push('');
    md.push('| 残句 | 次数 |');
    md.push('|---|---:|');
    for (const [k, n] of junkTop.slice(0, 30)) {
      md.push(`| \`${k.replace(/\|/g, '\\|')}\` | ${num(n)} |`);
    }
    if (junkTop.length > 30) md.push(`| ……其余 ${num(junkTop.length - 30)} 种 | — |`);
    md.push('');
  }
  if (filledSamples.length) {
    md.push('首句回填样例：');
    md.push('');
    for (const s of filledSamples) md.push(`- \`${s.id}\`：${JSON.stringify(s.value)}`);
    md.push('');
  }
  if (clearedSamples.length) {
    md.push('置空样例（原值仅剩残句）：');
    md.push('');
    for (const s of clearedSamples) md.push(`- \`${s.id}\`：${JSON.stringify(s.before)}`);
    md.push('');
  }
  md.push('## 5. 目标记录（prov-fujian-2011-917联考-11）');
  md.push('');
  if (!targetBefore || !targetAfter) {
    md.push('未找到目标记录。');
  } else {
    md.push('### 选项');
    md.push('');
    md.push('| 项 | 改前 | 改后 |');
    md.push('|---|---|---|');
    const beforeOpts = new Map((targetBefore.options || []).map(o => [o.key, o.text]));
    for (const o of targetAfter.options || []) {
      const b = beforeOpts.get(o.key);
      md.push(`| ${o.key} | ${JSON.stringify(b)} | ${JSON.stringify(o.text)} |`);
    }
    md.push('');
    md.push('### 解析');
    md.push('');
    md.push('改前：');
    md.push('');
    md.push('```text');
    md.push(String(targetBefore.explanation || ''));
    md.push('```');
    md.push('');
    md.push('改后：');
    md.push('');
    md.push('```text');
    md.push(String(targetAfter.explanation || ''));
    md.push('```');
    md.push('');
    md.push('### keyPoints');
    md.push('');
    md.push(`- 改前：\`${JSON.stringify(targetBefore.keyPoints || [])}\``);
    md.push(`- 改后：\`${JSON.stringify(targetAfter.keyPoints || [])}\``);
  }
  md.push('');
  md.push('## 6. 抽样');
  md.push('');
  for (const s of samples) {
    md.push(`### \`${s.id}\``);
    md.push('');
    for (const c of s.changes) {
      const before = c.type === 'keyPoints' ? c.before.join(' | ') : String(c.before);
      const after = c.type === 'keyPoints' ? c.after.join(' | ') : String(c.after);
      const cut = (v) => (v.length > 160 ? `${v.slice(0, 160)}…` : v);
      md.push(`- \`${c.field}\`（${c.reason}）：${JSON.stringify(cut(before))} → ${JSON.stringify(cut(after))}`);
    }
    md.push('');
  }
  md.push('## 7. 安全断言');
  md.push('');
  const spaceChanges = changes.filter(c => c.type === 'option' || c.type === 'explanation');
  md.push(`- 空白不变式（去空白后逐字一致）：${num(spaceChanges.length)} 处，失败 **${num(problems.length)}** 项`);
  md.push('- keyPoints 新值必须来自原值、或为解析首句子串；');
  md.push('- 题干 / 答案 / 模块 / ID / 分片命名均未触碰。');
  if (problems.length) {
    md.push('');
    md.push('失败明细（最多 50 条）：');
    md.push('');
    for (const p of problems.slice(0, 50)) md.push(`- ${p}`);
  }
  md.push('');
  md.push('## 8. 写入结果');
  md.push('');
  if (!APPLY) {
    md.push('当前为 dry-run：未改动任何题目数据。确认后执行 `node scripts/fix-fujian-ocr-spaces.cjs --apply`。');
  } else if (final.applied) {
    md.push(`- 备份：\`${backupRel}\``);
    for (const n of final.notes) md.push(`- ${n}`);
  } else {
    md.push('- **未写入或已回滚**');
    for (const n of final.notes) md.push(`- ${n}`);
  }
  md.push('');

  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  fs.writeFileSync(REPORT_MD, `${md.join('\n')}\n`, 'utf8');

  const csvRows = [['id', 'field', 'reason', 'before', 'after']];
  for (const c of changes) {
    csvRows.push([
      c.id,
      c.field,
      c.reason,
      c.type === 'keyPoints' ? c.before.join(' | ') : c.before,
      c.type === 'keyPoints' ? c.after.join(' | ') : c.after,
    ]);
  }
  fs.writeFileSync(
    REPORT_CSV,
    `\uFEFF${csvRows.map(row => row.map(csvCell).join(',')).join('\n')}\n`,
    'utf8'
  );
}

try {
  main();
} catch (err) {
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  fs.writeFileSync(
    REPORT_MD,
    `# 福建 v2 文本层空格清洗与 keyPoints 残句清理\n\n- 生成时间：${new Date().toISOString()}\n- 结论：**❌ 失败（未写入）**\n\n\`\`\`text\n${err?.stack || err}\n\`\`\`\n`,
    'utf8'
  );
  console.error(`[fix-fj-spaces] 失败：${err?.message || err}`);
  process.exitCode = 1;
}
